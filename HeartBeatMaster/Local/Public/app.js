let usersWithDevices = [];
const DEBUG = true;

const ws = new WebSocket(`ws://${location.host}`);
const log = msg => {
  const el = document.getElementById("log");
  el.innerHTML += `<div>${msg}</div>`;
};

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
      log(`Utente con fascia trovato: ID: ${msg.data.deviceId},  ${msg.data.nome} ${msg.data.cognome},
         Peso: ${msg.data.peso}, Altezza: ${msg.data.altezza} cm,
          Data di nascita: ${msg.data.data_nascita}, Sesso: ${msg.data.maschio === "1" ? "Maschio" : "Femmina"}`);
      // const heartRateMax = calcHeartRateMax(msg.data.data_nascita);
      // const heartRatemin = getHeartRateMin(msg.data.maschio);
      document.getElementById("button_startAttach").style.visibility = "visible";
      break;

    default:
      log(`${JSON.stringify(msg)}`);
  }
};

document.getElementById("button_startAttach").addEventListener("click", ()=> {
    console.log("Sending selected devices to server...");
    let selectedUsers = searchAndPopolateSelectedUsers();
    ws.send(JSON.stringify({ type: "selectedDevices", data: selectedUsers }));
});


function updateDevice(id, heartRate,age,weight,height) {
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

function calcIntensity(hr, hrMax, hrRest) {
  const hrr = hrMax - hrRest;
  const intensity = ((hr - hrRest) / hrr) * 100;
  return intensity.toFixed(2);
}

function calcHeartRateMax(bornDate) {
  const birthYear = new Date(bornDate).getFullYear();
  const currentYear = new Date().getFullYear();
  const age = currentYear - birthYear;
  return 208 -0.7*age;
}

function getHeartRateMin(male) {
  if(male==="1"){
    return 0.64;
  } else if(male==="0"){
    return 0.76;
  }
  else
  {
    throw new Error("Invalid value for sex parameter: "+ male);
  }
}

function addUserWithDevice(id, name, surname, weight, height) {
  const newDevice = { id, name, surname, weight, height };
  usersWithDevices.push(newDevice);
  if(DEBUG)
    console.log("New user with device added:", newDevice);
}

function searchAndPopolateSelectedUsers() {
  let selectedUsers = [];
  //TODO really search in the table of found devices
  // const table = document.querySelector(".found-devices");
  // const rows = table.querySelectorAll("tr");
  selectedUsers.push(20026);
  return selectedUsers;
}