export const MessageTypes = Object.freeze({
    //sent by AntManager
    NEW_SENSOR:             "NEW_SENSOR",
    SCAN_RESULT:            "SCAN_RESULT",
    DEVICE_ATTACHED:        "DEVICE_ATTACHED",
    DEVICE_DETACHED:        "DEVICE_DETACHED",
    HEART_RATE:             "HEART_RATE",
    DEVICE_USER_INFO:       "DEVICE_USER_INFO",
    ERROR:                  "ERROR",
    //sent by App.js
    UPDATE_FOUND_DEVICE:    "UPDATE_FOUND_DEVICE",
    UPDATE_SELECTED_DEVICE: "UPDATE_SELECTED_DEVICE",
    AVG_DEVICE_DATA:        "AVG_DEVICE_DATA",
    SHUTDOWN:               "SHUTDOWN",
    //sent by server
    CURRENT_SERVER_STATE:  "CURRENT_SERVER_STATE"
});