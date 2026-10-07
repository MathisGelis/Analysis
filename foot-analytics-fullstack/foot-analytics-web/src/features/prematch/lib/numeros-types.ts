// src/features/prematch/lib/numeros-types.ts
//
// Ce que le serveur lit dans les numeros de maillot (foot-analytics-api/src/features/analyse/compo-numeros.ts et
// systeme-probable.ts) : onze par poste, polyvalence, indices de systeme. Le serveur reste la source.
// Convention : 1 gardien, 2 DD, 3 DG, 4 DCD, 5 DCG, 6 MDC, 7 AG, 8 MC, 9 BU, 10 MO, 11 AD.

export type Fiabilite = "faible" | "moyenne" | "bonne";

export interface PosteProbable {
  numero: number;
  /** Code de poste de la convention : GB, DD, DG, DCD, DCG, MDC, AG, MC, BU, MO, AD. */
  poste: string;
  joueur: string | null;
  nom: string | null;
  /** Titularisations de ce joueur avec ce numero (0 quand il est la a defaut). */
  fois: number;
  /** numero : il porte ce numero ; ligne : a defaut, un titulaire de la meme ligne ; null : personne. */
  origine: "numero" | "ligne" | null;
  autres: { nom: string; fois: number }[];
}

export interface IndiceNumeros {
  regle: string;
  nom: string;
  numeros: [number, number];
  fois: [number, number];
  force: number;
  texte: string;
}

export interface ProfilJoueurNumeros {
  joueur: string;
  nom: string;
  titularisations: number;
  numeros: { numero: number; poste: string; fois: number }[];
  principal: string | null;
  polyvalent: boolean;
}

export interface StructureNumeros {
  defense: { lignes: number; part: number } | null;
  attaque: { attaquants: number; part: number } | null;
}

export interface AnalyseNumeros {
  matchs: number;
  fiabilite: { titulaires: number; dansLesOnze: number; part: number; exploitable: boolean };
  profils: ProfilJoueurNumeros[];
  onze: PosteProbable[];
  indices: IndiceNumeros[];
  systeme: { systeme: string; confiance: number; fiabilite: "faible" | "moyenne"; distribution: { systeme: string; poids: number }[]; preuves: number } | null;
  structure: StructureNumeros;
  notes: string[];
}

/** Systeme probable : dispositifs saisis par le staff et changements de numero, fusionnes. */
export interface SystemeProbableDonnees {
  systeme: string;
  confiance: number;
  fiabilite: Fiabilite;
  /** renseigne : dispositifs saisis seuls ; numeros : changements de numero seuls ; mixte : les deux. */
  source: "renseigne" | "numeros" | "mixte";
  observations: number;
  matchsNumeros: number;
  alternatives: { systeme: string; poids: number }[];
  indices: string[];
  /** Present quand le dispositif a ete choisi par le modele de l'IA actif plutot que par le moteur a regles. */
  modele?: { nom: string };
  structure: StructureNumeros;
  /** Ou se placent les numeros 1 a 11 (les lignes, du defenseur a l'attaquant, gardien exclu). */
  disposition: number[][];
}
