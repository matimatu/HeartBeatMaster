import * as Ant from "ant-plus-next";
import { queryDeviceOwners } from "../phpConnector.js";

export async function startAntManager() {
    const MAX_CHANNELS = 8;
    const stick = await initializeAntStick();
    if (!stick) {
        console.error("Failed to initialize ANT+ stick");
        process.exit(1);
    }
    try {
        await (stick.open());
    } catch (err) {
        console.error("⚠️ Errore sull'apertura dello stick:", err);
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
        }
    });
    //after 2 seconds stop scanning and check for device users

    setTimeout(async () => {
        hrScanner.detach();
        hrScanner.once("detached", async () => {
            console.log("scanner detached");
            let result = await checkForDeviceUsers(ids);
            displayResults(result);
            //TODO handle user interaction to select the wanted devices to attach to
            //for demo purposes I will just attach to all the devices found after scanning
            let nextChannelAvailable = 0;
            console.log("\nAttaching to ALL detected devices...");
            for (const [deviceId, info] of Object.entries(result)) {
                await attachToDevice(nextChannelAvailable, deviceId);
                nextChannelAvailable++;
                if (nextChannelAvailable >= MAX_CHANNELS) {
                    console.log("Max channels reached, cannot attach to more devices.");
                    break;
                }
            }
        });

    }, 2000);

    // When the stick is ready, start scanning
    stick.on("startup", () => {
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

async function initializeAntStick() {
    let stick = new Ant.GarminStick3();
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
    console.log("Sending device IDs to server:", stringIds);
    const result = await queryDeviceOwners(stringIds);

    return result;
}

async function attachToDevice(channel, deviceId) {
    return new Promise(resolve => {
        const sensor = new Ant.HeartRateSensor(stick);

        sensor.on('attached', () => {
            console.log(`Sensor  ${deviceId} attached on channel ${channel}\n`);
            resolve();
        });

        sensor.on('detached', () => {
            console.log(`Sensor ${deviceId} detached`);
        });

        sensor.attach(channel, deviceId);

        sensor.on("heartRateData", data => {
            console.log(`   DeviceID: ${data.DeviceId}`);
            console.log(`   Frequenza cardiaca: ${data.ComputedHeartRate} bpm`);
            console.log(`   Beat time: ${data.BeatTime}`);
            console.log(data.BatteryLevel !== undefined ? `   Batteria : ${data.BatteryLevel}%` : "");

        });
    });
}

function displayResults(result) {
    for (const [deviceId, info] of Object.entries(result)) {
        console.log("Device:", deviceId);

        if (info.userData) {
            console.log("  Nome completo:", info.userData.nome, info.userData.cognome);
            console.log("  Peso:", info.userData.peso);
            console.log("  Altezza:", info.userData.altezza);
        }
    }
}
