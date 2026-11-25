// src/features/classement/classement-predit.ts
//
// CLASSEMENT FINAL PREDIT d'un championnat : on joue la fin de saison des milliers de fois et on compte.
//
// - Les matchs deja joues sont IMMUABLES : leurs points et leurs buts sont acquis.
// - Chaque equipe en rencontre chaque autre DEUX fois (une a domicile, une a l'exterieur) : tout couple (recevant, visiteur)
//   sans match joue est donc un match restant, qu'il soit deja programme ou non.
// - Les buts de chaque match restant suivent deux lois de Poisson independantes, dont les buts attendus viennent du modele
//   de score (IA si elle a battu Poisson a l'entrainement, sinon le modele de depart lisse), fournis par l'appelant.
// - Departage dans la simulation : points, difference de buts, buts marques (puis l'ordre des identifiants). Le departage FFF
//   complet (confrontations directes...) s'applique au classement reel, pas a la simulation, pour qu'elle reste rapide.
//
// Fonction pure, deterministe (graine fixe) : les memes donnees redonnent le meme resultat.

export interface EquipeDuChampionnat { id: string; clubId: string; nom: string }

export interface MatchJoue { dom: string; ext: string; butsDom: number; butsExt: number }

/** Buts attendus du recevant et du visiteur d'un match restant. */
export type ButsAttendus = (dom: string, ext: string) => { dom: number; ext: number };

export interface LignePredite {
  equipeId: string;
  clubId: string;
  nom: string;
  /** Ce qui est deja acquis. */
  actuel: { rang: number; joues: number; pts: number; diff: number };
  restants: number;
  /** Points finaux : moyenne, et fourchette (10e et 90e centiles) sur les simulations. */
  ptsAttendus: number;
  ptsBas: number;
  ptsHaut: number;
  /** Rang final moyen, et rang le plus frequent. */
  rangAttendu: number;
  rangProbable: number;
  /** Part des simulations ou l'equipe finit a chaque rang (index 0 = 1er), 0 a 1. */
  rangs: number[];
}

export interface ClassementPredit {
  /** Du premier au dernier du classement final predit. */
  equipes: LignePredite[];
  simulations: number;
  matchsJoues: number;
  matchsRestants: number;
}

const BUTS_MAX = 12;

/** Generateur pseudo-aleatoire congruentiel (Park-Miller) : meme graine, memes tirages. */
function alea(graine: number): () => number {
  let s = Math.abs(Math.floor(graine)) % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function tirerButs(lambda: number, hasard: () => number): number {
  const limite = Math.exp(-Math.min(lambda, 8));
  let k = 0;
  for (let p = hasard(); p > limite && k < BUTS_MAX; p *= hasard()) k++;
  return k;
}

const arrondi = (x: number, d: number) => +x.toFixed(d);

/** Les couples (recevant, visiteur) qui n'ont pas encore ete joues. */
export function matchsRestants(equipes: readonly EquipeDuChampionnat[], joues: readonly MatchJoue[]): { dom: string; ext: string }[] {
  const faits = new Set(joues.map((m) => `${m.dom}>${m.ext}`));
  const restants: { dom: string; ext: string }[] = [];
  for (const a of equipes) for (const b of equipes) if (a.id !== b.id && !faits.has(`${a.id}>${b.id}`)) restants.push({ dom: a.id, ext: b.id });
  return restants;
}

export function predireClassement(
  equipes: readonly EquipeDuChampionnat[], joues: readonly MatchJoue[], attendus: ButsAttendus, simulations = 4000, graine = 20260101,
): ClassementPredit | null {
  const n = equipes.length;
  if (n < 3) return null;
  const index = new Map(equipes.map((e, i) => [e.id, i]));
  const jouesValides = joues.filter((m) => index.has(m.dom) && index.has(m.ext) && m.dom !== m.ext);

  // Ce qui est acquis.
  const pts0 = new Array<number>(n).fill(0);
  const bp0 = new Array<number>(n).fill(0);
  const bc0 = new Array<number>(n).fill(0);
  const joues0 = new Array<number>(n).fill(0);
  for (const m of jouesValides) {
    const d = index.get(m.dom)!, e = index.get(m.ext)!;
    joues0[d]++; joues0[e]++;
    bp0[d] += m.butsDom; bc0[d] += m.butsExt; bp0[e] += m.butsExt; bc0[e] += m.butsDom;
    if (m.butsDom > m.butsExt) pts0[d] += 3; else if (m.butsDom < m.butsExt) pts0[e] += 3; else { pts0[d]++; pts0[e]++; }
  }

  const restants = matchsRestants(equipes, jouesValides).map((m) => ({ d: index.get(m.dom)!, e: index.get(m.ext)!, ...attendus(m.dom, m.ext) }));
  const restantsParEquipe = new Array<number>(n).fill(0);
  for (const m of restants) { restantsParEquipe[m.d]++; restantsParEquipe[m.e]++; }

  const hasard = alea(graine + n * 7919 + jouesValides.length);
  const rangs = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const pointsFinaux = Array.from({ length: n }, () => new Array<number>(simulations));
  const sommeRang = new Array<number>(n).fill(0);
  const ordre = Array.from({ length: n }, (_, i) => i);
  const pts = new Array<number>(n);
  const bp = new Array<number>(n);
  const bc = new Array<number>(n);

  for (let s = 0; s < simulations; s++) {
    for (let i = 0; i < n; i++) { pts[i] = pts0[i]; bp[i] = bp0[i]; bc[i] = bc0[i]; }
    for (const m of restants) {
      const gd = tirerButs(m.dom, hasard), ge = tirerButs(m.ext, hasard);
      bp[m.d] += gd; bc[m.d] += ge; bp[m.e] += ge; bc[m.e] += gd;
      if (gd > ge) pts[m.d] += 3; else if (gd < ge) pts[m.e] += 3; else { pts[m.d]++; pts[m.e]++; }
    }
    ordre.sort((a, b) => pts[b] - pts[a] || (bp[b] - bc[b]) - (bp[a] - bc[a]) || bp[b] - bp[a] || equipes[a].id.localeCompare(equipes[b].id));
    for (let r = 0; r < n; r++) { rangs[ordre[r]][r]++; sommeRang[ordre[r]] += r + 1; }
    for (let i = 0; i < n; i++) pointsFinaux[i][s] = pts[i];
  }

  // Le classement actuel (memes departages que la simulation, sur ce qui est acquis).
  const actuel = [...ordre.keys()].sort((a, b) => pts0[b] - pts0[a] || (bp0[b] - bc0[b]) - (bp0[a] - bc0[a]) || bp0[b] - bp0[a] || equipes[a].id.localeCompare(equipes[b].id));
  const rangActuel = new Map(actuel.map((i, r) => [i, r + 1]));

  const lignes: LignePredite[] = equipes.map((e, i) => {
    const triés = [...pointsFinaux[i]].sort((a, b) => a - b);
    const part = rangs[i].map((c) => c / simulations);
    return {
      equipeId: e.id, clubId: e.clubId, nom: e.nom,
      actuel: { rang: rangActuel.get(i)!, joues: joues0[i], pts: pts0[i], diff: bp0[i] - bc0[i] },
      restants: restantsParEquipe[i],
      ptsAttendus: arrondi(triés.reduce((a, b) => a + b, 0) / simulations, 1),
      ptsBas: triés[Math.floor(simulations * 0.1)], ptsHaut: triés[Math.min(simulations - 1, Math.floor(simulations * 0.9))],
      rangAttendu: arrondi(sommeRang[i] / simulations, 2),
      rangProbable: part.indexOf(Math.max(...part)) + 1,
      rangs: part.map((p) => arrondi(p, 4)),
    };
  });
  lignes.sort((a, b) => a.rangAttendu - b.rangAttendu || b.ptsAttendus - a.ptsAttendus || a.equipeId.localeCompare(b.equipeId));
  return { equipes: lignes, simulations, matchsJoues: jouesValides.length, matchsRestants: restants.length };
}
