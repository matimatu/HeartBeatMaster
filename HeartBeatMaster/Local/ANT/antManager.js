import * as Ant from "ant-plus-next";
import { queryDeviceOwners } from "../Public/phpConnector.js";
import { setPhase } from "../server.js";
import { MessageTypes, Phases, Sex } from "../Public/costantsHandler.js";
let stick = null;
let stickOpened = false;
let wsClient = null;
let running = false; // to handle multiple starts
const DEBUG = false;
const SCANNING_TIME = 1000;     //in ms
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
        stickOpened = true;
    } catch (err) {
        console.error("Errore sull'apertura dello stick:", err);
        process.exit(1);
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
            console.log(data.BatteryLevel !== undefined ? `   Batteria : ${data.BatteryLevel}%` : "");
            //send data to frontend
            sendToClient({ type: MessageTypes.NEW_SENSOR, data });
        }
    });
    //after SCANNING_TIME stop scanning and check for device users

    setTimeout(async () => {
        hrScanner.detach();
        hrScanner.once("detached", async () => {
            console.log("scanner detached");
            sendToClient({ type: MessageTypes.SCAN_RESULT, data: ids });
            let result;
            try {
                result = await checkForDeviceUsers(ids);
            }
            catch (err) {
                console.error("Error on checkForDeviceUsers", err)
                const msg = err.message || "";
                let data = "";
                const isSqlStateError = msg.includes("SQLSTATE[HY000]");
                const isConnectionRefused = msg.includes("[2002]");
                if (isSqlStateError && isConnectionRefused) {
                    data = "Errore DB: Impossibile stabilire la connessione al database!";
                }
                else if (msg.includes("fetch failed")) {
                    data = "Errore sul sito: Sito non raggiungibile!";
                }
                else if (msg.includes("No device IDs provided")) {
                    data = "Nessun dispositivo da controllare!";
                }
                else {
                    data = "Unknown error:" + msg;
                }
                console.log("Sending error to client...");
                sendToClient({ type: MessageTypes.ERROR_ON_CHECKFORDEVICEUSERS, data })
                return;
            }
            displayAndSendResults(result);
            setPhase(Phases.SELECTION);      //TODO for now is useless,since the server has FoundDevices empty
        });

    }, SCANNING_TIME);

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
        if (DEBUG) console.log("ANT-> send to client", obj)
    }
}

export async function handleAppMessage(msg) {
    switch (msg.type) {
        case MessageTypes.UPDATE_SELECTED_DEVICE:
            console.log("ANTManager-> List of selected devices received from app:", msg.data);
            let errorCode = await attachSelectedDevices(msg.data);
            if (errorCode == "") {
                // if (DEBUG) {
                console.log("ANTManager-> Successfully attached to all selected devices.");
                console.log("Entering workout phase...");
                // }
                setPhase(Phases.WORKOUT);
            }
            else {
                switch (errorCode) {
                    case "WARMUP_TIMEOUT":
                        console.log("ANTManager-> Trying to continue to workout anyway...");
                        setPhase(Phases.WORKOUT);
                        break;
                    default:
                        console.error("ANTManager-> Failed to attach to all devices!");
                        break;
                }
            }
            break;

        default:
            console.error("ANTManager-> Command not recognised", msg);
    }
}

async function initializeAntStick() {
    stick = new Ant.GarminStick3();
    if (!(await stick.isPresent())) {
        console.log("ANTManager-> Stick3 ANT+ doesn't exist");
        console.log("Trying Stick2...");
        stick = new Ant.GarminStick2();

        if (!(await stick.isPresent())) {
            console.error("ANTManager-> Stick2 doesn't exist!!");
            return null;
        }
    }
    return stick;
}
async function checkForDeviceUsers(ids) {
    if (ids.length === 0) {
        console.log("ANTManager-> No device id provided from app!");
        throw new Error("No device IDs provided");
    }
    let stringIds = ids.map(String);
    console.log("ANTManager-> Sending device IDs with API:", stringIds);
    const result = await queryDeviceOwners(stringIds);

    return result;
}

async function attachSelectedDevices(idAndDirectAttach_array) {
    let channel = 0;
    let promises = [];
    if (idAndDirectAttach_array.length === 0) {
        console.log("ANTManager-> No devices selected to attach.");
        //TODO send message to client
        return "NO_SELECTED_DEVICES";
    }
    console.log("\nANTManager-> Attaching to selected devices...");
    console.log(idAndDirectAttach_array.length + " devices to attach to.");
    for (const pair of idAndDirectAttach_array) {
        console.log("\nANTManager-> Attaching to device:", pair.selectedId);
        promises.push(attachDevice( pair.selectedId, channel,pair.isDirectAttach));
        if (pair.isDirectAttach) {
            channel += 1;  // only one channel for the specific attach
        } else {
            channel += 2;  // 2 channels for warmup + specific attach
        }
    }
    if (channel >= stick.maxChannels) {
        console.log("ANTManager-> Max channels reached, cannot attach to more devices.");
        return "MAX_CHANNELS_REACHED";
    }
    try {
        await Promise.all(promises);
        console.log("AttachSelectedDevices", "bulk attach ended! ALL DEVICES ATTACHED");
    } catch (err) {
        console.log("AttachSelectedDevices", `catched error ${err.message} `);
        return err.message;
    }
    return "";
}



/**
 * Attach with a short warmup phase followed by a specific attach.
 *
 * Performs a quick warmup scan to detect the device, then detaches and
 * attempts a specific attach on a dedicated channel to receive full data.
 * Handles timeouts and resolves or rejects the provided promise.
 *
 * @param {number} deviceId - Sensor device ID to attach.
 * @param {number} channel - Channel used for warmup scan.
 * @param {number} specificChannel - Channel used for the specific attach.
 * @param {Function} resolve - Promise resolve callback.
 * @param {Function} reject - Promise reject callback.
 * @returns {void} Resolves via the provided callbacks when attached.
 * @throws {Error} When warmup or specific attach times out.
 */
async function attachWithWarmup(deviceId, channel, specificChannel, resolve, reject) {
    const context = `[Device ${deviceId}]`;
    let finished = false;
    let warmupTimeout;
    let specificTimeout;
    let warmupSensor = null;
    let specificSensor = null;
    let gotFirstData = false;

    warmupSensor = new Ant.HeartRateSensor(stick);

    warmupSensor.on("attached", () => {
        console.log(context, `Warmup sensor attached on ch ${channel}`);
    });

    warmupSensor.on("heartRateData", data => {
        if (data.DeviceId === deviceId && !gotFirstData) {
            gotFirstData = true;
            console.log(context, ` Device detected: ${data.DeviceId}`);
            clearTimeout(warmupTimeout);
            warmupSensor.detach();
        }
    });

    warmupSensor.on("detached", () => {
        console.log(context, "Warmup sensor detached");

        if (!gotFirstData) {
            console.log(context, "Device not detected during warmup!!");
        }
        specificSensor = new Ant.HeartRateSensor(stick);

        specificSensor.on("attached", () => {
            if (finished) return;
            finished = true;
            clearTimeout(specificTimeout);
            console.log(context, `Specific sensor attached on channel ${specificChannel}`);
            sendToClient({ type: MessageTypes.DEVICE_ATTACHED, deviceId, channel });
            resolve();
        });

        specificSensor.on("heartRateData", data => {
            if (data.DeviceId === deviceId) {
                console.log(`ANTManager-> ${context}  \nDeviceID: ${data.DeviceId}`);
                console.log(`   DeviceID: ${data.DeviceId}`);
                console.log(`   Frequenza cardiaca: ${data.ComputedHeartRate} bpm`);
                // console.log(`   Beat time: ${data.BeatTime}`);
                // console.log(`   Beat Count: ${data.BeatCount}`);
                // console.log(`  Previous Beat: ${data.PreviousBeat}`);
                console.log(data.BatteryLevel !== undefined ? `   Batteria : ${data.BatteryLevel}%` : "");
                sendToClient({ type: MessageTypes.HEART_RATE, data });

            }
        });

        specificSensor.on("detached", () => {
            console.error(context, "Specific sensor detached!");
        });

        console.log(context, `Attaching specific sensor on channel ${specificChannel}`);
        specificSensor.attach(specificChannel, deviceId);

        specificTimeout = setTimeout(() => {
            if (finished) return;
            finished = true;
            reject(new Error("SPECIFIC_ATTACH_TIMEOUT"));
        }, 3000);
    });

    console.log(context, `Attaching warmup on channel ${channel}...`);
    warmupSensor.attach(channel, 0);

    warmupTimeout = setTimeout(() => {
        if (finished || gotFirstData) return;
        console.log(context, "Warmup timeout");
        warmupSensor.detach();
        if (!finished) {
            reject(new Error("WARMUP_TIMEOUT"));
        }
    }, 3000);
}
/**
 * Attach directly to a specific sensor ID on a single channel.
 *
 * Attempts immediate specific-channel attachment and listens for heart rate
 * data. Resolves when attached and rejects on timeout or failure.
 *
 * @param {number} deviceId - Sensor device ID to attach.
 * @param {number} channel - Channel to attach on.
 * @param {Function} resolve - Promise resolve callback.
 * @param {Function} reject - Promise reject callback.
 * @returns {void} Resolves via the provided callbacks when attached.
 * @throws {Error} When direct attach times out or fails.
 */
async function attachDirectToDevice(deviceId, channel, resolve, reject) {
    const context = `[Device ${deviceId}]`;
    let finished = false;
    let directTimeout;

    const specificSensor = new Ant.HeartRateSensor(stick);

    specificSensor.on("attached", () => {
        if (finished) return;
        finished = true;
        clearTimeout(directTimeout);
        console.log(context, `Sensor attached on channel ${channel}`);
        sendToClient({ type: MessageTypes.DEVICE_ATTACHED, deviceId, channel });

        resolve();
    });

    specificSensor.on("heartRateData", data => {
        if (data.DeviceId === deviceId) {
            console.log(`ANTManager-> ${context}  \nDeviceID: ${data.DeviceId}`);
            console.log(`   DeviceID: ${data.DeviceId}`);
            console.log(`   Frequenza cardiaca: ${data.ComputedHeartRate} bpm`);
            // console.log(`   Beat time: ${data.BeatTime}`);
            // console.log(`   Beat Count: ${data.BeatCount}`);
            // console.log(`  Previous Beat: ${data.PreviousBeat}`);
            console.log(data.BatteryLevel !== undefined ? `   Batteria : ${data.BatteryLevel}%` : "");
            sendToClient({ type: MessageTypes.HEART_RATE, data });
        }
    });

    specificSensor.on("detached", () => {
        console.error(context, "Sensor detached!");
    });

    console.log(context, `Attaching to specific ID ${deviceId} on channel ${channel}...`);
    specificSensor.attach(channel, deviceId);

    directTimeout = setTimeout(() => {
        if (finished) return;
        finished = true;
        reject(new Error("DIRECT_ATTACH_TIMEOUT"));
    }, 3000);
}
/**
 * High-level attach wrapper that chooses the attach strategy.
 *
 * Inspects the device ID and delegates to either direct attach or the
 * warmup+specific attach flow, returning a promise that resolves on attach.
 *
 * @param {number} deviceId - Sensor device ID to attach.
 * @param {number} channel - Starting channel index to use.
 * @returns {Promise<void>} Resolves when attachment succeeds.
 * @throws {Error} Rejects with attach error codes on failure.
 */
async function attachDevice(deviceId, channel,isDirectAttach) {
    return new Promise((resolve, reject) => {
        const context = `[Device ${deviceId}]`;

        if (isDirectAttach) {
            console.log(context, `Direct attach to specific ID on channel ${channel}`);
            attachDirectToDevice(deviceId, channel, resolve, reject);
        }
        else {
            console.log(context, `Starting warmup on channel ${channel}`);
            attachWithWarmup(deviceId, channel, channel + 1, resolve, reject);
        }
    });
}

export async function closeStick() {
    try {
        if (!stick) {
            console.log("ANTManager-> Stick not yet existing so no problem.");
            return true;
        }
        if (stickOpened) {
            await stick.close();
            console.log("ANTManager-> Stick closed.");
            stickOpened = false;
            return true;
        }
        else {
            console.log("ANTManager-> Stick already closed.");
            return true;
        }
    } catch (err) {
        console.error("ANTManager-> error on trying to close the stick", err);
        return false;
    }
}

function displayAndSendResults(result) {
    console.log("\nResults:");
    for (const [deviceId, data] of Object.entries(result)) {
        console.log("Device:", deviceId);
        if (data.userData) {
            console.log("  Direct attach:",data.isDirectAttach);
            console.log("  Username:", data.userData.nome, data.userData.cognome);
            console.log("  Weight:", data.userData.peso);
            console.log("  Height:", data.userData.altezza);
            console.log("  Sex:", data.userData.sesso === Sex.MALE ? Sex.MALE : Sex.FEMALE);
            const info = {
                registered: true,
                isDirectAttach: data.isDirectAttach,
                name: data.userData.nome,
                surname: data.userData.cognome,
                weight: data.userData.peso,
                height: data.userData.altezza,
                birthDate: data.userData.data_nascita,
                sex: data.userData.sesso,
            };
            sendToClient({ type: MessageTypes.DEVICE_USER_INFO, data: { deviceId, ...info } });//the ... dismembers the info struct
        }
        else {
            console.log("  No user data associated with this device.");
            const registered = false;
            sendToClient({ type: MessageTypes.DEVICE_USER_INFO, data: { deviceId, registered } });
        }
    }
}
