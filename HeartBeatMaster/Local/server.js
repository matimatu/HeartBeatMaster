import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { startAntManager, getConnectedDevices } from './antManager.js';

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.use(express.static('public'));

startAntManager();
  