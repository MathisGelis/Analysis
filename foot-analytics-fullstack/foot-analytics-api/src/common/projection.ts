// src/common/projection.ts
//
// PROJECTION de resultat d'un match a venir : modele de Poisson, volontairement simple et lisible. Les buts
// attendus de chaque equipe croisent ce qu'elle marque et ce que l'autre encaisse (moyennes par match de la
// saison) ; le terrain joue un peu. Ce n'est qu'une estimation sur des moyennes : elle n'est donnee qu'avec assez
// de matchs joues de chaque cote, et dit sur quoi elle repose.
//
// Fonction pure.

export interface EquipeProjection { matchs: number; bpm: number; bcm: number }

export interface Projection {
  /** Probabilites en %, entieres, de somme 100 (victoire, nul, defaite de MON equipe). */
  pV: number; pN: number; pD: number;
  /** Buts attendus de chaque equipe (une decimale). */
  buts: { moi: number; adv: number };
  /** Score exact le plus probable et sa probabilite en %. */
  scoreProbable: { moi: number; adv: number; proba: number };
  /** Matchs joues de l'equipe qui en a le moins : la taille de l'echantillon. */
  matchs: number;
}

/** Avantage du terrain : les buts attendus de l'equipe qui recoit sont majores, ceux du visiteur minores. */
const AVANTAGE_DOMICILE = 0.12;
const BUTS_MAX = 10;

function poisson(lambda: number): number[] {
  const p = [Math.exp(-lambda)];
  for (let k = 1; k <= BUTS_MAX; k++) p.push((p[k - 1] * lambda) / k);
  return p;
}

/** Arrondit en entiers de somme 100 (methode du plus grand reste). */
function arrondirA100(valeurs: number[]): number[] {
  const somme = valeurs.reduce((s, v) => s + v, 0) || 1;
  const brut = valeurs.map((v) => (v / somme) * 100);
  const res = brut.map(Math.floor);
  let reste = 100 - res.reduce((s, v) => s + v, 0);
  [...brut.keys()].sort((a, b) => (brut[b] - res[b]) - (brut[a] - res[a])).forEach((i) => { if (reste-- > 0) res[i]++; });
  return res;
}

export function projectionResultat(
  e: { moi: EquipeProjection; adv: EquipeProjection; domicileMoi: boolean | null }, matchsMin = 5,
): Projection | null {
  const matchs = Math.min(e.moi.matchs, e.adv.matchs);
  if (matchs < matchsMin) return null;

  const facteur = e.domicileMoi === null ? 0 : e.domicileMoi ? AVANTAGE_DOMICILE : -AVANTAGE_DOMICILE;
  const lMoi = Math.max(0.05, ((e.moi.bpm + e.adv.bcm) / 2) * (1 + facteur));
  const lAdv = Math.max(0.05, ((e.adv.bpm + e.moi.bcm) / 2) * (1 - facteur));
  const pMoi = poisson(lMoi);
  const pAdv = poisson(lAdv);

  let v = 0, n = 0, d = 0;
  let meilleur = { moi: 0, adv: 0, p: -1 };
  for (let i = 0; i <= BUTS_MAX; i++) {
    for (let j = 0; j <= BUTS_MAX; j++) {
      const p = pMoi[i] * pAdv[j];
      if (i > j) v += p; else if (i === j) n += p; else d += p;
      if (p > meilleur.p) meilleur = { moi: i, adv: j, p };
    }
  }
  const total = v + n + d;
  const [pV, pN, pD] = arrondirA100([v, n, d]);
  return {
    pV, pN, pD,
    buts: { moi: +lMoi.toFixed(1), adv: +lAdv.toFixed(1) },
    scoreProbable: { moi: meilleur.moi, adv: meilleur.adv, proba: Math.round((meilleur.p / total) * 100) },
    matchs,
  };
}
