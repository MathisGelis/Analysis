// src/lib/tendances-format.ts
//
// Presentation des tendances : nombres a la francaise, libelles de series, sens
// des fleches. Fonctions pures, partagees par le rapport d'equipe, la poule et le scouting.

import type { SensTendance, TypeSerie } from "@/lib/analyse-types";

/** 1.5 -> "1,5" ; un ecart porte son signe ("+0,4"). */
export function decimal(x: number, chiffres = 1, avecSigne = false): string {
  const t = x.toFixed(chiffres).replace(".", ",");
  return avecSigne && x > 0 ? `+${t}` : t;
}

const SERIES: Record<TypeSerie, (n: number) => string> = {
  victoires: (n) => `${n} victoires de suite`,
  invaincu: (n) => `${n} matchs sans defaite`,
  defaites: (n) => `${n} defaites de suite`,
  sans_victoire: (n) => `${n} matchs sans victoire`,
  sans_encaisser: (n) => `${n} matchs sans encaisser`,
  sans_marquer: (n) => `${n} matchs sans marquer`,
  marque: (n) => `but marque sur ${n} matchs de suite`,
};

export const libelleSerie = (type: TypeSerie, longueur: number): string => SERIES[type](longueur);

/** Une serie est-elle une bonne nouvelle pour l'equipe ? */
export const serieFavorable = (type: TypeSerie): boolean =>
  type === "victoires" || type === "invaincu" || type === "sans_encaisser" || type === "marque";

/** Ton d'un sens de tendance : "hausse" est positif, sauf pour les buts encaisses (`inverse`). */
export function tonDuSens(sens: SensTendance, inverse = false): "positif" | "negatif" | "neutre" {
  if (sens === "stable" || sens === "insuffisant") return "neutre";
  return (sens === "hausse") !== inverse ? "positif" : "negatif";
}

export const LIBELLE_SENS: Record<SensTendance, string> = {
  hausse: "En hausse", baisse: "En baisse", stable: "Stable", insuffisant: "Trop tot",
};
