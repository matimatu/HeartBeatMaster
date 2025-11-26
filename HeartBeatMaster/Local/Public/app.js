import { calcIntensity, calcHeartRateMax, calcHeartRateMin } from "./statsHandler.js";
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
      renderTableUsersWithDevice(msg.data.deviceId,msg.data.name,msg.data.surname);
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
          for(const selectedDevice of clientState.selectedDevices){
            selectedDevice.hrMax = calcHeartRateMax(selectedDevice.birthdate);
            selectedDevice.hrMin = calcHeartRateMin(selectedDevice.sex);
          }
          break;
        default:
          console.error("Invalid phase:", msg.data.phase);
          return;
      }
      if(DEBUG) 
          console.log("clientState updated:", clientState, msg.data.phase);
      // restoreUI(msg.data);   //TODO handle restoration of UI based on current state
      break;
    default:
      log(`message type not recognised: ${JSON.stringify(msg)}`);
  }
};

//////////////////////////////////////// EVENT LISTENERS ////////////////////////////////////////////
document.getElementById("button_startAttach").addEventListener("click", ()=> {
    let selectedDeviceIds = scrapeSelectedDeviceIds();
    console.log("Sending selected devices to server...");
    ws.send(JSON.stringify({ type: "updateSelectedDevice", data: selectedDeviceIds }));  //sending data to server which foward to ANT Manager
});


/////////////////////////////////////////////// FUNCTIONS ////////////////////////////////////////////
function log(msg){
  const el = document.getElementById("log");
  el.innerHTML += `<div>${msg}</div>`;
};

function renderTableUsersWithDevice(deviceId,nome,cognome){
  const headerDiv = document.getElementById("found-devices-header");
  headerDiv.style.display = "block";
  const table = document.getElementsByClassName("found-devices")[0];
  const row = document.createElement("tr");
  const cell1 = document.createElement("td");
  cell1.textContent = deviceId;

  const cell2 = document.createElement("td");
  cell2.textContent = nome + " " + cognome;
  const cell3 = document.createElement("td");
  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = true;
  cell3.appendChild(checkbox);

  row.appendChild(cell1);
  row.appendChild(cell2);
  row.appendChild(cell3);
  table.appendChild(row);
};

function renderDeviceStats(id, heartRate,age,weight,height) {
  if(id ===0) return; //ignore wildcard id
  const container = document.getElementById("devices");
  let el = document.getElementById(`dev-${id}`);
  if (!el) {
    el = document.createElement("div");
    el.id = `dev-${id}`;
    el.className = "device";
    container.appendChild(el);
  }
  const selectedDevice = clientState.selectedDevices.find(dev => dev.deviceId == String(id));
  if(selectedDevice){
    el.textContent = ((selectedDevice.name && selectedDevice.surname) ? selectedDevice.name + " " + selectedDevice.surname : "nome non trovato" + ": ");
    el.textContent += `: ${heartRate} bpm`;
    el.textContent += ` - Intensità: ${calcIntensity(heartRate, selectedDevice.hrMax, selectedDevice.hrMin)} %`;
  }
}

function restoreUI(state) {
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
  //TODO really search in the table of found devices
    const table = document.getElementsByClassName("found-devices")[0];
    const rows = table.querySelectorAll("tr");
    rows.forEach(row => {
      if(row.rowIndex === 0) return; //skip header row
        const rowCheckbox = row.cells[2].querySelector("input[type='checkbox']");
        if (rowCheckbox.checked)
        {
          const deviceId = row.cells[0].textContent;
          selectedDeviceIds.push(parseInt(deviceId));
        }
    });
  return selectedDeviceIds;
}