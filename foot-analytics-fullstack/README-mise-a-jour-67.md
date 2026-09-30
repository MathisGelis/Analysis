# Mise a jour 67 — Medical & charge saison-sensitive

## Cause

La page `/medical` filtrait deja par equipe (maj 63) mais les stats
affichees etaient les valeurs **globales** stockees sur chaque joueur :
`chargeAcute7j`, `chargeChronic28j`, `scoreFatigue`, `minutes`,
`cartonsJaunes`, etc. Ces valeurs sont des snapshots temps-reel
mis a jour a chaque import FMI.

Sur une saison 26-27 (nouvelle, sans FMI, effectif constitue par
attachement manuel), les joueurs conservent leurs stats de leur
carriere passee — la page medical montrait donc des charges et des
fatigue non-nulles alors qu'aucun match n'a ete joue sur cette
saison. Idem pour les blessures : elles s'affichaient toutes,
independamment de leur date.

## Fix

Nouvelle logique en 3 axes :

### 1. Saison courante determinee par priorite

```ts
const saisonCourante = (OWN_SAISON_ID
    ? saisons.find((s: any) => s.id === OWN_SAISON_ID)
    : null)
    ?? (equipe?.saisonId ? saisons.find((s: any) => s.id === equipe.saisonId) : null)
    ?? saisons.find((s: any) => s.actif)
    ?? saisons[0]
    ?? null;
```

Priorite : cookie `ownSaisonId` > saison de l'equipe propre > saison
active > 1ere disponible.

### 2. Stats de charge : zero hors saison active

Les mesures ACWR (Acute/Chronic Workload Ratio) sont par nature
**temporelles** : elles n'ont de sens que pour la saison en cours.
Consulter la charge d'un joueur sur une saison future ou passee n'a
aucun sens.

```ts
const estSaisonActive = saisonCourante?.actif === true;
const effectifPourStats = effectif.map((j: any) => estSaisonActive ? j : ({
  ...j,
  chargeAcute7j: 0, chargeChronic28j: 0,
  scoreFatigue: 0, scoreForme: 0,
  minutes: 0, matchs: 0,
  cartonsJaunes: 0, cartonsRouges: 0,
}));
```

Sur saison inactive : tout est reset a 0.

### 3. Blessures filtrees par fenetre saisonniere

```ts
const debutSaison = new Date(`${anneeDebut}-08-01`);
const finSaison = new Date(`${anneeDebut + 1}-07-31`);
blessuresEquipe = blessuresApi
  .filter(b => effectifIds.has(b.joueurId))
  .filter(b => {
    if (!b.dateDebut) return estSaisonActive;
    const d = new Date(b.dateDebut);
    return d >= debutSaison && d <= finSaison;
  });
```

Seules les blessures declarees dans la periode aout N -> juillet N+1
sont affichees. Sur une saison future : aucune blessure (bien !).

## Nouveaux etats affiches

### Header : badge saison

```
[icon] Saison 2025-2026
[icon] Saison 2026-2027 · stats non pertinentes (saison inactive)
```

### Etat "saison non active" (nouveau)

Si l'utilisateur regarde une saison qui n'est pas active :

```
[icon] Charge et fatigue : indisponibles hors saison active.
Les mesures de charge (ACWR 7j/28j, fatigue) sont des snapshots temps
reel qui ne s'appliquent qu'a la saison active en cours. Bascule sur
la saison active dans le switcher pour voir les stats a jour.
```

Aucun KPI, aucun tableau de fatigue affiche. Clair et propre.

## Fichier

| Fichier | Etat |
|---|---|
| `foot-analytics-web/src/app/medical/page.tsx` | refonte saison-sensitive |

## Pas de modif backend. Pas de reseed.

## Verification

### Sur saison active (25-26)
1. Bascule sur 25-26 via le switcher
2. `/medical` :
   - Badge saison "2025-2026"
   - KPIs avec vraies valeurs
   - Tableau fatigue rempli
   - Blessures de la saison

### Sur saison 26-27 pas active
1. Bascule sur 26-27
2. `/medical` :
   - Badge "2026-2027 · stats non pertinentes"
   - Placeholder "Charge et fatigue : indisponibles hors saison active"
   - Aucun KPI, aucun tableau

### Sur saison 26-27 mais si tu la rends active
1. `PATCH /saisons/<id-26-27>/activer` (via API)
2. `/medical` sur 26-27 :
   - Badge "2026-2027" (sans le warning)
   - Effectif : les joueurs attaches manuellement
   - KPIs a 0 (pas encore de FMI)
   - Tableau fatigue vide
   - Placeholder "Aucune donnee" possible
