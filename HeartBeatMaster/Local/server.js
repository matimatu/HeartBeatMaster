import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { startAntManager,setWsConnection,handleAppMessage  } from "./ANT/AntManager.js";

const PORT = 8081;      //8080 IS THE DEAFULT PORT FOR APACHE XAMPP,USED FOR TESTING WITH LOCALHOST
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static("public"));

let clientSocket = null;

server.listen(PORT, () => {
  console.log(` Server started on http://localhost:${PORT}`);
  console.log("Waiting for client connection...");
});

wss.on("connection", (ws) => {
  console.log("Client connected");
  clientSocket = ws;

  setWsConnection(ws);

  startAntManager();

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);
      console.log("message received from client:", data);
      // Send message to ANT Manager
      handleAppMessage(data);
    } catch (err) {
      console.error("Error on parsing message:", err);
    }
  });

  ws.on("close", () => {
    console.log("Client disconnected");
    clientSocket = null;
  });
});



