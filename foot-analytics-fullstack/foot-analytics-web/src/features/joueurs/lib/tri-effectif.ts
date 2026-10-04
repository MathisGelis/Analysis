// src/features/joueurs/lib/tri-effectif.ts
//
// Tri de l'effectif par n'importe quelle colonne de stats. Fonction pure, sans dependance a l'ecran.
// Une valeur absente (pas de fatigue calculee, pas de note...) reste toujours en fin de liste, quel que
// soit le sens : trier "du plus au moins fatigue" ne doit pas mettre en tete les joueurs sans donnee.

import type { Joueur } from "@/shared/lib/types";

export type CleTri =
  | "nom" | "poste" | "matchs" | "titularisations" | "minutes" | "note" | "fatigue"
  | "buts" | "passes" | "jaunes" | "rouges" | "discipline" | "statut";
export type Sens = "asc" | "desc";

export interface ColonneTri { cle: CleTri; libelle: string; sensParDefaut: Sens }

/** Libelles du selecteur de tri, dans l'ordre d'affichage. */
export const COLONNES_TRI: ColonneTri[] = [
  { cle: "nom", libelle: "Nom", sensParDefaut: "asc" },
  { cle: "poste", libelle: "Poste", sensParDefaut: "asc" },
  { cle: "matchs", libelle: "Matchs", sensParDefaut: "desc" },
  { cle: "titularisations", libelle: "Titularisations", sensParDefaut: "desc" },
  { cle: "minutes", libelle: "Minutes", sensParDefaut: "desc" },
  { cle: "note", libelle: "Note", sensParDefaut: "desc" },
  { cle: "fatigue", libelle: "Fatigue", sensParDefaut: "desc" },
  { cle: "buts", libelle: "Buts", sensParDefaut: "desc" },
  { cle: "passes", libelle: "Passes decisives", sensParDefaut: "desc" },
  { cle: "jaunes", libelle: "Cartons jaunes", sensParDefaut: "desc" },
  { cle: "rouges", libelle: "Cartons rouges", sensParDefaut: "desc" },
  { cle: "discipline", libelle: "Discipline", sensParDefaut: "desc" },
  { cle: "statut", libelle: "Statut", sensParDefaut: "asc" },
];

export function sensParDefaut(cle: CleTri): Sens {
  return COLONNES_TRI.find((c) => c.cle === cle)?.sensParDefaut ?? "desc";
}

/** Ordre des postes sur le terrain, du gardien aux attaquants ; un poste inconnu passe apres. */
const RANG_POSTE = ["GB", "DD", "DC", "DG", "MD", "MC", "MIL", "MO", "MG", "AD", "AT", "AG"];
const rangPoste = (p: string | undefined) => {
  const i = RANG_POSTE.indexOf((p ?? "").toUpperCase());
  return i < 0 ? RANG_POSTE.length : i;
};

/** Valeur de tri : un nombre, une chaine, ou null quand la donnee manque. */
function valeur(j: Joueur, cle: CleTri): number | string | null {
  switch (cle) {
    case "nom": return `${j.nom} ${j.prenom ?? ""}`.trim();
    case "poste": return j.poste ? rangPoste(j.poste) : null;
    case "matchs": return j.matchs ?? 0;
    case "titularisations": return j.titularisations ?? 0;
    case "minutes": return j.minutes ?? 0;
    case "note": return j.noteMoyenne ?? null;
    case "fatigue": return j.scoreFatigue ?? null;
    case "buts": return j.buts ?? 0;
    case "passes": return j.passesDecisives ?? 0;
    case "jaunes": return j.cartonsJaunes ?? 0;
    case "rouges": return j.cartonsRouges ?? 0;
    // Un rouge pese trois jaunes, comme l'ancien tri "discipline".
    case "discipline": return (j.cartonsJaunes ?? 0) + (j.cartonsRouges ?? 0) * 3;
    case "statut": return j.statutMutation ?? null;
  }
}

const parNom = (a: Joueur, b: Joueur) =>
  a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" }) || (a.prenom ?? "").localeCompare(b.prenom ?? "", "fr", { sensitivity: "base" });

export function trierEffectif(joueurs: Joueur[], cle: CleTri, sens: Sens): Joueur[] {
  const direction = sens === "asc" ? 1 : -1;
  return [...joueurs].sort((a, b) => {
    const va = valeur(a, cle), vb = valeur(b, cle);
    if (va === null && vb === null) return parNom(a, b);
    if (va === null) return 1;            // sans donnee : toujours en fin de liste
    if (vb === null) return -1;
    const ordre = typeof va === "string" || typeof vb === "string"
      ? String(va).localeCompare(String(vb), "fr", { sensitivity: "base" })
      : (va as number) - (vb as number);
    // A egalite : ordre alphabetique, dans le meme sens pour ne pas melanger la lecture.
    return ordre !== 0 ? ordre * direction : parNom(a, b);
  });
}
