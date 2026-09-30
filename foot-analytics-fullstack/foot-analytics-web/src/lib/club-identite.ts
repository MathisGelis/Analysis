// src/lib/club-identite.ts
//
// Identite visuelle d'un club quand la base n'en fournit pas : initiales
// deduites du nom FFF et teinte / motif d'ecusson choisis de facon
// DETERMINISTE a partir de l'identifiant. Fonctions pures.
//
// Pourquoi : les clubs importes des FMI ont tous la couleur par defaut
// (#b6f24a) et une abreviation prise sur les 3 premiers caracteres du nom
// ("O. " pour O. Lyon Sud). Les teintes viennent des variables du theme, pas
// de couleurs codees en dur : l'ecusson suit le mode clair / sombre.

// Jamais "danger" (rouge d'alerte) : un ecusson ne doit pas se lire comme un etat.
export type Teinte = "accent" | "sky" | "amber" | "crest-violet" | "crest-teal" | "crest-rose";
export const TEINTES: Teinte[] = ["accent", "sky", "amber", "crest-violet", "crest-teal", "crest-rose"];
/** 0 uni, 1 bandeau, 2 ecartele vertical, 3 chevron. */
export const NB_MOTIFS = 4;

/** Couleur par defaut inseree en base pour tous les clubs : "aucune couleur choisie". */
export const COULEUR_PAR_DEFAUT = "#b6f24a";

// Mots d'appareil des noms de clubs (statut juridique, "de", "saint"...) : ils
// n'identifient pas le club. Compares SANS points ni accents.
const MOTS_VIDES = new Set([
  "fc", "as", "os", "cs", "ol", "ev", "es", "ent", "am", "laiq", "sc", "afc", "us", "rc",
  "st", "ste", "de", "du", "des", "la", "le", "les", "en", "et", "club", "football",
  "association", "associat", "sportive", "olympique", "entente", "amicale", "union",
]);

function mots(nom: string): string[] {
  return nom.toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * "O. Lyon Sud" -> "LS", "F.C. Meys Grezieu" -> "MG", "Neuville S/S" -> "NEU",
 * "Scol" -> "SCO". Deux mots significatifs : leurs initiales ; un seul : ses
 * trois premieres lettres.
 */
export function initialesClub(nom: string | null | undefined): string {
  const tous = mots(nom ?? "");
  // Les lettres isolees ("O", "S" de "S/S") sont des sigles, pas des mots.
  let utiles = tous.filter((m) => m.length > 1 && !MOTS_VIDES.has(m));
  if (utiles.length === 0) utiles = tous.filter((m) => m.length > 1);
  if (utiles.length === 0) return (tous.join("").slice(0, 3) || "?").toUpperCase();
  if (utiles.length === 1) return utiles[0].slice(0, 3).toUpperCase();
  return (utiles[0][0] + utiles[1][0]).toUpperCase();
}

/** djb2 : hash stable et sans dependance. */
export function hashTexte(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export interface IdentiteClub {
  initiales: string;
  teinte: Teinte;
  motif: number;
  /** Couleur personnalisee (hex) si le club en a une, sinon null : on utilise la teinte du theme. */
  couleurPerso: string | null;
}

export function identiteClub(club: {
  id: string; nom?: string | null; abbr?: string | null; couleur?: string | null;
}): IdentiteClub {
  const h = hashTexte(club.id);
  const perso = club.couleur && /^#[0-9a-f]{6}$/i.test(club.couleur)
    && club.couleur.toLowerCase() !== COULEUR_PAR_DEFAUT
    ? club.couleur
    : null;
  return {
    initiales: initialesClub(club.nom ?? club.abbr ?? ""),
    teinte: TEINTES[h % TEINTES.length],
    motif: Math.floor(h / TEINTES.length) % NB_MOTIFS,
    couleurPerso: perso,
  };
}
