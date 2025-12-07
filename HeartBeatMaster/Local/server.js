import express from "express";
import { WebSocketServer } from "ws";
import http from "http";
import { startAntManager, setWsConnection, handleAppMessage, closeStick } from "./ANT/antManager.js";
import { MessageTypes,WorkoutTypes,Phases } from "./Public/costantsHandler.js";
import { saveWorkoutData } from "./Public/phpConnector.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

//interval durations
const TEN_SEC = 1 * 10 * 1000; // 10 seconds in ms, for debugging purposes
const ONE_MIN = 1 * 60 * 1000; // 1 minutes in ms
const FIVE_MIN = 5 * 60 * 1000; // 5 minutes in ms

const PORT = 8080;
const DEBUG = true;
const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const serverState = {
    phase: Phases.SCANNING,      // Phases.SCANNING | Phases.SELECTION | Phases.WORKOUT
    foundDevices: [],       // [{ registered, deviceId, name, surname, weight, birthDate, sex }]           useful in scanning and selection phases
    selectedDevices: [],    // [{ deviceId, name, surname, weight, birthDate,hrMax, hrMin, hrBuffer[] }]   useful in workout phase
    workoutData:{}              // { startDate, endDate, intervalDuration, type}                     useful in workout phase
};

app.use(express.static("public"));

let clientSocket = null;

server.listen(PORT, () => {
    console.log(`Server-> started on http://localhost:${PORT}`);
    console.log("Server-> Waiting for client connection...");
});

wss.on("connection", (ws) => {
    console.log("Server-> Client connected");
    clientSocket = ws;
    sendStateToClient(ws);
    setWsConnection(ws);

    startAntManager();

    ws.onmessage = e  =>  {
        try {
            const msg = JSON.parse(e.data);
            if (DEBUG)
                console.log("Server->  message received from client:", msg);
            switch (msg.type) {
                case MessageTypes.UPDATE_FOUND_DEVICE:
                    if (msg.data.registered === true) {
                        const index = serverState.foundDevices.findIndex(d => d.deviceId === msg.data.deviceId && d.registered === false);
                        if (index !== -1) {
                            serverState.foundDevices.splice(index, 1);
                            if (DEBUG) console.log("Server-> new device registered, removed old unknown device")
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

                    console.log("Server-> Updated found devices:", serverState.foundDevices);
                    console.log("\nServer-> waiting for client to select devices...");      //TODO it may be not the time to send this message!
                    break;
                case MessageTypes.UPDATE_SELECTED_DEVICE:
                    if (DEBUG) console.log(`Server-> data received on updateSelectedDevice: ${msg.data}`);
                    for (const selectedId of msg.data) {
                        if (DEBUG) console.log(`Server-> selected id: ${selectedId}`);
                        const selectedIdStr = String(selectedId);
                        const foundDev = serverState.foundDevices.find(d => d.deviceId === selectedIdStr);
                        if (foundDev) {
                            if (DEBUG) console.log(`Server-> found id that matches into foundDevices: ${selectedId}`);
                            serverState.selectedDevices.push({
                                deviceId: foundDev.deviceId,
                                name: foundDev.name,
                                surname: foundDev.surname,
                                weight: foundDev.weight,
                                height: foundDev.height,
                                birthDate: foundDev.birthDate,
                                sex: foundDev.sex,
                                hrBuffer: []  //will contains tuples of { hr: number, timestamp: number }
                            });
                        }
                    }
                    if (DEBUG) console.log("Server-> Updated selected devices:", serverState.selectedDevices);
                    console.log("Server-> Forwarding message to ANT Manager...");
                    handleAppMessage(msg);
                    break;
                case MessageTypes.AVG_DEVICE_DATA:
                    if (updateDeviceData_JSON(msg.data.deviceId, msg.data.name, msg.data.surname,
                        msg.data.avgHr, msg.data.caloriesBurnt, msg.data.avgIntensity)) {
                        if (DEBUG) console.log("Server-> JSON updated");
                    }
                    else {
                        shutdown();
                    }
                    break;
                case MessageTypes.END_WORKOUT:
                    console.log("\nServer-> ordering to ANTManager to close the stick...");
                    closeStick();
                    if(msg.data.endDateWorkout == null){
                        console.error("Server-> END_WORKOUT message missing endDateWorkout data");
                        break;
                    }
                     if(serverState.workoutData.type == null){
                        console.error("Server-> END_WORKOUT serverState missing type data");
                        break;
                    }
                    if(serverState.workoutData.startDate == null){
                        console.error("Server-> END_WORKOUT serverState missing startDate data");
                        break;
                    }
                    serverState.workoutData.endDate = msg.data.endDateWorkout;
                    var filePath = path.join(__dirname, "devicesData.json");
                    var data = [];
                    if (fs.existsSync(filePath)) {
                        var raw = fs.readFileSync(filePath, "utf-8");
                        data = JSON.parse(raw);
                    }
                    saveWorkoutData(data,serverState.workoutData.startDate,serverState.workoutData.endDate,
                        serverState.workoutData.intervalDuration,serverState.workoutData.type)
                        .then(result => {
                            if (result) {
                                if(DEBUG) console.log("Server-> Workout data saved successfully");
                            } else {
                                console.error("Server-> Failed to save workout data");
                            }
                        })
                        .catch(err => {
                            console.error("Server-> Error saving workout data:", err);
                        });
                    break;
                case MessageTypes.SHUTDOWN:
                    console.log("Server-> Shutting down...")
                    shutdown();
                    break;
                default:
                    console.error(`Server-> msg type not recognised: ${msg.type} `);
                    break;
            }

        } catch (err) {
            if (err instanceof SyntaxError) {
                console.error("Server-> Parsing error: invalid JSON: ", err.message);
                return;
            }
            console.error("Server-> Error on handling message: ", err);
        }
    };

    ws.on("close", () => {
        console.log("Server-> Client disconnected");
        clientSocket = null;
    });
});

export function setPhase(newPhase) {
    switch (newPhase) {
        case Phases.SCANNING:
        case Phases.SELECTION:
            break;
        case Phases.WORKOUT:
              const ts = Date.now();
            const startDateWorkout = new Date(ts);
            serverState.workoutData.startDate = startDateWorkout;     //TODO maybe move the initialization of startDate in a more precise place
            serverState.workoutData.intervalDuration = (DEBUG) ? TEN_SEC : ONE_MIN;
            serverState.workoutData.type = WorkoutTypes.INTERVAL;       //TODO UI to select different types
            break;
        default:
            console.error("Server-> Invalid phase:", newPhase);
            return;
    }
    serverState.phase = newPhase;
    if (DEBUG) console.log("Server-> Phase set to " + newPhase + " , sending state to client...");
    sendStateToClient(clientSocket);
}

function sendStateToClient(ws) {
    if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify({ type: MessageTypes.CURRENT_SERVER_STATE, data: serverState }));
        if (DEBUG) console.log(`Server -> sent currentState to client: ${JSON.stringify({ serverState })}`)
    }
    else
        console.error("\nws error, unable to send currentState to client!");

}

function shutdown() {   //TODO  add a deadline if the server doesn't stop
    console.log("\nServer-> Shutting down...");
    console.log("\nServer-> ordering to ANTManager to detach all devices...");
    closeStick();

    console.log("Server-> Clearing JSON data file...");
    clearDeviceData_JSON();

    console.log("\nServer-> closing WebSocket server...");
    //close the web socket server
    wss.clients.forEach(client => {
        try {
            client.close();
        } catch (err) {
            console.error("Error closing client:", err);
        }
    });

    wss.close(() => {
        console.log("Server-> WebSocket server closed");
    });

    // 2)close the http server
    server.close(() => {
        console.log("Server-> HTTP server closed");
        process.exit(0);
    });
}
//capture SIGINT (Ctrl+C)
process.on("SIGINT", shutdown);
//capture SIGTERM (kill)
process.on("SIGTERM", shutdown);

/////////////////////////////////////////////// JSON FILE FUNCTIONS //////////////////////////////////////////////////////

function getDeviceById_JSON(deviceId, filePath) {
    if (!fs.existsSync(filePath)) {
        console.log("File json not found");
        return null;
    }

    var json = JSON.parse(fs.readFileSync(filePath, "utf-8"));

    for (var i = 0; i < json.length; i++) {
        if (json[i].deviceId === deviceId) {
            return json[i];
        }
    }
    return null;
}

function updateDeviceData_JSON(deviceId, name, surname, avgHeartRate, caloriesBurnt, intensity) {
    try {
        var filePath = path.join(__dirname, "devicesData.json");
        var data = [];

        // If file exists, read existing data
        if (fs.existsSync(filePath)) {
            var raw = fs.readFileSync(filePath, "utf-8");
            data = JSON.parse(raw);
        }

        // Find the data by deviceId
        var device = null;

        for (var i = 0; i < data.length; i++) {
            if (data[i].deviceId === deviceId) {
                device = data[i];
                break;
            }
        }

        // If device not found, create a new entry
        if (!device) {
            device = {
                deviceId: deviceId,
                name: name,
                surname: surname,
                avgHeartRatePerMin: [],
                caloriesBurntPerMin: [],
                intensityPerMin: []
            };
            data.push(device);
        }

        // Update the arrays with new data per minute
        device.avgHeartRatePerMin.push(avgHeartRate);
        device.caloriesBurntPerMin.push(caloriesBurnt);
        device.intensityPerMin.push(intensity);


        if (device.avgHeartRatePerMin.length > 60) device.avgHeartRatePerMin.shift();
        if (device.caloriesBurntPerMin.length > 60) device.caloriesBurntPerMin.shift();
        if (device.intensityPerMin.length > 60) device.intensityPerMin.shift();

        // Rewrite the JSON file with updated data
        fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
    } catch (err) {
        if (err instanceof SyntaxError) {
            console.error("Server-> updateDeviceData_JSON-> Parsing error: invalid JSON: ", err.message);
        }
        else if (err instanceof TypeError) {
            console.error("Server-> updateDeviceData_JSON-> Type error in path.join: ", err.message);
        }
        else {
            console.error("Server-> updateDeviceData_JSON-> Error: ", err.message);
        }
        return false;
    }
    return true;
}

function clearDeviceData_JSON() {
    try {
        const filePath = path.join(__dirname, "devicesData.json");

        // Sovrascrive il file con un array vuoto
        fs.writeFileSync(filePath, JSON.stringify([], null, 4));

        console.log("Server-> clearDeviceData_JSON -> File cleared successfully.");
        return true;
    } catch (err) {
        if (err instanceof TypeError) {
            console.error("Server-> clearDeviceData_JSON -> Type error: ", err.message);
        } else {
            console.error("Server-> clearDeviceData_JSON -> Error: ", err.message);
        }
        return false;
    }
}