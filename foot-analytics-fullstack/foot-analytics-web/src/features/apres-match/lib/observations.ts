// src/features/apres-match/lib/observations.ts
//
// Les observations de l'adversaire apres le match (voir foot-analytics-api/src/features/apres-match/observations-adversaire.ts) :
// types de l'API et petites fonctions pures qui font evoluer les valeurs d'une section a chaque appui. Le catalogue (sections,
// champs, choix) vient du serveur : l'ecran l'affiche tel quel.

export type TypeChamp = "choix" | "multi" | "note" | "texte" | "joueurs";
export interface ChampObservation { id: string; libelle: string; type: TypeChamp; options?: string[] }
export interface SectionObservation { id: string; titre: string; aide?: string; champs: ChampObservation[] }
export interface JoueurObserve { numero: number; commentaire?: string }
export type ValeurChamp = string | string[] | number | JoueurObserve[];
export type ValeursSection = Record<string, ValeurChamp>;
export type Observations = Record<string, ValeursSection>;

export interface EtatObservations {
  adversaireId: string;
  catalogue: SectionObservation[];
  valeurs: Observations;
  avancement: { sections: number; total: number };
  modifieLe: string | null;
}

export const MAX_JOUEURS = 3;
export const MAX_TEXTE = 300;

/** Un champ « choix » : l'option choisie ; un second appui sur la meme option la retire. */
export function choisir(v: ValeursSection, champ: string, option: string): ValeursSection {
  const suivant = { ...v };
  if (suivant[champ] === option) delete suivant[champ]; else suivant[champ] = option;
  return suivant;
}

/** Un champ « multi » : l'option est ajoutee ou retiree (dans l'ordre du catalogue). */
export function basculer(v: ValeursSection, champ: string, option: string, options: string[]): ValeursSection {
  const actuel = Array.isArray(v[champ]) ? (v[champ] as string[]) : [];
  const liste = actuel.includes(option) ? actuel.filter((o) => o !== option) : options.filter((o) => o === option || actuel.includes(o));
  const suivant = { ...v };
  if (liste.length === 0) delete suivant[champ]; else suivant[champ] = liste;
  return suivant;
}

/** Une note de 1 a 5 ; un second appui sur la meme note l'efface. */
export function noter(v: ValeursSection, champ: string, note: number): ValeursSection {
  const suivant = { ...v };
  if (suivant[champ] === note) delete suivant[champ]; else suivant[champ] = note;
  return suivant;
}

/** Un texte court ; vide, il est retire. Rogne a la longueur permise. */
export function ecrire(v: ValeursSection, champ: string, texte: string): ValeursSection {
  const suivant = { ...v };
  if (texte.trim() === "") delete suivant[champ]; else suivant[champ] = texte.slice(0, MAX_TEXTE);
  return suivant;
}

/** Les joueurs observes (numero + commentaire), a l'ecran dans l'ordre saisi. */
export const lireJoueurs = (v: ValeursSection, champ: string): JoueurObserve[] => (Array.isArray(v[champ]) ? (v[champ] as JoueurObserve[]) : []);

export function ecrireJoueurs(v: ValeursSection, champ: string, joueurs: JoueurObserve[]): ValeursSection {
  const suivant = { ...v };
  if (joueurs.length === 0) delete suivant[champ]; else suivant[champ] = joueurs;
  return suivant;
}

/** Ajoute un joueur (au plus trois, sans doublon de numero) : numero 0 = a renseigner. */
export function ajouterJoueur(joueurs: JoueurObserve[]): JoueurObserve[] {
  return joueurs.length >= MAX_JOUEURS ? joueurs : [...joueurs, { numero: 0 }];
}

/** Les numeros a corriger avant d'enregistrer : hors 1-99 ou en double. Vide : la liste peut partir. */
export function erreursJoueurs(joueurs: JoueurObserve[]): string | null {
  const numeros = joueurs.map((j) => j.numero);
  if (numeros.some((n) => !Number.isInteger(n) || n < 1 || n > 99)) return "Numéro de maillot : de 1 à 99.";
  if (new Set(numeros).size !== numeros.length) return "Un numéro ne peut être cité qu'une fois.";
  return null;
}

/**
 * Ce qui peut partir au serveur : les joueurs dont le numero est invalide (0, hors 1-99) ou deja cite sont laisses de cote tant qu'ils ne
 * sont pas corriges ; le reste de la section part normalement.
 */
export function pourEnvoi(v: ValeursSection): ValeursSection {
  const sortie: ValeursSection = {};
  for (const [cle, valeur] of Object.entries(v)) {
    if (Array.isArray(valeur) && valeur.length > 0 && typeof valeur[0] === "object") {
      const vus = new Set<number>();
      const liste = (valeur as JoueurObserve[]).filter((j) => {
        if (!Number.isInteger(j.numero) || j.numero < 1 || j.numero > 99 || vus.has(j.numero)) return false;
        vus.add(j.numero);
        return true;
      });
      if (liste.length > 0) sortie[cle] = liste;
    } else sortie[cle] = valeur;
  }
  return sortie;
}

/** Une section contient-elle quelque chose ? */
export const sectionRemplie = (v: ValeursSection | undefined): boolean => !!v && Object.keys(v).length > 0;

export const nbRemplies = (o: Observations): number => Object.values(o).filter(sectionRemplie).length;
