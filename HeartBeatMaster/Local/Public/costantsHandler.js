export const MessageTypes = Object.freeze({
    //sent by AntManager
    NEW_SENSOR:             "NEW_SENSOR",                   //received from app
    SCAN_RESULT:            "SCAN_RESULT",                  //received from app
    DEVICE_ATTACHED:        "DEVICE_ATTACHED",              //received from app
    DEVICE_DETACHED:        "DEVICE_DETACHED",              //received from app
    HEART_RATE:             "HEART_RATE",                   //received from app
    DEVICE_USER_INFO:       "DEVICE_USER_INFO",             //received from app       
    ERROR:                  "ERROR",                        //received from app
    //sent by App.js
    UPDATE_FOUND_DEVICE:    "UPDATE_FOUND_DEVICE",          //received from server
    UPDATE_SELECTED_DEVICE: "UPDATE_SELECTED_DEVICE",       //received from server then forwarded to antManager
    AVG_DEVICE_DATA:        "AVG_DEVICE_DATA",              //received from server
    SHUTDOWN:               "SHUTDOWN",                     //received from server
    END_WORKOUT:            "END_WORKOUT",                  //received from server        
    
    //sent by server
    CURRENT_SERVER_STATE:  "CURRENT_SERVER_STATE"           //received from app
});

export const Phases = Object.freeze({
    SCANNING:   "SCANNING",
    SELECTION:  "SELECTION",
    WORKOUT:    "WORKOUT"
});

export const Sex = Object.freeze({
    MALE:   "male", 
    FEMALE: "female"
});

export const WorkoutTypes = Object.freeze({
    INTERVAL:   "INTERVAL",
    CONTINUOUS: "CONTONUOUS"
});