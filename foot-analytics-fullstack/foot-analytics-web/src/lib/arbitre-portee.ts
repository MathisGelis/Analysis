// src/lib/arbitre-portee.ts
//
// Portee de la fiche arbitre : "saison" (defaut, saison choisie dans le
// switcher) ou "carriere" (tout l'historique). Fonctions pures : le filtrage
// et les totaux se font a partir des participations par championnat
// (Arbitre.participations) et des liens arbitre/match.

export type Portee = "saison" | "carriere";

/** Un motif de carton et le nombre de cartons donnes pour ce motif. */
export interface CompteMotif { motif: string; n: number }

export interface ParticipationChamp {
  saisonId?: string | null;
  matchsOfficies: number;
  matchsPrincipal: number;
  cartonsJaunesDonnes: number;
  cartonsRougesDonnes: number;
  profil?: string | null;
  motifsTop?: string | null;
  /** Decompte complet des motifs (absent des participations calculees avant cette version). */
  motifs?: CompteMotif[] | null;
  /** Cartons dont la feuille ne donne aucun motif. */
  cartonsSansMotif?: number | null;
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
  /** Detail des motifs sur la portee : null si une participation n'en porte pas (rebuild a relancer). */
  decompteMotifs: DecompteMotifs | null;
}

export interface DecompteMotifs {
  motifs: CompteMotif[];
  sansMotif: number;
  /** Total des cartons : somme des motifs + cartons sans motif. Egal a CJ + CR quand les donnees sont completes. */
  total: number;
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
 * Decompte des motifs sur un ensemble de participations : chaque motif additionne sur tous les
 * championnats, plus les cartons sans motif, pour que le total retombe sur les cartons donnes.
 * null si une participation n'a pas le detail (calculee avant cette version) : on ne devine pas.
 */
export function decompteMotifs(participations: ParticipationChamp[]): DecompteMotifs | null {
  if (participations.length === 0) return { motifs: [], sansMotif: 0, total: 0 };
  if (participations.some((p) => !Array.isArray(p.motifs))) return null;
  const cle = (m: string) => m.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const groupes = new Map<string, CompteMotif>();
  let sansMotif = 0;
  for (const p of participations) {
    sansMotif += p.cartonsSansMotif ?? 0;
    for (const { motif, n } of p.motifs ?? []) {
      const g = groupes.get(cle(motif));
      if (g) g.n += n; else groupes.set(cle(motif), { motif, n });
    }
  }
  const motifs = [...groupes.values()].sort((a, b) => b.n - a.n || a.motif.localeCompare(b.motif));
  return { motifs, sansMotif, total: motifs.reduce((s, m) => s + m.n, 0) + sansMotif };
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
    decompteMotifs: decompteMotifs(participations),
  };
}
