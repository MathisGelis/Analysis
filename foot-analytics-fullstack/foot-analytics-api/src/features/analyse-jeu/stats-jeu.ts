// src/features/analyse-jeu/stats-jeu.ts
//
// Ce que l'on tire des evenements d'UN match : stats des deux equipes, buts par tranche de 15 minutes, carte des tirs (3 tiers x 5
// couloirs), constats automatiques. Les evenements du direct donnent tout le detail ; sans direct, la feuille de match (FMI) donne
// ce qu'elle sait (buts et cartons, minutes comprises). Rien n'est invente : un chiffre inconnu est absent, jamais estime.
// Fonctions pures.

import { compteurs, CompteursCote, estBut } from "../direct/stats-direct";
import { COULOIRS, TIERS } from "../direct/types";

export type Cote = "dom" | "ext";

export interface EvenementJeu {
  cote: Cote; type: string; resultat?: string | null; minute: number;
  zoneTier?: number | null; zoneCouloir?: number | null; contextes?: string[] | null;
  joueurId?: string | null; joueur2Id?: string | null;
}
export interface EvenementFmi { type: string; sousType?: string | null; minute?: number | null; equipe: Cote }

export const NOMS_TRANCHES = ["0-15", "15-30", "30-45", "45-60", "60-75", "75-90"] as const;
/** Tranche de 15 minutes d'une minute de match (1 a 15 = premiere) ; au-dela de 90, la derniere. */
export const trancheDe = (minute: number): number => Math.min(5, Math.max(0, Math.floor((Math.max(1, minute) - 1) / 15)));

export const NOMS_TIERS = ["Offensif", "Médian", "Défensif"] as const;
export const NOMS_COULOIRS = ["gauche", "axe gauche", "centre", "axe droit", "droit"] as const;
export const nomZone = (index: number) => `${NOMS_TIERS[Math.floor(index / COULOIRS)]} · ${NOMS_COULOIRS[index % COULOIRS]}`;

export interface LigneStat { cle: string; libelle: string; nous: number; eux: number }
export interface Constat { id: string; titre: string; detail: string; ton: "bon" | "alerte" | "neutre" }

export interface ResumeMatch {
  nousCote: Cote;
  score: { nous: number; eux: number };
  /** `detail` : le match a ete saisi en direct (zones, tirs, contextes) ; `fmi` : la feuille de match donne des buts ou cartons. */
  sources: { detail: boolean; fmi: boolean };
  stats: LigneStat[];
  conversion: { nous: number | null; eux: number | null };
  tranches: { nom: string; nous: number; eux: number }[];
  butsSource: "direct" | "fmi" | "aucune";
  carte: { tirs: number[]; buts: number[] };
  contextes: { nom: string; tirs: number; buts: number }[];
  constats: Constat[];
}

const pct = (a: number, b: number): number | null => (b > 0 ? Math.round((a / b) * 100) : null);
const pluriel = (n: number, un: string, plus: string) => `${n} ${n > 1 ? plus : un}`;

const estTirAuBut = (e: EvenementJeu) => e.type === "tir" || e.type === "coup_franc" || e.type === "penalty";

export function resumerMatch(args: {
  nousCote: Cote; evenements: EvenementJeu[]; fmi: EvenementFmi[]; scoreDom: number; scoreExt: number;
  /** Le score vient de la feuille de match officielle : il fait foi, et un ecart avec le direct est signale. */
  scoreOfficiel?: boolean;
}): ResumeMatch {
  const { nousCote, evenements, fmi } = args;
  const eux: Cote = nousCote === "dom" ? "ext" : "dom";
  const detail = evenements.length > 0;
  const score = { nous: nousCote === "dom" ? args.scoreDom : args.scoreExt, eux: nousCote === "dom" ? args.scoreExt : args.scoreDom };
  const c = compteurs(evenements);
  const n: CompteursCote = c[nousCote], e: CompteursCote = c[eux];

  // Cartons : le direct s'il existe, sinon la feuille de match.
  const cartonsFmi = (cote: Cote, couleur: string) => fmi.filter((x) => x.type === "carton" && x.equipe === cote && (x.sousType ?? "jaune") === couleur).length;
  const jaunes = detail ? { nous: n.jaunes, eux: e.jaunes } : { nous: cartonsFmi(nousCote, "jaune"), eux: cartonsFmi(eux, "jaune") };
  const rouges = detail ? { nous: n.rouges, eux: e.rouges } : { nous: cartonsFmi(nousCote, "rouge"), eux: cartonsFmi(eux, "rouge") };

  const stats: LigneStat[] = [];
  if (detail) {
    stats.push(
      { cle: "tirs", libelle: "Tirs", nous: n.tirs, eux: e.tirs },
      { cle: "cadres", libelle: "Tirs cadrés", nous: n.tirsCadres, eux: e.tirsCadres },
      { cle: "corners", libelle: "Corners", nous: n.corners, eux: e.corners },
      { cle: "coups_francs", libelle: "Coups francs", nous: n.coupsFrancs, eux: e.coupsFrancs },
      { cle: "penaltys", libelle: "Penaltys", nous: n.penaltys, eux: e.penaltys },
      { cle: "fautes", libelle: "Fautes", nous: n.fautes, eux: e.fautes },
      { cle: "hors_jeux", libelle: "Hors-jeux", nous: n.horsJeux, eux: e.horsJeux },
      { cle: "arrets", libelle: "Arrêts du gardien", nous: n.arrets, eux: e.arrets },
    );
  }
  if (detail || fmi.some((x) => x.type === "carton")) {
    stats.push({ cle: "jaunes", libelle: "Cartons jaunes", nous: jaunes.nous, eux: jaunes.eux }, { cle: "rouges", libelle: "Cartons rouges", nous: rouges.nous, eux: rouges.eux });
  }

  // Buts par tranche : le direct, sinon la feuille de match (quand elle date ses buts).
  const butsDirect = evenements.filter(estBut);
  const butsFmi = fmi.filter((x) => x.type === "but" && typeof x.minute === "number");
  const tranches = NOMS_TRANCHES.map((nom) => ({ nom, nous: 0, eux: 0 }));
  let butsSource: ResumeMatch["butsSource"] = "aucune";
  if (butsDirect.length > 0) {
    butsSource = "direct";
    for (const b of butsDirect) tranches[trancheDe(b.minute)][b.cote === nousCote ? "nous" : "eux"]++;
  } else if (butsFmi.length > 0) {
    butsSource = "fmi";
    for (const b of butsFmi) tranches[trancheDe(b.minute as number)][b.equipe === nousCote ? "nous" : "eux"]++;
  }

  // Carte des tirs de MON equipe (les zones sont celles de l'equipe qui joue, voir direct/types.ts).
  const carte = { tirs: Array(TIERS * COULOIRS).fill(0) as number[], buts: Array(TIERS * COULOIRS).fill(0) as number[] };
  const contextes = new Map<string, { tirs: number; buts: number }>();
  for (const x of evenements) {
    if (x.cote !== nousCote || !estTirAuBut(x) || !x.resultat) continue;
    if (x.zoneTier != null && x.zoneCouloir != null) {
      const i = x.zoneTier * COULOIRS + x.zoneCouloir;
      carte.tirs[i]++;
      if (estBut(x)) carte.buts[i]++;
    }
    for (const nom of x.contextes ?? []) {
      const l = contextes.get(nom) ?? { tirs: 0, buts: 0 };
      l.tirs++; if (estBut(x)) l.buts++;
      contextes.set(nom, l);
    }
  }

  const conversion = { nous: pct(n.buts, n.tirs), eux: pct(e.buts, e.tirs) };
  const res: ResumeMatch = {
    nousCote, score, sources: { detail, fmi: fmi.length > 0 }, stats, conversion, tranches, butsSource, carte,
    contextes: [...contextes].map(([nom, l]) => ({ nom, ...l })).sort((a, b) => b.tirs - a.tirs),
    constats: [],
  };
  res.constats = constatsDe(res, n, e, evenements.filter((x) => x.cote === nousCote), evenements.filter((x) => x.cote === eux));
  // L'ecart entre le direct et la feuille de match : la feuille fait foi, le direct est a corriger (ou complete).
  if (args.scoreOfficiel && detail && (n.buts !== score.nous || e.buts !== score.eux)) {
    res.constats = [{ id: "ecart_fmi", ton: "alerte" as const, titre: "Le direct ne donne pas le score officiel",
      detail: `La feuille de match dit ${score.nous}-${score.eux}, les événements saisis donnent ${n.buts}-${e.buts}. Corrige la frise du direct : le score officiel reste celui de la feuille.` }, ...res.constats].slice(0, 5);
  }
  return res;
}

/** Quelques constats lisibles en vingt secondes, du plus marquant au moins marquant (5 au plus). Seulement ce que les chiffres permettent. */
function constatsDe(r: ResumeMatch, n: CompteursCote, e: CompteursCote, nos: EvenementJeu[], leurs: EvenementJeu[]): Constat[] {
  const l: Constat[] = [];
  if (!r.sources.detail) {
    l.push({ id: "limite", titre: "Résumé limité", ton: "neutre",
      detail: "Ce match n'a pas été saisi en direct : seuls le score, les buts datés et les cartons de la feuille de match sont connus. Les tirs et les zones ne le sont pas." });
  }
  const tirs = n.tirs + e.tirs;
  if (tirs >= 6) {
    const part = Math.round((n.tirs / tirs) * 100);
    if (part >= 60) l.push({ id: "domination", ton: "bon", titre: "Match dominé au tir", detail: `${n.tirs} tirs contre ${e.tirs} (${part} % des tirs du match).` });
    else if (part <= 40) l.push({ id: "domination", ton: "alerte", titre: "Match subi au tir", detail: `${n.tirs} tirs contre ${e.tirs} pour l'adversaire (${part} % des tirs du match).` });
  }
  if (n.tirs >= 6) {
    const conv = pct(n.buts, n.tirs) as number;
    if (n.buts === 0) l.push({ id: "efficacite", ton: "alerte", titre: "Aucun but malgré les occasions", detail: `${pluriel(n.tirs, "tir", "tirs")} dont ${n.tirsCadres} cadré${n.tirsCadres > 1 ? "s" : ""}, sans réussite.` });
    else if (conv >= 30) l.push({ id: "efficacite", ton: "bon", titre: "Très efficace devant le but", detail: `${pluriel(n.buts, "but", "buts")} sur ${n.tirs} tirs (${conv} %).` });
    else if (n.tirsCadres / n.tirs <= 0.25) l.push({ id: "precision", ton: "alerte", titre: "Peu de tirs cadrés", detail: `${n.tirsCadres} tir${n.tirsCadres > 1 ? "s" : ""} cadré${n.tirsCadres > 1 ? "s" : ""} sur ${n.tirs}.` });
  }
  if (e.tirs >= 6 && e.buts === 0 && r.score.eux === 0) l.push({ id: "defense", ton: "bon", titre: "Défense solide", detail: `${e.tirs} tirs concédés, aucun but encaissé.` });

  // Moments : premier but, buts tardifs.
  const buts = [...nos.filter(estBut).map((b) => ({ b, nous: true })), ...leurs.filter(estBut).map((b) => ({ b, nous: false }))].sort((a, b) => a.b.minute - b.b.minute);
  if (buts.length > 0) {
    const premier = buts[0];
    l.push({ id: "premier_but", ton: premier.nous ? "bon" : "alerte", titre: premier.nous ? "Score ouvert par ton équipe" : "Score ouvert par l'adversaire", detail: `Premier but à la ${premier.b.minute}e minute.` });
    const tardifs = buts.filter((x) => x.b.minute >= 76);
    if (tardifs.length > 0) {
      const pour = tardifs.filter((x) => x.nous).length, contre = tardifs.length - pour;
      l.push({ id: "fin_de_match", ton: contre > pour ? "alerte" : "bon", titre: "Un match qui se joue à la fin", detail: `${pluriel(pour, "but marqué", "buts marqués")} et ${pluriel(contre, "encaissé", "encaissés")} après la 75e minute.` });
    }
  }

  // Coups de pied arretes : buts qui en viennent, et corners obtenus.
  const sur = (cote: EvenementJeu[]) => cote.filter((x) => estBut(x) && ((x.contextes ?? []).includes("CPA") || x.type === "penalty" || x.type === "coup_franc")).length;
  if (sur(nos) > 0) l.push({ id: "cpa", ton: "bon", titre: "Coups de pied arrêtés décisifs", detail: `${pluriel(sur(nos), "but", "buts")} sur coup de pied arrêté ou penalty.` });
  if (sur(leurs) > 0) l.push({ id: "cpa_contre", ton: "alerte", titre: "Buts encaissés sur coup de pied arrêté", detail: `${pluriel(sur(leurs), "but", "buts")} concédé${sur(leurs) > 1 ? "s" : ""} sur coup de pied arrêté ou penalty.` });

  // Zone favorite des tirs.
  const total = r.carte.tirs.reduce((s, x) => s + x, 0);
  if (total >= 6) {
    const imax = r.carte.tirs.indexOf(Math.max(...r.carte.tirs));
    const part = Math.round((r.carte.tirs[imax] / total) * 100);
    if (part >= 40) l.push({ id: "zone", ton: "neutre", titre: "Une zone de tir dominante", detail: `${part} % des tirs partent de la zone « ${nomZone(imax)} ».` });
  }

  // Discipline.
  const cartons = r.stats.filter((s) => s.cle === "jaunes" || s.cle === "rouges");
  const rougesNous = cartons.find((s) => s.cle === "rouges")?.nous ?? 0, jaunesNous = cartons.find((s) => s.cle === "jaunes")?.nous ?? 0;
  if (rougesNous > 0) l.push({ id: "rouge", ton: "alerte", titre: "Carton rouge", detail: `${pluriel(rougesNous, "expulsion", "expulsions")} pour ton équipe : à compter avec les suspensions.` });
  else if (jaunesNous >= 3) l.push({ id: "jaunes", ton: "alerte", titre: "Match tendu", detail: `${jaunesNous} cartons jaunes pour ton équipe.` });

  // Du plus marquant : alertes d'abord, puis le reste ; 5 au plus. L'ordre d'ecriture ci-dessus departage.
  const poids = { alerte: 0, bon: 1, neutre: 2 } as const;
  return l.map((x, i) => ({ x, i })).sort((a, b) => poids[a.x.ton] - poids[b.x.ton] || a.i - b.i).map((s) => s.x).slice(0, 5);
}
