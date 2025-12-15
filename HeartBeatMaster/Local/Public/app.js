import { calcIntensity, calcHeartRateMax, calcHeartRateMin, calcAvgHeartRate, calcCaloriesBurnedPerTime, calcAgeFromBirthDate } from "./statsHandler.js";
import { registerNewDevice } from "./phpConnector.js";
import { MessageTypes,WorkoutTypes,Phases } from "./costantsHandler.js";

const DEBUG = true;
let clientState = {
    foundDevices: [],   // [{ registered, isDirectAttach, deviceId, name, surname, weight, birthDate, sex }]               useful in scanning and selection phases
    selectedDevices: [], // [{ deviceId, name, surname, weight, birthDate, sex, hrMax, hrMin, caloriesBurnt,hrBuffer[{ hr, timestamp }] }]  useful in workout phase
    workoutData:{}       // { startDate, endDate, intervalDuration}                     useful in workout phase
};

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
            //updating clientState.foundDevices
            if (msg.data.registered === true) {
                clientState.foundDevices.push({
                    registered:msg.data.registered,
                    isDirectAttach:msg.data.isDirectAttach,
                    deviceId: msg.data.deviceId,
                    name: msg.data.name,
                    surname: msg.data.surname,
                    weight: msg.data.weight,
                    height: msg.data.height,
                    birthDate: msg.data.birthDate,
                    sex: msg.data.sex
                });
            }
            else{
                clientState.foundDevices.push({
                     registered:msg.data.registered,
                    deviceId: msg.data.deviceId,
                });
            }
            console.log("Updated found devices:", clientState.foundDevices);
            const foundDevice = clientState.foundDevices.find(dev => dev.deviceId === msg.data.deviceId);
            if(!foundDevice)
            {
                console.error("device with id " + msg.data.deviceId + " not found into clientState.foundDevices!");
                return;
            }
            renderFoundDevice(foundDevice.registered, foundDevice.deviceId, foundDevice.name, foundDevice.surname);
            document.getElementById("button_startAttach").style.display = "block";

            sendToServer({ type: MessageTypes.UPDATE_FOUND_DEVICE, data: msg.data });
            break;
        case MessageTypes.CURRENT_SERVER_STATE:
            switch (msg.data.phase) {
                case Phases.SCANNING:
                    break;
                case Phases.SELECTION:
                    if (DEBUG) console.log("found devices from server: ", msg);
                    if(msg.data.foundDevices.length > 0)    //for now the  serverstate at the start of the selection phase contains no foundDevices! 
                        clientState.foundDevices = msg.data.foundDevices;
                    break;
                case Phases.WORKOUT:
                    clientState.selectedDevices = msg.data.selectedDevices;
                    if(msg.data.workoutData.startDate == null){
                        console.error("msg.data.workoutData.startDate empty!");
                        break;
                    }
                    if(msg.data.workoutData.intervalDuration == null){
                        console.error("msg.data.workoutData.intervalDuration empty!");
                        break;
                    }
                    if(msg.data.workoutData.type == null){
                        console.error("msg.data.workoutData.intervalDuration empty!");
                        break;
                    }
                    clientState.workoutData.startDate = msg.data.workoutData.startDate; 
                    clientState.workoutData.intervalDuration = msg.data.workoutData.intervalDuration; 
                    clientState.workoutData.type = msg.data.workoutData.type;
                    //calculating hrMax and hrMin for all selectedDevices one time
                    for (const selectedDevice of clientState.selectedDevices) {
                        selectedDevice.hrMax = calcHeartRateMax(selectedDevice.birthDate);
                        selectedDevice.hrMin = calcHeartRateMin(selectedDevice.sex);
                        if (selectedDevice.hrBuffer == null) {
                            selectedDevice.hrBuffer = [];   //will contains tuples of { hr: number, timestamp: number } 
                        }
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
        case MessageTypes.WORKOUT_SAVE_RESULT:
            if (DEBUG) console.log(MessageTypes.WORKOUT_SAVE_RESULT + " received from server: ", msg);
            if(msg.data.success == true) {
                log("workout salvato correttamente!");
                renderWorkoutDataSaved();
            }
            else {
                log("workout non salvato!!");
            }
            break;
        case MessageTypes.SERVER_CLOSING:
            if (DEBUG) console.log(MessageTypes.SERVER_CLOSING + " received from server: ", msg);
            renderServerClosed();
            break;
        case MessageTypes.NO_DEVICES_FOUND:
            if (DEBUG) console.log(MessageTypes.SERVER_CLOSING + " received from ANTManager: ", msg);

            break;
        case MessageTypes.ERROR_ON_CHECKFORDEVICEUSERS:
            if (DEBUG) console.log(MessageTypes.ERROR_ON_CHECKFORDEVICEUSERS + " received from ANTManager: ", msg);
            log("ANtManager: " + msg.data);
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
    if(clientState.workoutData.intervalDuration == null){
        console.error("clientState.workoutData.intervalDuration empty!");
        return;
    }
    const selectedDevice = clientState.selectedDevices.find(dev => dev.deviceId == String(id));
    if (selectedDevice) {
        const now = Date.now();
        const hr = msg.data.ComputedHeartRate;
        selectedDevice.hrBuffer.push({ hr, timestamp: now });
        let avgHr = -1;
        let caloriesBurnt = -1;
        const intensity = calcIntensity(hr, selectedDevice.hrMax, selectedDevice.hrMin)
      
        if (selectedDevice.hrBuffer.length > 0 && (now - selectedDevice.hrBuffer[0].timestamp) >= clientState.workoutData.intervalDuration) {
            avgHr = calcAvgHeartRate(selectedDevice.hrBuffer);
            if (DEBUG) console.log("frequency rate in five seconds:", avgHr);

            const age = calcAgeFromBirthDate(selectedDevice.birthDate);
            let intervalCaloriesBurnt = -1;
            if (DEBUG) intervalCaloriesBurnt = 0.1;
                else intervalCaloriesBurnt = 1;
            caloriesBurnt = calcCaloriesBurnedPerTime(selectedDevice.sex, selectedDevice.weight, avgHr, age, intervalCaloriesBurnt);
            if (DEBUG) console.log("Calories burned in five seconds:", caloriesBurnt);  //TODO more robust controls on intervalDuration numbers.
            if (selectedDevice.caloriesBurnt === undefined)
                selectedDevice.caloriesBurnt = caloriesBurnt;
            else {
                let caloriesBurntPrev = parseFloat(selectedDevice.caloriesBurnt);
                let caloriesBurntNow = Number(caloriesBurnt) || 0;
                selectedDevice.caloriesBurnt = (caloriesBurntPrev + caloriesBurntNow).toFixed(2);
            }

            if (DEBUG) console.log("selectedDevice.caloriesBurnt updated");
            const avgIntensity = calcIntensity(avgHr, selectedDevice.hrMax, selectedDevice.hrMin);
            selectedDevice.hrBuffer.length = 0; // empty the array
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
    if (!header) {
        header = document.createElement("h2");
        header.id = "found-devices-header";
        header.textContent = "Dispositivi trovati";
        const logContainer = document.getElementById("log-container");
        logContainer.insertAdjacentElement("afterend", header);
    }
    let table = document.querySelector(".found-devices");
    if (!table) {
        table = document.createElement("table");
        table.className = "found-devices animation-popup";

        const headerRow = document.createElement("tr");
        const headers = ["DeviceID", "Nome", "Seleziona"];
        headers.forEach(text => {
            const th = document.createElement("th");
            th.textContent = text;
            headerRow.appendChild(th);
        });

        table.appendChild(headerRow);
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
            if(selectedDeviceIds.length === 0) {
                showWarningPopup("Selezionare almeno un partecipante da monitorare!");
                return;
            }
            const idAndIsDirectAttach_array = [];

            for(const deviceId of selectedDeviceIds){
                const selectedDevice = clientState.foundDevices.find(dev => dev.deviceId == String(deviceId));
                idAndIsDirectAttach_array.push({selectedId: deviceId, isDirectAttach: selectedDevice.isDirectAttach});
            }
            console.log("Sending selected devices to server...");
            sendToServer({ type: MessageTypes.UPDATE_SELECTED_DEVICE, data: idAndIsDirectAttach_array });  //sending data to server which forward to ANT Manager
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
        case Phases.SCANNING:
            // Nothing to restore in scanning phase
            break;
        case Phases.SELECTION:
            // if(DEBUG) console.log("Restoring selection UI...");
            // renderSelectionUI();
            break;
        case Phases.WORKOUT:
            if (DEBUG) console.log("Restoring workout UI...");
            renderWorkoutUI();
            break;
        default:
            console.error("Invalid phase:", state.phase);
    }
}

function renderWorkoutUI() {
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

    let btnEndWorkout = document.createElement("button");
    btnEndWorkout.textContent = "Termina workout";
    btnEndWorkout.id = "btn_endWorkout";
    btnEndWorkout.addEventListener("click", btnEndWorkout_onClick);
    divSelectedDevices.insertAdjacentElement("afterend",btnEndWorkout);
    if (DEBUG) console.log("workout UI updated");
}

/**
 * Called after the server confirms the workout data was saved.
 * - Removes btn_endWorkout
 * - Removes the device stat divs
 * - Shows a friendly confirmation box "Dati workout salvati"
 * The visual style follows the existing render functions (uses .device and animation-popup).
 */
function renderWorkoutDataSaved() {
    removeWorkoutUI();
    const prev = document.getElementById("workout-saved");
    if (prev) prev.remove();

    const saved = document.createElement("div");
    saved.id = "workout-saved";
    saved.className = "device animation-popup";
    saved.textContent = "Dati workout salvati";

    const logContainer = document.getElementById("log-container");
    if (logContainer) {
        logContainer.insertAdjacentElement("afterend", saved);
    } else {
        document.body.appendChild(saved);
    }
    setTimeout(() => saved.classList.add("show"), 50);
}

function renderServerClosed(){
    removeSelectionUI();
    removeWorkoutUI();

    const prev = document.getElementById("server-closed");
    if (prev) prev.remove();

    const saved = document.createElement("div");
    saved.id = "server-closed";
    saved.className = "device animation-popup";
    saved.textContent = "Server non raggiungibile";

    const logContainer = document.getElementById("log-container");
    if (logContainer) {
        logContainer.insertAdjacentElement("afterend", saved);
    } else {
        document.body.appendChild(saved);
    }
    setTimeout(() => saved.classList.add("show"), 50);
}

function removeWorkoutUI() {
    const btn_endWorkout = document.querySelector("#btn_endWorkout");
    if(btn_endWorkout) btn_endWorkout.remove();
    
    const selectedDevicesContainer = document.getElementById("selected-devices-container");
    if (selectedDevicesContainer) selectedDevicesContainer.remove();
}

function removeSelectionUI(){
    const btn_AttachSelectedDevices = document.querySelector("#button_startAttach");
    if(btn_AttachSelectedDevices) btn_AttachSelectedDevices.remove();

    const headerFoundDevices = document.querySelector("#found-devices-header");
    if(headerFoundDevices) {
        headerFoundDevices.remove();
    }
    const tableFoundDevices = document.querySelector(".found-devices");
    if(tableFoundDevices) {
        tableFoundDevices.remove();
    }
}

/**
 * Show a simple warning popup with a message and an OK button
 * Useful for validation errors or warnings
 */
function showWarningPopup(message) {
    // Remove previous warning if exists
    const old = document.getElementById("warning-popup");
    if (old) old.remove();

    // Overlay
    const overlay = document.createElement("div");
    overlay.id = "warning-popup";
    overlay.className = "popup-overlay";

    // Box
    const box = document.createElement("div");
    box.className = "popup-box";

    // Title (warning style)
    const title = document.createElement("h3");
    title.textContent = "Attenzione";
    box.appendChild(title);

    // Close button
    const closeBtn = document.createElement("span");
    closeBtn.className = "popup-close-btn";
    closeBtn.textContent = "✕";
    closeBtn.onclick = () => overlay.remove();
    box.appendChild(closeBtn);

    // Message
    const msg = document.createElement("p");
    msg.className = "popup-message";
    msg.textContent = message;
    box.appendChild(msg);

    // OK Button
    const okBtn = document.createElement("button");
    okBtn.textContent = "OK";
    okBtn.className = "popup-submit-btn";
    okBtn.onclick = () => overlay.remove();
    box.appendChild(okBtn);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
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

function btnEndWorkout_onClick() {
    const ts = Date.now();
    const endDateWorkout = new Date(ts);
    clientState.workoutData.endDate = endDateWorkout;
    sendToServer({type: MessageTypes.END_WORKOUT, data: {endDateWorkout}});
}
//////////////////////////////////////// SCRAPING FUNCTIONS ////////////////////////////////////////
function scrapeSelectedDeviceIds() {
    let selectedDeviceIds = [];
    const table = document.querySelector(".found-devices");
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
