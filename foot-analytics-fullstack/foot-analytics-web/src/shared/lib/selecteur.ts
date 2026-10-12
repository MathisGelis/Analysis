// src/shared/lib/selecteur.ts
//
// Logique pure de la liste deroulante maison (shared/ui/Select.tsx) : filtre, groupes, navigation au
// clavier et saisie de la premiere lettre. Tout travaille sur des index de la liste AFFICHEE.

export interface OptionSelect {
  valeur: string;
  libelle: string;
  /** Texte secondaire (raison d'une option grisee, ville d'un club...). */
  detail?: string;
  /** Titre de groupe : les options d'un meme groupe sont regroupees, dans l'ordre d'apparition. */
  groupe?: string;
  desactive?: boolean;
}

/** Options dont la valeur est aussi le libelle (une liste de postes, de statuts...). */
export const optionsSimples = (valeurs: readonly string[]): OptionSelect[] => valeurs.map((v) => ({ valeur: v, libelle: v }));

/** Minuscules sans accents : "Équipe" et "equipe" se retrouvent. */
export const normaliser = (s: string) =>
  s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

/** Options dont le libelle, le detail ou le groupe contient chaque mot de la requete (dans n'importe quel ordre). */
export function filtrerOptions(options: OptionSelect[], requete: string): OptionSelect[] {
  const mots = normaliser(requete).split(/\s+/).filter(Boolean);
  if (mots.length === 0) return options;
  return options.filter((o) => {
    const texte = normaliser(`${o.libelle} ${o.detail ?? ""} ${o.groupe ?? ""}`);
    return mots.every((m) => texte.includes(m));
  });
}

export interface GroupeOptions {
  titre: string | null;
  options: { option: OptionSelect; index: number }[];
}

/**
 * Options regroupees par titre, dans l'ordre ou chaque groupe apparait ; les options sans groupe restent a leur place.
 * `index` est la position dans la liste d'origine : la navigation clavier ne depend pas du regroupement.
 */
export function grouperOptions(options: OptionSelect[]): GroupeOptions[] {
  const resultat: GroupeOptions[] = [];
  options.forEach((option, index) => {
    const titre = option.groupe ?? null;
    let groupe = titre === null ? resultat[resultat.length - 1] : resultat.find((g) => g.titre === titre);
    if (!groupe || (titre === null && groupe.titre !== null)) {
      groupe = { titre, options: [] };
      resultat.push(groupe);
    }
    groupe.options.push({ option, index });
  });
  return resultat;
}

/** Index de la premiere option selectionnable (non grisee), ou -1. */
export const premierActif = (options: OptionSelect[]) => options.findIndex((o) => !o.desactive);

/** Index de la derniere option selectionnable, ou -1. */
export function dernierActif(options: OptionSelect[]): number {
  for (let i = options.length - 1; i >= 0; i--) if (!options[i].desactive) return i;
  return -1;
}

/** Option selectionnable suivante (pas = 1) ou precedente (pas = -1) ; on reste sur place en bout de liste. */
export function indexSuivant(options: OptionSelect[], depuis: number, pas: 1 | -1): number {
  for (let i = depuis + pas; i >= 0 && i < options.length; i += pas) {
    if (!options[i].desactive) return i;
  }
  return depuis;
}

/**
 * Saisie de la premiere lettre, comme une liste native : "ma" saute a la premiere option qui commence par "ma" ; une
 * meme lettre repetee ("m", "m") passe a l'option suivante qui commence par cette lettre.
 */
export function indexParFrappe(options: OptionSelect[], frappe: string, depuis: number): number {
  const f = normaliser(frappe);
  if (!f) return depuis;
  const repetition = f.length > 1 && [...f].every((c) => c === f[0]);
  const cible = repetition ? f[0] : f;
  const commence = (i: number) => !options[i].desactive && normaliser(options[i].libelle).startsWith(cible);
  const debut = repetition || f.length === 1 ? depuis + 1 : Math.max(depuis, 0);
  for (let k = 0; k < options.length; k++) {
    const i = (debut + k) % options.length;
    if (commence(i)) return i;
  }
  return depuis;
}
