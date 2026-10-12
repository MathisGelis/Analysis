// src/features/utilisateurs/acces-saisons.ts
//
// Saisons qu'un educateur peut consulter. Un compte a soit l'acces a TOUTES les saisons, soit a la saison actuelle
// (et aux suivantes) plus les saisons passees que son gestionnaire a cochees. Fonctions pures ; le service les applique.

export interface AccesSaisons {
  toutesSaisons: boolean;
  /** Saisons passees visibles en plus de la saison actuelle (ignoree quand `toutesSaisons`). */
  saisonIds: string[];
}

/** Ce que le gestionnaire envoie : tout est facultatif, l'existant sert de base. */
export interface DemandeAccesSaisons { toutesSaisons?: boolean; saisonIds?: string[] }

/**
 * Acces resultant d'une demande de creation ou de modification. Un compte sans restriction demandee (champ absent)
 * garde l'acces a toutes les saisons : une creation par l'API sans ces champs ne change rien a l'existant.
 * Les identifiants sont dedoublonnes ; la liste n'est conservee que si l'acces est restreint.
 */
export function accesSaisonsResultant(demande: DemandeAccesSaisons, actuel: AccesSaisons = { toutesSaisons: true, saisonIds: [] }): AccesSaisons {
  const toutesSaisons = demande.toutesSaisons ?? actuel.toutesSaisons;
  if (toutesSaisons) return { toutesSaisons: true, saisonIds: [] };
  const ids = demande.saisonIds ?? actuel.saisonIds;
  return { toutesSaisons: false, saisonIds: [...new Set(ids)] };
}

/** Identifiants demandes qui ne sont pas des saisons connues. */
export const saisonsInconnues = (demandees: string[], connues: Iterable<string>): string[] => {
  const ok = new Set(connues);
  return [...new Set(demandees)].filter((id) => !ok.has(id));
};
