<?php
require_once '../dbConnect.php'; // Connessione al DB
/**
 *
 * REST API skeleton that accepts POST JSON with { device_ids: [ ... ] }
 * and returns a mapping of device_id -> { registered: bool, user: { nome, cognome, data_nascita, altezza, peso } | null }
 *
 * Assumptions:
 *  - Database contains tables:
 *      - `fasce` with columns: `id` (PK), `chiave` (device identifier)
 *      - `utenti` with columns: `id` (PK), `nome`, `cognome`, `data_nascita`, `altezza`, `peso`, ...
 *      - `fascePerUtenti` with columns: `id`, `fascia_id` (FK -> fasce.id), `utente_id` (FK -> utenti.id)
 *  - `chiave` stores the device_id values you will POST.
 *
 * Expected input:
 *  POST /searchDevicesInUsers.php
 *  Content-Type: application/json
 *  Body: { "device_ids": ["20024","12354"] }
 *
 * Output (200):
 *  {
 *    "success": true,
 *    "data": {
 *      "20024": { "registered": true, "user": { "nome": "Mario", "cognome": "Rossi", "data_nascita":"1990-01-01", "altezza":180, "peso":75 } },
 *      "12354": { "registered": false, "user": null }
 *    }
 *  }
 */

// --- CORS and headers ---
$DEBUG = false;
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    echo json_encode(['success' => true, 'message' => 'OK']);
    exit;
}
// Read JSON body
$raw = file_get_contents('php://input');
$data = json_decode($raw, true);
if($DEBUG) {
    var_dump($raw);
    var_dump($data);
    echo json_last_error_msg();
}

if (!is_array($data) || !isset($data['device_ids']) || !is_array($data['device_ids'])) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid payload: expected JSON with device_ids array']);
    exit;
}

$deviceIds = array_values($data['device_ids']);
// Normalize to strings
$deviceIds = array_values(array_map('strval', $deviceIds));

if (count($deviceIds) === 0) {
    echo json_encode(['success' => true, 'data' => new stdClass()]);
    exit;
}

// Prevent extremely large queries
$MAX_IDS = 200;
if (count($deviceIds) > $MAX_IDS) {
    http_response_code(413);
    echo json_encode(['success' => false, 'error' => 'Too many device IDs (max ' . $MAX_IDS . ')']);
    exit;
}

try {
   $pdo = connectToDatabase();
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database connection failed ']);
    echo('nDB connect error: ' .  $e->getMessage());
    error_log('DB connect error: ' . $e->getMessage());
    exit;
}

try {
    // Build placeholders for an IN() clause
    $placeholders = implode(',', array_fill(0, count($deviceIds), '?'));
    // Query: join fasce -> fascePerUtenti -> utenti
    $sql = "SELECT f.".$fasce_chiave__COLUMN." AS device_id,
                   u.".$utenti_ID__COLUMN." AS user_id, u.".$utenti_nome__COLUMN.", u.".$utenti_cognome__COLUMN.",
                   u.".$utenti_data_nascita__COLUMN.", u.".$utenti_altezza__COLUMN.", u.".$utenti_peso__COLUMN."
            FROM " . $fasce__TABLE . " f
            JOIN " . $fascePerUtenti__TABLE . " fp ON fp.".$fascePerUtenti_ID_fascia__COLUMN." = f.".$fascePerUtenti_ID__COLUMN."
            JOIN ". $utenti__TABLE ." u ON u.".$utenti_ID__COLUMN." = fp.".$fascePerUtenti_ID_utente__COLUMN."
            WHERE f.".$fasce_chiave__COLUMN." IN ($placeholders)";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($deviceIds);
    $rows = $stmt->fetchAll();

    // Initialize results with not-registered
    $results = [];
    foreach ($deviceIds as $id) {
        $results[(string)$id] = ['registered' => false, 'user' => null];
    }

    // Fill with found users. If multiple rows per device exist, this keeps the first one encountered.
    foreach ($rows as $row) {
        $did = (string)$row['device_id'];
        if (!isset($results[$did]) || $results[$did]['registered'] === true) {
            // If already set (duplicate), skip //TODO: handle duplicates better and create a array of users?
            continue;
        }
        $results[$did] = [
            'registered' => true,
            'user' => [
                'id' => $row['user_id'],
                'nome' => $row['nome'] ?? null,
                'cognome' => $row['cognome'] ?? null,
                'data_nascita' => $row['data_nascita'] ?? null,
                'altezza' => $row['altezza'] ?? null,
                'peso' => $row['peso'] ?? null,
            ],
        ];
    }

    echo json_encode(['success' => true, 'data' => $results]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => 'Database query failed']);
    error_log('DB query error: ' . $e->getMessage());
    exit;
}

?>
