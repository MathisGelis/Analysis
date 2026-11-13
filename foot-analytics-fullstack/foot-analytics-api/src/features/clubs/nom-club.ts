// src/features/clubs/nom-club.ts
//
// Identite d'un club d'apres son NOM, partagee par l'import des feuilles de match (FMI) et par le calendrier FFF : les deux
// doivent designer le meme club, sinon le meme adversaire existe en deux exemplaires. Fonctions pures.

/** "O. Lyon Sud 2" -> "O. Lyon Sud" : le numero ou la lettre d'equipe n'est pas dans le nom du club. */
export function sansSuffixeEquipe(nom: string): string {
  return nom.trim().replace(/\s+(?:\d{1,2}|[Bb]|II|III)$/u, "").trim();
}

const PREFIXES_CLUB = /\b(fc|as|us|ol|rc|sc|sa|cs|cm|fa|fcm|fco|club|football)\b/g;

/** Cle de comparaison d'un nom de club : sans suffixe d'equipe, accents, ponctuation ni prefixes usuels (FC, AS, US...). */
export function cleNomClub(nom: string): string {
  return sansSuffixeEquipe(nom)
    .toLowerCase().normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[.,;:!?'"`/\\()]/g, " ")
    .replace(PREFIXES_CLUB, " ")
    .replace(/\s+/g, " ")
    .trim();
}
