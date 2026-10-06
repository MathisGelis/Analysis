// src/features/shell/lib/acces-pages.ts
//
// QUI PEUT OUVRIR QUELLE PAGE : une seule table, lue par la navigation (elle masque les entrees fermees) et par les pages
// elles-memes (elles refusent l'URL tapee a la main). Fonctions pures.
//
//  - saison passee : la preparation du prochain match (entrainements, tactique, predictions et rapport pre-match) n'a de
//    sens que sur la saison en cours ou a venir : sur une saison anterieure a la saison en cours, ces pages sont fermees.
//    Tout le reste (matchs, classement, effectif, medical, analyse d'equipe...) reste consultable.
//  - administrateur : les saisons (creation, activation, suppression) et l'IA ne sont pas des pages d'educateur.
//
// Ce n'est que de l'affichage : le serveur applique lui-meme les droits sur chaque donnee (features/acces cote API).

import type { ModeSaison } from "@/features/saisons/lib/saison-mode";

export type RestrictionPage = "saison-passee" | "admin";

export interface ContexteAccesPages {
  role?: string | null;
  /** Position de la saison choisie par rapport a la saison en cours. */
  mode: ModeSaison;
}

/** Pages fermees quand la saison choisie precede la saison en cours. */
export const PAGES_SAISON_EN_COURS: readonly string[] = ["/entrainements", "/tactique", "/ia", "/rapports/prematch"];

/** Pages reservees a l'administrateur. */
export const PAGES_ADMIN: readonly string[] = ["/saisons", "/admin/ia"];

const sousChemin = (chemin: string, prefixe: string) => chemin === prefixe || chemin.startsWith(`${prefixe}/`);

/** Pourquoi cette page est fermee a ce compte, ou null si elle est ouverte. */
export function restrictionDe(chemin: string, ctx: ContexteAccesPages): RestrictionPage | null {
  if (PAGES_ADMIN.some((p) => sousChemin(chemin, p)) && ctx.role !== "admin") return "admin";
  if (ctx.mode === "passee" && PAGES_SAISON_EN_COURS.some((p) => sousChemin(chemin, p))) return "saison-passee";
  return null;
}

export const pageAccessible = (chemin: string, ctx: ContexteAccesPages): boolean => restrictionDe(chemin, ctx) === null;
