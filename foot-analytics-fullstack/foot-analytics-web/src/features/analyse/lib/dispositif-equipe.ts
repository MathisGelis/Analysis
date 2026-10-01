// src/features/analyse/lib/dispositif-equipe.ts
//
// Ce qu'on sait du dispositif d'une equipe, pour la fiche club. Rien n'est suppose : le dispositif de la base
// (Equipe.formationDef, "4-2-3-1" par defaut) n'est pas une information et n'est jamais affiche. On montre, dans cet ordre :
//   1. le dispositif OBSERVE : celui que le staff a renseigne sur les derniers matchs (les plus recents pesent plus) ;
//   2. pour MON equipe seulement, le dispositif PREVU : celui de la derniere composition enregistree (onglet Tactique) ;
//   3. sinon rien : la fiche invite a le renseigner sur le dernier match.
// Fonctions pures.

import { ligneDuPoste, type Ligne } from "@/features/tactique/lib/composition";

import type { JoueurOnze, SituationClub } from "./situation-types";

export interface DispositifAffiche {
  systeme: string;
  source: "observe" | "prevu";
  /** Phrase courte qui dit d'ou vient l'information. */
  detail: string;
}

export function dispositifAffiche(
  situation: SituationClub | null | undefined, planFormation?: string | null,
): DispositifAffiche | null {
  const p = situation?.systeme.prediction;
  if (p) {
    const n = p.observations;
    return { systeme: p.systeme, source: "observe", detail: `d'apres ${n} match${n > 1 ? "s" : ""} renseigne${n > 1 ? "s" : ""}` };
  }
  if (planFormation && planFormation.trim()) {
    return { systeme: planFormation.trim(), source: "prevu", detail: "prevu dans la derniere composition enregistree" };
  }
  return null;
}

/** Dispositif a utiliser pour dessiner le dernier onze : celui du match, sinon le dispositif probable ; sinon aucun. */
export function formationDuOnze(situation: SituationClub | null | undefined): { formation: string; exact: boolean } | null {
  const onze = situation?.dernierOnze;
  if (!onze) return null;
  if (onze.match.formation) return { formation: onze.match.formation, exact: true };
  const probable = situation?.systeme.prediction?.systeme;
  return probable ? { formation: probable, exact: false } : null;
}

const RANG: Record<Ligne, number> = { GB: 0, DEF: 1, MIL: 2, ATT: 3 };

/** Ligne d'un joueur : son poste connu, sinon, pour le seul rangement, son numero de maillot (1 gardien, 2-5, 6-8, 9-11). */
function ligneDe(j: Pick<JoueurOnze, "poste" | "numero">): Ligne {
  const d = ligneDuPoste(j.poste);
  if (d) return d;
  if (j.numero === 1) return "GB";
  if (j.numero <= 5) return "DEF";
  if (j.numero <= 8) return "MIL";
  return "ATT";
}

/**
 * Les titulaires dans l'ordre du terrain (gardien, defense, milieu, attaque), pour les placer sur les lignes d'un
 * dispositif : les lignes se remplissent dans l'ordre, donc chaque ligne a toujours le bon nombre de joueurs.
 */
export function ordonnerPourTerrain<T extends Pick<JoueurOnze, "poste" | "numero">>(titulaires: T[]): T[] {
  return [...titulaires].sort((a, b) => RANG[ligneDe(a)] - RANG[ligneDe(b)] || a.numero - b.numero);
}

/** Nom de famille tel que la feuille l'ecrit (en majuscules) ; a defaut le nom entier. */
export function nomDeFamille(nom: string): string {
  return nom.split(" ").filter((m) => m.length > 1 && m === m.toUpperCase()).join(" ") || nom;
}
