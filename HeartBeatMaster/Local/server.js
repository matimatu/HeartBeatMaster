import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { startAntManager } from "./antManager.js";

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("public"));

startAntManager();

let clientSocket = null;

wss.on("connection", (ws) => {
  console.log("Client connected");
  clientSocket = ws;

  setWsConnection(ws);

  ws.on("close", () => {
    console.log("🔌 Client disconnected");
    clientSocket = null;
  });
});
  