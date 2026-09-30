# Foot Analytics — API (NestJS)

Backend REST pour la plateforme **Foot Analytics**. Il expose tout le CRUD
consomme par le front Next.js (effectif, matchs, entrainements, blessures,
scouting, classement) et un endpoint d'**import de feuilles de match FMI**
qui execute le parseur Python `parse_fmi.py`.

## Stack

- **NestJS 10** + **TypeORM**
- Base **SQLite (sql.js / WASM)** par defaut — *zero configuration, aucune
  compilation native* — ou **PostgreSQL / Supabase** en production
- Validation des entrees via **class-validator**
- Import FMI : appel du script **Python `parser/parse_fmi.py`** (pdfplumber)

## Demarrage rapide

```bash
cd foot-analytics-api
npm install
cp .env.example .env          # facultatif : valeurs par defaut OK
npm run start:dev
```

L'API demarre sur `http://localhost:4000/api` et **peuple automatiquement** la
base au premier lancement avec les donnees reelles (12 clubs, 57 joueurs,
le match Neuville–Meys parse depuis la vraie FMI, le rapport scouting, etc.).

Pour l'import FMI, installer aussi les dependances Python du parseur :

```bash
pip install -r parser/requirements.txt
```

## Configuration (.env)

| Variable | Defaut | Role |
|---|---|---|
| `PORT` | `4000` | Port d'ecoute |
| `CORS_ORIGIN` | `http://localhost:3000` | Origine autorisee (le front) |
| `DB_TYPE` | `sqlite` | `sqlite` (sql.js) ou `postgres` |
| `SQLITE_PATH` | `foot-analytics.sqlite` | Fichier SQLite |
| `DATABASE_URL` | — | Connexion Postgres/Supabase si `DB_TYPE=postgres` |
| `PYTHON_BIN` | `python3` | Binaire Python pour le parseur |
| `FMI_PARSER_PATH` | `parser/parse_fmi.py` | Script de parsing |
| `AUTO_SEED` | `true` | Peuple la base si vide au demarrage |
| `LOG_LEVEL` | `log` | `fatal`, `error`, `warn`, `log`, `debug`, `verbose` : `debug` active les traces de diagnostic (clone de saison, effectif, attache) |

### Passer sur Supabase / Postgres

```env
DB_TYPE=postgres
DATABASE_URL=postgresql://postgres:motdepasse@db.xxxx.supabase.co:5432/postgres
```

`synchronize: true` cree les tables automatiquement (pratique pour la demo ;
en production reelle, basculer sur des migrations TypeORM).

## Endpoints

Toutes les routes sont prefixees par `/api`.

### Clubs
- `GET    /clubs` · `GET /clubs/:id`
- `POST   /clubs` · `PATCH /clubs/:id` · `DELETE /clubs/:id`

### Equipes
- `GET    /equipes?clubId=` · `GET /equipes/:id`
- `POST   /equipes` · `PATCH /equipes/:id` · `DELETE /equipes/:id`

### Joueurs (effectif)
- `GET    /joueurs?clubId=&poste=` · `GET /joueurs/:id`
- `POST   /joueurs` · `PATCH /joueurs/:id` · `DELETE /joueurs/:id`

### Matchs (avec compositions + evenements imbriques)
- `GET    /matchs?clubId=` · `GET /matchs/:id`
- `POST   /matchs` · `PATCH /matchs/:id` · `DELETE /matchs/:id`

### Entrainements (la charge `duree x intensite / 10` est calculee serveur)
- `GET    /entrainements?equipeId=` · `GET /entrainements/:id`
- `POST   /entrainements` · `PATCH /entrainements/:id` · `DELETE /entrainements/:id`

### Blessures
- `GET    /blessures?joueurId=` · `GET /blessures/:id`
- `POST   /blessures` · `PATCH /blessures/:id` · `DELETE /blessures/:id`

### Scouting
- `GET    /scouting?clubId=` · `GET /scouting/club/:clubId` · `GET /scouting/:id`
- `POST   /scouting` · `PATCH /scouting/:id` · `DELETE /scouting/:id`

### Classement / Stats
- `GET    /classement`
- `GET    /stats/bilan/:clubId` · `GET /stats/effectif/:clubId`

### Import FMI
- `POST   /fmi/import` — multipart/form-data, champ `file` (PDF).
  Execute le parseur, cree le match + compositions + evenements.
  Si le `numeroFmi` existe deja, **met a jour** au lieu de dupliquer.
  La reponse contient `avertissements` (donnees partielles : compositions
  incompletes, equipes non rattachees...).
- `POST   /fmi/import-batch` — champ `files` repete. Renvoie un **rapport par
  fichier** (`statut` : `importe` / `mis_a_jour` / `echec`, `code` d'echec :
  `parse_impossible` / `fmi_invalide` / `erreur_interne`, `avertissements`) et
  le bilan du lot (`nouveaux`, `mis_a_jour`, `echecs`, `avec_avertissements`).
  `ok` vaut `false` s'il y a au moins un echec ou si la reconstruction des
  effectifs a echoue.

### Blessures
Une blessure qui chevauche une autre du meme joueur est refusee (`409`,
`code: "BLESSURE_CHEVAUCHANTE"`, liste `conflits`) sauf `forcer: true`.

### Administration
- `POST   /seed/reset` — vide et recree les donnees de demonstration.

## Exemples

```bash
# Modifier un joueur
curl -X PATCH http://localhost:4000/api/joueurs/chapo-5 \
  -H "Content-Type: application/json" \
  -d '{"scoreForme":88,"commentaire":"Capitaine en forme"}'

# Ajouter un entrainement (charge calculee automatiquement)
curl -X POST http://localhost:4000/api/entrainements \
  -H "Content-Type: application/json" \
  -d '{"equipeId":"chapo-s","date":"2026-02-01","type":"Tactique","theme":"Pressing","dureeMin":90,"intensite":7,"presents":20,"total":22}'

# Importer une feuille FMI
curl -X POST http://localhost:4000/api/fmi/import \
  -F "file=@parser/FMI_Neuville1.pdf"
```

## Tests

```bash
npm test                      # Jest : services sur une base SQLite en memoire (sql.js), sans mock
cd parser
pip install -r requirements-dev.txt
pytest tests                  # parseur FMI : feuille de reference + PDF de parser/tests/fixtures/
```

Les PDF de non-regression a ajouter sont listes dans `parser/tests/fixtures/README.md`.

## Arborescence

```
foot-analytics-api/
├── parser/                       # parseur FMI (copie depuis le front)
│   ├── parse_fmi.py
│   └── requirements.txt
├── src/
│   ├── main.ts                   # bootstrap (CORS, prefix /api, validation)
│   ├── app.module.ts
│   ├── common/database.module.ts # choix sqlite (sql.js) / postgres
│   ├── entities/index.ts         # toutes les entites TypeORM
│   ├── seed/                     # donnees reelles + service de seed
│   └── modules/
│       ├── clubs/  equipes/  joueurs/  matchs/
│       ├── entrainements/  blessures/  scouting/
│       ├── classement/  stats/  fmi/
└── .env.example
```
