# Foot Analytics — sécurité et RGPD (volet technique)

Ce document suit la liste « Tâches techniques RGPD (dev uniquement) » : ce que fait le code, comment c'est vérifié, et
ce qui reste à faire par l'exploitant (réglages d'hébergement, secrets, textes légaux).

## 1. Dépôt Git et secrets

| Point | État |
|---|---|
| `Data/`, feuilles de match réelles, fixture issue d'une vraie feuille, bases SQLite | retirés du suivi, ignorés (`.gitignore`) |
| Fixtures de test | feuille **anonymisée** (`parser/outils/anonymiser_fmi.py`), données de démo fictives |
| Historique | purgé (`git filter-repo`) puis force-push de toutes les branches |
| Garde-fou | `scripts/verifier-depot.sh` (CI + hook `pre-commit` : `git config core.hooksPath .githooks`), gitleaks en CI |
| `npm audit` | en CI (API et front, niveau `moderate`) |

**À faire (exploitant)** : régénérer **tous** les secrets ayant pu exister dans l'historique ou les journaux —
`JWT_SECRET` (Render), mot de passe de la base Supabase (puis `DATABASE_URL`), mots de passe des comptes présents dans les
anciennes bases SQLite (réinitialisation par l'administrateur, qui génère un mot de passe temporaire aléatoire). Chaque
clone existant du dépôt doit être supprimé et recloné (les anciens commits y sont encore).

## 2. Authentification et sessions

- Plus de mot de passe commun : mot de passe **temporaire aléatoire à usage unique** à la création et à la
  réinitialisation, montré une fois au gestionnaire (transmission hors bande) ; il ne sert qu'à choisir un nouveau mot de
  passe (`403 MOT_DE_PASSE_A_CHANGER` partout ailleurs). L'ancien mot de passe commun est refusé à la connexion.
  Compte admin d'une base vide : `ADMIN_INITIAL_PASSWORD`, sinon tiré au hasard et affiché une fois.
- Jetons dans des cookies **HttpOnly / Secure / SameSite=Lax** posés par le **serveur Next** (BFF) : l'API est sur un
  autre site (Render) et un cookie posé par elle serait un cookie tiers, bloqué par les navigateurs. Plus rien dans le
  `localStorage` (les anciennes clés sont effacées au chargement).
- Jeton d'accès 15 min + jeton de rafraîchissement opaque (30 jours glissants), **rotation** à chaque usage, empreintes
  seulement en base (table `sessions`), **rejeu détecté** (toute la famille révoquée).
- **Révocation** : version de jeton par compte (déconnexion de tous les appareils, mot de passe changé, compte désactivé).
- **Limites de débit** (`@nestjs/throttler`) : par compte, par IP et par login sur `/auth/login` ; **verrouillage** 15 min
  après 5 échecs. L'IP réelle est transmise par le BFF avec un secret partagé (`BFF_SECRET`).
- **Politique de mot de passe** : 12 caractères min., pas de mot de passe courant (liste + variantes décorées), ni login,
  prénom ou nom.
- **Comptes inactifs** : éducateurs et référents désactivés après 12 mois sans connexion (entretien quotidien),
  réactivables par un gestionnaire ; les administrateurs ne le sont jamais automatiquement.

## 3. Sécurité de l'API et de l'infrastructure

- `helmet` sur l'API ; front : **CSP par nonce** (aucune ressource externe, `frame-ancestors 'none'`), `nosniff`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`, HSTS, `noindex`.
- CORS : plus de `localhost` en production ; le navigateur ne parle qu'au BFF (même origine).
- Postgres : `DB_SSL=verify` + `DB_SSL_CA` pour vérifier le certificat (voir le README de l'API).
- Compte de service à droits minimaux : `foot-analytics-api/sql/role-application.sql` (rôle `foot_app` : lecture et
  écriture des lignes seulement, journal d'audit en ajout seul ; migrations lancées avec le rôle propriétaire).
- RLS activée sur **toutes** les tables, `anon` / `authenticated` sans privilège (vérifié par `migrations.pg.spec.ts`).
- `vercel.json` : région `fra1`. Render : Francfort. Supabase : Irlande.

**À faire (exploitant)** : sur Supabase, désactiver la *Data API*, restreindre l'accès réseau à la base (*Network
Restrictions*) aux adresses de Render si l'offre le permet, vérifier le chiffrement au repos et les **sauvegardes**
(offre avec sauvegardes quotidiennes, restauration testée). Renseigner `BFF_SECRET` (même valeur sur Vercel et Render),
`API_URL` sur Vercel, `TRUST_PROXY=1` sur Render.

## 4. Journaux et audit

- Journaux du serveur sans nom, prénom ni licence (test de non-régression qui capture tous les niveaux de journal).
- **Journal d'audit** en base (`journal_audit`, ajout seul) : connexions et échecs, gestion des comptes, lectures et
  écritures médicales, exports, fiches de joueurs d'autres clubs, imports de feuilles. Lecture réservée à
  l'administrateur (page *Administration > Journal*), purge après 12 mois (fonction `SECURITY DEFINER`).
- **Alertes** : consultations massives de fiches d'autres clubs, recherches avancées en série, exports en série, échecs
  de connexion en rafale ; trace
  dans le journal, message dans les journaux du serveur, et webhook optionnel (`ALERTE_WEBHOOK_URL`).

## 5–6. Données médicales et visibilité entre clubs

- Une blessure appartient au **club qui l'a saisie** : jamais lue par un autre club (`404`), ne suit pas le joueur qui
  change de club, n'entre dans aucune statistique, analyse, recherche, export ni modèle d'IA d'un autre club.
- Matrice de visibilité définie à un seul endroit (`features/acces/visibilite.ts`), appliquée par les contrôleurs et par
  un **intercepteur global** sur toutes les réponses : licence, date de naissance, morphologie, santé, fatigue, présences
  et commentaires ne sortent jamais pour un autre club.
- Aucune donnée personnelle dans les URL (recherches en `POST`), `noindex`, liste des joueurs un club à la fois,
  recherche par licence limitée à son club, limite de requêtes par compte, détection des parcours massifs.
- **Recherche avancée** (`/recherche`) : critères et résultats limités aux données de championnat (poste, matchs joués,
  équipes) — aucune donnée privée n'est un critère, puisque filtrer dessus la révélerait ; 100 joueurs au plus par
  recherche, saisons fermées au compte refusées, chaque recherche tracée (critères et nombre de résultats, sans nom) et
  alerte au-delà de 40 en 10 minutes. Aucun service d'IA externe : rien ne quitte l'hébergement.
- Conditions d'utilisation versionnées, acceptées à la première connexion (et à chaque nouvelle version).
- `isolation-clubs.http.spec.ts` : toutes les routes de lecture, pour chaque rôle des deux clubs, plus l'export PowerPoint.

## 7–8. Minimisation et pipeline FMI

- Colonnes supprimées : `matchs.pdfUrl`, `blessures.joueurNom`, `blessures.risqueRecidive` ; la localisation d'une
  blessure lue sur une feuille de match n'est plus conservée.
- Import : PDF en mémoire puis dossier temporaire supprimé ; provenance sur chaque match (date, compte importateur) ;
  trace `fmi.import` sans donnée personnelle ; diagnostic brut d'une feuille réservé à l'administrateur.

## 10. Pages et mentions

- Pages publiques `/confidentialite`, `/mentions-legales`, `/cgu`, liées depuis l'écran de connexion et le pied de page
  de l'application. **À compléter par l'exploitant** : responsable du traitement, contact, base légale des données de
  santé, durées de conservation des données des joueurs, garanties de transfert des hébergeurs (passages surlignés).
- Mention « aide à la décision, non contraignante » sur le onze et le système probables, la projection et la fatigue.
- Aucun cookie non essentiel, aucune mesure d'audience ni pixel.

## 12. Tests et CI

Jest (SQLite et Postgres), Vitest, pytest du parseur, Playwright (SQLite et Postgres), garde-fous (fichiers de données,
gitleaks, `npm audit`), lint. Tests dédiés : isolation entre clubs, données médicales absentes ailleurs que sur
`/blessures`, journaux sans données personnelles, sessions (rotation, rejeu, révocation, verrouillage), journal d'audit.
