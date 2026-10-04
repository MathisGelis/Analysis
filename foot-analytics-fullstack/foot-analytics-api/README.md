# Foot Analytics — API (NestJS)

Backend REST pour la plateforme **Foot Analytics**. Il expose tout le CRUD
consomme par le front Next.js (effectif, matchs, entrainements, blessures,
scouting, classement) et un endpoint d'**import de feuilles de match FMI**
qui execute le parseur Python `parse_fmi.py`.

## Stack

- **NestJS 11** + **TypeORM 0.3**
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
| `DATABASE_URL` | — | Connexion Postgres/Supabase si `DB_TYPE=postgres` (voir ci-dessous) |
| `DB_SSL` | `require` (`off` en local) | `off`, `require` (chiffre, sans verifier le certificat) ou `verify` (avec `DB_SSL_CA`) |
| `DB_SSL_CA` | — | Certificat de l'autorite (PEM, ou chemin du fichier) pour `DB_SSL=verify` |
| `DB_POOL_MAX` | `10` | Taille du pool de connexions Postgres |
| `DB_MIGRATIONS_RUN` | `true` | `false` : ne pas appliquer les migrations au demarrage (Postgres) |
| `SEED_FORCE` | — | `true` autorise le peuplement de demo a vider une base Postgres (a eviter) |
| `PYTHON_BIN` | `python3` | Binaire Python pour le parseur |
| `FMI_PARSER_PATH` | `parser/parse_fmi.py` | Script de parsing |
| `AUTO_SEED` | `true` (SQLite) · `false` (Postgres) | Peuple la base de demo si elle est vide au demarrage |
| `LOG_LEVEL` | `log` | `fatal`, `error`, `warn`, `log`, `debug`, `verbose` : `debug` active les traces de diagnostic (clone de saison, effectif, attache) |

### Passer sur Supabase / Postgres

Supabase ne sert ici que de **Postgres heberge** : l'authentification (JWT + bcrypt), les droits et l'import FMI
restent dans cette API.

1. **Projet** : creer le projet dans une region UE (Paris ou Francfort) : la base contient des blessures
   (donnees de sante) et des joueurs mineurs.
2. **Connexion** : bouton *Connect* du projet (ou *Project Settings > Database*), puis la chaine **Session pooler**
   (port `5432`) ou la connexion directe. Pas le *Transaction pooler* (`6543`) : migrations et transactions
   supposent une session stable.

   ```env
   DB_TYPE=postgres
   DATABASE_URL=postgresql://postgres.<ref>:<mot-de-passe>@aws-0-<region>.pooler.supabase.com:5432/postgres
   ```

   Un mot de passe contenant `@`, `#` ou `/` doit etre encode (`%40`, `%23`, `%2F`).
3. **SSL** : chiffre par defaut sans verifier le certificat. Pour verifier la chaine, telecharger le certificat
   (*Project Settings > Database > SSL configuration*) et regler `DB_SSL=verify` + `DB_SSL_CA=/chemin/prod-ca.crt`.
4. **Schema** : il evolue par **migrations** (`src/database/migrations`), appliquees au demarrage ; jamais de `synchronize`
   sur Postgres.
5. **Donnees** : copier un fichier SQLite existant vers la base (applique les migrations, puis copie tout dans une
   transaction ; refuse une cible non vide, `--ecraser` pour la vider d'abord). Le fichier SQLite n'est jamais modifie.

   ```bash
   DATABASE_URL=... npm run db:copier -- --sqlite foot-analytics.sqlite
   ```
6. **Securite** : Supabase expose par defaut une API REST sur toutes les tables, avec une cle `anon` publique. La
   migration `VerrouillerApiDonnees` active la RLS sans politique sur chaque table et retire les privileges de
   `anon` / `authenticated`, tables futures comprises (`migrations.pg.spec.ts` echoue si une table reste ouverte).
   L'API Nest se connecte avec le role proprietaire, que la RLS ne bloque pas. Par precaution, desactiver aussi la
   *Data API* du projet (*Project Settings*), inutilisee ici.
7. **Peuplement de demo** : jamais automatique sur Postgres, et `npm run seed` / `POST /seed/reset` y sont refuses
   (ils videraient toutes les tables).
8. **Sauvegardes** : l'offre gratuite n'en fait pas de maniere fiable et met le projet en pause apres une semaine
   d'inactivite ; pour de vraies donnees, prendre une offre avec sauvegardes quotidiennes, et verifier une restauration.

### Migrations

```bash
npm run migration:show                                   # etat (DATABASE_URL)
npm run migration:run                                    # applique celles qui manquent
npm run migration:revert                                 # annule la derniere
npm run migration:generate -- src/database/migrations/NomClair    # apres avoir modifie une entite
```

`migration:generate` compare les entites a la base visee : elle doit etre a jour des migrations existantes
(`migration:run` sur un Postgres local vide d'abord). Relire le fichier genere, retirer tout `"public".` en dur, et
**activer la RLS** sur toute nouvelle table (`ALTER TABLE ... ENABLE ROW LEVEL SECURITY`, comme dans
`VerrouillerApiDonnees`) : le test de migrations le verifie.

### Tests sur Postgres

La suite Jest tourne par defaut sur SQLite (en memoire). Avec `TEST_DATABASE_URL`, la meme suite tourne sur
Postgres (un schema par test, supprime ensuite) et les tests de migrations, de verrouillage RLS et de copie
SQLite -> Postgres s'activent :

```bash
docker run -d -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=foot_test -p 5432:5432 postgres:16
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/foot_test npx jest
```

Ne jamais viser une base Supabase : les tests refusent un hote `supabase.co` / `supabase.com`. La CI lance les deux
variantes, ainsi que le parcours Playwright sur SQLite puis sur Postgres.

## Endpoints

Toutes les routes sont prefixees par `/api`.

### Clubs
- `GET    /clubs` · `GET /clubs/:id`
- `POST   /clubs` · `PATCH /clubs/:id` · `DELETE /clubs/:id`

### Equipes
- `GET    /equipes?clubId=` · `GET /equipes/:id`
- `POST   /equipes` · `PATCH /equipes/:id` · `DELETE /equipes/:id`
- Une nouvelle saison reprend les equipes de la precedente (clones sans joueurs).
  Des que la 1re feuille de la nouvelle poule est importee, le clone provisoire
  (meme niveau : categorie + division) est **fusionne** dans la vraie equipe,
  joueurs, seances et saisies comprises ; au demarrage l'API reconcilie aussi les
  donnees existantes (`AUTO_RECONCILE=false` pour desactiver).

### Joueurs (effectif)
- `GET    /joueurs?clubId=&poste=` · `GET /joueurs/:id`
- `POST   /joueurs` · `PATCH /joueurs/:id` · `DELETE /joueurs/:id`
- **Stats par equipe et par saison** (jamais les compteurs globaux du joueur) :
  - `GET /joueurs/effectif?equipeId=` : effectif d'une equipe, stats sur ses seuls matchs ;
  - `GET /joueurs/championnat?equipeId=` : joueurs de la poule (meme saison + competition + poule) ;
  - `GET /joueurs/:id/historique` : une entree par saison (`totaux`, `saisonActive`) avec une ligne par equipe
    (matchs, minutes, buts, passes, cartons, numeros portes) ;
  - `GET /joueurs/:id/matchs?saisonId=&limite=` : derniers matchs joues, avec la feuille personnelle ;
  - `PUT /joueurs/:id/stats-equipe/:equipeId` `{ buts?, passesDecisives? }` : saisie manuelle pour CETTE equipe
    (les FMI n'ont pas toujours les buteurs) ; `null` efface et revient au calcul depuis les feuilles.

### Matchs (avec compositions + evenements imbriques)
- `GET    /matchs?clubId=` · `GET /matchs/:id`
- `POST   /matchs` · `PATCH /matchs/:id` · `DELETE /matchs/:id`

### Entrainements (la charge `duree x intensite / 10` est calculee serveur)
- `GET    /entrainements?equipeId=` · `GET /entrainements/:id`
- `POST   /entrainements` · `PATCH /entrainements/:id` · `DELETE /entrainements/:id`

### Maintenance (admin)
- `POST   /arbitres/maintenance/delegues` — supprime les liens d'arbitre de role
  `autre` et les arbitres qui n'en ont pas d'autre : ce sont les delegues de
  rencontre enregistres a tort par les anciens imports FMI. **Simulation par
  defaut** ; `?appliquer=true` pour supprimer, puis `POST /derivation/rebuild`.

### Blessures
- `GET    /blessures?joueurId=` · `GET /blessures/:id`
- `POST   /blessures` · `PATCH /blessures/:id` · `DELETE /blessures/:id`

### Scouting
- `GET    /scouting?clubId=&saisonId=` · `GET /scouting/club/:clubId?saisonId=` · `GET /scouting/:id`
  (avec `saisonId`, seuls les rapports dates dans la saison : du 1er juillet au 30 juin)
- `POST   /scouting` · `PATCH /scouting/:id` · `DELETE /scouting/:id`

### Classement / Stats
- `GET    /classement`
- `GET    /stats/bilan/:clubId?equipeId=&saisonId=` (sans parametre : toutes equipes et saisons melangees)
- `GET    /analyse/club/:clubId?equipeId=&saisonId=` : rapport d'analyse d'equipe, meme perimetre
- `GET    /analyse/club/:clubId/situation?equipeId=&saisonId=` : dispositif joue (`systeme.prediction` : d'apres les seuls
  matchs dont le staff a renseigne le dispositif, jamais une valeur par defaut ; `systeme.probable` : fusionne avec ce que
  disent les numeros de maillot) et dernier onze (feuille du dernier match joue)
- `GET    /analyse/prematch?equipeId=&adversaireId=&matchId=` : rapport pre-match (aussi : bilan de saison, derniers matchs,
  buteurs, systeme probable et onze probable de l'adversaire)
- `GET    /analyse/prematch/pages` : les 15 pages du rapport PowerPoint (`id`, `titre`, `contenu`, `groupe`), dans l'ordre du
  dossier, pour proposer le choix. `groupe` : `modele` (les 7 pages du modele du staff) ou `analyse` (8 pages ajoutees, au
  meme style, pour les statistiques que le modele n'a pas la place d'accueillir)
- `GET    /analyse/prematch/export?equipeId=&adversaireId=&matchId=&pages=` : le rapport d'avant-match **en PowerPoint**
  (`.pptx`, au format du modele `src/features/analyse/modele/rapport-avant-match.pptx`). `pages` : liste separee par des
  virgules parmi `couverture, match, saison, comparatif, forme, forces, pistes, dispositif, systeme, onze, polyvalence,
  joueurs, face, ambiance, cles` (toutes par defaut, toujours dans cet ordre ; une page inconnue ou aucune page : `400`).
  Memes regles d'acces que le rapport. Une information inconnue (heure de convocation, surface du terrain, style de
  jeu...) donne un **champ vide** a completer dans PowerPoint, jamais une valeur inventee.

### Rapport PowerPoint : le modele du staff, plus les pages d'analyse
Les 7 pages du modele (couverture, match, saison, forces, dispositif, ambiance, cles) gardent sa mise en page : le fichier
est le modele lui-meme, dont on remplit les formes. Le rapport pre-match sait toutefois bien plus que ces pages ne
peuvent en porter ; **rien n'est retire de la presentation** : les statistiques sans place dans le modele ont leur propre
page, construite dans le meme style (palette, Arial, cartes arrondies, rond d'en-tete et pied de page du modele) :

| Page | Contenu |
|---|---|
| `comparatif` | tableau chiffre nous / eux (classement, points, buts, domicile / exterieur, dynamique, serie) + projection du resultat (victoire / nul / defaite, score probable, buts attendus) |
| `forme` | forme des deux equipes, leurs 5 derniers matchs, constats chiffres (dynamique, domicile / exterieur, matchs serres, fin de match) |
| `pistes` | toutes les pistes pour le match (atout / vigilance / info, importance), en entier |
| `systeme` | systeme probable, confiance, alternatives et **tous les indices** tires des numeros de maillot |
| `onze` | onze probable poste par poste (numero, joueur, titularisations, autres joueurs au meme numero) |
| `polyvalence` | joueurs qui changent de numero (donc de poste), numeros portes et postes |
| `joueurs` | danger, stabilite du onze, fatigue, changements, joueurs cles (impact en points par match), buteurs, sanctions et discipline |
| `face` | face-a-face (bilan, rencontres) et arbitre (profil, cartons, motifs) |

Sur les pages du modele, rien n'est coupe non plus : forces, faiblesses et trois cles s'ecrivent en entier, la police
s'adaptant a la place (jamais sous 9 pt ; au-dela, le texte est abrege sur la page du modele mais reste complet sur la
page `pistes`). Les textes ecrits par l'application (en-tetes, libelles) portent leurs accents ; les phrases calculees par
l'API (pistes, constats, indices) restent en ASCII comme le reste de l'API.

Code : `pptx-xml.ts` (operations OOXML sur l'archive : formes, texte, cellules, ajout / retrait / ordre des diapositives),
`pptx-formes.ts` (constructeurs de formes au style du modele), `rapport-pptx-analyse.ts` (contenu des pages d'analyse, pur),
`rapport-pptx-pages.ts` (mise en page des 8 pages), `rapport-pptx-contenu.ts` (contenu des 15 pages) et `rapport-pptx.ts`
(assemblage : pages au choix, pieds de page renumerotes).

### Compo et systeme probables : les numeros de maillot
La FMI ne donne pas le dispositif, mais les numeros portent une information (convention du staff : 1 gardien, 2 DD, 3 DG,
4 DCD, 5 DCG, 6 MDC, 7 AG, 8 MC, 9 BU, 10 MO, 11 AD ; `features/matchs/numeros-postes.ts`). `features/analyse/compo-numeros.ts`
en tire :
- le **onze probable par poste** : un joueur par numero d'apres les 10 dernieres feuilles (les recentes pesent plus) ;
- le **systeme**, d'apres les **changements de numero** d'un joueur : un 2 qui devient 4 (DD vers DC) dit une defense a 4, un
  attaquant tantot 9 tantot 10 dit deux attaquants, un 9 qui alterne avec un 7 ou un 11 trois attaquants... (table `REGLES`).
  Des numeros stables (1 a 11 dans 96 % des feuilles) donnent les postes mais pas le systeme. Un changement vu une fois
  (remplacement d'urgence) pese moitie moins qu'un changement qui se repete, les recents pesent plus. Sur les feuilles
  reelles les numeros bougent beaucoup et se contredisent souvent : **un systeme n'est retenu que si les preuves sont
  suffisantes et si le premier devance nettement le suivant** ; sinon seules ressortent les lignes nettes (« defense a 4 »,
  « deux attaquants ») et les indices. Chaque estimation cite ses indices, sa confiance est plafonnee a 70 %, et si les
  numeros sont ceux de la saison (hors 1-11) rien n'est deduit.

`features/analyse/systeme-probable.ts` les fusionne avec les dispositifs saisis (le staff prime, les numeros confirment,
completent ou contredisent) ; `disposition-onze.ts` dit ou se placent les numeros dans chaque dispositif.

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

### Comptes et roles
Trois roles : `admin`, `referent` (referent d'un club) et `user` (educateur).
- `GET/POST /utilisateurs` · `GET/PATCH/DELETE /utilisateurs/:id` : reserves a l'administrateur et au referent.
  L'**administrateur** gere tous les comptes. Le **referent** ne voit et ne gere que les comptes `user` de SON club :
  il peut en creer autant qu'il veut (mot de passe initial a changer a la 1re connexion), leur attribuer des equipes de
  son club (aucune equipe = toutes), les modifier, reinitialiser leur mot de passe et les supprimer. Il ne peut jamais
  creer d'admin ni de referent, ni sortir de son club : `403` ; un compte hors de son perimetre est `404`.
  Les droits sont lus en base a chaque appel (pas dans le jeton).
- Chaque compte renvoie son **createur** (`createur: { id, login, prenom, nom }`, `null` pour un compte anterieur au
  suivi ou cree a l'amorcage, `createurSupprime: true` si ce compte a disparu depuis). Il est fixe a la creation et ne
  se modifie pas.
- **Saisons consultables** d'un educateur : `toutesSaisons` (defaut `true` : comptes existants et creations par l'API sans
  precision) ou `toutesSaisons: false` + `saisonIds` (saisons passees visibles en plus de la saison actuelle et des
  suivantes ; liste vide = la saison actuelle seulement). Les identifiants inconnus sont refuses (`400`). Un admin ou un
  referent voit toujours tout.

### Perimetre d'acces (filtrage cote API)
Chaque requete authentifiee passe par `AccesGuard` (`src/features/acces`) : le compte, ses equipes attribuees et ses saisons
ouvertes sont lus **en base** a chaque appel (jamais dans le jeton) ; une restriction posee par un gestionnaire joue
immediatement et un compte supprime perd l'acces tout de suite (`401`). La politique est dans `features/acces/contexte-acces.ts`. Le front
ne filtre rien : il affiche ce que l'API renvoie.

| | admin | referent | educateur |
|---|---|---|---|
| Club | tous | le sien | le sien |
| Equipes de son club | toutes | toutes | celles attribuees (aucune = toutes) ; une equipe attribuee l'est aussi sur les autres saisons (meme empreinte, ou meme categorie + division quand la poule change) |
| Saisons | toutes | toutes | selon `toutesSaisons` / `saisonIds` |

- **Donnees de championnat** (matchs, classements, clubs, equipes et joueurs adverses, arbitres, entraineurs, rapports de
  scouting, analyses) : lisibles par tous les comptes connectes, **hors des saisons fermees au compte** : listes filtrees,
  lecture par identifiant `404`, parametre `saisonId` ferme `404` (ou liste vide). Sans `saisonId` ni `equipeId`, une analyse
  ou un bilan d'un compte restreint porte sur la saison actuelle. Pour un joueur d'un autre club, les champs prives
  (commentaire, fatigue, morphologie...) sont retires.
- **Donnees privees d'un club** (seances, plans de jeu, blessures, effectif saisi) et **ecritures** : limitees au club du compte
  et, pour un educateur, a ses equipes ; une equipe d'un autre club ou non attribuee est `403` (`404` si sa saison est fermee).
  Un match ne se programme ou ne se modifie que si l'un des deux clubs est le sien ; rien ne se deplace vers un autre club
  ou une autre equipe.
- **Reserve a l'administrateur** : creer, modifier, activer, supprimer une saison ; supprimer un club ; renommer ou supprimer
  un arbitre ; `POST /seed/reset` ; les maintenances. Le referent gere les equipes et le club de son club ; tout compte peut ajouter un
  club adverse, un arbitre, importer une feuille FMI et relancer la derivation.
- Limite connue : les totaux cumules d'un joueur, d'un arbitre ou d'un entraineur (denormalises sur toute sa carriere) ne se
  decoupent pas par saison et restent visibles ; tout ce qui est ventile par saison est filtre.
- Les tests `test/features/acces/acces.http.spec.ts` demarrent l'application entiere (vrais gardes, base de test) et appellent l'API
  avec les jetons d'un admin, d'un referent et de plusieurs educateurs.

### Administration
- `POST   /seed/reset` — vide et recree les donnees de demonstration (administrateur seulement ; refuse sur Postgres).

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

Une **feature** = un dossier de `src/features/`, avec tout ce qui la concerne : entite(s), DTO, service, controleur, module et la
logique pure qui n'est utile qu'a elle. Rien n'est partage entre features par un fichier fourre-tout : ce qui sert a
plusieurs vit dans `src/common/` (utilitaires sans domaine) ou dans la feature qui possede le concept (`matchs/minutes.ts`
est importe par `joueurs` et `tactiques`).

```
foot-analytics-api/
├── parser/                       # parseur FMI (Python) et ses tests
├── src/
│   ├── main.ts                   # demarrage (CORS, prefixe /api, validation, taches d'amorcage)
│   ├── app.module.ts             # assemble les modules + gardes globaux (JWT puis perimetre d'acces)
│   ├── common/                   # utilitaires transverses : dates, saison d'une date, recherche floue, niveaux de log
│   ├── database/                 # connexion (sqlite sql.js / postgres), registre des entites, migrations, copie SQLite -> Postgres
│   │   └── migrations/
│   └── features/
│       ├── acces/                # politique d'acces (club, equipes, saisons), garde global, decorateur @Acces()
│       ├── auth/                 # login, jetons JWT, gardes, @Public()
│       ├── utilisateurs/         # comptes, roles, saisons consultables
│       ├── clubs/  saisons/  equipes/
│       ├── matchs/               # match + composition + evenements, systeme de jeu, minutes, programme
│       ├── joueurs/              # joueurs, stats par equipe, fatigue, parcours et statut de mutation
│       ├── entrainements/  blessures/  tactiques/
│       ├── arbitres/  coachs/  scouting/  classement/  stats/
│       ├── analyse/              # tendances, rapport d'equipe, rapport pre-match (+ export PowerPoint, modele/), situation, numeros de maillot
│       ├── fmi/                  # import des feuilles de match (appelle parser/parse_fmi.py)
│       ├── derivation/           # recalcul des effectifs, classements et cumuls apres import
│       └── seed/                 # donnees de demonstration
├── test/                         # miroir de src/ : un fichier <nom>.spec.ts par fichier teste
│   ├── common/  database/  features/
│   └── support/                  # base de test (sqlite / Postgres), monde de test, application complete (app-test.ts)
└── .env.example
```

Dans une feature : `x.entity.ts` (une entite par fichier), `x.dto.ts`, `x.service.ts`, `x.controller.ts`, `x.module.ts`, plus
les fichiers de logique pure (`fatigue.ts`, `tendances.ts`...), sans dependance a Nest ni a la base, testes tels quels.
Les imports internes a une feature sont relatifs (`./x.service`) ; entre features, ils passent par l'alias `@/`
(`@/features/matchs/minutes`). Les tests utilisent `@test/` pour leurs outils (`@test/support/test-db`).
