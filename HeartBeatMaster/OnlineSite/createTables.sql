create table datimonitoraggioutenti
(
    ID        int auto_increment
        primary key,
    altezza   decimal(5, 2) null,
    peso      decimal(5, 2) null,
    ID_utente int           not null
);

create table fasce
(
    ID                     int auto_increment
        primary key,
    chiave                 text    not null,
    collegabile_facilmente tinyint null,
    constraint chiave
        unique (chiave(255))
);

create table fasceperutenti
(
    ID                        int auto_increment
        primary key,
    ID_datimonitoraggioutente int not null,
    ID_fascia                 int not null,
    constraint ID_utente
        unique (ID_datimonitoraggioutente, ID_fascia),
    constraint fasceperutenti_ibfk_1
        foreign key (ID_datimonitoraggioutente) references datimonitoraggioutenti (ID)
            on delete cascade,
    constraint fasceperutenti_ibfk_2
        foreign key (ID_fascia) references fasce (ID)
            on delete cascade
);

create index ID_fascia
    on fasceperutenti (ID_fascia);

create table tipologieworkout
(
    ID          int auto_increment
        primary key,
    nome        varchar(100) not null,
    descrizione text         null
);

create table workout
(
    ID                        int auto_increment
        primary key,
    data_inizio               datetime not null,
    data_fine                 datetime null,
    durata_intervallo_analisi int      not null comment 'in seconds',
    ID_tipologiaworkout       int      not null,
    constraint workout_ibfk_1
        foreign key (ID_tipologiaworkout) references tipologieworkout (ID)
);

create index ID_tipologiaworkout
    on workout (ID_tipologiaworkout);

create table partecipanteworkout
(
    ID         int auto_increment
        primary key,
    ID_workout int           not null,
    ID_fascia  int           not null,
    ID_utente  int           not null,
    peso       decimal(5, 2) null,
    altezza    decimal(5, 2) null,
    constraint partecipanteworkout_ibfk_1
        foreign key (ID_workout) references workout (ID),
    constraint partecipanteworkout_ibfk_2
        foreign key (ID_fascia) references fasce (ID),
    constraint partecipanteworkout_ibfk_3
        foreign key (ID_utente) references utenti (ID)
);

create index ID_fascia
    on partecipanteworkout (ID_fascia);

create index ID_utente
    on partecipanteworkout (ID_utente);

create index ID_workout
    on partecipanteworkout (ID_workout);

    

create table datiworkout
(
    ID                     int auto_increment
        primary key,
    ID_partecipanteworkout int           not null,
    num_intervallo         int           not null,
    frequenza_cardiaca     smallint      not null,
    calorie_bruciate       decimal(6, 2) not null,
    intensita              decimal(5, 2) not null,
    constraint datiworkout_ibfk_1
        foreign key (ID_partecipanteworkout) references partecipanteworkout (ID)
);

create index ID_partecipanteworkout
    on datiworkout (ID_partecipanteworkout);