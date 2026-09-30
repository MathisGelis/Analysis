-- ===========================================================================
--  FOOT ANALYTICS — Schema PostgreSQL / Supabase
--  A executer dans l'editeur SQL de Supabase (ou via `supabase db push`).
--
--  Modele relationnel concu a partir du gabarit reel de Feuille de Match
--  Informatisee (FMI / FFF) et du rapport de scouting Excel existant.
--
--  Convention : tout en francais, snake_case, cle primaire `id uuid`.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
--  1. CLUBS  /  EQUIPES  /  SAISONS
-- ---------------------------------------------------------------------------
create table clubs (
    id            uuid primary key default gen_random_uuid(),
    numero_fff    text unique,                 -- ex. "504275"
    nom           text not null,
    ville         text,
    logo_url      text,
    couleur       text default '#b6f24a',
    cree_le       timestamptz default now()
);

create table saisons (
    id            uuid primary key default gen_random_uuid(),
    libelle       text not null,               -- ex. "2025-2026"
    debut         date,
    fin           date
);

create table equipes (
    id            uuid primary key default gen_random_uuid(),
    club_id       uuid references clubs(id) on delete cascade,
    saison_id     uuid references saisons(id) on delete set null,
    nom           text not null,               -- ex. "Neuville S/S 2"
    categorie     text,                        -- "Seniors", "U20", "SR3"...
    division      text,                        -- "D2"
    poule         text,                        -- "C"
    coach         text,
    formation_def text default '4-2-3-1',      -- systeme de reference
    created_at    timestamptz default now()
);
create index idx_equipes_club on equipes(club_id);

-- ---------------------------------------------------------------------------
--  2. JOUEURS
-- ---------------------------------------------------------------------------
create table joueurs (
    id              uuid primary key default gen_random_uuid(),
    licence         text unique,               -- numero de licence FFF
    nom             text not null,
    prenom          text,
    club_id         uuid references clubs(id) on delete set null,
    poste           text,                      -- "GB","DC","MC","ATT"...
    date_naissance  date,
    statut_mutation text,                       -- "Mutation" / "Pas mutation"
    photo_url       text,
    created_at      timestamptz default now()
);
create index idx_joueurs_club on joueurs(club_id);
create index idx_joueurs_licence on joueurs(licence);

-- lien joueur <-> equipe (un joueur peut jouer dans plusieurs equipes)
create table effectifs (
    id          uuid primary key default gen_random_uuid(),
    equipe_id   uuid references equipes(id) on delete cascade,
    joueur_id   uuid references joueurs(id) on delete cascade,
    numero      int,
    unique (equipe_id, joueur_id)
);

-- ---------------------------------------------------------------------------
--  3. ARBITRES
-- ---------------------------------------------------------------------------
create table arbitres (
    id            uuid primary key default gen_random_uuid(),
    licence       text unique,
    nom_complet   text not null,
    tendance      text,                        -- "stricte" / "permissive"
    note_moyenne  numeric(3,1)
);

-- ---------------------------------------------------------------------------
--  4. MATCHS
-- ---------------------------------------------------------------------------
create table matchs (
    id                uuid primary key default gen_random_uuid(),
    numero_fmi        text unique,             -- N° de match de la FMI
    saison_id         uuid references saisons(id) on delete set null,
    journee           text,                    -- "J16", "Coupe GVR - 1/4"...
    date              date,
    heure             time,
    competition       text,
    poule             text,
    terrain           text,
    equipe_dom_id     uuid references equipes(id) on delete set null,
    equipe_ext_id     uuid references equipes(id) on delete set null,
    score_dom         int,
    score_ext         int,
    arbitre_id        uuid references arbitres(id) on delete set null,
    formation_dom     text,
    formation_ext     text,
    statut            text default 'joue',     -- joue / arrete / non_joue
    pdf_url           text,                    -- feuille de match d'origine
    created_at        timestamptz default now()
);
create index idx_matchs_dom on matchs(equipe_dom_id);
create index idx_matchs_ext on matchs(equipe_ext_id);
create index idx_matchs_date on matchs(date);

-- compositions : un joueur dans un match
create table compositions (
    id          uuid primary key default gen_random_uuid(),
    match_id    uuid references matchs(id) on delete cascade,
    equipe_id   uuid references equipes(id) on delete cascade,
    joueur_id   uuid references joueurs(id) on delete cascade,
    numero      int,
    titulaire   boolean default true,
    capitaine   boolean default false,
    minutes     int default 0,
    note        numeric(3,1),
    unique (match_id, joueur_id)
);
create index idx_compo_match on compositions(match_id);
create index idx_compo_joueur on compositions(joueur_id);

-- evenements de match (cartons, buts, remplacements, blessures)
create table evenements_match (
    id            uuid primary key default gen_random_uuid(),
    match_id      uuid references matchs(id) on delete cascade,
    equipe_id     uuid references equipes(id) on delete set null,
    joueur_id     uuid references joueurs(id) on delete set null,
    joueur_2_id   uuid references joueurs(id) on delete set null, -- passeur / entrant
    type          text not null,        -- 'carton' | 'but' | 'remplacement' | 'blessure'
    sous_type     text,                 -- 'jaune'|'rouge' / 'cpa'|'jeu' / localisation
    motif         text,
    minute        int,
    arret         int default 0,        -- temps additionnel
    created_at    timestamptz default now()
);
create index idx_evt_match on evenements_match(match_id);
create index idx_evt_joueur on evenements_match(joueur_id);
create index idx_evt_type on evenements_match(type);

-- ---------------------------------------------------------------------------
--  5. ENTRAINEMENTS
-- ---------------------------------------------------------------------------
create table entrainements (
    id          uuid primary key default gen_random_uuid(),
    equipe_id   uuid references equipes(id) on delete cascade,
    date        date,
    type        text,                    -- "tactique","physique","technique"...
    duree_min   int,
    intensite   int,                     -- /10
    charge      numeric(6,1),            -- duree x intensite (RPE)
    contenu     text,
    qualite     int                      -- /10
);
create index idx_entr_equipe on entrainements(equipe_id);

create table presence_entrainement (
    id              uuid primary key default gen_random_uuid(),
    entrainement_id uuid references entrainements(id) on delete cascade,
    joueur_id       uuid references joueurs(id) on delete cascade,
    present         boolean default true,
    engagement      int,                 -- /10
    unique (entrainement_id, joueur_id)
);

-- ---------------------------------------------------------------------------
--  6. MEDICAL  /  CHARGE  /  FORME
-- ---------------------------------------------------------------------------
create table blessures (
    id              uuid primary key default gen_random_uuid(),
    joueur_id       uuid references joueurs(id) on delete cascade,
    match_id        uuid references matchs(id) on delete set null,
    localisation    text,
    gravite         text,                -- "legere","moderee","grave"
    date_debut      date,
    duree_estimee   int,                 -- jours
    protocole       text,
    risque_recidive int                  -- /100
);

create table suivi_forme (
    id                uuid primary key default gen_random_uuid(),
    joueur_id         uuid references joueurs(id) on delete cascade,
    date              date,
    score_forme       int,               -- /100
    fatigue           int,               -- /100 (questionnaire)
    charge_semaine    numeric(7,1),
    note_moyenne      numeric(3,1)
);
create index idx_forme_joueur on suivi_forme(joueur_id);

-- ---------------------------------------------------------------------------
--  7. SCOUTING  (remplace les rapports Excel)
-- ---------------------------------------------------------------------------
create table rapports_scouting (
    id                  uuid primary key default gen_random_uuid(),
    equipe_id           uuid references equipes(id) on delete cascade,
    auteur              text,
    date_rapport        date default current_date,
    dispositif_attendu  text,
    commentaires        text,
    joueurs_cles        text[],
    joueurs_suspendus   text[],
    forces              text[],
    faiblesses          text[],
    created_at          timestamptz default now()
);

-- ---------------------------------------------------------------------------
--  8. IA  /  PREDICTIONS
-- ---------------------------------------------------------------------------
create table predictions_ia (
    id              uuid primary key default gen_random_uuid(),
    equipe_id       uuid references equipes(id) on delete cascade,
    match_id        uuid references matchs(id) on delete set null,
    type            text,                -- 'compo' | 'formation' | 'fatigue'
    formation       text,
    payload         jsonb,               -- compo probable, probabilites...
    confiance       numeric(4,1),        -- %
    genere_le       timestamptz default now()
);

-- ---------------------------------------------------------------------------
--  9. VUES  (statistiques agregees)
-- ---------------------------------------------------------------------------

-- Bilan d'une equipe sur la saison
create or replace view v_bilan_equipe as
with res as (
    select equipe_dom_id as equipe_id,
           score_dom as bp, score_ext as bc,
           case when score_dom > score_ext then 'V'
                when score_dom = score_ext then 'N' else 'D' end as issue,
           true as domicile
    from matchs where statut = 'joue'
    union all
    select equipe_ext_id, score_ext, score_dom,
           case when score_ext > score_dom then 'V'
                when score_ext = score_dom then 'N' else 'D' end,
           false
    from matchs where statut = 'joue'
)
select equipe_id,
       count(*)                                    as matchs_joues,
       count(*) filter (where issue = 'V')          as victoires,
       count(*) filter (where issue = 'N')          as nuls,
       count(*) filter (where issue = 'D')          as defaites,
       coalesce(sum(bp), 0)                         as buts_marques,
       coalesce(sum(bc), 0)                         as buts_encaisses,
       coalesce(sum(bp) - sum(bc), 0)               as difference,
       count(*) filter (where issue = 'V') * 3
         + count(*) filter (where issue = 'N')      as points,
       round(avg(bp)::numeric, 2)                   as buts_marques_moy,
       round(avg(bc)::numeric, 2)                   as buts_encaisses_moy
from res
group by equipe_id;

-- Statistiques de discipline par joueur
create or replace view v_discipline_joueur as
select joueur_id,
       count(*) filter (where sous_type = 'jaune') as cartons_jaunes,
       count(*) filter (where sous_type = 'rouge') as cartons_rouges
from evenements_match
where type = 'carton'
group by joueur_id;

-- ---------------------------------------------------------------------------
--  10. ROW LEVEL SECURITY  (a activer / affiner selon votre organisation)
-- ---------------------------------------------------------------------------
-- Exemple : lecture autorisee a tout utilisateur authentifie.
-- alter table matchs enable row level security;
-- create policy "lecture authentifiee" on matchs
--   for select using (auth.role() = 'authenticated');
--
-- Repeter pour chaque table, ou utiliser une table `membres_staff`
-- pour restreindre par club.

-- ===========================================================================
--  FIN DU SCHEMA
-- ===========================================================================
