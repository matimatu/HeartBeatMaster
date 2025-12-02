import { calcIntensity, calcHeartRateMax, calcHeartRateMin } from "./statsHandler.js";
import { registerNewDevice } from "./phpConnector.js";

const DEBUG = true;
let clientState = {
  foundDevices: [],   // [{ deviceId, name, surname, weight, birthDate }]               useful in scanning and selection phases
  selectedDevices: [] // [{ deviceId, name, surname, weight, birthDate,hrMax, hrMin }]  useful in training phase
};
const ws = new WebSocket(`ws://${location.host}`);

if(DEBUG) ws.onopen = () => log("Connesso al server");

ws.onmessage = e => {
  const msg = JSON.parse(e.data);
  switch (msg.type) {
    case "newSensor":
      if(DEBUG) log(`Nuovo sensore trovato: ${msg.data.DeviceId}`);
      break;
    case "scanResult":
      if(DEBUG) log(`Scansione completata (${Object.keys(msg.data).length} dispositivi trovati)`);
      break;
    case "UserDevice_attached":
      if(DEBUG) log(`Sensore ${msg.deviceId} attaccato (canale ${msg.channel})`);
      break;
    case "heartRate":
      renderDeviceStats(msg.data.DeviceId, msg.data.ComputedHeartRate);
      break;
    case "deviceUsersInfo":
      renderFoundDevice(msg.data.registered, msg.data.deviceId, msg.data.name, msg.data.surname);
      document.getElementById("button_startAttach").style.display = "block";
      sendToServer({ type: "updateFoundDevice", data: msg.data });
      break;
    case "currentState":
      switch (msg.data.phase) {
        case "scanning":
          break;
        case "selection":
          if(DEBUG) console.log("found devices from server: ",msg);
          clientState.foundDevices = msg.data.foundDevices;
          break;
        case "training":
          clientState.selectedDevices = msg.data.selectedDevices;
          //calculating hrMax and hrMin for all selectedDevices one time
          for (const selectedDevice of clientState.selectedDevices) {
            selectedDevice.hrMax = calcHeartRateMax(selectedDevice.birthDate);
            selectedDevice.hrMin = calcHeartRateMin(selectedDevice.sex);
          }
          break;
        default:
          console.error("Invalid phase:", msg.data.phase);
          return;
      }
      if (DEBUG)
        console.log("clientState updated:", clientState, msg.data.phase);
      restoreUI(msg.data);   //TODO handle restoration of UI based on current state
      break;
    default:
      log(`message type not recognised: ${JSON.stringify(msg)}`);
  }
};

/////////////////////////////////////////////// FUNCTIONS ////////////////////////////////////////////
function sendToServer(obj) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(obj));
    if (DEBUG) console.log(`message sent to server:${JSON.stringify(obj)}`)
  }
  else
    console.error("\nws error, unable to send message to server!");
}

function log(msg) {
  const el = document.getElementById("log-container");
  el.innerHTML += `<div>${msg}</div>`;
};

function renderFoundDevice(isRegistered, deviceId, nome, cognome) {

  let header = document.getElementById("found-devices-header");
  if (!header) { //if header doesn't exist -> create it
    header = document.createElement("h2");
    header.id = "found-devices-header";
    // header.style.display = "block"; 
    header.textContent = "Dispositivi trovati";
    const logContainer = document.getElementById("log-container");
    logContainer.insertAdjacentElement("afterend", header);
  }
  let table = document.querySelector(".found-devices");
  if (!table) { //if table doesn't exist -> create it
    table = document.createElement("table");
    table.className = "found-devices animation-popup";

    // Crea l'header della tabella
    const headerRow = document.createElement("tr");
    const headers = ["DeviceID", "Nome", "Seleziona"];
    headers.forEach(text => {
      const th = document.createElement("th");
      th.textContent = text;
      headerRow.appendChild(th);
    });

    table.appendChild(headerRow);

    // insert table on DOM under div or h2 header
    header.insertAdjacentElement("afterend", table);

    setTimeout(() => {
      table.classList.add("show");
    }, 50); // 50ms to let the transition happen
  }
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
  renderStartAttachButton();
};

function renderStartAttachButton() {
  let btnWrapper = document.querySelector(".btn-wrapper");
  if (!btnWrapper) {
    btnWrapper = document.createElement("div");
    btnWrapper.className = "btn-wrapper animation-popup";

    const button = document.createElement("button");
    button.id = "button_startAttach";
    button.textContent = "Collega device selezionati";
    button.style.display = "none";

    button.addEventListener("click", () => {
      let selectedDeviceIds = scrapeSelectedDeviceIds();
      console.log("Sending selected devices to server...");
      sendToServer({ type: "ANT_updateSelectedDevice", data: selectedDeviceIds });  //sending data to server which forward to ANT Manager
    });

    btnWrapper.appendChild(button);
    document.body.appendChild(btnWrapper);
    setTimeout(() => {
      btnWrapper.classList.add("show");
    }, 200);
  }

  return document.getElementById("button_startAttach"); // ritorna il bottone per poterlo mostrare/nascondere
}


function renderDeviceStats(id, heartRate, age, weight, height) {
  if (id === 0) return; //ignore wildcard id
  const container = document.getElementById("selected-devices-container");
  if(!container)
  {
    console.log("container not existing yet,skipping")
    return;
  }
  let el = document.getElementById(`dev-${id}`);
  if (!el) {
    el = document.createElement("div");
    el.id = `dev-${id}`;
    el.className = "device animation-popup";
    container.appendChild(el);

     setTimeout(() => {
      el.classList.add("show");
    }, 50); // 50ms to let the transition happen
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
      // if(DEBUG) console.log("Restoring selection UI...");
      // renderSelectionUI();
      break;
    case "training":
      if (DEBUG) console.log("Restoring training UI...");
      renderTrainingUI();
      break;
    default:
      console.error("Invalid phase:", state.phase);
  }
}

function renderTrainingUI() {
  //removing elements
  const headerFoundDevices = document.getElementById("found-devices-header");
  if (!headerFoundDevices) {
    console.error("headerFoundDevices not found!");
    return;
  }
  headerFoundDevices.remove();

  const tableFoundDevices = document.querySelector(".found-devices");
  if (!tableFoundDevices) {
    console.error("tableFoundDevices not found!");
    return;
  }
  tableFoundDevices.remove();

  let btnWrapper = document.querySelector(".btn-wrapper");
  if (!btnWrapper) {
     console.error("btnWrapper not found!");
    return;
  }
  btnWrapper.remove();

  //adding elements
  let divSelectedDevices = document.getElementById("selected-devices-container");
  if(!divSelectedDevices)
  {
    divSelectedDevices = document.createElement("div");
    divSelectedDevices.id = "selected-devices-container";
    const logContainer = document.getElementById("log-container");
    logContainer.insertAdjacentElement("afterend",divSelectedDevices);
  }

  if(DEBUG) console.log("training UI updated");
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
      const overlay = document.querySelector("#device-reg-popup");
      overlay.remove();
      const cell = button.parentElement;
      cell.removeChild(button);
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = true;
      cell.appendChild(checkbox);
      const nameCell = row.cells[1];
      nameCell.textContent = result.data.name + " " + result.data.surname;
      sendToServer({ type: "updateFoundDevice", data: { deviceId, ...result.data } });
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
  };
}
