// src/shared/lib/formation.ts
//
// Le NOM d'un dispositif tel qu'on l'affiche. Le 4-4-2 losange s'ecrit 4-1-2-1-2 (meme notation que les autres : un milieu defensif,
// deux milieux excentres, un meneur, deux attaquants), donc il passe partout ; on affiche « 4-4-2 losange ».

export const FORMATION_LOSANGE = "4-1-2-1-2";

const LIBELLES: Record<string, string> = { [FORMATION_LOSANGE]: "4-4-2 losange" };

/** « 4-4-2 losange » pour 4-1-2-1-2, sinon le dispositif tel quel (vide : vide). */
export function libelleFormation(formation: string): string;
export function libelleFormation(formation: string | null | undefined): string | null | undefined;
export function libelleFormation(formation: string | null | undefined): string | null | undefined {
  return formation ? LIBELLES[formation] ?? formation : formation;
}
