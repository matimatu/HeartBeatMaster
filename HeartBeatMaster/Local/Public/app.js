import { calcIntensity, calcHeartRateMax, getHeartRateMin } from "./statsHandler.js";
const DEBUG = true;

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
      updateDevice(msg.data.DeviceId, msg.data.ComputedHeartRate);
      break;
    case "deviceUserInfo":
      listOfUsersWithDevices_render(msg.data.deviceId,msg.data.nome,msg.data.cognome);
      document.getElementById("button_startAttach").style.visibility = "visible";
      break;

    default:
      log(`${JSON.stringify(msg)}`);
  }
};

//////////////////////////////////////// EVENT LISTENERS ////////////////////////////////////////////
document.getElementById("button_startAttach").addEventListener("click", ()=> {
    console.log("Sending selected devices to server...");
    let selectedUsers = searchAndPopolateSelectedUsers();
    ws.send(JSON.stringify({ type: "selectedDevices", data: selectedUsers }));
    // const heartRateMax = calcHeartRateMax(msg.data.data_nascita);
    // const heartRatemin = getHeartRateMin(msg.data.maschio);
});



/////////////////////////////////////////////// FUNCTIONS ////////////////////////////////////////////
function log(msg){
  const el = document.getElementById("log");
  el.innerHTML += `<div>${msg}</div>`;
};

function listOfUsersWithDevices_render(deviceId,nome,cognome){
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

function updateDevice(id, heartRate,age,weight,height) {
  if(id ===0) return; //ignore wildcard id
  const container = document.getElementById("devices");
  let el = document.getElementById(`dev-${id}`);
  if (!el) {
    el = document.createElement("div");
    el.id = `dev-${id}`;
    el.className = "device";
    container.appendChild(el);
  }
  el.textContent = `Dispositivo ${id}: ${heartRate} bpm`;
  el.textContent += ` - Intensità: ${calcIntensity(hr, 190, 60)} %`;
}



function searchAndPopolateSelectedUsers() {
  let selectedUsers = [];
  //TODO really search in the table of found devices
    const table = document.getElementsByClassName("found-devices")[0];
    const rows = table.querySelectorAll("tr");
    rows.forEach(row => {
        const rowCheckbox = row.cells[2].querySelector("input[type='checkbox']");
        if (rowCheckbox.checked)
        {
          const deviceId = row.cells[0].textContent;
          selectedUsers.push(parseInt(deviceId));
        }
    });
  // selectedUsers.push(20026);
  return selectedUsers;
  // return [20026];  
}