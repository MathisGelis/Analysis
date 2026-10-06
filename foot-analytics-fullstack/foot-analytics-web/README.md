# Foot Analytics — plateforme staff & scouting

> Application web orientee coach / staff pour la gestion, l'analyse et le
> scouting d'une equipe de football amateur. Pensee comme une alternative
> moderne aux rapports Excel et aux feuilles de match papier — elle parse
> directement les FMI FFF en PDF et les transforme en donnees exploitables.

Les donnees de demonstration viennent de deux sources reelles : une feuille FFF
(Neuville S/S 2 vs F.C. Meys Grezieu 1, match N° 53415223, 18/01/2026, Poule C) et le
suivi Chaponnay sur 25 journees. Le parseur Python des feuilles de match vit dans le
backend (`foot-analytics-api/parser/`, avec la feuille de reference et ses tests).

## Backend API (NestJS)

Ce front est concu pour fonctionner avec le backend **`foot-analytics-api`**
(NestJS, fourni separement). Le front lit et ecrit via son client
`src/shared/lib/api.ts`, qui appelle l'URL definie par `NEXT_PUBLIC_API_URL`
(defaut `http://localhost:4000/api`).

- **Si le backend tourne** : toutes les pages lisent les donnees en base, et
  les pages d'edition (effectif, fiche joueur, entrainements, import FMI)
  ecrivent reellement via l'API (CRUD complet).
- **Si le backend est absent ou injoignable** : chaque lecture **retombe
  automatiquement** sur les donnees locales de demonstration
  (`src/shared/data/demo.ts`), pour que l'app reste affichable. Les mutations
  necessitent en revanche le backend.

```bash
# 1. Lancer le backend (dans foot-analytics-api/)
npm install && npm run start:dev      # -> http://localhost:4000/api

# 2. Lancer le front (ici), pointe sur le backend
echo "NEXT_PUBLIC_API_URL=http://localhost:4000/api" >> .env.local
npm install && npm run dev            # -> http://localhost:3000
```

Pages branchees sur l'API : Dashboard, Championnat, Club, Scouting, Matchs
(liste + detail), Joueur, Effectif (CRUD), Entrainements (ajout), Medical,
Fair-play, Import FMI (upload reel vers le parseur du backend).

---

## Aperçu fonctionnel

| Section | Description |
|---|---|
| **Dashboard** | Hero club, KPIs (BM/BC, forme, discipline), dernier match, prochain match avec acces au rapport scouting, courbe BM/BC saison, top forme, classement Poule C |
| **Championnat** | Classement complet 12 equipes + buts par equipe |
| **Mon club** | Identite, bilan dom/ext, effectif, historique des matchs |
| **Effectif** | 57 joueurs Chaponnay reels, filtres poste + tri (matchs/forme/discipline/nom) |
| **Joueur** | Identite, score de forme, note, risque blessure IA, polyvalence postes, observations |
| **Matchs** | Liste avec badge FMI |
| **Match (detail)** | Score, terrains SVG cote-a-cote avec compos et cartons, banc, timeline chronologique, heatmap, tableaux complets compos + licences |
| **Tactique** | Selecteur de formation + 11 type modifiable, suggestion IA. Sans composition enregistree, le dispositif de depart est celui que le logiciel a identifie pour l'equipe (derniers matchs renseignes, numeros de maillot, IA), sinon 4-2-3-1 |
| **Entrainements** | Planning semaine, charge par seance, presences |
| **Medical** | **Saison en cours** : blesses du moment, saisie des blessures, puis la **fatigue de l'effectif** (toujours affichee). **Saison precedente** : resume des blessures de la saison (chiffres cles, ou, quand, joueurs les plus touches, rechutes), detail avec saisie |
| **Fair-play** | KPIs cartons, motifs, par journee, joueurs a surveiller, profil estime |
| **Scouting** | Notes d'observation sur un club (ouvertes depuis son dossier dans Rapports ; remplace l'Excel Chaponnay) |
| **Analytics** | xG vs G, heatmaps off/def, tendances |
| **Calendrier** | Vue mois, matchs + entrainements ; ferme sur une saison anterieure a la saison en cours |
| **Rapports** | **Point d'entree unique** : le prochain match en un clic et un dossier par club (pre-match avec ses predictions : projection du resultat, systeme et onze probables, pistes ; analyse d'equipe ; scouting). Le pre-match s'imprime en PDF et **s'exporte en PowerPoint** (pages au choix) |
| **Import FMI** | Drag&drop PDF, simulation pipeline parser → base |

---

## Stack technique

- **Next.js 15** (App Router) + **React 19** + **TypeScript** + **Tailwind CSS 3**
- Donnees et authentification : l'**API NestJS** (`foot-analytics-api`), sur SQLite en dev et sur
  Postgres (Supabase) en production. Le front ne parle qu'a cette API ; il n'a aucune cle de base.
- **pdfplumber** (Python) pour le parsing des feuilles FMI
- Pas de dependance graphique externe : tous les graphiques sont des SVG
  ecrits a la main dans `src/shared/ui/Charts.tsx` (BarsChart, Sparkline,
  DonutStat, FormeStrip, PitchHeatmap) — l'app reste tres legere.
- Polices auto-hebergees (paquets `@fontsource-variable`, aucun appel a Google Fonts) :
  **Bricolage Grotesque** (titres, grands chiffres), **Instrument Sans** (texte),
  **JetBrains Mono** (codes)
- Direction artistique "Soiree de match" : bleu nuit + accent violet, mode nuit / jour
  (voir *Design system* plus bas)

---

## Demarrage rapide

### 1. Mode demo (sans API)

L'app fonctionne immediatement avec les donnees reelles parsees, sans
backend :

```bash
cd foot-analytics
npm install
npm run dev
```

Ouvrir <http://localhost:3000>.

### 2. Mode complet (avec l'API)

Demarrer `foot-analytics-api` (voir son README : SQLite par defaut, Postgres / Supabase en
production), puis :

```bash
cp .env.example .env.local
# NEXT_PUBLIC_API_URL doit pointer vers l'API (http://localhost:4000/api par defaut)
npm run dev
```

### Design system

Tout passe par des **jetons CSS** (`src/app/globals.css`), jamais de couleur en dur :
surfaces (`--bg`, `--surface`, `--surface-2`, `--surface-3`), texte (`--ink`, `--muted`,
`--faint`), accent (`--accent` pour le texte et les icones, `--accent-strong` pour les aplats
portant du texte blanc), donnees (`--sky`, `--amber`, `--danger`, `--win/--draw/--loss`),
series de graphiques (`--chart-1..3`, validees pour le daltonisme). Deux modes, choisis par
`data-theme` ; contrastes texte >= 4,5:1 dans les deux. Tailwind expose ces jetons
(`text-accent`, `bg-panel2`, `border-line`...).

Classes de composants : `.panel`, `.panel-inset`, `.glass`, `.stat-tile`, `.scoreboard`,
`.badge(-accent|-amber|-danger|-sky)`, `.pill-v/n/d`, `.table-fm`, `.btn(-accent|-ghost)`,
`.inp`, `.kbd`, `.skeleton`, `.text-gradient`, `.pitch-lines`. Composants partages :
`TabBar` (onglets a curseur), `Charts` (barres, courbe, anneau : marques fines, info-bulle,
tableau pour lecteurs d'ecran), `RechercheGlobale`, `ClubBadge`, `Logo`.

Navigation et recherche sont separees. La **navigation** est la barre laterale (repliable en rail,
etat memorise dans un cookie ; tiroir sur mobile). La **recherche** est le champ de la barre du
haut : elle ne trouve que des fiches (joueurs et entraineurs par recherche floue cote serveur,
clubs, arbitres). **Ctrl/Cmd + K** (ou `/`) y place le curseur. `prefers-reduced-motion`
desactive les animations.

```bash
npm run lint      # ESLint 10 (config flat : regles Next core-web-vitals, hooks React, a11y JSX) sur src, tests et e2e
```

### Tests unitaires (Vitest)

```bash
npm test
```

Les tests sont dans `tests/`, qui reflete `src/` (`tests/features/<feature>/lib/x.test.ts` teste
`src/features/<feature>/lib/x.ts`) : fonctions pures (resolution de l'equipe propre, empreintes et
championnats, classement, matchs d'une equipe, calendrier, ecussons de clubs, validation des
redirections, decodage JWT...) et un garde-fou d'architecture (`tests/architecture`) qui interdit
les widgets natifs du navigateur.

### Tests de bout en bout (Playwright)

```bash
npx playwright install chromium     # une seule fois
npm run test:e2e
```

Les tests demarrent leur propre API (port 4100, base SQLite temporaire) et leur
propre front (port 3100, build dans `.next-e2e` : un `npm run dev` en cours n'est
pas perturbe) : la base de developpement n'est jamais touchee. Le
parcours d'import FMI exige Python + pdfplumber (`PYTHON_BIN=chemin/vers/python`),
il est ignore sinon. Voir `playwright.config.ts` pour les variables.

### Dependances et securite

`npm audit --omit=dev` (ce qui part en production) : **0 vulnerabilite**. `npm audit` complet signale la seule famille `braces`
(avis publie en septembre 2026, **aucune version corrigee n'existe** : la derniere, 3.0.3, est touchee), tiree par les outils de
developpement uniquement (`tailwindcss` 3 et `@next/eslint-plugin-next`, via `micromatch` / `fast-glob` / `chokidar`) : un motif
de glob imbrique a l'extreme fait deborder la pile, et ces motifs viennent de la configuration du depot, jamais d'une entree utilisateur.
Passer a Tailwind 4 ne suffirait pas (le plugin ESLint de Next garde `fast-glob`) : a reverifier a chaque mise a jour
(`npm audit`). Les autres avis ont ete corriges : `postcss-selector-parser` force a `^7.1.6` (`overrides`, CSS genere identique
octet pour octet), et cote API `argparse` force a `^2` sous `js-yaml` (voir `foot-analytics-api/package.json`).

### Diagnostic

`NEXT_PUBLIC_DEBUG=1` active les traces `console.debug` du front (`[switcher]`,
`[effectif]`, `[middleware]`...). Silencieux par defaut.

### 3. Parseur FMI standalone

Le parseur est dans le backend :

```bash
cd ../foot-analytics-api/parser
pip install -r requirements.txt

# Un fichier :
python parse_fmi.py /chemin/vers/FMI.pdf > result.json

# Un dossier complet :
python parse_fmi.py --batch /chemin/dossier_pdfs/ -o /chemin/output/
```

Sortie : un JSON par PDF contenant `numero_match`, `date`, `competition`,
`compo_recevante`, `compo_visiteuse`, `cartons`, `remplacements`,
`blessures`, `officiels`, etc.

---

## Arborescence

`src/app/` ne contient que le **routage** (App Router) : chaque `page.tsx` declare sa `metadata` et re-exporte la
page, qui vit dans sa feature. Une **feature** regroupe tout ce qui concerne un domaine : `components/` (React) et
`lib/` (logique pure, types, contextes). Ce qui sert a plusieurs features est dans `shared/`.

```
foot-analytics-web/
├── src/
│   ├── app/                      # routes : page.tsx fins, layout, error, loading, api/own-club|own-equipe
│   ├── middleware.ts             # garde d'acces + selection d'equipe (cookies)
│   ├── features/
│   │   ├── shell/                # coquille : barre laterale, barre du haut, theme, navigation
│   │   ├── auth/  comptes/       # connexion, jeton ; gestion des comptes (page admin)
│   │   ├── ia/                   # espace admin de l'IA : entrainement, courbe d'apprentissage, poids appris, modeles
│   │   ├── equipes/              # club et equipe actifs (contextes, cookies, empreintes, resolution)
│   │   ├── saisons/  clubs/  classement/
│   │   ├── joueurs/              # effectif, fiche joueur, fatigue, parcours, mutations de club
│   │   ├── matchs/  calendrier/  entrainements/  medical/
│   │   ├── tactique/  analyse/  prematch/   # composition, rapport d'equipe, rapport pre-match (avec ses predictions)
│   │   ├── rapports/             # point d'entree unique : dossier d'un club (pre-match, analyse, scouting)
│   │   ├── arbitres/  coachs/  recherche/  fmi/
│   │   ├── dashboard/            # page d'accueil
│   │   └── demo/                 # ecran Analytics de demonstration
│   └── shared/
│       ├── ui/                   # composants generiques : Select, DatePicker, Modal, Charts, Pitch...
│       ├── lib/                  # client API (api.ts), types, retour d'information (feedback), selecteurs
│       └── data/demo.ts          # donnees de demonstration (repli quand l'API est injoignable)
├── tests/                        # miroir de src/ (Vitest) + architecture/
├── e2e/                          # parcours Playwright (leur propre API et leur propre front)
└── playwright.config.ts  vitest.config.ts  tailwind.config.ts
```

Les imports internes a une feature sont relatifs ; entre features, ils passent par l'alias `@/`
(`@/shared/ui/Select`, `@/features/joueurs/lib/fatigue`).

---

## Cas d'usage typiques

### Avant un match
1. Verifier `/medical` pour confirmer l'effectif disponible (les blesses du moment, puis la fatigue de chacun)
2. Ouvrir `/rapports` : le prochain match s'y prepare en un clic, et chaque club a son dossier (Pre-match, Analyse d'equipe,
   Scouting) relie par les memes onglets
3. Composer dans `/tactique` (le dispositif de depart est celui que le logiciel a identifie pour votre equipe, le onze suggere est pre-rempli)
4. Preparer le rapport d'avant-match (depuis `/rapports`) : lecture a l'ecran, **Imprimer / PDF**, ou **Exporter en PowerPoint**
   (au format de la presentation du staff, **pages au choix** : par exemple sans la page convocation, ou le **modele
   seul**). Le fichier compte 15 pages : les 7 du modele du staff et 8 pages d'**analyse** (comparatif et projection, forme,
   pistes, systeme et indices, onze par poste, changements de numero, joueurs cles et discipline, face-a-face et arbitre),
   au meme style, pour que rien du rapport ne se perde. Les informations que le rapport ne connait pas (heure de
   convocation, surface du terrain, style de jeu, ambiance...) restent des champs **vides** a completer dans PowerPoint ;
   le dispositif attendu place le onze probable sur le terrain.

### Qui voit quoi : saison passee et pages reservees
Une seule table (`features/shell/lib/acces-pages.ts`), lue par la navigation **et** par les pages elles-memes :

| Page | Regle |
|---|---|
| Calendrier, Entrainements, Tactique, rapport pre-match (et l'ancienne page Predictions) | **fermees sur une saison anterieure a la saison en cours** : pas d'onglet, et l'adresse tapee a la main affiche « disponible sur la saison en cours » avec un bouton pour y revenir. Rien a preparer sur une saison terminee ; le reste (matchs, effectif, medical, classement, analyse d'equipe, scouting) reste consultable |
| Saisons, IA (`/admin/ia`) | **administrateur seulement** : ils sont dans le menu de gauche (section Donnees) de l'administrateur ; ni onglet, ni page pour le referent et l'educateur (de toute facon, le serveur refuse leurs ecritures) |

C'est de l'affichage : les droits sur les donnees sont appliques par l'API. L'ancienne page Scouting renvoie vers `/rapports`, l'ancienne page
Predictions aussi (`/ia?adversaire=<club>` ouvre le pre-match de ce club).

### Compo et systeme probables
Le systeme de jeu d'un adversaire vient des dispositifs saisis sur ses matchs **et** des numeros de maillot de ses feuilles
(1 gardien, 2 DD, 3 DG, 4 DCD, 5 DCG, 6 MDC, 7 AG, 8 MC, 9 BU, 10 MO, 11 AD) : un joueur qui passe du 2 au 4 dit une
defense a 4, un attaquant 9 puis 10 deux attaquants... Chaque estimation dit d'ou elle vient, sa confiance et ses indices ;
un dispositif saisi pese toujours plus que les numeros.

### Entrainer l'IA (administrateur)
Dans **Administration > IA** (`/admin/ia`) : *Lancer un entrainement* fait rejouer a l'IA toutes les feuilles de match de la base,
semaine apres semaine (elle predit chaque semaine avant de la decouvrir, note ses erreurs, se corrige). L'ecran montre la
progression, puis le resultat : precision des compos **comparee a trois methodes simples**, **courbe d'apprentissage**, poids
appris (ce qui pese dans sa decision, avec le point de depart), justesse de ses probabilites, ses pires compositions et les
joueurs difficiles a lire. *Activer ce modele* fait predire la compo probable des rapports (avec la chance de chaque joueur de
commencer) ; *Revenir au moteur a regles* l'annule. L'ecran dit si l'IA fait mieux, pareil ou moins bien que le meilleur repere.

**Reentrainement automatique** : chaque mercredi a 5 h (heure de Paris), l'IA se reentraine seule sur toutes les feuilles. Le
panneau « Reentrainement automatique » donne le prochain passage, le dernier et son verdict, et permet de le suspendre ou de le
reactiver. Le nouveau modele ne remplace le modele actif que s'il fait **au moins aussi bien** sur des semaines que l'actif n'avait pas
vues ; sinon il reste dans l'historique (badge « Non retenu », la raison au survol), et le bloc *Face au modele actif* de son
resultat montre la comparaison. Sans modele actif, aucun modele n'est active tout seul. Un lancement manuel donne le meme avis
mais n'active jamais. Quand le modele actif a appris les dispositifs (et fait au moins aussi bien que les regles), il choisit le
systeme probable des rapports et de la fiche club (« Predit par l'IA »).

### Saisir le systeme de jeu d'un match
Sur la fiche d'un match joue, « Systemes de jeu » : le staff choisit le dispositif de chaque equipe (la FMI n'en contient aucun).
On peut le **renseigner sur n'importe quel match**, y compris ceux des adversaires, tant qu'il est vide ; un dispositif deja
saisi se lit et ne se corrige que depuis un match de son club (ou par l'administrateur). Les boutons Modifier / Supprimer d'un
match n'apparaissent que si l'API les autorise (`droits`, `modifiable`) ; un refus de l'API s'affiche avec sa raison
(`ApiError.message`), jamais un « API 403 sur /matchs/... » muet.

### Apres un match
1. Le coach uploade la FMI dans `/import`
2. Le parser extrait automatiquement : compos, cartons, remplacements, blessures
3. Le match apparait dans `/matchs/<id>` avec toutes les donnees structurees
4. Les analyses (forme, discipline, IA) se rafraichissent

### Hebdomadaire
1. `/dashboard` : sante de l'equipe
2. `/fair-play` : surveiller les joueurs sous menace de suspension
3. `/medical` : qui est blesse, la fatigue de l'effectif (la fatigue se lit aussi dans `/effectif`, tri par fatigue)
4. `/calendrier` : valider le planning seances

---

## Modele de donnees (resume)

- **clubs**, **saisons**, **equipes**, **joueurs**, **effectifs**
- **matchs** + **compositions** + **evenements_match** (carton / but / remplacement / blessure)
- **arbitres**, **rapports_scouting**, **predictions_ia**
- **entrainements** + **presence_entrainement**
- **blessures**, **suivi_forme**

Vues materialisees : `v_bilan_equipe`, `v_discipline_joueur`.
RLS prevue (commentee dans le SQL — a activer selon votre modele d'auth).

---

## Roadmap suggeree

- [ ] Brancher `/api/import` cote serveur (execute le parser Python via worker)
- [ ] Notifications en direct sur les blessures/notes
- [ ] Modele ML pour predictions (xgboost sur historique FMI)
- [ ] Mode multi-equipe (U20, U18, feminines, vétérans)
- [ ] Export PDF des rapports pre/post-match
- [ ] App mobile (React Native ou PWA)

---

## Licence

Projet prive — destine au staff FC Chaponnay-Marennes. Le parseur FMI peut
etre adapte pour d'autres clubs amateurs francais sans modification.
