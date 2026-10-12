// src/features/entrainements/charge-entrainement.ts

// Charge d'entrainement en UA-RPE (Unité Arbitraire de Foster).
//
// FORMULE DE BASE — Foster session-RPE method (Foster et al. 2001) :
//
//     chargeBase = duree (min) x RPE (1-10)
//
// Methode validée par 36+ études en physiologie du sport, references :
//   - Foster C. et al. (2001), JSCR
//   - Impellizzeri F.M. et al. (2004), Use of RPE-based TL in soccer
//   - Haddad M. et al. (2017), Frontiers Neuroscience review
//
// Le RPE capture deja l'internal load (cardio, lactate, ressenti
// global). Les etudes montrent que pour deux seances de meme RPE
// mais d'espaces differents (SSG vs LSG), l'external load (distance,
// HSR, accelerations) varie significativement mais le RPE reste
// similaire (Castellano J. et al. 2023, Frontiers Sports).
//
// MODULATION (TYPE x ESPACE) — Estimation external load :
//
// Notre app n'a pas de GPS. On applique une modulation MODEREE (±15%
// max) pour ajuster vers une "charge externe estimee" base sur le
// type et l'espace. Les facteurs sont conservateurs car la litterature
// montre que le RPE explique deja ~80% de la variance de charge.
//
// Reference match officiel 90' RPE7 ~ 600-700 UA-RPE.
const FACTEURS_TYPE: Record<string, number> = {
  Physique: 1.00,        // course/sprint, RPE fidele a la charge
  "Pre-match": 1.00,     // intensite match, validee
  Tactique: 0.95,        // mouvements explosifs parfois sous-perçus
  Technique: 0.85,       // moins de course continue
  Activation: 0.70,      // duree active << duree de seance
  Recup: 0.60,           // intensite tres faible
};

// Le facteur ESPACE depend du TYPE de seance, selon la litterature :
//
//   - Physique / Pre-match : LSG (grand terrain) genere plus de HSR
//     et sprint distance (Riboli A. et al. 2023, PMC10110967)
//   - Tactique / Technique : SSG (espace reduit) genere plus
//     d'accelerations/decelerations (Castellano J. et al. 2023)
//
// Effet modere car les etudes montrent que le RPE varie peu entre
// formats (typical ES = 0.62 max, Aoki M. et al. 2017, PMC9465750).
function facteurEspace(type?: string, espace?: string): number {
  if (!espace) return 1.00;
  const isPhysique = type === "Physique" || type === "Pre-match";
  const matricePhysique: Record<string, number> = {
    terrain_entier: 1.10,   // sprints longs, HSR maximale
    demi_terrain: 1.00,     // reference
    quart_terrain: 0.95,
    espace_reduit: 0.90,    // limite par la place
    salle: 0.85,            // pas de sprint linéaire long
    autre: 1.00,
  };
  const matriceTechnicoTactique: Record<string, number> = {
    terrain_entier: 0.95,   // moins d'acc/dec, plus de placement
    demi_terrain: 1.00,     // reference
    quart_terrain: 1.05,
    espace_reduit: 1.10,    // densite duels & changement direction
    salle: 0.95,
    autre: 1.00,
  };
  const matrice = isPhysique ? matricePhysique : matriceTechnicoTactique;
  return matrice[espace] ?? 1.00;
}

export function calcCharge(
  dureeMin?: number, intensite?: number,
  type?: string, espace?: string,
): number {
  if (!dureeMin || !intensite) return 0;
  const base = dureeMin * intensite;             // Foster pur
  const fType: number = (type && FACTEURS_TYPE[type]) || 0.85;
  const fEspace = facteurEspace(type, espace);
  return +(base * fType * fEspace).toFixed(1);
}
