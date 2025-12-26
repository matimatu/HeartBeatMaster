<?php
//------------table fields---------------------
$fasce__TABLE = 'fasce';
    $fasce_ID__COLUMN = 'ID';
    $fasce_chiave__COLUMN = 'chiave';
    $fasce_collegabileFacilmente__COLUMN = 'collegabile_facilmente';
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

$workout__TABLE = 'workout';
    $workout_ID__COLUMN = 'ID';
    $workout_data_inizio__COLUMN = 'data_inizio';
    $workout_data_fine__COLUMN = 'data_fine';
    $workout_ID_tipologiaWorkout__COLUMN = 'ID_tipologiaworkout';

$tipologieWorkout__TABLE = 'tipologieworkout';
    $tipologieWorkout_ID__COLUMN = 'ID';
    $tipologieWorkout_nome__COLUMN = 'nome';
    $tipologieWorkout_descrizione__COLUMN = 'descrizione';
    $datiWorkout_durata_intervallo_analisi__COLUMN = 'durata_intervallo_analisi';

$partecipantiWorkout__TABLE = 'partecipantiworkout';
    $partecipantiWorkout_ID__COLUMN = 'ID';
    $partecipantiWorkout_ID_workout__COLUMN = 'ID_workout';
    $partecipantiWorkout_ID_utente__COLUMN = 'ID_utente';
    $partecipantiWorkout__ID_fascia__COLUMN = 'ID_fascia';  //for history
    $partecipantiWorkout_altezza__COLUMN = 'altezza';       //for history
    $partecipantiWorkout_peso__COLUMN = 'peso';             //for history

$datiWorkout__TABLE = 'datiworkout';
    $datiWorkout_ID__COLUMN = 'ID';
    $datiWorkout_ID_partecipantiWorkout__COLUMN = 'ID_partecipantiworkout';
    $datiWorkout_num_intervallo__COLUMN = 'num_intervallo';
    $datiWorkout_frequenza_cardiaca__COLUMN = 'frequenza_cardiaca';
    $datiWorkout_calorie_bruciate__COLUMN = 'calorie_bruciate';
    $datiWorkout_intensita__COLUMN = 'intensita';
function connectToDatabase() {
    
    $config = require __DIR__ . '/config.php';

    $db = $config['db'];
    $host = $db['host'];
    $port = $db['port'];
    $dbname = $db['name'];
    $user = $db['user'];
    $pass = $db['pass'];

    $dsn = "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4";
    $pdo = new PDO($dsn, $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    return $pdo;
}
?>