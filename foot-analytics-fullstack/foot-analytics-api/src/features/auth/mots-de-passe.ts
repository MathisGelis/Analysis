// src/features/auth/mots-de-passe.ts
//
// Politique des mots de passe (fonctions pures) et mots de passe temporaires.
//
// Politique (recommandations CNIL / NIST : la longueur et le refus des mots de passe connus plutot que des regles de
// composition) : 12 caracteres minimum, 128 maximum, au moins 5 caracteres distincts, pas que des chiffres, ni le
// login, ni le prenom ou le nom, ni un mot de passe courant (meme decore d'une majuscule, de chiffres ou d'un symbole
// a la fin : "Azerty123!").
//
// Mot de passe temporaire : tire au hasard (crypto), a usage unique (le compte doit le changer a la premiere
// connexion, voir AccesGuard), communique hors bande par le gestionnaire qui cree ou reinitialise le compte.

import { randomInt } from "node:crypto";

export const LONGUEUR_MIN = 12;
export const LONGUEUR_MAX = 128;

/**
 * Mots de passe parmi les plus utilises (listes publiques de fuites, variantes francaises) et mots du domaine. Compares
 * en minuscules, apres retrait des chiffres et symboles de fin.
 */
const COURANTS = new Set([
  "123456", "1234567", "12345678", "123456789", "1234567890", "azerty", "azertyuiop", "qwerty", "qwertyuiop",
  "password", "passw0rd", "motdepasse", "mot2passe", "bienvenue", "bonjour", "soleil", "loulou", "doudou", "chouchou",
  "marseille", "paris", "lyon", "olympique", "football", "footballeur", "foot", "soccer", "coach", "entraineur",
  "educateur", "admin", "administrateur", "administrator", "root", "user", "utilisateur", "login", "connexion",
  "secret", "changeme", "changemoi", "default", "defaut", "letmein", "welcome", "iloveyou", "jetaime", "princesse",
  "sunshine", "monkey", "dragon", "master", "shadow", "superman", "batman", "pokemon", "starwars", "liverpool",
  "chelsea", "arsenal", "barcelona", "realmadrid", "juventus", "psg", "allezlom", "allezlesbleus", "zidane",
  "mbappe", "ronaldo", "messi", "neymar", "france", "francais", "nicolas", "julien", "camille", "thomas", "antoine",
  "alexandre", "maxime", "quentin", "baseball", "basketball", "handball", "rugby", "tennis", "hello", "salut",
  "abcdef", "abcdefgh", "abc123", "aaaaaa", "qwerty123", "azerty123", "trustno1", "whatever", "freedom", "computer",
  "internet", "ordinateur", "portable", "samsung", "iphone", "apple", "google", "facebook", "instagram", "tiktok",
  "footanalytics", "foot-analytics", "analytics", "analyse", "club", "equipe", "seniors", "ligue", "district",
]);

/** Retire chiffres, symboles et espaces de fin ("Azerty123!" -> "azerty"). */
function racine(mdp: string): string {
  return mdp.toLowerCase().replace(/[^a-z]+$/u, "");
}

/** Raisons du refus d'un mot de passe ; liste vide = mot de passe accepte. */
export function defautsMotDePasse(
  mdp: string,
  compte: { login?: string | null; prenom?: string | null; nom?: string | null } = {},
): string[] {
  const defauts: string[] = [];
  if (typeof mdp !== "string" || mdp.length < LONGUEUR_MIN) defauts.push(`au moins ${LONGUEUR_MIN} caracteres`);
  if (typeof mdp === "string" && mdp.length > LONGUEUR_MAX) defauts.push(`au plus ${LONGUEUR_MAX} caracteres`);
  if (typeof mdp !== "string") return defauts;
  if (new Set(mdp).size < 5) defauts.push("au moins 5 caracteres differents");
  if (/^\d+$/.test(mdp)) defauts.push("pas uniquement des chiffres");
  const bas = mdp.toLowerCase();
  if (COURANTS.has(bas) || COURANTS.has(racine(mdp)) || COURANTS.has(bas.replace(/[^a-z]/g, ""))) {
    defauts.push("pas un mot de passe courant");
  }
  const personnels = [compte.login, compte.prenom, compte.nom]
    .map((x) => (x ?? "").toLowerCase().replace(/\s+/g, ""))
    .filter((x) => x.length >= 3);
  if (personnels.some((x) => bas.replace(/\s+/g, "").includes(x))) defauts.push("ni ton login, ni ton prenom, ni ton nom");
  return defauts;
}

/** Message unique pour l'API : "Mot de passe refuse : au moins 12 caracteres ; pas un mot de passe courant." */
export function messageRefus(defauts: string[]): string {
  return `Mot de passe refuse : ${defauts.join(" ; ")}.`;
}

// Sans caracteres ambigus a la lecture (0/O, 1/l/I) : le mot de passe se dicte ou se recopie.
const ALPHABET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Mot de passe temporaire aleatoire, en 4 groupes de 4 (environ 92 bits d'entropie) : "Xk7p-qR3m-..." */
export function motDePasseTemporaire(): string {
  const groupes: string[] = [];
  for (let g = 0; g < 4; g++) {
    let s = "";
    for (let i = 0; i < 4; i++) s += ALPHABET[randomInt(ALPHABET.length)];
    groupes.push(s);
  }
  return groupes.join("-");
}
