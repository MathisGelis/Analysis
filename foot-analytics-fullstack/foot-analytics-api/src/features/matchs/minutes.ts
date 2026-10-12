// src/features/matchs/minutes.ts
//
// Minutes jouees par un joueur dans un match. Fonction pure, partagee par
// effectif(), championnat() et historique() qui en avaient chacun (ou pas du
// tout : historique() lisait la colonne, toujours 0 apres un import FMI) leur
// version.
//
// Regle : la valeur stockee sur la composition prime si elle est positive.
// Sinon on la deduit des remplacements du match :
//  - titulaire : 90, ou la minute de sa sortie ;
//  - remplacant : 90 - minute d'entree, 0 s'il n'est pas entre.

import type { Composition } from "./composition.entity";
import type { EvenementMatch } from "./evenement-match.entity";

type Compo = Pick<Composition, "minutes" | "titulaire" | "nom" | "prenom" | "cote">;
type Evt = Pick<EvenementMatch, "type" | "equipe" | "joueur" | "joueur2" | "minute">;

const norm = (s: string | null | undefined) =>
  (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/**
 * Le libelle d'evenement ("GRANGE Enzo") designe-t-il ce joueur ? On compare
 * nom ET prenom quand on les a : deux "GRANGE" dans la meme equipe (cas reel)
 * ne doivent pas se voir attribuer les remplacements l'un de l'autre.
 */
export function designeLeJoueur(libelle: string | null | undefined, compo: Pick<Composition, "nom" | "prenom">): boolean {
  const l = norm(libelle);
  const nom = norm(compo.nom);
  if (!l || !nom) return false;
  const prenom = norm(compo.prenom);
  return prenom ? l.includes(`${nom} ${prenom}`) : l.includes(nom);
}

export function minutesJouees(compo: Compo, evenementsDuMatch: Evt[]): number {
  if (typeof compo.minutes === "number" && compo.minutes > 0) return compo.minutes;

  const remplacements = evenementsDuMatch.filter(
    (e) => e.type === "remplacement" && e.equipe === compo.cote,
  );
  if (compo.titulaire) {
    const sortie = remplacements.find((r) => designeLeJoueur(r.joueur, compo));
    return sortie ? (sortie.minute ?? 90) : 90;
  }
  const entree = remplacements.find((r) => designeLeJoueur(r.joueur2, compo));
  return entree ? Math.max(0, 90 - (entree.minute ?? 90)) : 0;
}
