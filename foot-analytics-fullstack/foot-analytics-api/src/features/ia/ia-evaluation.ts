// src/features/ia/ia-evaluation.ts
//
// EVALUATION : comment juger une prediction de compo, et contre quoi la comparer. Le modele appris n'a de valeur que
// s'il fait mieux que des methodes simples sur EXACTEMENT les memes matchs, donc trois references :
//
//  - "dernier"   : le meme onze (et les memes numeros) que le dernier match ;
//  - "moteur"    : le moteur a regles actuel (features/analyse/compo-numeros.ts), celui de l'application aujourd'hui ;
//  - "frequence" : les 11 joueurs les plus souvent titulaires sur la fenetre.
//
// Note d'une prediction : part des 11 titulaires reels correctement predits (`onze`), et part des 11 couples
// (numero, joueur) corrects (`postes`, seulement quand les numeros de la feuille sont ceux de la convention). Fonctions pures.

import { analyserNumeros, FENETRE_NUMEROS, LigneFeuille } from "@/features/analyse/compo-numeros";

import type { FeuilleEquipe, LigneJoueur } from "./ia-donnees";
import { numerosDeFeuilleExploitables } from "./ia-modele";

/** Une prediction : les joueurs (cle) et, quand on les connait, leur numero. */
export type PrevisionPlate = Map<string, number | null>;

export type Methode = "modele" | "dernier" | "moteur" | "frequence";
export const METHODES: readonly Methode[] = ["modele", "dernier", "moteur", "frequence"];

export const LIBELLE_METHODE: Readonly<Record<Methode, string>> = {
  modele: "Modele appris", dernier: "Meme onze que le dernier match", moteur: "Moteur a regles actuel", frequence: "Les 11 plus souvent titulaires",
};

const titulairesDe = (f: FeuilleEquipe) => f.lignes.filter((l) => l.titulaire);

/** Les trois methodes de reference pour une equipe dont on connait l'historique (le plus recent d'abord). */
export function previsionsDeReference(recentesDAbord: readonly FeuilleEquipe[], fenetre: number): Record<Exclude<Methode, "modele">, PrevisionPlate | null> {
  if (recentesDAbord.length === 0) return { dernier: null, moteur: null, frequence: null };

  const dernier: PrevisionPlate = new Map(titulairesDe(recentesDAbord[0]).map((l) => [l.joueur, l.numero]));

  const compte = new Map<string, { n: number; nom: string }>();
  for (const f of recentesDAbord.slice(0, fenetre)) {
    for (const l of titulairesDe(f)) compte.set(l.joueur, { n: (compte.get(l.joueur)?.n ?? 0) + 1, nom: l.nom });
  }
  const parFrequence = [...compte].sort((a, b) => b[1].n - a[1].n || a[1].nom.localeCompare(b[1].nom) || a[0].localeCompare(b[0]));
  const frequence: PrevisionPlate = new Map(parFrequence.slice(0, 11).map(([joueur]) => [joueur, null]));

  // Le moteur actuel : un joueur par numero quand les numeros sont exploitables, sinon les 11 plus utilises.
  const lignes: LigneFeuille[] = recentesDAbord.flatMap((f) => f.lignes.map((l) => ({
    matchId: f.matchId, date: f.date, journee: f.journee, joueur: l.joueur, nom: l.nom, numero: l.numero, titulaire: l.titulaire,
  })));
  const numeros = analyserNumeros(lignes, FENETRE_NUMEROS);
  const moteur: PrevisionPlate = numeros.fiabilite.exploitable
    ? new Map(numeros.onze.filter((p) => p.joueur).map((p) => [p.joueur!, p.numero]))
    : frequence;
  return { dernier, moteur, frequence };
}

export interface Note {
  /** Part des 11 titulaires reels predits (0 a 1). */
  onze: number;
  /** Part des 11 couples (numero, joueur) exacts ; null si les numeros de la feuille ne sont pas lisibles ou pas predits. */
  postes: number | null;
}

/** Note une prediction contre la feuille reelle. */
export function noter(prevision: PrevisionPlate, reels: readonly LigneJoueur[]): Note {
  const titulaires = reels.filter((l) => l.titulaire);
  const onze = titulaires.filter((l) => prevision.has(l.joueur)).length / 11;
  const numerosConnus = [...prevision.values()].some((n) => n !== null);
  const postes = numerosDeFeuilleExploitables(titulaires) && numerosConnus
    ? titulaires.filter((l) => prevision.get(l.joueur) === l.numero).length / 11
    : null;
  return { onze, postes };
}

/* ------------------------------------------- agregats ------------------------------------------- */

/** Moyennes cumulees : onze (toutes les feuilles notees) et postes (celles dont les numeros sont lisibles). */
export class Agregat {
  n = 0;
  private sommeOnze = 0;
  nPostes = 0;
  private sommePostes = 0;
  parfaits = 0;

  ajouter(note: Note): void {
    this.n++;
    this.sommeOnze += note.onze;
    if (note.onze >= 1 - 1e-9) this.parfaits++;
    if (note.postes !== null) { this.nPostes++; this.sommePostes += note.postes; }
  }

  fusionner(autre: Agregat): void {
    this.n += autre.n; this.sommeOnze += autre.sommeOnze; this.nPostes += autre.nPostes;
    this.sommePostes += autre.sommePostes; this.parfaits += autre.parfaits;
  }

  get onze(): number | null { return this.n ? this.sommeOnze / this.n : null; }
  get postes(): number | null { return this.nPostes ? this.sommePostes / this.nPostes : null; }
}

/** Resume serialisable d'un agregat (valeurs arrondies a 4 decimales). */
export interface ResumeNote { n: number; onze: number | null; postes: number | null; nPostes: number; parfaits: number }

const arrondi = (x: number | null, d = 4): number | null => (x === null ? null : +x.toFixed(d));

export const resumer = (a: Agregat): ResumeNote => ({ n: a.n, onze: arrondi(a.onze), postes: arrondi(a.postes), nPostes: a.nPostes, parfaits: a.parfaits });
export { arrondi };

export type Agregats = Record<Methode, Agregat>;
export const agregatsVides = (): Agregats => ({ modele: new Agregat(), dernier: new Agregat(), moteur: new Agregat(), frequence: new Agregat() });
export const resumerTous = (a: Agregats): Record<Methode, ResumeNote> => ({
  modele: resumer(a.modele), dernier: resumer(a.dernier), moteur: resumer(a.moteur), frequence: resumer(a.frequence),
});
