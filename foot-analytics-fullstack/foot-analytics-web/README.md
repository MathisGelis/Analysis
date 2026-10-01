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
| **Tactique** | Selecteur de formation + 11 type modifiable, suggestion IA |
| **Entrainements** | Planning semaine, charge par seance, presences |
| **Medical** | Indisponibles, indice fatigue, risque blessure, dispo. globale |
| **Fair-play** | KPIs cartons, motifs, par journee, joueurs a surveiller, profil estime |
| **Scouting** | Liste des rapports, rapport Neuville complet (= remplace l'Excel Chaponnay) |
| **Analytics** | xG vs G, heatmaps off/def, tendances |
| **Calendrier** | Vue mois janvier 2026, matchs + entrainements |
| **IA** | Predictions resultat, compo adverse, risque blessure, suggestions tactiques |
| **Rapports** | Modeles pre/post match + bilan periodique, liste rapports |
| **Import FMI** | Drag&drop PDF, simulation pipeline parser → base |

---

## Stack technique

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
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
npm run lint      # ESLint (next/core-web-vitals)
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
│   │   ├── equipes/              # club et equipe actifs (contextes, cookies, empreintes, resolution)
│   │   ├── saisons/  clubs/  classement/
│   │   ├── joueurs/              # effectif, fiche joueur, fatigue, parcours, mutations de club
│   │   ├── matchs/  calendrier/  entrainements/  medical/
│   │   ├── tactique/  analyse/  prematch/   # composition, rapport d'equipe, rapport pre-match, predictions
│   │   ├── arbitres/  coachs/  scouting/  recherche/  fmi/
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
1. Verifier `/medical` pour confirmer l'effectif disponible
2. Ouvrir `/club/<adv>/scouting` pour le rapport complet
3. Composer dans `/tactique` (le onze suggere est pre-rempli)
4. Generer un PDF pre-match dans `/rapports`

### Apres un match
1. Le coach uploade la FMI dans `/import`
2. Le parser extrait automatiquement : compos, cartons, remplacements, blessures
3. Le match apparait dans `/matchs/<id>` avec toutes les donnees structurees
4. Les analyses (forme, discipline, IA) se rafraichissent

### Hebdomadaire
1. `/dashboard` : sante de l'equipe
2. `/fair-play` : surveiller les joueurs sous menace de suspension
3. `/medical` : suivi des charges et risque blessure
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
