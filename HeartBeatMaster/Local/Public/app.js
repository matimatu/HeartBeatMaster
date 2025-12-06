import { calcIntensity, calcHeartRateMax, calcHeartRateMin, calcAvgHeartRate, calcCaloriesBurnedPerTime, calcAgeFromBirthDate } from "./statsHandler.js";
import { registerNewDevice } from "./phpConnector.js";
import { MessageTypes } from "./messageTypes.js";

const DEBUG = true;
let clientState = {
    foundDevices: [],   // [{ deviceId, name, surname, weight, birthDate, sex }]               useful in scanning and selection phases
    selectedDevices: [], // [{ deviceId, name, surname, weight, birthDate, sex, hrMax, hrMin, avgHeartRate, caloriesBurnt }]  useful in training phase
    hrBuffer: [],  // { hr: number, timestamp: number }   //useful for calculating stats
};
const TEN_SEC = 1 * 10 * 1000; // 10 seconds in ms, for debugging purposes
const ONE_MIN = 1 * 60 * 1000; // 1 minutes in ms
const FIVE_MIN = 5 * 60 * 1000; // 5 minutes in ms
const ws = new WebSocket(`ws://${location.host}`);

if (DEBUG) ws.onopen = () => log("Connesso al server");

ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    switch (msg.type) {
        case MessageTypes.NEW_SENSOR:
            if (DEBUG) log(`Nuovo sensore trovato: ${msg.data.DeviceId}`);
            break;
        case MessageTypes.SCAN_RESULT:
            if (DEBUG) log(`Scansione completata (${Object.keys(msg.data).length} dispositivi trovati)`);
            break;
        case MessageTypes.DEVICE_ATTACHED:
            if (DEBUG) log(`Sensore ${msg.deviceId} attaccato (canale ${msg.channel})`);
            break;
        case MessageTypes.DEVICE_DETACHED:
            console.error(msg.type + "not handled!");
            break;
        case MessageTypes.HEART_RATE:
            handleHeartRateMsg(msg);
            break;
        case MessageTypes.DEVICE_USER_INFO:
            renderFoundDevice(msg.data.registered, msg.data.deviceId, msg.data.name, msg.data.surname);
            document.getElementById("button_startAttach").style.display = "block";
            sendToServer({ type: MessageTypes.UPDATE_FOUND_DEVICE, data: msg.data });
            break;
        case MessageTypes.CURRENT_SERVER_STATE:
            switch (msg.data.phase) {
                case "scanning":
                    break;
                case "selection":
                    if (DEBUG) console.log("found devices from server: ", msg);
                    clientState.foundDevices = msg.data.foundDevices;
                    break;
                case "training":
                    clientState.selectedDevices = msg.data.selectedDevices;
                    //calculating hrMax and hrMin for all selectedDevices one time
                    for (const selectedDevice of clientState.selectedDevices) {
                        selectedDevice.hrMax = calcHeartRateMax(selectedDevice.birthDate);
                        selectedDevice.hrMin = calcHeartRateMin(selectedDevice.sex);
                    }
                    break;
                default:
                    console.error("Invalid phase:", msg.data.phase);
                    return;
            }
            if (DEBUG)
                console.log("clientState updated:", clientState, msg.data.phase);
            restoreUI(msg.data);   //TODO handle restoration of UI based on current state
            break;
        case MessageTypes.ERROR:
            if (DEBUG) console.log("Errore ricevuto da ANTManager");
            log(msg.data);
            sendToServer({ type: MessageTypes.SHUTDOWN, data: msg.data });
            break;
        default:
            console.error(`message type not recognised: ${JSON.stringify(msg)}`);
            break;
    }
};


/////////////////////////////////////////////// FUNCTIONS ////////////////////////////////////////////
function handleHeartRateMsg(msg) {
    const id = msg.data.DeviceId;
    if (id === 0) return; //ignore wildcard id
    const selectedDevice = clientState.selectedDevices.find(dev => dev.deviceId == String(id));
    if (selectedDevice) {
        const now = Date.now();
        const hr = msg.data.ComputedHeartRate;
        clientState.hrBuffer.push({ hr, timestamp: now });
        let avgHr = -1;
        let caloriesBurnt = -1;
        const intensity = calcIntensity(hr, selectedDevice.hrMax, selectedDevice.hrMin)
        let timeBeforeCalculating;
        if (DEBUG) timeBeforeCalculating = TEN_SEC;
        else timeBeforeCalculating = ONE_MIN;
        if (clientState.hrBuffer.length > 0 && (now - clientState.hrBuffer[0].timestamp) >= timeBeforeCalculating) {
            avgHr = calcAvgHeartRate(clientState.hrBuffer);
            if (DEBUG) console.log("frequency rate in one minute:", avgHr);
            if (selectedDevice.avgHeartRate === undefined)
                selectedDevice.avgHeartRate = avgHr;
            else {
                selectedDevice.avgHeartRate = avgHr;
            }
            if (DEBUG) console.log("selectedDevice.avgHeartRate updated");

            const age = calcAgeFromBirthDate(selectedDevice.birthDate);
            caloriesBurnt = calcCaloriesBurnedPerTime(selectedDevice.sex, selectedDevice.weight, avgHr, age, 1);
            if (DEBUG) caloriesBurnt = calcCaloriesBurnedPerTime(selectedDevice.sex, selectedDevice.weight, avgHr, age, 0.1);
            if (DEBUG) console.log("Calories burned in one minute:", caloriesBurnt);
            if (selectedDevice.caloriesBurnt === undefined)
                selectedDevice.caloriesBurnt = caloriesBurnt;
            else {
                let caloriesBurntPrev = parseFloat(selectedDevice.caloriesBurnt);
                let caloriesBurntNow = Number(caloriesBurnt) || 0;
                selectedDevice.caloriesBurnt = (caloriesBurntPrev + caloriesBurntNow).toFixed(2);
            }

            if (DEBUG) console.log("selectedDevice.caloriesBurnt updated");
            const avgIntensity = calcIntensity(avgHr, selectedDevice.hrMax, selectedDevice.hrMin);
            clientState.hrBuffer.length = 0; // empty the array
            const deviceId = selectedDevice.deviceId;
            const name = selectedDevice.name;
            const surname = selectedDevice.surname;
            sendToServer({ type: MessageTypes.AVG_DEVICE_DATA, data: { deviceId, name, surname, avgHr, caloriesBurnt, avgIntensity } })
            if (DEBUG) console.log("data sent to server to udpate JSON file");
        }
        renderDeviceStats(selectedDevice.deviceId, selectedDevice.name, selectedDevice.surname,
            msg.data.ComputedHeartRate, intensity, selectedDevice.caloriesBurnt);
    }
    else {
        console.error("device with id " + id + " not found in selectedDevices!", clientState.selectedDevices);
        return;
    }
}

////////////////////////////////////////////WS FUNCTIONS////////////////////////////////////////

function sendToServer(obj) {
    if (ws && ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(obj));
        if (DEBUG) console.log(`message sent to server:${JSON.stringify(obj)}`)
    }
    else
        console.error("\nws error, unable to send message to server!");
}

/////////////////////////////////////////////UI FUNCTIONS////////////////////////////////////////

function log(msg) {
    const el = document.getElementById("log-container");
    el.innerHTML += `<div>${msg}</div>`;
};

function renderFoundDevice(isRegistered, deviceId, nome, cognome) {

    let header = document.getElementById("found-devices-header");
    if (!header) { //if header doesn't exist -> create it
        header = document.createElement("h2");
        header.id = "found-devices-header";
        // header.style.display = "block"; 
        header.textContent = "Dispositivi trovati";
        const logContainer = document.getElementById("log-container");
        logContainer.insertAdjacentElement("afterend", header);
    }
    let table = document.querySelector(".found-devices");
    if (!table) { //if table doesn't exist -> create it
        table = document.createElement("table");
        table.className = "found-devices animation-popup";

        // Crea l'header della tabella
        const headerRow = document.createElement("tr");
        const headers = ["DeviceID", "Nome", "Seleziona"];
        headers.forEach(text => {
            const th = document.createElement("th");
            th.textContent = text;
            headerRow.appendChild(th);
        });

        table.appendChild(headerRow);

        // insert table on DOM under div or h2 header
        header.insertAdjacentElement("afterend", table);

        setTimeout(() => {
            table.classList.add("show");
        }, 50); // 50ms to let the transition happen
    }
    const row = document.createElement("tr");
    const cell1 = document.createElement("td");
    cell1.textContent = deviceId;

    const cell2 = document.createElement("td");
    if (!isRegistered)
        cell2.textContent = "sconosciuto";
    else
        cell2.textContent = nome + " " + cognome;

    const cell3 = document.createElement("td");
    if (isRegistered) {
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = true;
        cell3.appendChild(checkbox);
    }
    else {
        const button = document.createElement("button");
        button.id = "button_registra";
        button.textContent = "registra";
        button.addEventListener("click", (event) => button_registraOnClick(event));
        cell3.appendChild(button);
    }


    row.appendChild(cell1);
    row.appendChild(cell2);
    row.appendChild(cell3);
    table.appendChild(row);
    renderStartAttachButton();
};

function renderStartAttachButton() {
    let btnWrapper = document.querySelector(".btn-wrapper");
    if (!btnWrapper) {
        btnWrapper = document.createElement("div");
        btnWrapper.className = "btn-wrapper animation-popup";

        const button = document.createElement("button");
        button.id = "button_startAttach";
        button.textContent = "Collega device selezionati";
        button.style.display = "none";

        button.addEventListener("click", () => {
            let selectedDeviceIds = scrapeSelectedDeviceIds();
            console.log("Sending selected devices to server...");
            sendToServer({ type: MessageTypes.UPDATE_SELECTED_DEVICE, data: selectedDeviceIds });  //sending data to server which forward to ANT Manager
        });

        btnWrapper.appendChild(button);
        document.body.appendChild(btnWrapper);
        setTimeout(() => {
            btnWrapper.classList.add("show");
        }, 200);
    }

    return document.getElementById("button_startAttach"); // ritorna il bottone per poterlo mostrare/nascondere
}


function renderDeviceStats(id, userName, userSurname, heartRate, intensity, caloriesBurnt) {
    let text;
    text = ((userName && userSurname) ? userName + " " + userSurname : "nome non trovato" + ": ");
    text += `: ${heartRate} bpm`;
    text += ` - Intensità: ${intensity} %`;
    text += " - Calorie bruciate: ";
    text += ((caloriesBurnt !== undefined) ? `${caloriesBurnt} KCal` : "sconosciute");

    const container = document.getElementById("selected-devices-container");
    if (!container) {
        console.log("container not existing yet,skipping")
        return;
    }
    let el = document.getElementById(`dev-${id}`);
    if (!el) {
        el = document.createElement("div");
        el.id = `dev-${id}`;
        el.className = "device animation-popup";
        container.appendChild(el);

        setTimeout(() => {
            el.classList.add("show");
        }, 50); // 50ms to let the transition happen
    }
    el.textContent = text;
}

function restoreUI(state) {//TODO
    switch (state.phase) {
        case "scanning":
            // Nothing to restore in scanning phase
            break;
        case "selection":
            // if(DEBUG) console.log("Restoring selection UI...");
            // renderSelectionUI();
            break;
        case "training":
            if (DEBUG) console.log("Restoring training UI...");
            renderTrainingUI();
            break;
        default:
            console.error("Invalid phase:", state.phase);
    }
}

function renderTrainingUI() {
    //removing elements
    const headerFoundDevices = document.getElementById("found-devices-header");
    if (!headerFoundDevices) {
        console.error("headerFoundDevices not found!");
        return;
    }
    headerFoundDevices.remove();

    const tableFoundDevices = document.querySelector(".found-devices");
    if (!tableFoundDevices) {
        console.error("tableFoundDevices not found!");
        return;
    }
    tableFoundDevices.remove();

    let btnWrapper = document.querySelector(".btn-wrapper");
    if (!btnWrapper) {
        console.error("btnWrapper not found!");
        return;
    }
    btnWrapper.remove();

    //adding elements
    let divSelectedDevices = document.getElementById("selected-devices-container");
    if (!divSelectedDevices) {
        divSelectedDevices = document.createElement("div");
        divSelectedDevices.id = "selected-devices-container";
        const logContainer = document.getElementById("log-container");
        logContainer.insertAdjacentElement("afterend", divSelectedDevices);
    }

    if (DEBUG) console.log("training UI updated");
}

function showRegistrationPopup(onSubmitCallback) {
    // Remove previous popup if exists
    const old = document.getElementById("device-reg-popup");
    if (old) old.remove();

    // Overlay
    const overlay = document.createElement("div");
    overlay.id = "device-reg-popup";
    overlay.className = "popup-overlay";

    // Box
    const box = document.createElement("div");
    box.className = "popup-box";

    // Title
    const title = document.createElement("h3");
    title.textContent = "Registrazione dispositivo";
    box.appendChild(title);

    // Close button
    const closeBtn = document.createElement("span");
    closeBtn.className = "popup-close-btn";
    closeBtn.textContent = "✕";
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);


    // Form
    const form = document.createElement("form");
    form.className = "popup-form";

    // Helper to create input fields
    function field(labelTxt, type, id) {
        const w = document.createElement("div");
        w.className = "popup-field";

        const label = document.createElement("label");
        label.htmlFor = id;
        label.textContent = labelTxt;

        const input = document.createElement("input");
        input.type = type;
        input.id = id;
        input.required = true;

        w.appendChild(label);
        w.appendChild(input);
        return w;
    }

    form.appendChild(field("Email", "email", "popup_mail"));
    form.appendChild(field("Password", "password", "popup_password"));
    form.appendChild(field("Peso", "number", "popup_weight"));
    form.appendChild(field("Altezza", "number", "popup_height"));
    // Submit button (styled like your main buttons)
    const submit = document.createElement("button");
    submit.type = "submit";
    submit.textContent = "Registra";
    submit.className = "popup-submit-btn";

    form.appendChild(submit);

    // error box
    const errorBox = document.createElement("div");
    errorBox.className = "popup-api-error";
    errorBox.style.display = "none";
    form.appendChild(errorBox);

    box.appendChild(form);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    // Handle submit
    form.onsubmit = (e) => {
        e.preventDefault();

        const data = {
            mail: document.getElementById("popup_mail").value.trim(),
            password: document.getElementById("popup_password").value.trim(),
            weight: document.getElementById("popup_weight").value.trim(),
            height: document.getElementById("popup_height").value.trim(),
        };

        if (onSubmitCallback) onSubmitCallback(data);
    };
}

/////////////////////////////////////////////// EVENT HANDLERS //////////////////////////////////////////
function button_registraOnClick(event) {
    const button = event.target;
    // get the tr that included the button
    const row = button.closest("tr");

    // read first cell of tr → DeviceID
    const deviceId = row.querySelector("td").textContent.trim();

    console.log("DeviceID selezionato:", deviceId);
    showRegistrationPopup(async (formData) => {
        console.log("Dati ricevuti:", formData);

        const result = await registerNewDevice(deviceId, formData.mail, formData.password, formData.weight, formData.height, 2000);
        if (result.success === false) {
            const box = document.querySelector("#device-reg-popup .popup-box");
            if (!box) return;

            const errorDiv = box.querySelector(".popup-api-error");
            if (!errorDiv) return;

            if (result.httpStatus === 404) {
                errorDiv.textContent = result.message;
                errorDiv.style.display = "block";
            }
        }
        else if (result.success === true) {
            const overlay = document.querySelector("#device-reg-popup");
            overlay.remove();
            const cell = button.parentElement;
            cell.removeChild(button);
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = true;
            cell.appendChild(checkbox);
            const nameCell = row.cells[1];
            nameCell.textContent = result.data.name + " " + result.data.surname;
            sendToServer({ type: MessageTypes.UPDATE_FOUND_DEVICE, data: { deviceId, ...result.data } });
        }

    });
}

//////////////////////////////////////// SCRAPING FUNCTIONS ////////////////////////////////////////
function scrapeSelectedDeviceIds() {
    let selectedDeviceIds = [];
    const table = document.getElementsByClassName("found-devices")[0];
    const rows = table.querySelectorAll("tr");
    rows.forEach(row => {
        if (row.rowIndex === 0) return; //skip header row
        const rowCheckbox = row.cells[2].querySelector("input[type='checkbox']");
        if (rowCheckbox.checked) {
            const deviceId = row.cells[0].textContent;
            selectedDeviceIds.push(parseInt(deviceId));
        }
    });
    return selectedDeviceIds;
}
