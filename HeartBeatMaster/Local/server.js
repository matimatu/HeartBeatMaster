import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { startAntManager, setWsConnection, handleAppMessage } from "./ANT/antManager.js";

const PORT = 8080;
const DEBUG = true;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const serverState = {
  phase: "scanning",  // "scanning" | "selection" | "training"
  foundDevices: [],   // [{ deviceId, name, surname, weight, birthdate, sex }]               useful in scanning and selection phases
  selectedDevices: [] // [{ deviceId, name, surname, weight, birthdate,hrMax, hrMin }]  useful in training phase
};


app.use(express.static("public"));

let clientSocket = null;

server.listen(PORT, () => {
  console.log(`Server->started on http://localhost:${PORT}`);
  console.log("Server->Waiting for client connection...");
});

wss.on("connection", (ws) => {
  console.log("Server->Client connected");
  clientSocket = ws;
  sendStateToClient(ws);
  setWsConnection(ws);

  startAntManager();

  ws.onmessage = e => {
    try {
      const msg = JSON.parse(e.data);
      if (DEBUG)
        console.log("Server-> message received from client:", msg);
      switch (msg.type) {
        case "updateFoundDevice":
          serverState.foundDevices.push({
                deviceId: msg.data.deviceId,
                name: msg.data.name,
                surname: msg.data.surname,
                weight: msg.data.weight,
                height: msg.data.height,
                birthdate: msg.data.birthdate,
                sex: msg.data.sex,
          });
          console.log("Server->Updated found devices:", serverState.foundDevices);
          console.log("\nwaiting for client to select devices...");
          break;
        case "updateSelectedDevice":
          console.log(`Server->data received on updateSelectedDevice: ${msg.data}`);
          for (const selectedId of msg.data) {
            if(DEBUG) console.log(`Server->selected id: ${selectedId}`);
            const selectedIdStr = String(selectedId);
            const foundDev = serverState.foundDevices.find(d => d.deviceId === selectedIdStr);
            if (foundDev) {
              if(DEBUG) console.log(`Server->found id that matches: ${selectedId}`);
              serverState.selectedDevices.push({
                deviceId: foundDev.deviceId,
                name: foundDev.name,
                surname: foundDev.surname,
                weight: foundDev.weight,
                height: foundDev.height,
                birthdate: foundDev.birthdate,
                sex: foundDev.sex,
              });
            }
          }
          console.log("Server->Updated selected devices:", serverState.selectedDevices);
          console.log("Server->Forwarding message to ANT Manager...");
          handleAppMessage(msg);
          break;
        default:
          console.error(`Server->msg type not recognised: ${msg.type} `);
          break;
      }

    } catch (err) {
      console.error("Server->Error on parsing message:", err);
    }
  };

  ws.on("close", () => {
    console.log("Server->Client disconnected");
    clientSocket = null;
  });
});

export function setPhase(newPhase) {
  switch (newPhase) {
    case "scanning":
    case "selection":
    case "training":
      break;
    default:
      console.error("Server->Invalid phase:", newPhase);
      return;
  }
  serverState.phase = newPhase;
  sendStateToClient(clientSocket);
   if (DEBUG)       console.log("Server->Phase set to " + newPhase +" , state sent to client.");
}

function sendStateToClient(ws) {
  ws.send(JSON.stringify({
    type: "currentState",
    data: serverState
  }));
}


