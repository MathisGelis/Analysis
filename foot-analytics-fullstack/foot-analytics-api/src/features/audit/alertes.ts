// src/features/audit/alertes.ts
//
// Regles d'alerte du journal d'audit (pures) : un comportement anormal laisse une trace "alerte.*" dans le journal,
// signalee aux administrateurs (page Journal, et webhook ALERTE_WEBHOOK_URL s'il est defini).
//   - consultations massives de fiches de joueurs d'autres clubs par un meme compte (extraction) ;
//   - recherches avancees de joueurs en serie par un meme compte (chacune rend jusqu'a 100 joueurs de tous les clubs) ;
//   - exports PowerPoint en serie par un meme compte ;
//   - echecs de connexion en rafale, tous comptes confondus (force brute, attaque par dictionnaire).

export interface RegleAlerte {
  alerte: string;
  /** Actions comptees. */
  surveille: string[];
  /** Compter par compte (sinon : globalement). */
  parCompte: boolean;
  fenetreMin: number;
  seuil: number;
  libelle: string;
}

export const REGLES_ALERTE: RegleAlerte[] = [
  {
    alerte: "alerte.consultations_massives", surveille: ["joueur.consultation_autre_club"], parCompte: true,
    fenetreMin: 10, seuil: 60, libelle: "Consultations massives de fiches de joueurs d'autres clubs",
  },
  {
    alerte: "alerte.recherches_massives", surveille: ["joueur.recherche_avancee"], parCompte: true,
    fenetreMin: 10, seuil: 40, libelle: "Recherches avancees de joueurs en serie",
  },
  {
    alerte: "alerte.export_massif", surveille: ["export.pptx"], parCompte: true,
    fenetreMin: 60, seuil: 20, libelle: "Exports en serie",
  },
  {
    alerte: "alerte.echecs_connexion", surveille: ["connexion.echec"], parCompte: false,
    fenetreMin: 15, seuil: 50, libelle: "Echecs de connexion repetes",
  },
];

/** Les regles concernees par une action. */
export function reglesPour(action: string, regles: RegleAlerte[] = REGLES_ALERTE): RegleAlerte[] {
  return regles.filter((r) => r.surveille.includes(action));
}

/** Debut de la fenetre d'une regle, en ISO. */
export function debutFenetre(regle: Pick<RegleAlerte, "fenetreMin">, maintenant: Date): string {
  return new Date(maintenant.getTime() - regle.fenetreMin * 60_000).toISOString();
}
