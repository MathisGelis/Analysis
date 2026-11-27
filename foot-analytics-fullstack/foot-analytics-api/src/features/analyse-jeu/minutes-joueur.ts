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
