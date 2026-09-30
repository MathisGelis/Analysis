// src/lib/arbitre-portee.ts
//
// Portee de la fiche arbitre : "saison" (defaut, saison choisie dans le
// switcher) ou "carriere" (tout l'historique). Fonctions pures : le filtrage
// et les totaux se font a partir des participations par championnat
// (Arbitre.participations) et des liens arbitre/match.

export type Portee = "saison" | "carriere";

export interface ParticipationChamp {
  saisonId?: string | null;
  matchsOfficies: number;
  matchsPrincipal: number;
  cartonsJaunesDonnes: number;
  cartonsRougesDonnes: number;
  profil?: string | null;
  motifsTop?: string | null;
  noteMoyenne?: number | null;
}

export interface LienMatch {
  note?: number | null;
  matchData?: { saisonId?: string | null } | null;
}

export interface TotauxArbitre {
  matchsOfficies: number;
  cartonsJaunesDonnes: number;
  cartonsRougesDonnes: number;
  noteMoyenne: number | null;
  profil: string | null;
  motifsTop: string | null;
}

/** Lit ?portee=... ; toute valeur inconnue retombe sur la saison courante. */
export function parsePortee(valeur: string | string[] | undefined): Portee {
  const v = Array.isArray(valeur) ? valeur[0] : valeur;
  return v === "carriere" ? "carriere" : "saison";
}

export function participationsDeSaison<T extends ParticipationChamp>(
  participations: T[], saisonId: string | null,
): T[] {
  return participations.filter((p) => (p.saisonId ?? null) === saisonId);
}

export function liensDeSaison<T extends LienMatch>(liens: T[], saisonId: string | null): T[] {
  return liens.filter((l) => (l.matchData?.saisonId ?? null) === saisonId);
}

/**
 * Totaux de l'arbitre sur un sous-ensemble de participations. Le profil et
 * les motifs viennent du championnat ou il a ete le plus souvent principal
 * (le profil n'a de sens que dans ce role). La note moyenne est celle des
 * liens notes.
 */
export function totauxDepuis(
  participations: ParticipationChamp[], liens: LienMatch[],
): TotauxArbitre {
  const somme = (f: (p: ParticipationChamp) => number) =>
    participations.reduce((s, p) => s + (f(p) || 0), 0);
  const principal = [...participations].sort(
    (a, b) => (b.matchsPrincipal || 0) - (a.matchsPrincipal || 0),
  )[0];
  const notes = liens.map((l) => l.note).filter((n): n is number => typeof n === "number");
  return {
    matchsOfficies: somme((p) => p.matchsOfficies),
    cartonsJaunesDonnes: somme((p) => p.cartonsJaunesDonnes),
    cartonsRougesDonnes: somme((p) => p.cartonsRougesDonnes),
    noteMoyenne: notes.length ? notes.reduce((s, n) => s + n, 0) / notes.length : null,
    profil: principal?.profil ?? null,
    motifsTop: principal?.motifsTop ?? null,
  };
}
