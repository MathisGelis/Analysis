// src/features/ia/ia-decision.ts
//
// LA REGLE DE SECURITE du reentrainement automatique : un nouveau modele ne remplace le modele actif que s'il fait AU
// MOINS AUSSI BIEN que lui. Sinon il est garde dans l'historique des modeles (rien n'est perdu) et l'actif reste en place.
//
// La comparaison se fait sur des feuilles que ni l'un ni l'autre n'a apprises avant de les predire : les semaines qui
// suivent la derniere vue par le modele actif (voir `reference` dans ia-entrainement.ts). Ce sont des matchs que l'actif
// n'avait jamais vus, et que le nouveau a predits en marche avant : une comparaison honnete, sans fuite.
//
// Critere : la part des 11 titulaires predits (`onze`, ce que l'on attend d'une compo probable) ; a egalite, la perte
// logarithmique (probabilites mieux calibrees). Fonctions pures.

import type { ComparaisonActif } from "./ia-entrainement";

/** Sous ce nombre de feuilles comparees, la comparaison n'est que du bruit : le modele actif est conserve. */
export const MIN_FEUILLES_COMPARAISON = 10;
/** Deux parts de titulaires egales a ce pres sont a egalite. */
const EPSILON = 1e-9;

export type ActionDecision =
  /** Le nouveau modele fait au moins aussi bien : il devient (ou deviendrait, pour un lancement manuel) le modele actif. */
  | "remplace"
  /** Le modele actif fait mieux, ou la comparaison est trop mince : il reste en place. */
  | "conserve"
  /** Aucun modele actif : le nouveau est range dans l'historique, a activer a la main. */
  | "sans_actif"
  /** Aucune semaine nouvelle depuis le dernier modele : rien a reentrainer. */
  | "inchange";

export interface Decision {
  action: ActionDecision;
  /** En clair, pour l'ecran. */
  raison: string;
  /** Vrai : la decision a ete appliquee (le modele actif a ete remplace). Un lancement manuel ne l'applique jamais. */
  appliquee: boolean;
  /** Les deux modeles face a face, quand il y en a un. */
  comparaison: ComparaisonActif | null;
}

const pct = (x: number | null) => (x === null ? "?" : `${(x * 100).toFixed(1).replace(".", ",")} %`);

/**
 * Le nouveau modele doit-il remplacer l'actif ? `comparaison` : null si aucun modele actif ou aucune feuille posterieure
 * a ce qu'il avait vu.
 */
export function decider(aUnActif: boolean, comparaison: ComparaisonActif | null): Omit<Decision, "appliquee"> {
  if (!aUnActif) {
    return { action: "sans_actif", comparaison: null, raison: "Aucun modele n'est actif : le nouveau modele est range dans l'historique, a activer a la main." };
  }
  if (!comparaison || comparaison.feuilles < MIN_FEUILLES_COMPARAISON) {
    const n = comparaison?.feuilles ?? 0;
    return {
      action: "conserve", comparaison,
      raison: `Seulement ${n} feuille${n > 1 ? "s" : ""} posterieure${n > 1 ? "s" : ""} a ce que le modele actif avait vu (il en faut ${MIN_FEUILLES_COMPARAISON}) : comparaison impossible, le modele actif est conserve et le nouveau garde dans l'historique.`,
    };
  }
  const { nouveau, ancien, actif, feuilles } = comparaison;
  const base = `sur ${feuilles} feuilles posterieures a celles de ${actif.nom}`;
  const dOnze = (nouveau.onze ?? 0) - (ancien.onze ?? 0);
  if (dOnze > EPSILON) {
    return { action: "remplace", comparaison, raison: `Meilleur que ${actif.nom} ${base} : ${pct(nouveau.onze)} des titulaires predits contre ${pct(ancien.onze)}.` };
  }
  if (dOnze < -EPSILON) {
    return { action: "conserve", comparaison, raison: `Moins bon que ${actif.nom} ${base} : ${pct(nouveau.onze)} des titulaires predits contre ${pct(ancien.onze)}. Le modele actif est conserve, le nouveau garde dans l'historique.` };
  }
  // Meme part de titulaires : la calibration departage (perte plus basse = mieux ; a perte egale, le plus recent).
  const meilleurePerte = (nouveau.perte ?? Infinity) <= (ancien.perte ?? Infinity) + EPSILON;
  return meilleurePerte
    ? { action: "remplace", comparaison, raison: `Aussi bon que ${actif.nom} ${base} (${pct(nouveau.onze)} des titulaires predits) et probabilites au moins aussi bien calibrees : il le remplace.` }
    : { action: "conserve", comparaison, raison: `Autant de titulaires predits que ${actif.nom} ${base} (${pct(nouveau.onze)}) mais des probabilites moins bien calibrees : le modele actif est conserve.` };
}
