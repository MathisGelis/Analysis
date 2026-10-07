// src/features/ia/ia-maths.ts
//
// MATHS DE L'APPRENTISSAGE : de petits modeles lineaires (une quinzaine de poids au plus), ajustes exactement par la
// methode de Newton plutot que par descente de gradient : pas de taux d'apprentissage a regler, resultat deterministe,
// et quelques iterations suffisent a repartir des poids precedents. Aucune dependance, aucun alea. Fonctions pures.
//
//  - regression logistique (un joueur est-il titulaire ?) ;
//  - logit conditionnel (parmi plusieurs candidats, lequel ? : quel numero, quel dispositif) ;
//  - assignation optimale (probleme du mariage : un numero par joueur).
//
// Les deux modeles sont REGULARISES VERS UN A PRIORI (les poids de depart) et non vers zero : avec peu de donnees,
// le modele reste proche de l'heuristique qu'on lui donne ; avec beaucoup, les donnees l'emportent.

export const sigmoide = (z: number): number => (z >= 0 ? 1 / (1 + Math.exp(-z)) : Math.exp(z) / (1 + Math.exp(z)));

const produit = (a: readonly number[], b: readonly number[]): number => {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
};

/** Resout A x = b (A carree, definie positive grace a la regularisation) par elimination de Gauss avec pivot. */
export function resoudre(a: number[][], b: number[]): number[] {
  const n = b.length;
  const m = a.map((ligne, i) => [...ligne, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (Math.abs(m[p][c]) < 1e-12) throw new Error("Systeme lineaire singulier");
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = c + 1; r < n; r++) {
      const f = m[r][c] / m[c][c];
      if (f === 0) continue;
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k];
    x[r] = s / m[r][r];
  }
  return x;
}

const softplus = (z: number): number => (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)));

/** Penalite d'ecart a l'a priori : l2/2 * ||w - prior||^2. */
const penalite = (w: readonly number[], prior: readonly number[], l2: number): number => {
  let s = 0;
  for (let i = 0; i < w.length; i++) s += (w[i] - prior[i]) ** 2;
  return (l2 / 2) * s;
};

/**
 * Pas de Newton amorti : la methode de Newton seule peut sauter tres loin (sur peu de donnees tres separables, la
 * courbure est presque nulle loin de l'optimum). On reduit le pas de moitie tant que la perte ne baisse pas.
 */
function avancer(w: number[], delta: number[], objectif: (w: number[]) => number): number[] | null {
  // Deja au minimum (pas de Newton minuscule) : rien a faire, et pas de recherche lineaire inutile.
  if (Math.max(...delta.map(Math.abs)) < 1e-5) return null;
  const avant = objectif(w);
  const tolerance = 1e-10 * (1 + Math.abs(avant));
  let t = 1;
  for (let k = 0; k < 12; k++, t /= 2) {
    const essai = w.map((wi, j) => wi - t * delta[j]);
    if (objectif(essai) <= avant + tolerance) return essai;
  }
  return null;
}

/** Un exemple de la regression logistique : caracteristiques, resultat (0 ou 1), poids de l'exemple. */
export interface ExempleBinaire { x: number[]; y: 0 | 1; s: number }

/** Un exemple du logit conditionnel : les caracteristiques de chaque candidat, et l'indice du bon. */
export interface ExempleChoix { phi: number[][]; vrai: number; s: number }

export interface OptionsNewton {
  /** Force de la regularisation vers l'a priori. */
  l2: number;
  iterations?: number;
}

/**
 * Regression logistique regularisee vers `prior`, ajustee depuis `depart` : minimise
 * somme s_i * perte(i) + l2/2 * ||w - prior||^2. Renvoie les poids (ceux de depart sans exemple).
 */
export function ajusterLogistique(exemples: ExempleBinaire[], depart: number[], prior: number[], opt: OptionsNewton): number[] {
  if (exemples.length === 0) return [...depart];
  const d = depart.length;
  let w = [...depart];
  const objectif = (v: number[]) => {
    let f = penalite(v, prior, opt.l2);
    for (const e of exemples) {
      const z = produit(v, e.x);
      f += e.s * (softplus(z) - e.y * z);
    }
    return f;
  };
  for (let it = 0; it < (opt.iterations ?? 8); it++) {
    const g = w.map((wi, j) => opt.l2 * (wi - prior[j]));
    const h = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? opt.l2 : 0)));
    for (const e of exemples) {
      const p = sigmoide(produit(w, e.x));
      const v = e.s * p * (1 - p);
      for (let i = 0; i < d; i++) {
        g[i] += e.s * (p - e.y) * e.x[i];
        if (e.x[i] === 0) continue;
        const vi = v * e.x[i];
        for (let j = i; j < d; j++) h[i][j] += vi * e.x[j];
      }
    }
    for (let i = 0; i < d; i++) for (let j = 0; j < i; j++) h[i][j] = h[j][i];
    const delta = resoudre(h, g);
    const suivant = avancer(w, delta, objectif);
    if (!suivant) break;
    const bouge = Math.max(...suivant.map((v, j) => Math.abs(v - w[j])));
    w = suivant;
    if (bouge < 1e-4) break;
  }
  return w;
}

/** Probabilites (somme 1) de chaque candidat : softmax des scores w . phi. */
export function probabilitesChoix(w: readonly number[], phi: readonly (readonly number[])[]): number[] {
  const z = phi.map((f) => produit(w, f));
  const max = Math.max(...z);
  const e = z.map((v) => Math.exp(v - max));
  const total = e.reduce((s, v) => s + v, 0);
  return e.map((v) => v / total);
}

/** Logit conditionnel regularise vers `prior` : un seul jeu de poids pour tous les candidats. */
export function ajusterChoix(exemples: ExempleChoix[], depart: number[], prior: number[], opt: OptionsNewton): number[] {
  if (exemples.length === 0) return [...depart];
  const d = depart.length;
  let w = [...depart];
  // Tampons reutilises : cet ajustement tourne sur des dizaines de milliers d'exemples a chaque etape de l'entrainement.
  const kMax = exemples.reduce((m, e) => Math.max(m, e.phi.length), 0);
  const z = new Float64Array(kMax);
  const mu = new Float64Array(d);

  const objectif = (v: number[]) => {
    let f = penalite(v, prior, opt.l2);
    for (const e of exemples) {
      const K = e.phi.length;
      let max = -Infinity;
      for (let k = 0; k < K; k++) {
        const x = e.phi[k];
        let s = 0;
        for (let i = 0; i < d; i++) s += v[i] * x[i];
        z[k] = s;
        if (s > max) max = s;
      }
      let somme = 0;
      for (let k = 0; k < K; k++) somme += Math.exp(z[k] - max);
      f += e.s * (max + Math.log(somme) - z[e.vrai]);
    }
    return f;
  };

  for (let it = 0; it < (opt.iterations ?? 8); it++) {
    const g = w.map((wi, j) => opt.l2 * (wi - prior[j]));
    const h = Array.from({ length: d }, (_, i) => Array.from({ length: d }, (_, j) => (i === j ? opt.l2 : 0)));
    for (const e of exemples) {
      const K = e.phi.length;
      let max = -Infinity;
      for (let k = 0; k < K; k++) {
        const x = e.phi[k];
        let s = 0;
        for (let i = 0; i < d; i++) s += w[i] * x[i];
        z[k] = s;
        if (s > max) max = s;
      }
      let somme = 0;
      for (let k = 0; k < K; k++) { z[k] = Math.exp(z[k] - max); somme += z[k]; }
      mu.fill(0);
      for (let k = 0; k < K; k++) {
        const pk = z[k] / somme;
        z[k] = pk;
        const x = e.phi[k];
        for (let i = 0; i < d; i++) mu[i] += pk * x[i];
      }
      const vrai = e.phi[e.vrai];
      for (let i = 0; i < d; i++) g[i] += e.s * (mu[i] - vrai[i]);
      for (let k = 0; k < K; k++) {
        const pk = e.s * z[k];
        const x = e.phi[k];
        for (let i = 0; i < d; i++) {
          if (x[i] === 0) continue;
          const pi = pk * x[i];
          for (let j = i; j < d; j++) h[i][j] += pi * x[j];
        }
      }
      for (let i = 0; i < d; i++) for (let j = i; j < d; j++) h[i][j] -= e.s * mu[i] * mu[j];
    }
    for (let i = 0; i < d; i++) for (let j = 0; j < i; j++) h[i][j] = h[j][i];
    const delta = resoudre(h, g);
    const suivant = avancer(w, delta, objectif);
    if (!suivant) break;
    const bouge = Math.max(...suivant.map((v, j) => Math.abs(v - w[j])));
    w = suivant;
    if (bouge < 1e-4) break;
  }
  return w;
}

/**
 * Assignation de cout minimal (algorithme hongrois) : chaque ligne (joueur) recoit une colonne (numero) distincte.
 * Requiert autant de colonnes que de lignes au moins. Renvoie, pour chaque ligne, la colonne choisie.
 */
export function assigner(couts: number[][]): number[] {
  const n = couts.length;
  if (n === 0) return [];
  const m = couts[0].length;
  if (m < n) throw new Error("Assignation impossible : moins de colonnes que de lignes");
  const u = new Array<number>(n + 1).fill(0);
  const v = new Array<number>(m + 1).fill(0);
  const p = new Array<number>(m + 1).fill(0);
  const chemin = new Array<number>(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array<number>(m + 1).fill(Infinity);
    const utilise = new Array<boolean>(m + 1).fill(false);
    do {
      utilise[j0] = true;
      const i0 = p[j0];
      let delta = Infinity;
      let j1 = 0;
      for (let j = 1; j <= m; j++) {
        if (utilise[j]) continue;
        const cur = couts[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) { minv[j] = cur; chemin[j] = j0; }
        if (minv[j] < delta) { delta = minv[j]; j1 = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (utilise[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = chemin[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const resultat = new Array<number>(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j] !== 0) resultat[p[j] - 1] = j - 1;
  return resultat;
}
