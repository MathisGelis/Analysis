// src/features/joueurs/lib/vues-effectif.ts
//
// Les « vues » de l'effectif, a la maniere de Football Manager : meme liste de joueurs, mais chaque vue
// n'affiche que les colonnes d'un theme (general, stats, medical, discipline, profil). Fonctions pures :
// la vue est un simple identifiant, les colonnes viennent du tableau ci-dessous.

export type VueEffectif = "general" | "stats" | "medical" | "discipline" | "profil";

export const VUES_EFFECTIF: { id: VueEffectif; libelle: string }[] = [
  { id: "general", libelle: "Général" },
  { id: "stats", libelle: "Stats" },
  { id: "medical", libelle: "Médical / Forme" },
  { id: "discipline", libelle: "Discipline" },
  { id: "profil", libelle: "Profil" },
];

/** Colonnes de chaque vue (le joueur est toujours en premier, les actions toujours en dernier). */
export const COLONNES_VUE: Record<VueEffectif, string[]> = {
  general: ["poste", "matchs", "titularisations", "minutes", "note", "fatigue", "buts", "passes", "jaunes", "rouges", "statut", "postes"],
  stats: ["poste", "matchs", "titularisations", "minutes", "minParMatch", "note", "buts", "passes", "butsParMatch", "contributions"],
  medical: ["poste", "fatigue", "acwr", "charge7", "charge28", "blessures", "matchs", "minutes", "statut"],
  discipline: ["poste", "matchs", "jaunes", "rouges", "jaunesParMatch", "scoreDiscipline", "profilDiscipline"],
  profil: ["poste", "age", "taille", "poids", "pied", "postes", "numero", "statut"],
};

export const VUE_PAR_DEFAUT: VueEffectif = "general";

export function lireVue(brut: string | null | undefined): VueEffectif {
  return VUES_EFFECTIF.some((v) => v.id === brut) ? (brut as VueEffectif) : VUE_PAR_DEFAUT;
}

/** Age au jour donne, depuis une date « jj/mm/aaaa » ou « aaaa-mm-jj » ; null si la date est absente ou illisible. */
export function ageAu(naissance: string | null | undefined, jour: Date): number | null {
  if (!naissance) return null;
  const fr = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(naissance);
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(naissance);
  const [a, m, j] = fr ? [+fr[3], +fr[2], +fr[1]] : iso ? [+iso[1], +iso[2], +iso[3]] : [NaN, NaN, NaN];
  if (!(a > 1900) || m < 1 || m > 12 || j < 1 || j > 31) return null;
  let age = jour.getFullYear() - a;
  if (jour.getMonth() + 1 < m || (jour.getMonth() + 1 === m && jour.getDate() < j)) age--;
  return age >= 0 && age < 100 ? age : null;
}

/** Rapport « par match » arrondi a 2 decimales ; null sans match. */
export const parMatch = (total: number | null | undefined, matchs: number | null | undefined): number | null =>
  matchs ? Math.round(((total ?? 0) / matchs) * 100) / 100 : null;
