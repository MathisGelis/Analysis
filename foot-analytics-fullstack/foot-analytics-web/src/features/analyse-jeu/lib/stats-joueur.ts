// src/features/analyse-jeu/lib/stats-joueur.ts
//
// Les stats de la fiche d'un joueur selon son poste : un gardien n'a ni buts ni tirs, un joueur de champ n'a pas d'arrets (les passes cles
// restent pour tous). Rapport a 90 minutes, forme recente, rang dans l'effectif. Fonctions pures.

import type { RangEffectif, StatsJoueurDirect } from "./data-hub-types";

export type FamillePoste = "gardien" | "defenseur" | "milieu" | "attaquant" | "inconnue";

/**
 * La famille de poste d'un joueur : le poste de sa fiche, sinon son numero le plus porte (1 = gardien, 2 a 5 = defenseurs, 6, 8, 10 = milieux,
 * 7, 9, 11 = attaquants). Sans rien : inconnue (on montre alors les stats de champ).
 */
export function famillePoste(poste: string | null | undefined, numero?: number | null): FamillePoste {
  const p = (poste ?? "").trim().toUpperCase();
  if (p) {
    if (p === "GB" || p.startsWith("GAR")) return "gardien";
    if (p.startsWith("D")) return "defenseur";
    if (p.startsWith("M")) return "milieu";
    if (p.startsWith("A") || p === "BU" || p.startsWith("ATT")) return "attaquant";
  }
  if (numero === 1 || numero === 16) return "gardien";
  if (numero && numero >= 2 && numero <= 5) return "defenseur";
  if (numero === 6 || numero === 8 || numero === 10) return "milieu";
  if (numero === 7 || numero === 9 || numero === 11) return "attaquant";
  return "inconnue";
}

export const LIBELLE_FAMILLE: Record<FamillePoste, string> = { gardien: "Gardien", defenseur: "Défenseur", milieu: "Milieu", attaquant: "Attaquant", inconnue: "Joueur" };

export type SectionStats = "gardien" | "creation" | "finition" | "discipline";

/** Les blocs de la fiche pour ce poste, dans l'ordre : le plus parlant d'abord. Un gardien n'a pas de bloc de finition ; un joueur de champ n'a pas de bloc gardien. */
export function sectionsPour(famille: FamillePoste, stats: Pick<StatsJoueurDirect, "tirs">): SectionStats[] {
  switch (famille) {
    case "gardien": return ["gardien", "creation", "discipline"];
    case "defenseur": return stats.tirs > 0 ? ["discipline", "creation", "finition"] : ["discipline", "creation"];
    case "milieu": return ["creation", "finition", "discipline"];
    case "attaquant": return ["finition", "creation", "discipline"];
    default: return ["finition", "creation", "discipline"];
  }
}

/** Une valeur rapportee a 90 minutes (arrondie a 2 decimales) ; null sans minutes. */
export function par90(valeur: number, minutes: number | null | undefined): number | null {
  return minutes && minutes > 0 ? Math.round((valeur / minutes) * 90 * 100) / 100 : null;
}

/** Sous ce nombre de minutes, un « par 90 » ne dit presque rien : on le montre mais on le signale. */
export const MINUTES_MIN_PAR90 = 180;

/** Les rangs a afficher : un gardien n'est classe que sur ses arrets et ses passes cles, un joueur de champ jamais sur des arrets. */
export function rangsAffiches(rangs: readonly RangEffectif[], famille: FamillePoste): RangEffectif[] {
  if (famille === "gardien") return rangs.filter((r) => r.cle === "arrets" || r.cle === "passesCles");
  return rangs.filter((r) => r.cle !== "arrets");
}

/** « 1er », « 2e » : le rang en francais. */
export const ordinal = (rang: number): string => (rang === 1 ? "1er" : `${rang}e`);

export interface LigneForme { cle: string; libelle: string; saison: number | null; recent: number | null; meilleurSiHaut: boolean }

/** Les 5 derniers matchs saisis contre la saison, par match, pour les stats qui comptent a ce poste (l'ordre des matchs est celui de la liste, du plus ancien au plus recent). */
export function formeRecente(parMatch: StatsJoueurDirect["parMatch"], famille: FamillePoste, n = 5): { recents: number; lignes: LigneForme[] } {
  const ordre = [...parMatch].sort((a, b) => dateTri(a.date) - dateTri(b.date));
  const recents = ordre.slice(-n);
  const moy = (l: typeof ordre, f: (m: (typeof ordre)[number]) => number): number | null => (l.length ? Math.round((l.reduce((s, m) => s + f(m), 0) / l.length) * 100) / 100 : null);
  const ligne = (cle: string, libelle: string, f: (m: (typeof ordre)[number]) => number, haut = true): LigneForme => ({ cle, libelle, saison: moy(ordre, f), recent: moy(recents, f), meilleurSiHaut: haut });
  const lignes: LigneForme[] = famille === "gardien"
    ? [ligne("arrets", "Arrêts par match", (m) => m.arrets), ligne("encaisses", "Buts encaissés par match", (m) => m.butsEncaisses, false), ligne("pc", "Passes clés par match", (m) => m.passesCles)]
    : [ligne("buts", "Buts par match", (m) => m.buts), ligne("xg", "xG par match", (m) => m.xg), ligne("tirs", "Tirs par match", (m) => m.tirs), ligne("pc", "Passes clés par match", (m) => m.passesCles), ligne("fautes", "Fautes par match", (m) => m.fautes, false)];
  return { recents: recents.length, lignes };
}

/** « 05/10/2025 » ou « 2025-10-05 » -> jour en ms (0 si illisible), pour ordonner les matchs. */
function dateTri(date: string | null): number {
  const t = (date ?? "").trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (iso) return Date.UTC(+iso[1], +iso[2] - 1, +iso[3]);
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t);
  return fr ? Date.UTC(+fr[3], +fr[2] - 1, +fr[1]) : 0;
}
