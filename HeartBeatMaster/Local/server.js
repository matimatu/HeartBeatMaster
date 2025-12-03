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
  foundDevices: [],   // [{ registered, deviceId, name, surname, weight, birthDate, sex }]               useful in scanning and selection phases
  selectedDevices: [] // [{ deviceId, name, surname, weight, birthDate,hrMax, hrMin }]  useful in training phase
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
          if (msg.data.registered === true) {
            const index = serverState.foundDevices.findIndex(d => d.deviceId === msg.data.deviceId && d.registered === false);
            if (index !== -1) {
              serverState.foundDevices.splice(index, 1);
              if(DEBUG) console.log("Server->new device registered, removed old unknown device")
            }

            serverState.foundDevices.push({
              registered: msg.data.registered,
              deviceId: msg.data.deviceId,
              name: msg.data.name,
              surname: msg.data.surname,
              weight: msg.data.weight,
              height: msg.data.height,
              birthDate: msg.data.birthDate,
              sex: msg.data.sex,
            });
          }
          else if (msg.data.registered === false) {
            serverState.foundDevices.push({
              registered: msg.data.registered,
              deviceId: msg.data.deviceId,
            });
          }

          console.log("Server->Updated found devices:", serverState.foundDevices);
          console.log("\nServer->waiting for client to select devices...");
          break;
        case "ANT_updateSelectedDevice":
          if(DEBUG) console.log(`Server->data received on updateSelectedDevice: ${msg.data}`);
          for (const selectedId of msg.data) {
            if (DEBUG) console.log(`Server->selected id: ${selectedId}`);
            const selectedIdStr = String(selectedId);
            const foundDev = serverState.foundDevices.find(d => d.deviceId === selectedIdStr);
            if (foundDev) {
              if (DEBUG) console.log(`Server->found id that matches into foundDevices: ${selectedId}`);
              serverState.selectedDevices.push({
                deviceId: foundDev.deviceId,
                name: foundDev.name,
                surname: foundDev.surname,
                weight: foundDev.weight,
                height: foundDev.height,
                birthDate: foundDev.birthDate,
                sex: foundDev.sex,
              });
            }
          }
          if (DEBUG)console.log("Server->Updated selected devices:", serverState.selectedDevices);
          console.log("Server->Forwarding message to ANT Manager...");
          handleAppMessage(msg);
          break;
        case "shutDown":
          console.log("Server->Shutting down...")
          shutdown();
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
  if (DEBUG) console.log("Server->Phase set to " + newPhase + " , sending state to client...");
  sendStateToClient(clientSocket);
}

function sendStateToClient(ws) {
  ws.send(JSON.stringify({
    type: "currentState",
    data: serverState
  }));
  if(DEBUG) console.log(`Server -> sent state to client: ${JSON.stringify({serverState})}`)
}

function shutdown() {
  console.log("\nServer->Shutting down...");

  //close the web socket server
  wss.clients.forEach(client => {
    try {
      client.close();
    } catch (err) {
      console.error("Error closing client:", err);
    }
  });

  wss.close(() => {
    console.log("Server->WebSocket server closed");
  });

  // 2)close the http server
  server.close(() => {
    console.log("Server->HTTP server closed");
    process.exit(0);
  });
}
//capture SIGINT (Ctrl+C)
process.on("SIGINT", shutdown);
//capture SIGTERM (kill)
process.on("SIGTERM", shutdown);

