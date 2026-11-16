// src/features/avant-match/lib/terrain-avant.ts
//
// La composition de depart sur le terrain : ou poser chacun des 11 postes d'un dispositif, affecter un joueur, composer le banc.
// Fonctions pures (la regle des joueurs mutes reste verifiee par l'API a l'enregistrement).

import { MAX_REMPLACANTS, NB_TITULAIRES, parseFormation, slotsDeFormation } from "@/features/tactique/lib/composition";

export interface PosteTerrain { index: number; libelle: string; x: number; y: number }

/** Les 11 postes, en % du terrain (l'attaque en haut, le gardien en bas), dans l'ordre des titulaires de l'API. */
export function postesDeFormation(formation: string): PosteTerrain[] {
  const lignes = parseFormation(formation) ?? [4, 4, 2];
  const slots = slotsDeFormation(formation);
  const postes: PosteTerrain[] = [{ index: 0, libelle: slots[0].libelle, x: 50, y: 91 }];
  const haut = 12, bas = 70;
  let index = 1;
  lignes.forEach((nb, li) => {
    // La premiere ligne (defense) est la plus basse, la derniere (attaque) la plus haute.
    const y = lignes.length === 1 ? (haut + bas) / 2 : bas - (li * (bas - haut)) / (lignes.length - 1);
    for (let k = 0; k < nb; k++) postes.push({ index: index, libelle: slots[index].libelle, x: Math.round(((k + 1) / (nb + 1)) * 100), y: Math.round(y) }), index++;
  });
  return postes;
}

/** Les 11 cases, completees si la liste est plus courte ("" = poste vide). */
export const onzeComplet = (titulaires: readonly (string | null)[]): string[] =>
  Array.from({ length: NB_TITULAIRES }, (_, i) => titulaires[i] || "");

/** Pose `joueurId` sur le poste ; il quitte le banc et son ancien poste. `""` libere le poste. */
export function affecter(titulaires: readonly string[], remplacants: readonly string[], index: number, joueurId: string) {
  const onze = onzeComplet(titulaires).map((id) => (joueurId && id === joueurId ? "" : id));
  onze[index] = joueurId;
  return { titulaires: onze, remplacants: remplacants.filter((id) => id !== joueurId) };
}

/** Met le joueur sur le banc, ou l'en retire. Un titulaire ne va pas sur le banc ; le banc est plafonne. */
export function basculerBanc(titulaires: readonly string[], remplacants: readonly string[], joueurId: string): string[] {
  if (titulaires.includes(joueurId)) return [...remplacants];
  if (remplacants.includes(joueurId)) return remplacants.filter((id) => id !== joueurId);
  return remplacants.length >= MAX_REMPLACANTS ? [...remplacants] : [...remplacants, joueurId];
}

/** Changer de dispositif garde les joueurs a leur rang : seule la disposition sur le terrain change. */
export const changerDispositif = (titulaires: readonly string[]) => onzeComplet(titulaires);

export const nbTitulaires = (titulaires: readonly string[]): number => titulaires.filter(Boolean).length;
