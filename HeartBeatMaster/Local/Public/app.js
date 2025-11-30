import { calcIntensity, calcHeartRateMax, calcHeartRateMin } from "./statsHandler.js";
import { registerNewDevice } from "./phpConnector.js";

const DEBUG = true;
let clientState = {
  foundDevices: [],   // [{ deviceId, name, surname, weight, birthdate }]               useful in scanning and selection phases
  selectedDevices: [] // [{ deviceId, name, surname, weight, birthdate,hrMax, hrMin }]  useful in training phase
};
const ws = new WebSocket(`ws://${location.host}`);

ws.onopen = () => log("Connesso al server");

ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case "newSensor":
      log(`Nuovo sensore trovato: ${msg.data.DeviceId}`);
      break;
    case "scanResult":
      log(`Scansione completata (${Object.keys(msg.data).length} dispositivi trovati)`);
      break;
    case "UserDevice_attached":
      log(`Sensore ${msg.deviceId} attaccato (canale ${msg.channel})`);
      break;
    case "heartRate":
      renderDeviceStats(msg.data.DeviceId, msg.data.ComputedHeartRate);
      break;
    case "deviceUsersInfo":
      renderTableUsersWithDevice(msg.data.registered, msg.data.deviceId, msg.data.name, msg.data.surname);
      document.getElementById("button_startAttach").style.display = "block";
      ws.send(JSON.stringify({ type: "updateFoundDevice", data: msg.data }));  //sending data to server
      break;
    case "currentState":
      switch (msg.data.phase) {
        case "scanning":
          break;
        case "selection":
          clientState.foundDevices = msg.data.foundDevices;
          break;
        case "training":
          clientState.selectedDevices = msg.data.selectedDevices;
          for (const selectedDevice of clientState.selectedDevices) {
            selectedDevice.hrMax = calcHeartRateMax(selectedDevice.birthdate);
            selectedDevice.hrMin = calcHeartRateMin(selectedDevice.sex);
          }
          break;
        default:
          console.error("Invalid phase:", msg.data.phase);
          return;
      }
      if (DEBUG)
        console.log("clientState updated:", clientState, msg.data.phase);
      // restoreUI(msg.data);   //TODO handle restoration of UI based on current state
      break;
    default:
      log(`message type not recognised: ${JSON.stringify(msg)}`);
  }
};

//////////////////////////////////////// EVENT LISTENERS ////////////////////////////////////////////
document.getElementById("button_startAttach").addEventListener("click", () => {
  let selectedDeviceIds = scrapeSelectedDeviceIds();
  console.log("Sending selected devices to server...");
  ws.send(JSON.stringify({ type: "updateSelectedDevice", data: selectedDeviceIds }));  //sending data to server which foward to ANT Manager
});


/////////////////////////////////////////////// FUNCTIONS ////////////////////////////////////////////
function log(msg) {
  const el = document.getElementById("log");
  el.innerHTML += `<div>${msg}</div>`;
};

function renderTableUsersWithDevice(isRegistered, deviceId, nome, cognome) {
  const headerDiv = document.getElementById("found-devices-header");
  headerDiv.style.display = "block";
  const table = document.getElementsByClassName("found-devices")[0];
  const row = document.createElement("tr");
  const cell1 = document.createElement("td");
  cell1.textContent = deviceId;

  const cell2 = document.createElement("td");
  if (!isRegistered)
    cell2.textContent = "sconosciuto";
  else
    cell2.textContent = nome + " " + cognome;

  const cell3 = document.createElement("td");
  if (isRegistered) {
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    cell3.appendChild(checkbox);
  }
  else {
    const button = document.createElement("button");
    button.id = "button_registra";
    button.textContent = "registra";
    button.addEventListener("click", (event) => button_registraOnClick(event));
    cell3.appendChild(button);
  }


  row.appendChild(cell1);
  row.appendChild(cell2);
  row.appendChild(cell3);
  table.appendChild(row);
};

function renderDeviceStats(id, heartRate, age, weight, height) {
  if (id === 0) return; //ignore wildcard id
  const container = document.getElementById("devices");
  let el = document.getElementById(`dev-${id}`);
  if (!el) {
    el = document.createElement("div");
    el.id = `dev-${id}`;
    el.className = "device";
    container.appendChild(el);
  }
  const selectedDevice = clientState.selectedDevices.find(dev => dev.deviceId == String(id));
  if (selectedDevice) {
    el.textContent = ((selectedDevice.name && selectedDevice.surname) ? selectedDevice.name + " " + selectedDevice.surname : "nome non trovato" + ": ");
    el.textContent += `: ${heartRate} bpm`;
    el.textContent += ` - Intensità: ${calcIntensity(heartRate, selectedDevice.hrMax, selectedDevice.hrMin)} %`;
  }
}

function restoreUI(state) {//TODO
  switch (state.phase) {
    case "scanning":
      // Nothing to restore in scanning phase
      break;
    case "selection":
      console.log("Restoring selection UI...");
      renderSelectionUI();
      break;
    case "training":
      console.log("Restoring training UI...");
      renderTrainingUI();
      break;
    default:
      console.error("Invalid phase:", state.phase);
  }
}


function scrapeSelectedDeviceIds() {
  let selectedDeviceIds = [];
  const table = document.getElementsByClassName("found-devices")[0];
  const rows = table.querySelectorAll("tr");
  rows.forEach(row => {
    if (row.rowIndex === 0) return; //skip header row
    const rowCheckbox = row.cells[2].querySelector("input[type='checkbox']");
    if (rowCheckbox.checked) {
      const deviceId = row.cells[0].textContent;
      selectedDeviceIds.push(parseInt(deviceId));
    }
  });
  return selectedDeviceIds;
}

function button_registraOnClick(event) {
  const button = event.target;
  // get the tr that included the button
  const row = button.closest("tr");

  // read first cell of tr → DeviceID
  const deviceId = row.querySelector("td").textContent.trim();

  console.log("DeviceID selezionato:", deviceId);
  showRegistrationPopup(async (formData) => {
    console.log("Dati ricevuti:", formData);

    const result = await registerNewDevice(deviceId, formData.mail, formData.password, formData.weight, formData.height, 2000);
    if (result.success === false) {
      const box = document.querySelector("#device-reg-popup .popup-box");
      if (!box) return;

      const errorDiv = box.querySelector(".popup-api-error");
      if (!errorDiv) return;

      
      if (result.httpStatus === 404) {
        errorDiv.textContent = result.message;
        errorDiv.style.display = "block";
      }


    }
    else if (result.success === true) {
        //TODO
    }

  });
}


function showRegistrationPopup(onSubmitCallback) {
  // Remove previous popup if exists
  const old = document.getElementById("device-reg-popup");
  if (old) old.remove();

  // Overlay
  const overlay = document.createElement("div");
  overlay.id = "device-reg-popup";
  overlay.className = "popup-overlay";

  // Box
  const box = document.createElement("div");
  box.className = "popup-box";

  // Title
  const title = document.createElement("h3");
  title.textContent = "Registrazione dispositivo";
  box.appendChild(title);

  // Close button
  const closeBtn = document.createElement("span");
  closeBtn.className = "popup-close-btn";
  closeBtn.textContent = "✕";
  closeBtn.onclick = () => overlay.remove();
  box.appendChild(closeBtn);
  

  // Form
  const form = document.createElement("form");
  form.className = "popup-form";

  // Helper to create input fields
  function field(labelTxt, type, id) {
    const w = document.createElement("div");
    w.className = "popup-field";

    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = labelTxt;

    const input = document.createElement("input");
    input.type = type;
    input.id = id;
    input.required = true;

    w.appendChild(label);
    w.appendChild(input);
    return w;
  }

  form.appendChild(field("Email", "email", "popup_mail"));
  form.appendChild(field("Password", "password", "popup_password"));
  form.appendChild(field("Peso", "number", "popup_weight"));
  form.appendChild(field("Altezza", "number", "popup_height"));
  // Submit button (styled like your main buttons)
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Registra";
  submit.className = "popup-submit-btn";

  form.appendChild(submit);

  // error box
  const errorBox = document.createElement("div");
  errorBox.className = "popup-api-error";
  errorBox.style.display = "none";
  form.appendChild(errorBox);

  box.appendChild(form);
  overlay.appendChild(box);
  document.body.appendChild(overlay);

  // Handle submit
  form.onsubmit = (e) => {
    e.preventDefault();

    const data = {
      mail: document.getElementById("popup_mail").value.trim(),
      password: document.getElementById("popup_password").value.trim(),
      weight: document.getElementById("popup_weight").value.trim(),
      height: document.getElementById("popup_height").value.trim(),
    };

    if (onSubmitCallback) onSubmitCallback(data);

    // overlay.remove();
  };
}
