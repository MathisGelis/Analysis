// src/features/analyse-jeu/croisements.ts
//
// Relier le jeu saisi aux mesures deja calculees par le rapport d'equipe : danger, impact des joueurs, rotation et charge, dispositif.
// Principe : on montre des correlations et des ecarts avec leur effectif (n), jamais une cause. Sous 5 matchs saisis, on le dit et on
// ne calcule rien. Fonctions pures.

import { Famille, JeuEquipe, JoueurJeu } from "./jeu-equipe";

export const MIN_MATCHS_CORRELATION = 5;

const moyenne = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const arrondi = (x: number, d = 2) => Math.round(x * 10 ** d) / 10 ** d;

/** Coefficient de correlation de Pearson ; null si moins de 3 points ou si une des series est constante. */
export function pearson(x: number[], y: number[]): number | null {
  const n = Math.min(x.length, y.length);
  if (n < 3) return null;
  const mx = moyenne(x.slice(0, n)), my = moyenne(y.slice(0, n));
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  if (sxx === 0 || syy === 0) return null;
  return sxy / Math.sqrt(sxx * syy);
}

export type Force = "forte" | "moyenne" | "faible" | "nulle";
export const forceDe = (r: number): Force => { const a = Math.abs(r); return a >= 0.6 ? "forte" : a >= 0.35 ? "moyenne" : a >= 0.15 ? "faible" : "nulle"; };

/** Ce que le rapport d'equipe a deja mesure (voir analyse.types.ts) : seul le necessaire. */
export interface MesuresRapport {
  scoreDanger: number; fatigueMoy: number | null;
  impacts: { joueurId: string | null; nom: string; prenom?: string; matchsAvec: number; delta: number; impactPondere: number }[];
}

/** Le contexte de chaque match saisi : ce que l'on croise avec le rendement. */
export interface ContexteMatch { matchId: string; rotation: number | null; seancesAvant: number | null; chargeAvant: number | null }

export interface Croisements {
  suffisant: boolean;
  minimum: number;
  /** Danger mesure (rapport) contre ce que les tirs saisis montrent. */
  danger: null | {
    mesure: { scoreDanger: number; butsParMatch: number; matchs: number };
    reel: { matchs: number; tirsParMatch: number; cadresPct: number | null; conversion: number | null; butsParMatch: number };
    serie: { matchId: string; date: string | null; tirs: number; cadres: number; buts: number; ecart: number }[];
    tendance: null | { debut: number; fin: number; sens: "hausse" | "baisse" | "stable" };
    lecture: string[];
  };
  joueurs: { joueurId: string; nom: string; impactPondere: number; delta: number; matchs: number; buts: number; passes: number; tirs: number; conversion: number | null; lecture: "impact_sans_production" | "production_sans_impact" | "coherent" }[];
  facteurs: { id: string; facteur: string; mesure: string; n: number; r: number | null; force: Force | null; lecture: string }[];
  dispositifs: { formation: string; matchs: number; saisis: number; butsPourParMatch: number; butsContreParMatch: number; pointsParMatch: number; tirsParMatch: number | null; conversion: number | null; echantillonFaible: boolean }[];
  familles: { famille: Famille; tirs: number; buts: number; conversion: number | null; part: number }[];
}

const points = (bp: number, bc: number) => (bp > bc ? 3 : bp === bc ? 1 : 0);

export function croiser(jeu: JeuEquipe, mesures: MesuresRapport, contextes: ContexteMatch[], noms: Map<string, string>): Croisements {
  const saisis = jeu.matchs.filter((m) => m.saisi && m.tirs !== null);
  const suffisant = saisis.length >= MIN_MATCHS_CORRELATION;
  const res: Croisements = { suffisant, minimum: MIN_MATCHS_CORRELATION, danger: null, joueurs: [], facteurs: [], dispositifs: dispositifsDe(jeu), familles: famillesDe(jeu) };
  if (saisis.length === 0 || !jeu.tirs) return res;

  // 1. Danger mesure contre danger reel.
  const convMoy = jeu.tirs.pour.tirs > 0 ? jeu.tirs.pour.buts / jeu.tirs.pour.tirs : 0;
  const serie = saisis.map((m) => ({ matchId: m.matchId, date: m.date, tirs: m.tirs as number, cadres: (m.cadres ?? 0), buts: m.bp, ecart: arrondi(m.bp - (m.tirs as number) * convMoy, 1) }));
  const toutesButs = jeu.matchs.length ? moyenne(jeu.matchs.map((m) => m.bp)) : 0;
  let tendance: Croisements["danger"] extends null | infer D ? (D extends { tendance: infer T } ? T : never) : never = null;
  if (saisis.length >= 4) {
    const h = Math.floor(saisis.length / 2);
    const debut = arrondi(moyenne(serie.slice(0, h).map((s) => s.tirs)), 1), fin = arrondi(moyenne(serie.slice(-h).map((s) => s.tirs)), 1);
    tendance = { debut, fin, sens: fin - debut >= 1.5 ? "hausse" : debut - fin >= 1.5 ? "baisse" : "stable" };
  }
  const lecture: string[] = [];
  const butsSaisis = moyenne(saisis.map((m) => m.bp));
  lecture.push(`Le score de danger (${mesures.scoreDanger}/100) repose sur les buts, la stabilité et la fatigue : il ne voit pas les tirs. Le jeu saisi montre ${jeu.tirs.parMatch.pour} tirs par match, dont ${jeu.tirs.cadresPct.pour ?? "–"} % cadrés, pour ${arrondi(butsSaisis, 1)} but${butsSaisis >= 2 ? "s" : ""} par match.`);
  if (Math.abs(butsSaisis - toutesButs) >= 0.5 && jeu.matchs.length > saisis.length) lecture.push(`Attention : les matchs saisis (${arrondi(butsSaisis, 1)} but/match) ne sont pas représentatifs de la saison (${arrondi(toutesButs, 1)} but/match sur ${jeu.matchs.length} matchs).`);
  if (jeu.tirs.conversion.pour !== null && jeu.tirs.conversion.contre !== null) {
    if (jeu.tirs.conversion.pour - jeu.tirs.conversion.contre >= 10) lecture.push(`Plus efficace que l'adversaire devant le but : ${jeu.tirs.conversion.pour} % de conversion contre ${jeu.tirs.conversion.contre} %.`);
    else if (jeu.tirs.conversion.contre - jeu.tirs.conversion.pour >= 10) lecture.push(`Moins efficace que l'adversaire devant le but : ${jeu.tirs.conversion.pour} % de conversion contre ${jeu.tirs.conversion.contre} % : l'écart se joue dans la finition plus que dans le nombre de tirs.`);
  }
  if (tendance && tendance.sens !== "stable") lecture.push(`Production ${tendance.sens === "hausse" ? "en hausse" : "en baisse"} : ${tendance.debut} tirs par match au début, ${tendance.fin} sur les derniers.`);
  res.danger = {
    mesure: { scoreDanger: mesures.scoreDanger, butsParMatch: arrondi(toutesButs, 1), matchs: jeu.matchs.length },
    reel: { matchs: saisis.length, tirsParMatch: jeu.tirs.parMatch.pour, cadresPct: jeu.tirs.cadresPct.pour, conversion: jeu.tirs.conversion.pour, butsParMatch: arrondi(butsSaisis, 1) },
    serie, tendance, lecture,
  };

  // 2. Impact mesure contre finition reelle (joueurs avec fiche).
  const parId = new Map(jeu.joueurs.map((j) => [j.joueurId, j]));
  const lignes = mesures.impacts.filter((i) => i.joueurId && parId.has(i.joueurId)).map((i) => ({ i, j: parId.get(i.joueurId as string) as JoueurJeu }));
  const prod = (j: JoueurJeu) => j.buts + j.passes;
  if (lignes.length >= 5) {
    const impacts = lignes.map((l) => l.i.impactPondere).sort((a, b) => a - b), prods = lignes.map((l) => prod(l.j)).sort((a, b) => a - b);
    const hautImpact = impacts[Math.floor(impacts.length * 2 / 3)], basProd = prods[Math.floor(prods.length / 3)], hautProd = prods[Math.floor(prods.length * 2 / 3)], basImpact = impacts[Math.floor(impacts.length / 3)];
    res.joueurs = lignes.map(({ i, j }) => ({
      joueurId: j.joueurId, nom: noms.get(j.joueurId) ?? [i.prenom, i.nom].filter(Boolean).join(" "), impactPondere: i.impactPondere, delta: i.delta, matchs: j.matchs, buts: j.buts, passes: j.passes, tirs: j.tirs,
      conversion: j.tirs > 0 ? Math.round((j.buts / j.tirs) * 100) : null,
      lecture: i.impactPondere >= hautImpact && prod(j) <= basProd ? "impact_sans_production" as const : prod(j) >= hautProd && i.impactPondere <= basImpact ? "production_sans_impact" as const : "coherent" as const,
    })).sort((a, b) => b.impactPondere - a.impactPondere);
  } else if (lignes.length > 0) {
    res.joueurs = lignes.map(({ i, j }) => ({ joueurId: j.joueurId, nom: noms.get(j.joueurId) ?? i.nom, impactPondere: i.impactPondere, delta: i.delta, matchs: j.matchs, buts: j.buts, passes: j.passes, tirs: j.tirs, conversion: j.tirs > 0 ? Math.round((j.buts / j.tirs) * 100) : null, lecture: "coherent" as const }));
  }

  // 3. Rotation et charge d'entrainement contre rendement (correlations, matchs saisis seulement).
  const ctx = new Map(contextes.map((c) => [c.matchId, c]));
  const facteur = (id: string, nom: string, mesure: string, lire: (c: ContexteMatch) => number | null, cible: (m: (typeof saisis)[number]) => number, cibleNom: string) => {
    const paires = saisis.map((m) => ({ x: lire(ctx.get(m.matchId) ?? { matchId: m.matchId, rotation: null, seancesAvant: null, chargeAvant: null }), y: cible(m) })).filter((p): p is { x: number; y: number } => p.x !== null);
    const n = paires.length;
    if (n < MIN_MATCHS_CORRELATION) return { id, facteur: nom, mesure, n, r: null, force: null, lecture: `Pas assez de matchs saisis avec cette donnée (${n} sur ${MIN_MATCHS_CORRELATION} nécessaires).` };
    const r = pearson(paires.map((p) => p.x), paires.map((p) => p.y));
    if (r === null) return { id, facteur: nom, mesure, n, r: null, force: null, lecture: "Aucune variation d'un match à l'autre : rien à comparer." };
    const f = forceDe(r);
    return { id, facteur: nom, mesure, n, r: arrondi(r), force: f,
      lecture: f === "nulle" || f === "faible" ? `Pas de lien net avec ${cibleNom} (corrélation ${arrondi(r)} sur ${n} matchs).` : `Lien ${f} : ${r > 0 ? "plus" : "moins"} de ${nom.toLowerCase()} va avec ${r > 0 ? "plus" : "moins"} de ${cibleNom} (corrélation ${arrondi(r)} sur ${n} matchs). Un lien n'est pas une cause.` };
  };
  res.facteurs = [
    facteur("rotation_tirs", "Rotation", "Titulaires changés par rapport au match précédent", (c) => c.rotation, (m) => m.tirs as number, "tirs"),
    facteur("rotation_buts", "Rotation", "Titulaires changés par rapport au match précédent", (c) => c.rotation, (m) => m.bp, "buts marqués"),
    facteur("seances_tirs", "Séances d'entraînement", "Séances dans les 7 jours avant le match", (c) => c.seancesAvant, (m) => m.tirs as number, "tirs"),
    facteur("charge_buts", "Charge d'entraînement", "Charge cumulée des 7 jours avant le match", (c) => c.chargeAvant, (m) => m.bp, "buts marqués"),
  ];
  return res;
}

function dispositifsDe(jeu: JeuEquipe): Croisements["dispositifs"] {
  // Un match se repartit entre les dispositifs que l'equipe a tenus, au prorata de leur duree (un changement de systeme compte pour chacun).
  type Part = { m: (typeof jeu.matchs)[number]; poids: number };
  const g = new Map<string, Part[]>();
  for (const m of jeu.matchs) {
    const segs = m.segments?.length ? m.segments.map((s) => ({ formation: s.formation, poids: s.poids })) : m.formation ? [{ formation: m.formation, poids: 1 }] : [];
    for (const s of segs) g.set(s.formation, [...(g.get(s.formation) ?? []), { m, poids: s.poids }]);
  }
  const pond = (ps: Part[], f: (m: Part["m"]) => number) => { const w = ps.reduce((t, p) => t + p.poids, 0); return w > 0 ? ps.reduce((t, p) => t + f(p.m) * p.poids, 0) / w : 0; };
  return [...g].map(([formation, ps]) => {
    const s = ps.filter((p) => p.m.saisi && p.m.tirs !== null);
    const poidsSaisis = s.reduce((t, p) => t + p.poids, 0), poids = ps.reduce((t, p) => t + p.poids, 0);
    const buts = s.reduce((t, p) => t + p.m.bp * p.poids, 0), tirs = s.reduce((t, p) => t + (p.m.tirs as number) * p.poids, 0);
    return {
      formation, matchs: arrondi(poids, 1), saisis: arrondi(poidsSaisis, 1),
      butsPourParMatch: arrondi(pond(ps, (m) => m.bp), 1), butsContreParMatch: arrondi(pond(ps, (m) => m.bc), 1),
      pointsParMatch: arrondi(pond(ps, (m) => points(m.bp, m.bc))),
      tirsParMatch: poidsSaisis > 0 ? arrondi(tirs / poidsSaisis, 1) : null, conversion: tirs > 0 ? Math.round((buts / tirs) * 100) : null,
      echantillonFaible: poids < 3,
    };
  }).sort((a, b) => b.matchs - a.matchs);
}

function famillesDe(jeu: JeuEquipe): Croisements["familles"] {
  const f = jeu.tirs?.familles ?? [];
  const total = f.reduce((s, x) => s + x.tirs, 0);
  return f.map((x) => ({ ...x, conversion: x.tirs > 0 ? Math.round((x.buts / x.tirs) * 100) : null, part: total ? Math.round((x.tirs / total) * 100) : 0 }));
}
