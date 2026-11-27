// src/features/analyse-jeu/minutes-joueur.ts
//
// Les apparitions d'un joueur dans des matchs : sa ligne de feuille, ses minutes jouees (valeur stockee, sinon deduite des remplacements),
// titulaire ou non. Sert aux stats « par 90 minutes » de sa fiche : on ne rapporte les actions du direct qu'aux minutes des matchs saisis.
// Fonction pure.

import { normaliser } from "@/common/fuzzy";
import { minutesJouees } from "@/features/matchs/minutes";

export interface LigneFeuilleJoueur { matchId: string; cote: "dom" | "ext"; nom: string; prenom?: string | null; licence?: string | null; titulaire: boolean; minutes?: number | null; numero?: number | null }
export interface EvenementFeuille { matchId: string; type: string; equipe: string; joueur?: string | null; joueur2?: string | null; minute?: number | null }

export interface Presence { minutes: number; titulaire: boolean; numero: number | null }

const meme = (a: { licence?: string | null; nom: string; prenom?: string | null }, b: { licence?: string | null; nom: string; prenom?: string | null }): boolean => {
  if (a.licence && b.licence) return a.licence.trim() === b.licence.trim();
  return normaliser(`${a.nom} ${a.prenom ?? ""}`) === normaliser(`${b.nom} ${b.prenom ?? ""}`);
};

/** Les presences du joueur (par match) parmi les lignes de feuille de SON equipe (`cotes` : le cote du club dans chaque match). */
export function presencesDuJoueur(
  joueur: { licence?: string | null; nom: string; prenom?: string | null }, lignes: readonly LigneFeuilleJoueur[],
  evenements: readonly EvenementFeuille[], cotes: ReadonlyMap<string, "dom" | "ext">,
): Map<string, Presence> {
  const res = new Map<string, Presence>();
  for (const l of lignes) {
    if (cotes.get(l.matchId) !== l.cote || !meme(joueur, l) || res.has(l.matchId)) continue;
    const evts = evenements.filter((e) => e.matchId === l.matchId).map((e) => ({ type: e.type, equipe: e.equipe, joueur: e.joueur ?? null, joueur2: e.joueur2 ?? null, minute: e.minute ?? 0 }));
    const minutes = minutesJouees({ minutes: l.minutes ?? 0, titulaire: l.titulaire, nom: l.nom, prenom: l.prenom ?? "", cote: l.cote } as never, evts as never);
    res.set(l.matchId, { minutes, titulaire: l.titulaire, numero: l.numero ?? null });
  }
  return res;
}

/** Le onze du coup d'envoi d'un match (plan de jeu de ce match) : qui commence, avec quel numero. */
export interface PlanDepart { matchId: string; titulaires: readonly string[]; remplacants: readonly string[]; numeros?: Record<string, number> | null }
export interface EvenementDirectMinutes { matchId: string; cote: "dom" | "ext"; type: string; minute: number; joueurId?: string | null; joueur2Id?: string | null }

/**
 * Les minutes d'un joueur DEDUITES DU DIRECT : plus precises que la feuille de match, parce qu'elles viennent de ce que le staff a saisi
 * (remplacements a la minute, carton rouge). Un titulaire joue de 0 a sa sortie (remplace ou expulse), un entrant de son entree a la fin.
 * La fin du match est la derniere minute saisie (au moins 90). Un joueur qui n'est ni dans le onze ni entre : aucune presence.
 * Ne porte que sur les matchs dont on connait le onze de depart et dont le direct a des evenements ; le reste reste a la feuille de match.
 */
export function presencesDuDirect(
  joueurId: string, plans: readonly PlanDepart[], evenements: readonly EvenementDirectMinutes[], cotes: ReadonlyMap<string, "dom" | "ext">,
): Map<string, Presence> {
  const res = new Map<string, Presence>();
  for (const plan of plans) {
    const cote = cotes.get(plan.matchId);
    const evs = evenements.filter((e) => e.matchId === plan.matchId);
    if (!cote || evs.length === 0 || plan.titulaires.filter(Boolean).length < 7) continue;
    const fin = Math.max(90, ...evs.map((e) => e.minute));
    const nous = evs.filter((e) => e.cote === cote).sort((a, b) => a.minute - b.minute);
    const titulaire = plan.titulaires.includes(joueurId);
    const entree = nous.find((e) => e.type === "remplacement" && e.joueur2Id === joueurId);
    if (!titulaire && !entree) continue;
    const debut = titulaire ? 0 : entree!.minute;
    const sortie = nous.find((e) => e.minute >= debut && ((e.type === "remplacement" && e.joueurId === joueurId) || (e.type === "carton_rouge" && e.joueurId === joueurId)));
    res.set(plan.matchId, { minutes: Math.max(0, Math.min(fin, sortie?.minute ?? fin) - debut), titulaire, numero: plan.numeros?.[joueurId] ?? null });
  }
  return res;
}

/** Les presences du direct d'abord (plus precises), la feuille de match pour les matchs que le direct ne couvre pas. */
export function fusionnerPresences(direct: ReadonlyMap<string, Presence>, feuille: ReadonlyMap<string, Presence>): Map<string, Presence> {
  const res = new Map(feuille);
  for (const [id, p] of direct) res.set(id, { ...p, numero: p.numero ?? feuille.get(id)?.numero ?? null });
  return res;
}
