
import * as Ant from "ant-plus-next";
import { queryDeviceOwners } from "../phpConnector.js";

let stick = null;
let wsClient = null;
let running = false; // to handle multiple starts
const DEBUG = true;
export async function startAntManager() {
    console.log("\n\nStarting ANT+ process...");
    if (running) {
        console.log("\n\nANT+ process already running.");
        return;
    }
    running = true;
    stick = await initializeAntStick();
    if (!stick) {
        console.error("Failed to initialize ANT+ stick");
        process.exit(1);
    }
    try {
        await (stick.open());
    } catch (err) {
        console.error("Errore sull'apertura dello stick:", err);
    }
    //start scanning for heart rate monitors
    let ids = [];
    const hrScanner = new Ant.HeartRateScanner(stick);


    hrScanner.on("heartRateData", data => {
        if (data.DeviceId !== 0 && !ids.includes(data.DeviceId)) {
            ids.push(data.DeviceId);
            console.log("New sensor found:");
            console.log(`   DeviceID: ${data.DeviceId}`);
            console.log(`   Frequenza cardiaca: ${data.ComputedHeartRate} bpm`);
            console.log(`   Beat time: ${data.BeatTime}`);
            console.log(data.BatteryLevel !== undefined ? `   Batteria : ${data.BatteryLevel}%` : "");
            //send data to frontend
            sendToClient({ type: "newSensor", data });
        }
    });
    //after 2 seconds stop scanning and check for device users

    setTimeout(async () => {
        hrScanner.detach();
        hrScanner.once("detached", async () => {
            console.log("scanner detached");
            sendToClient({ type: "scanResult", data: ids });

            let result = await checkForDeviceUsers(ids);
            displayResults(result);
            //TODO handle user interaction to select the wanted devices to attach to
            //for demo purposes I will just attach to all the devices found after scanning
            // await attachSelectedDevices(result);
        });

    }, 4000);

    // When the stick is ready, start scanning
    stick.on("startup", () => {
        console.log("Max channels:", stick.maxChannels);
        console.log("Stick ANT+ started, scanning...");
        hrScanner.scan();
    });

    stick.on("error", err => {
        console.error("Stick error:", err);
    });

    // Log when the scanner is attached/detached
    hrScanner.on("attached", () => {
        console.log("scanner attached");
    });


}



/////////////////////////////////////////////// FUNCTIONS ///////////////////////////////////////////////

export function setWsConnection(ws) {
  wsClient = ws;
}

function sendToClient(obj) {
  if (wsClient && wsClient.readyState === wsClient.OPEN) {
    wsClient.send(JSON.stringify(obj));
  }
}

export async function handleAppMessage(msg) {
  switch (msg.type) {
    case "selectedDevices":
      console.log("List of selected devices received from app:", msg.data);
      attachSelectedDevices(msg.data);
      break;

    default:
      console.log("Command not recognised", msg);
  }
}

async function initializeAntStick() {
    stick = new Ant.GarminStick3();
    if (!(await stick.isPresent())) {
        console.log("Stick3 ANT+ doesn't exist");
        console.log("Trying Stick2...");
        stick = new Ant.GarminStick2();

        if (!(await stick.isPresent())) {
            console.error("Stick2 doesn't exist!!");
            return null;
        }
    }
    return stick;
}
async function checkForDeviceUsers(ids) {
    if (ids.length === 0) {
        console.log("No device found, couldn't check for users.");
        process.exit(0);
    }
    let stringIds = ids.map(String);
    console.log("Sending device IDs with API:", stringIds);
    const result = await queryDeviceOwners(stringIds);

    return result;
}

async function attachSelectedDevices(ids) {
    let nextChannelAvailable = 0;
    console.log("\nAttaching to selected devices...");
    console.log(ids.length + " devices to attach to.");
    for (const deviceId of ids) {
        console.log("\nAttaching to device:", deviceId);
        try {
            await attachToDevice(nextChannelAvailable, deviceId); 
        } catch (error) {
            console.error(`Failed to attach to device ${deviceId}:`, error.message);
            console.log("Trying wildcard attach...");
            await attachToDevice(nextChannelAvailable, 0); //tryng wildcard attach
        }
        
        nextChannelAvailable++;
        if (nextChannelAvailable >= stick.maxChannels) {
            console.log("Max channels reached, cannot attach to more devices.");
            break;
        }
    }
}

/**
 * Attaches to a specific ANT+ heart rate device on a given channel.
 * 
 * @async
 * @function attachToDevice
 * @param {number} channel - The ANT+ channel number to attach the sensor to
 * @param {number} deviceId - The device ID of the heart rate sensor to attach
 * @returns {Promise<void>} Resolves when the sensor is successfully attached
 * @throws {Error} Throws an error with message "ATTACH_TIMEOUT" if the sensor fails to attach within 2000ms
 * 
 * @description
 * Attempts to attach a heart rate sensor to the specified channel and device ID.
 * Sets up event listeners for sensor attachment, detachment, and heart rate data.
 * Sends WebSocket messages to notify clients of attachment status and heart rate updates.
 * If attachment does not complete within 2 seconds, the promise is rejected with an ATTACH_TIMEOUT error.
 */
async function attachToDevice(channel, deviceId) {
    return new Promise((resolve,reject) => {
        const sensor = new Ant.HeartRateSensor(stick);
        let finished = false;

        sensor.on('attached', () => {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            console.log(`Sensor  ${deviceId} attached on channel ${channel}\n`);
            sendToClient({ type: "UserDevice_attached", deviceId, channel });
            resolve();
        });

        sensor.on('detached', () => {
            console.log(`Sensor ${deviceId} detached`);
            sendToClient({ type: "UserDevice_detached", deviceId, channel });

        });

        sensor.attach(channel, deviceId);

        sensor.on("heartRateData", data => {
            console.log(`   DeviceID: ${data.DeviceId}`);
            console.log(`   Frequenza cardiaca: ${data.ComputedHeartRate} bpm`);
            console.log(`   Beat time: ${data.BeatTime}`);
            console.log(data.BatteryLevel !== undefined ? `   Batteria : ${data.BatteryLevel}%` : "");

            sendToClient({ type: "heartRate", data });
        });

        const timer = setTimeout(() => {
            if (finished) return;
            finished = true;

            try { sensor.detach(); } catch { }

            reject(new Error("ATTACH_TIMEOUT"));
        }, 2000);
    });
}

function displayResults(result) {
    console.log("\nResults:");
    for (const [deviceId, info] of Object.entries(result)) {
        console.log("Device:", deviceId);

        if (info.userData) {
            console.log("  Nome completo:", info.userData.nome, info.userData.cognome);
            console.log("  Peso:", info.userData.peso);
            console.log("  Altezza:", info.userData.altezza);
            console.log("  Sesso:", info.userData.maschio === "1" ? "Maschio" : "Femmina");
            sendToClient({ type: "deviceUserInfo", data: { deviceId, ...info.userData } });
        }
        else
        {
            console.log("  No user data associated with this device.");
        }
    }
}
