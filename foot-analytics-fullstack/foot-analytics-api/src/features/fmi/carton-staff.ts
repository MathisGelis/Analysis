// src/features/fmi/carton-staff.ts
//
// UN CARTON PEUT VISER LE BANC : la FMI liste dans le meme tableau les sanctions des joueurs et celles des entraineurs et
// dirigeants. Un carton de membre du staff n'est pas celui d'un joueur : il ne compte ni dans la discipline des joueurs, ni
// dans les suspensions, ni dans les "joueurs a surveiller". Il est range a part (evenement "carton_staff"), et crédité au
// coach. Fonction pure.

import { normaliser } from "@/common/fuzzy";

export interface PersonneFeuille { licence?: string | null; nom: string }

/** Les mots d'un nom, sans accents ni ordre : "DELORME Eric" == "Eric DELORME". */
const mots = (s: string) => normaliser(s).split(" ").filter(Boolean).sort().join(" ");

/**
 * Ce carton est-il celui d'un membre du staff ? Oui si sa licence est celle d'un membre de l'encadrement du match et pas
 * celle d'un joueur de la feuille ; sans licence exploitable, si son nom est celui d'un membre de l'encadrement et d'aucun
 * joueur de la feuille.
 */
export function estCartonDuStaff(
  carton: { licence?: string | null; joueur: string },
  joueursFeuille: readonly PersonneFeuille[],
  encadrement: readonly PersonneFeuille[],
): boolean {
  const lic = (carton.licence ?? "").trim();
  if (lic) {
    if (joueursFeuille.some((j) => (j.licence ?? "").trim() === lic)) return false;
    if (encadrement.some((s) => (s.licence ?? "").trim() === lic)) return true;
  }
  const nom = mots(carton.joueur);
  if (!nom) return false;
  if (joueursFeuille.some((j) => mots(j.nom) === nom)) return false;
  return encadrement.some((s) => mots(s.nom) === nom);
}
