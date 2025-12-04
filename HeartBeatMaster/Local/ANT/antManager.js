
import * as Ant from "ant-plus-next";
import { queryDeviceOwners } from "../Public/phpConnector.js";
import { setPhase } from "../server.js";

let stick = null;
let wsClient = null;
let running = false; // to handle multiple starts
const DEBUG = false;
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
            let result;
            try{
               result  = await checkForDeviceUsers(ids);        //TODO handle site connection error
            }
            catch(err){
                console.error("Error on checkForDeviceUsers", err)
                const msg = err.message || "";
                let data = "";
                const isSqlStateError = msg.includes("SQLSTATE[HY000]");
                const isConnectionRefused = msg.includes("[2002]");
                if (isSqlStateError && isConnectionRefused) {
                    data = "Errore DB: Impossibile stabilire la connessione al database!";
                }
                else if(msg.includes("fetch failed"))
                {
                    data = "Errore sul sito: Sito non raggiungibile!";
                }
                else
                {
                    data = "Unknown error:" + msg;
                }
                console.log("Sending error to client...");
                sendToClient({type: "error",data})
                return;
            }
            displayResults(result);
            setPhase("selection");
        });

    }, 2000);

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
    if(DEBUG) console.log("ANT-> send to client",obj)
  }
}

export async function handleAppMessage(msg) {
  switch (msg.type) {
    case "updateSelectedDevice":
        console.log("List of selected devices received from app:", msg.data);
        let result = await attachSelectedDevices(msg.data);
        if (result) {
            if(DEBUG) {           
                console.log("Successfully attached to all selected devices.");
                console.log("Entering training phase...");
            }
            setPhase("training");
        } else {
        console.error("Failed to attach to all selected devices.");
        }
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
            try {
                await attachToDevice(nextChannelAvailable, 0); //tryng wildcard attach
                
            } catch (error) {
                console.error(`Wildcard attach also failed for device ${deviceId}:`, error.message);
                return false;
            }
        }
        
        nextChannelAvailable++;
        if (nextChannelAvailable >= stick.maxChannels) {
            console.log("Max channels reached, cannot attach to more devices.");
            return false;
        }
    }
    return true;
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
 * If attachment does not complete within 1 seconds, the promise is rejected with an ATTACH_TIMEOUT error.
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
            console.log(`   \nDeviceID: ${data.DeviceId}`);
            console.log(`   Frequenza cardiaca: ${data.ComputedHeartRate} bpm`);
            console.log(`   Beat time: ${data.BeatTime}`);
            console.log(`   Beat Count: ${data.BeatCount}`);
            console.log(`  Previous Beat: ${data.PreviousBeat}`);
            console.log(data.BatteryLevel !== undefined ? `   Batteria : ${data.BatteryLevel}%` : "");

            sendToClient({ type: "heartRate", data });
        });

        const timer = setTimeout(() => {
            if (finished) return;
            finished = true;

            sensor.detach();

            reject(new Error("ATTACH_TIMEOUT"));
        }, 1000);
    });
}

export async function detachAllDevices(){
    try{
        stick.close();
    }catch(err)
    {
        console.log("ANT-> error on trying to close the stick", err);
    }
}

function displayResults(result) {
    console.log("\nResults:");
    for (const [deviceId, data] of Object.entries(result)) {
        console.log("Device:", deviceId);

        if (data.userData) {
            console.log("  Username:", data.userData.nome, data.userData.cognome);
            console.log("  Weight:", data.userData.peso);
            console.log("  Height:", data.userData.altezza);
            console.log("  Sex:", data.userData.sesso === "male" ? "male" : "female");
            const info = {
                registered: true,
                name: data.userData.nome,
                surname: data.userData.cognome,
                weight: data.userData.peso,
                height: data.userData.altezza,
                birthDate: data.userData.data_nascita,
                sex: data.userData.sesso,
            };                
            sendToClient({ type: "deviceUsersInfo", data: { deviceId, ...info} });//the ... dismembers the info struct
        }
        else
        {
            console.log("  No user data associated with this device.");
            const registered = false;
            sendToClient({ type: "deviceUsersInfo", data: { deviceId, registered} });
        }
    }
}
