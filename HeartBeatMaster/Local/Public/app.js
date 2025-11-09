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
    case "attached":
      log(`Sensore ${msg.deviceId} attaccato (canale ${msg.channel})`);
      break;
    case "heartRate":
      updateDevice(msg.data.DeviceId, msg.data.ComputedHeartRate);
      break;
    // case "detached":
    //   log(`Sensore ${msg.deviceId} disconnesso`);
    //   break;
    default:
      log(`${JSON.stringify(msg)}`);
  }
};

function updateDevice(id, hr) {
  const container = document.getElementById("devices");
  let el = document.getElementById(`dev-${id}`);
  if (!el) {
    el = document.createElement("div");
    el.id = `dev-${id}`;
    el.className = "device";
    container.appendChild(el);
  }
  el.textContent = `Dispositivo ${id}: ${hr} bpm`;
}
