const ws = new WebSocket(`ws://${location.host}`);
const log = msg => {
  const el = document.getElementById('log');
  el.innerHTML += `<div>${msg}</div>`;
};

ws.onopen = () => log("Connesso al server");

//TODO ws.onmessage = ...
