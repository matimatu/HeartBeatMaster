import * as Ant from "ant-plus-next";
import { queryDeviceOwners } from './phpConnector.js';


const stick = await initializeAntStick();
if (!stick) {
    console.error("Failed to initialize ANT+ stick");
    process.exit(1);
}

try {
    await(stick.open());
} catch (err) {
     console.error("⚠️ Errore sull'apertura dello stick:", err);
}

///////////////////START TO SCAN HEART RATE DEVICES ///////////////////
let ids = [];
const hrScanner = new Ant.HeartRateScanner(stick);

hrScanner.on("heartRateData", data => {
    if(data.DeviceId !== 0 && !ids.includes(data.DeviceId)) {
        ids.push(data.DeviceId);
        console.log("❤️ Nuovo sensore rilevato:");
        console.log(`   DeviceID: ${data.DeviceId}`);
        console.log(`   Frequenza cardiaca: ${data.ComputedHeartRate} bpm`);
        console.log(`   Beat time: ${data.BeatTime}`);
        // console.log(data.BatteryLevel !== undefined ? `   Batteria : ${data.BatteryLevel}%` : "");
    }
});


//after 2 seconds...
 setTimeout(async ()=> {
        hrScanner.detach();
        hrScanner.once("detached", async() =>  
            {
            console.log("scanner detached");
            let result = await checkForDeviceUsers(ids);
            displayResults(result);
            });
    }, 2000);



//////////////////////////////////EVENT LISTENERS ///////////////////////////////////////////////////////

// When the stick is ready, start scanning
stick.on("startup", ()  => {
    console.log("🚀 Stick ANT+ avviato, inizio scansione...");
    hrScanner.scan();
});


stick.on("error", err => {
    console.error("❌ Errore stick:", err);
});

// Log when the scanner is attached/detached
hrScanner.on("attached", () => {
    console.log("scanner attached");
});



/////////////////////////////////////////////// FUNCTIONS ///////////////////////////////////////////////
async function initializeAntStick() {
    let stick = new Ant.GarminStick3();

    if(!(await stick.isPresent())) {
        console.log("Stick3 ANT+ doesn't exist");
        console.log("Trying Stick2...");
        stick = new Ant.GarminStick2();

        if(!(await stick.isPresent())){
            console.error("Stick2 doesn't exist!!");
            return null;
        }
    }

    return stick;
}
async function checkForDeviceUsers(ids) {
    if (ids.length === 0) {
        console.log("Nessun dispositivo rilevato, impossibile interrogare il server.");
        process.exit(0);
    }
    let stringIds = ids.map(String);
    console.log("Sending device IDs to server:", stringIds);
    const result = await queryDeviceOwners(stringIds);

    return result;
}

function displayResults(result) {
    for (const [deviceId, info] of Object.entries(result)) {
        console.log('Device:', deviceId);
        console.log('  Username:', info.username);
        console.log('  Registered:', info.registered);

        if (info.userData) {
            console.log('  Nome completo:', info.userData.nome, info.userData.cognome);
            console.log('  Peso:', info.userData.peso);
            console.log('  Altezza:', info.userData.altezza);
        }
    }
}
