import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { startAntManager,setWsConnection  } from "./ANT/AntManager.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("public"));



let clientSocket = null;

wss.on("connection", (ws) => {
  console.log("Client connected");
  clientSocket = ws;

  setWsConnection(ws);

  ws.on("close", () => {
    console.log("Client disconnected");
    clientSocket = null;
  });
});

const PORT = 8081;      //8080 IS THE DEAFULT PORT FOR APACHE XAMPP,USED FOR TESTING WITH LOCALHOST
server.listen(PORT, () => {
  console.log(` Server started on http://localhost:${PORT}`);
});

await startAntManager();