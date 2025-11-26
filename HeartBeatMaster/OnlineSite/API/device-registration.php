<?php
require_once '../dbConnect.php';

// --- CORS ---
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true]);
    exit;
}

// Read body
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);

//controls
if (!is_array($data) ||     !isset($data['device_id']) ||    !isset($data['mail']) || 
   !isset($data['password'])  ||   !isset($data['weight'])  ||   !isset($data['height'])) {

    http_response_code(400);
    echo json_encode(['success' => false,
         'error' => 'Invalid payload. Expected an array with this fields: { device_id,mail,password,weight,height" }']);
    exit;
}
if(!is_string($data['device_id']) || !is_string($data['mail']) 
    || !is_string($data['password']) || !is_string($data['weight'])|| !is_string($data['height']))
{
    http_response_code(400);
    echo json_encode(['success' => false,
         'error' => 'Invalid payload. Expected an array with this fields: { device_id,mail,password,weight,height" }']);
    exit;
}
$deviceId = strval($data['device_id']);
$mail = trim($data['name']);
$password = trim($data['surname']);
$weight = trim($data['weight']);
$height = trim($data['height']);


try {
    $pdo = connectToDatabase();
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed']);
    exit;
}

try {

    // 1) --- VERIFY USER EXISTS ---
    $sqlUser = "SELECT ".$utenti_ID__COLUMN."," .$utenti_nome__COLUMN.","
         .$utenti_cognome__COLUMN. "," .$utenti_data_nascita__COLUMN. ",".$utenti_sesso__COLUMN. "
                FROM ".$utenti__TABLE."
                WHERE ".$utenti_mail__COLUMN." = ? AND ".$utenti_password__COLUMN." = ?
                LIMIT 1";

    $stmt = $pdo->prepare($sqlUser);
    $stmt->execute([$mail, $surname]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);

    if (!$user) {
        http_response_code(404);
        echo json_encode(['success' => false, 'error' => 'User not found']);
        exit;
    }

    $userId         = $user[$utenti_ID__COLUMN];
    $userName       = $user[$utenti_nome__COLUMN];
    $userSurname    = $user[$utenti_cognome__COLUMN];
    $userBirthdate  = $user[$utenti_data_nascita__COLUMN];
    $userSex        = $user[$utenti_sesso__COLUMN];

    // 2) --- CHECK IF DEVICE ALREADY EXISTS IN fasce ---
    $sqlCheckDevice = "SELECT ".$fasce_ID__COLUMN."
                       FROM ".$fasce__TABLE."
                       WHERE ".$fasce_chiave__COLUMN." = ?
                       LIMIT 1";

    $stmt = $pdo->prepare($sqlCheckDevice);
    $stmt->execute([$deviceId]);
    $existingDevice = $stmt->fetch(PDO::FETCH_ASSOC);

    if ($existingDevice) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => 'Device already registered']);
        exit;
    }


    // BEGIN TRANSACTION
    $pdo->beginTransaction();


    // 3) --- INSERT INTO fasce ---
    $sqlInsertFascia = "INSERT INTO ".$fasce__TABLE."
                        (".$fasce_chiave__COLUMN.")
                        VALUES (?)";
    $stmt = $pdo->prepare($sqlInsertFascia);
    $stmt->execute([$deviceId]);
    $newFasciaId = $pdo->lastInsertId();

    // 4) --- INSERT INTO datiMonitoraggioUtenti---
    $sqlInsertMonitoringData = "INSERT INTO ".$datiMonitoraggioUtenti__TABLE."
                      (".$datiMonitoraggioUtenti_altezza__COLUMN.", ".$datiMonitoraggioUtenti_peso__COLUMN.",".$datiMonitoraggioUtenti_ID_utente__COLUMN. ")
                      VALUES (?, ?, ?)";

    $stmt = $pdo->prepare($sqlInsertMonitoringData);
    $stmt->execute([$height, $weight,$userId]);
    $newDatiMonitoraggioUtenteId = $pdo->lastInsertId();

    // 5) --- INSERT INTO fascePerUtenti ---
    $sqlInsertLink = "INSERT INTO ".$fascePerUtenti__TABLE."
                      (".$fascePerUtenti_ID_fascia__COLUMN.", ".$fascePerUtenti_ID_utente__COLUMN.")
                      VALUES (?, ?)";

    $stmt = $pdo->prepare($sqlInsertLink);
    $stmt->execute([$newFasciaId, $newDatiMonitoraggioUtenteId]);


    $pdo->commit();

    echo json_encode([
        'success' => true,
        'message' => 'Device registered successfully',
        'data' => [
            'name' => $userName,
            'surname' => $userSurname,
            'weight' => $weight,
            'height' => $height,
            'birthDate' => $userBirthdate,
        ]
    ]);

} catch (PDOException $e) {

    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }

    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database query failed']);
    error_log("DB error: " . $e->getMessage());
    exit;
}

?>
