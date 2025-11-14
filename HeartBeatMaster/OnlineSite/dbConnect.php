<?php
// Configurazione database
$host = '127.0.0.1';  // localhost
$port = 3306;          // porta MySQL
$dbname = 'pulse_monitor_advanced_test';
$user = 'root';
$pass = 'Mendilip98';   

$fasce__TABLE = 'fasce';
    $fasce_ID__COLUMN = 'ID';
    $fasce_chiave__COLUMN = 'chiave';
$fascePerUtenti__TABLE = 'fasceperutenti';
    $fascePerUtenti_ID__COLUMN = 'ID';
    $fascePerUtenti_ID_fascia__COLUMN = 'ID_fascia';
    $fascePerUtenti_ID_utente__COLUMN = 'ID_utente';
$utenti__TABLE = 'utenti';
    $utenti_ID__COLUMN = 'ID';
    $utenti_nome__COLUMN = 'nome';
    $utenti_cognome__COLUMN = 'cognome';
    $utenti_mail__COLUMN = 'mail';
    $utenti_data_nascita__COLUMN = 'data_nascita';
    $utenti_altezza__COLUMN = 'altezza';
    $utenti_peso__COLUMN = 'peso';
    $utenti_maschio__COLUMN = 'maschio';


function connectToDatabase() {

    global $host, $port, $dbname, $user, $pass;
    
    $dsn = "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    return $pdo;
}


// // ----------------------------
// // Esempio: Lettura dati utenti
// // ----------------------------
// $pdo = connectToDatabase();
// try {
//     $stmt = $pdo->query("SELECT * FROM Utenti");
//     $utenti = $stmt->fetchAll(PDO::FETCH_ASSOC);

//     foreach ($utenti as $utente) {
//         echo "ID: {$utente['ID']}, Nome: {$utente['nome']}, Cognome: {$utente['cognome']}, Mail: {$utente['mail']}<br>";
//     }
// } catch (PDOException $e) {
//     echo "Errore nella query: " . $e->getMessage();
// }
?>