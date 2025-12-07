<?php
require_once '../dbConnect.php';

/**
 * save-workout-data.php
 *
 * REST API endpoint to save workout data for multiple devices to the database.
 *
 * Expected JSON input:
 * {
 *   "workout_data": [ { deviceId, name, surname, avgHeartRatePerMin[], caloriesBurntPerMin[], intensityPerMin[] }, ... ],
 *   "start_date": "2025-12-07 10:00:00",
 *   "end_date": "2025-12-07 11:00:00",
 *   "interval_duration": 60,
 *   "workout_type": "Running"
 * }
 *
 * All operations are performed in a single database transaction.
 * If any step fails, the entire transaction is rolled back.
 */

// --- CORS and Headers ---
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true]);
    exit;
}

// --- Read and decode JSON input ---
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

// --- Validate input structure ---
if (!validateInput($input)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Invalid input format. Expected: { workout_data, start_date, end_date, interval_duration, workout_type }'
    ]);
    exit;
}

// Extract input fields
$workoutDataArray = $input['workout_data'];
$startDate = $input['start_date'];
$endDate = $input['end_date'];
$intervalDuration = intval($input['interval_duration']);
$workoutTypeName = trim($input['workout_type']);

try {
    // Connect to database
    $pdo = connectToDatabase();
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    error_log('DB Connection Error: ' . $e->getMessage());
    exit;
}

try {
    // Start transaction
    $pdo->beginTransaction();

    // STEP 1: Find or verify the workout type exists
    $workoutTypeId = findWorkoutTypeId($pdo, $workoutTypeName);
    if ($workoutTypeId === null) {
        $pdo->rollBack();
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Workout type not found: ' . $workoutTypeName]);
        exit;
    }

    // STEP 2: Create the workout record (single record for all participants)
    $workoutId = createWorkout($pdo, $startDate, $endDate,$intervalDuration,$workoutTypeId);
    if ($workoutId === null) {
        $pdo->rollBack();
        throw new Exception('Failed to create workout record');
    }

    // STEP 3: Process each device in the workout data
    foreach ($workoutDataArray as $deviceData) {
        $deviceId = $deviceData['deviceId'];
        $userName = $deviceData['name'];
        $userSurname = $deviceData['surname'];
        $avgHeartRates = $deviceData['avgHeartRatePerMin'];
        $caloriesBurnt = $deviceData['caloriesBurntPerMin'];
        $intensities = $deviceData['intensityPerMin'];

        // STEP 3a: Find the fasce (device) by chiave
        $fasciaId = findFasciaByChiave($pdo, $deviceId);
        if ($fasciaId === null) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Device not found: ' . $deviceId]);
            exit;
        }

        // STEP 3b: Find the fascePerUtenti link
        $fascePerUtentiId = findFascePerUtentiByFasciaId($pdo, $fasciaId);
        if ($fascePerUtentiId === null) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Device not linked to any user: ' . $deviceId]);
            exit;
        }

        // STEP 3c: Get datiMonitoraggioUtenti (weight, height) from fascePerUtenti link
        $monitoringData = getMonitoringDataByFascePerUtenti($pdo, $fascePerUtentiId);
        if ($monitoringData === null) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'Monitoring data not found for device: ' . $deviceId]);
            exit;
        }

        $userHeight = $monitoringData[$datiMonitoraggioUtenti_altezza__COLUMN];
        $userWeight = $monitoringData[$datiMonitoraggioUtenti_peso__COLUMN];
        $userId = $monitoringData[$datiMonitoraggioUtenti_ID_utente__COLUMN];

        // STEP 3d: Create partecipanteworkout record
        $partecipanteId = createPartecipanteworkout(
            $pdo,
            $workoutId,
            $fasciaId,
            $userId,
            $userHeight,
            $userWeight
        );
        if ($partecipanteId === null) {
            $pdo->rollBack();
            throw new Exception('Failed to create partecipanteworkout for device: ' . $deviceId);
        }

        // STEP 3e: Create datiworkout records (one per interval)
        for ($i = 0; $i < count($avgHeartRates); $i++) {
            $intervalNumber = $i + 1; // Intervals are 1-indexed
            $hr = intval($avgHeartRates[$i]);
            $caloriesBurnt = floatval($caloriesBurnt[$i]);
            $intensity = floatval($intensities[$i]);

            $success = createDatiworkout(
                $pdo,
                $partecipanteId,
                $intervalNumber,
                $hr,
                $caloriesBurnt,
                $intensity
            );

            if (!$success) {
                $pdo->rollBack();
                throw new Exception('Failed to create datiworkout for device: ' . $deviceId . ' interval: ' . $intervalNumber);
            }
        }
    }

    // Commit the transaction
    $pdo->commit();

    // Return success response
    http_response_code(200);
    echo json_encode([
        'success' => true,
        'message' => 'Workout data saved successfully',
        'workoutId' => $workoutId,
        'deviceCount' => count($workoutDataArray)
    ]);

} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database error: ' . $e->getMessage()]);
    error_log('Database error in save-workout-data: ' . $e->getMessage());
    exit;
} catch (Exception $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    error_log('Error in save-workout-data: ' . $e->getMessage());
    exit;
}

// ============================================================================
// ===                        HELPER FUNCTIONS                             ===
// ============================================================================

/**
 * Validates the input JSON structure
 * Ensures all required fields are present and have correct types
 */
function validateInput($input) {
    if (!is_array($input)) {
        return false;
    }

    // Check required top-level fields
    if (!isset($input['workout_data']) || !isset($input['start_date']) || 
        !isset($input['end_date']) || !isset($input['interval_duration']) || 
        !isset($input['workout_type'])) {
        return false;
    }

    // Validate workout_data is an array
    if (!is_array($input['workout_data']) || count($input['workout_data']) === 0) {
        return false;
    }

    // Validate each device record in workout_data
    foreach ($input['workout_data'] as $device) {
        if (!validateDeviceRecord($device)) {
            return false;
        }
    }

    // Validate dates are strings
    if (!is_string($input['start_date']) || !is_string($input['end_date'])) {
        return false;
    }

    // Validate interval duration is numeric
    if (!is_numeric($input['interval_duration'])) {
        return false;
    }

    // Validate workout type is a string
    if (!is_string($input['workout_type']) || empty(trim($input['workout_type']))) {
        return false;
    }

    return true;
}

/**
 * Validates a single device record in the workout data array
 */
function validateDeviceRecord($device) {
    if (!is_array($device)) {
        return false;
    }

    // Check required device fields
    $requiredFields = ['deviceId', 'name', 'surname', 'avgHeartRatePerMin', 'caloriesBurntPerMin', 'intensityPerMin'];
    foreach ($requiredFields as $field) {
        if (!isset($device[$field])) {
            return false;
        }
    }

    // Validate arrays
    if (!is_array($device['avgHeartRatePerMin']) || !is_array($device['caloriesBurntPerMin']) || 
        !is_array($device['intensityPerMin'])) {
        return false;
    }

    // All three arrays must have the same length
    $length = count($device['avgHeartRatePerMin']);
    if (count($device['caloriesBurntPerMin']) !== $length || count($device['intensityPerMin']) !== $length) {
        return false;
    }

    // Validate array contents
    foreach ($device['avgHeartRatePerMin'] as $value) {
        if (!is_numeric($value)) {
            return false;
        }
    }

    foreach ($device['caloriesBurntPerMin'] as $value) {
        if (!is_numeric($value)) {
            return false;
        }
    }

    foreach ($device['intensityPerMin'] as $value) {
        if (!is_numeric($value)) {
            return false;
        }
    }

    return true;
}

/**
 * Find workout type ID by name from tipologieworkout table
 */
function findWorkoutTypeId($pdo, $workoutTypeName) {
    global $tipologieWorkout__TABLE, $tipologieWorkout_ID__COLUMN, $tipologieWorkout_nome__COLUMN;

    $sql = "SELECT " . $tipologieWorkout_ID__COLUMN . "
            FROM " . $tipologieWorkout__TABLE . "
            WHERE " . $tipologieWorkout_nome__COLUMN . " = ?
            LIMIT 1";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$workoutTypeName]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    return $result ? intval($result[$tipologieWorkout_ID__COLUMN]) : null;
}

/**
 * Create a new workout record
 */
function createWorkout($pdo, $startDate, $endDate,$analysisIntervalDuration, $workoutTypeId) {
    global $workout__TABLE, $workout_data_inizio__COLUMN, $workout_data_fine__COLUMN, $datiWorkout_durata_intervallo_analisi__COLUMN, $workout_ID_tipologiaWorkout__COLUMN;

    $sql = "INSERT INTO " . $workout__TABLE . "
            (" . $workout_data_inizio__COLUMN . ", " . $workout_data_fine__COLUMN . ", " . $datiWorkout_durata_intervallo_analisi__COLUMN . ", " . $workout_ID_tipologiaWorkout__COLUMN . ")
            VALUES (?, ?, ?, ?)";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$startDate, $endDate,$analysisIntervalDuration, $workoutTypeId]);

    return $pdo->lastInsertId();
}

/**
 * Find fasce (device) ID by chiave (device ID)
 */
function findFasciaByChiave($pdo, $deviceId) {
    global $fasce__TABLE, $fasce_ID__COLUMN, $fasce_chiave__COLUMN;

    $sql = "SELECT " . $fasce_ID__COLUMN . "
            FROM " . $fasce__TABLE . "
            WHERE " . $fasce_chiave__COLUMN . " = ?
            LIMIT 1";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$deviceId]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    return $result ? intval($result[$fasce_ID__COLUMN]) : null;
}

/**
 * Find fascePerUtenti link by fasce ID
 */
function findFascePerUtentiByFasciaId($pdo, $fasciaId) {
    global $fascePerUtenti__TABLE, $fascePerUtenti_ID__COLUMN, $fascePerUtenti_ID_fascia__COLUMN;

    $sql = "SELECT " . $fascePerUtenti_ID__COLUMN . "
            FROM " . $fascePerUtenti__TABLE . "
            WHERE " . $fascePerUtenti_ID_fascia__COLUMN . " = ?
            LIMIT 1";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$fasciaId]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    return $result ? intval($result[$fascePerUtenti_ID__COLUMN]) : null;
}

/**
 * Get monitoring data (height and weight) from datiMonitoraggioUtenti via fascePerUtenti
 */
function getMonitoringDataByFascePerUtenti($pdo, $fascePerUtentiId) {
    global $fascePerUtenti__TABLE, $fascePerUtenti_ID__COLUMN, $fascePerUtenti_ID_datimonitoraggioutente__COLUMN;
    global $datiMonitoraggioUtenti__TABLE, $datiMonitoraggioUtenti_altezza__COLUMN;
    global $datiMonitoraggioUtenti_peso__COLUMN,$datiMonitoraggioUtenti_ID_utente__COLUMN, $datiMonitoraggioUtenti_ID__COLUMN;

    // First get the datiMonitoraggioUtenti ID from fascePerUtenti
    $sql1 = "SELECT " . $fascePerUtenti_ID_datimonitoraggioutente__COLUMN . "
             FROM " . $fascePerUtenti__TABLE . "
             WHERE " . $fascePerUtenti_ID__COLUMN . " = ?
             LIMIT 1";

    $stmt = $pdo->prepare($sql1);
    $stmt->execute([$fascePerUtentiId]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$result) {
        return null;
    }

    $datiMonitoraggioUtenteId = $result[$fascePerUtenti_ID_datimonitoraggioutente__COLUMN];

    // Now get the actual data
    $sql2 = "SELECT " . $datiMonitoraggioUtenti_altezza__COLUMN . ", " . $datiMonitoraggioUtenti_peso__COLUMN . ", " . $datiMonitoraggioUtenti_ID_utente__COLUMN . "
             FROM " . $datiMonitoraggioUtenti__TABLE . "
             WHERE " . $datiMonitoraggioUtenti_ID__COLUMN . " = ?
             LIMIT 1";

    $stmt = $pdo->prepare($sql2);
    $stmt->execute([$datiMonitoraggioUtenteId]);
    $result = $stmt->fetch(PDO::FETCH_ASSOC);

    return $result ? $result : null;
}

/**
 * Create a partecipanteworkout record
 */
function createPartecipanteworkout($pdo, $workoutId, $fasciaId,$userId, $height, $weight) {
    global $partecipanteWorkout__TABLE;
    global $partecipanteWorkout_ID_workout__COLUMN, $partecipanteWorkout__ID_fascia__COLUMN, $partecipanteWorkout_ID_utente__COLUMN;
    global $partecipanteWorkout_altezza__COLUMN, $partecipanteWorkout_peso__COLUMN;

    $sql = "INSERT INTO " . $partecipanteWorkout__TABLE . "
        (" . $partecipanteWorkout_ID_workout__COLUMN . ", " . $partecipanteWorkout__ID_fascia__COLUMN . ", " . 
        $partecipanteWorkout_ID_utente__COLUMN . ", " . $partecipanteWorkout_altezza__COLUMN . ", " . $partecipanteWorkout_peso__COLUMN . ")
        VALUES (?, ?, ?, ?, ?)";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$workoutId, $fasciaId, $userId, $height, $weight]);

    return $pdo->lastInsertId();
}

/**
 * Create a datiworkout record (single interval data for a participant)
 */
function createDatiworkout($pdo, $partecipanteId, $intervalNumber, $heartRate, $caloriesBurnt, $intensity) {
    global $datiWorkout__TABLE;
    global $datiWorkout_ID_partecipanteWorkout__COLUMN, $datiWorkout_num_intervallo__COLUMN;
    global $datiWorkout_frequenza_cardiaca__COLUMN, $datiWorkout_calorie_bruciate__COLUMN, $datiWorkout_intensita__COLUMN;

    $sql = "INSERT INTO " . $datiWorkout__TABLE . "
            (" . $datiWorkout_ID_partecipanteWorkout__COLUMN . ", " . $datiWorkout_num_intervallo__COLUMN . ", " .
            $datiWorkout_frequenza_cardiaca__COLUMN . ", " . $datiWorkout_calorie_bruciate__COLUMN . ", " . $datiWorkout_intensita__COLUMN . ")
            VALUES (?, ?, ?, ?, ?)";

    $stmt = $pdo->prepare($sql);
    $stmt->execute([$partecipanteId, $intervalNumber, $heartRate, $caloriesBurnt, $intensity]);

    return true;
}

?>
