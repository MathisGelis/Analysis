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

const PARTICULES = new Set(["de", "du", "des", "la", "le", "les", "sur", "sous", "en", "et", "d", "l", "au", "aux"]);
const PREFIXES = new Set(["fc", "as", "us", "ol", "rc", "sc", "sa", "cs", "cm", "fa", "fcm", "fco", "club", "football"]);

function motsDuClub(nom: string): string[] {
  return sansSuffixeEquipe(nom).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim().split(" ").filter(Boolean);
}

/**
 * « FCLCR » est-il l'abrege de « FC Lyon Croix Rousse » ? Les feuilles de match (FMI) abregent parfois le nom du club en sigle,
 * alors que le calendrier FFF donne le nom complet. Vrai si l'abrege se decoupe en prefixes successifs des mots du nom complet
 * (initiales : FCLCR ; ou debuts de mots : FCLYONCR) ; seuls les prefixes usuels (FC, AS...) et les particules peuvent manquer.
 * Prudent : au moins trois mots significatifs, trois lettres, et ce n'est pas le nom lui-meme ecrit tel quel.
 */
export function estAbregeDe(abrege: string, complet: string): boolean {
  const a = motsDuClub(abrege).join("");
  const mots = motsDuClub(complet).filter((m) => !PARTICULES.has(m));
  if (a.length < 3 || mots.filter((m) => !PREFIXES.has(m)).length < 2 || mots.length < 3) return false;
  if (a === mots.join("")) return false;
  const lire = (i: number, j: number): boolean => {
    if (i === mots.length) return j === a.length;
    const mot = mots[i];
    if (PREFIXES.has(mot) && lire(i + 1, j)) return true;
    for (let k = Math.min(mot.length, a.length - j); k >= 1; k--) {
      if (a.startsWith(mot.slice(0, k), j) && lire(i + 1, j + k)) return true;
    }
    return false;
  };
  return lire(0, 0);
}

/** Le club existant dont `nom` est l'abrege (ou dont le nom est l'abrege de `nom`), s'il n'y en a qu'un ; sinon undefined. */
export function clubParAbrege(nom: string, clubs: { id: string; nom: string }[]): string | undefined {
  const hits = clubs.filter((c) => estAbregeDe(c.nom, nom) || estAbregeDe(nom, c.nom));
  return hits.length === 1 ? hits[0].id : undefined;
}
