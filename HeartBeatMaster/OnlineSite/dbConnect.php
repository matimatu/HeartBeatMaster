<?php
// db config
$host = '127.0.0.1';  // localhost
$port = 3306;          // MySQL port
$dbname = 'pulse_monitor_advanced_test';
$user = 'root';
$pass = 'Mendilip98';   

//------------table fields---------------------
$fasce__TABLE = 'fasce';
    $fasce_ID__COLUMN = 'ID';
    $fasce_chiave__COLUMN = 'chiave';
$fascePerUtenti__TABLE = 'fasceperutenti';
    $fascePerUtenti_ID__COLUMN = 'ID';
    $fascePerUtenti_ID_fascia__COLUMN = 'ID_fascia';
    $fascePerUtenti_ID_datimonitoraggioutente__COLUMN = 'ID_datimonitoraggioutente';
$datiMonitoraggioUtenti__TABLE = 'datimonitoraggioutenti';
    $datiMonitoraggioUtenti_ID__COLUMN = 'ID';
    $datiMonitoraggioUtenti_altezza__COLUMN = 'altezza';
    $datiMonitoraggioUtenti_peso__COLUMN = 'peso';
    $datiMonitoraggioUtenti_ID_utente__COLUMN = 'ID_utente';
$utenti__TABLE = 'utenti';
    $utenti_ID__COLUMN = 'ID';
    $utenti_nome__COLUMN = 'nome';
    $utenti_cognome__COLUMN = 'cognome';
    $utenti_mail__COLUMN = 'mail';
    $utenti_password__COLUMN = 'password';
    $utenti_data_nascita__COLUMN = 'data_nascita';
    $utenti_sesso__COLUMN = 'sesso';

function connectToDatabase() {

    global $host, $port, $dbname, $user, $pass;
    
    $dsn = "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    return $pdo;
}
?>