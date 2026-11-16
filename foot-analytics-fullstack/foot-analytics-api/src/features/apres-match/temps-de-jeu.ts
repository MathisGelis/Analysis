// src/features/apres-match/temps-de-jeu.ts
//
// Ce que le direct apprend sur chaque joueur de mon equipe : le temps de jeu (titulaire du plan de jeu, entree et sortie sur les
// remplacements, expulsion) et ses faits (buts, passes, arrets, cartons). Fonctions pures.

import { estBut } from "../direct/stats-direct";

export interface JoueurPresent { id: string; role: string }
export interface EvenementCote {
  cote: "dom" | "ext"; type: string; resultat?: string | null; minute: number;
  joueurId?: string | null; joueur2Id?: string | null;
}

export interface Faits { buts: number; passes: number; arrets: number; tirs: number; jaunes: number; rouges: number }
export interface Fiche { minutes: number; aJoue: boolean; faits: Faits }

const vide = (): Faits => ({ buts: 0, passes: 0, arrets: 0, tirs: 0, jaunes: 0, rouges: 0 });

/** `finMinute` : la minute atteinte par le chrono (la duree du match une fois termine). */
export function fichesDuMatch(joueurs: JoueurPresent[], evenements: EvenementCote[], nousCote: "dom" | "ext", finMinute: number): Map<string, Fiche> {
  const evs = evenements.filter((e) => e.cote === nousCote).sort((a, b) => a.minute - b.minute);
  const entree = new Map<string, number>(), sortie = new Map<string, number>();
  for (const j of joueurs) if (j.role === "titulaire") entree.set(j.id, 0);
  const fiches = new Map<string, Fiche>(joueurs.map((j) => [j.id, { minutes: 0, aJoue: j.role === "titulaire", faits: vide() }]));
  const fait = (id: string | null | undefined) => (id ? fiches.get(id)?.faits : undefined);

  // Sans plan de jeu, personne n'est titulaire : un joueur qui agit sans etre entre en jeu a forcement joue depuis le debut.
  const sansPlan = !joueurs.some((j) => j.role === "titulaire");
  for (const e of evs) {
    if (sansPlan) {
      // Le sortant d'un remplacement et ceux qui agissent (tireur, passeur...) etaient la ; l'entrant d'un remplacement non.
      const presents = e.type === "remplacement" ? [e.joueurId] : [e.joueurId, e.joueur2Id];
      for (const id of presents) if (id && fiches.has(id) && !entree.has(id)) { entree.set(id, 0); fiches.get(id)!.aJoue = true; }
    }
    if (e.type === "remplacement") {
      if (e.joueurId && !sortie.has(e.joueurId)) sortie.set(e.joueurId, e.minute);
      if (e.joueur2Id && !entree.has(e.joueur2Id)) { entree.set(e.joueur2Id, e.minute); const f = fiches.get(e.joueur2Id); if (f) f.aJoue = true; }
    } else if (e.type === "carton_rouge" && e.joueurId && !sortie.has(e.joueurId)) {
      sortie.set(e.joueurId, e.minute);
    }
    if (estBut(e)) { const f = fait(e.joueurId); if (f) f.buts++; const p = fait(e.joueur2Id); if (p) p.passes++; }
    else if (e.type === "tir") { const f = fait(e.joueurId); if (f) f.tirs++; }
    else if (e.type === "arret") { const f = fait(e.joueurId); if (f) f.arrets++; }
    else if (e.type === "carton_jaune") { const f = fait(e.joueurId); if (f) f.jaunes++; }
    else if (e.type === "carton_rouge") { const f = fait(e.joueurId); if (f) f.rouges++; }
  }
  for (const [id, f] of fiches) {
    const debut = entree.get(id);
    if (debut === undefined) continue;
    f.minutes = Math.max(0, Math.min(sortie.get(id) ?? finMinute, finMinute) - debut);
  }
  return fiches;
}
