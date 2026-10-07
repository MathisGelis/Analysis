// src/features/ia/ia-entrainement.entity.ts

import { Column, Entity, PrimaryColumn } from "typeorm";

import type { Decision } from "./ia-decision";
import type { ResultatEntrainement } from "./ia-entrainement";

export type StatutEntrainement = "en_cours" | "termine" | "echec" | "annule";
/** manuel : lance par un administrateur ; auto : le reentrainement hebdomadaire. */
export type Declencheur = "manuel" | "auto";

export interface OptionsLancement {
  /** Essayer plusieurs hyperparametres (defaut) ou un seul passage. */
  optimiser: boolean;
  /** Restreindre aux matchs de ces saisons ; absent = toutes. */
  saisonIds: string[] | null;
}

/** Un entrainement : la marche avant sur toutes les feuilles de match, avec sa progression puis son resultat complet. */
@Entity("ia_entrainements")
export class IaEntrainement {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Column({ default: "en_cours" }) statut: StatutEntrainement;
  /** 0 a 100. */
  @Column({ type: "int", default: 0 }) progression: number;
  /** L'etape en cours, ou la raison d'un echec / d'une annulation. */
  @Column({ type: "text", nullable: true }) message: string | null;
  @Column({ type: "simple-json" }) options: OptionsLancement;
  /** Identifiant du compte admin qui l'a lance. */
  @Column({ type: "varchar", nullable: true }) lancePar: string | null;
  /** Le modele produit (un entrainement reussi en cree un). */
  @Column({ type: "varchar", nullable: true }) modeleId: string | null;
  @Column({ type: "simple-json", nullable: true }) resultat: ResultatEntrainement | null;
  @Column({ type: "varchar", default: "manuel" }) declencheur: Declencheur;
  /**
   * Le nouveau modele face au modele actif (voir ia-decision.ts). Pour un entrainement automatique la decision est
   * appliquee ; pour un lancement manuel elle n'est qu'un avis (c'est l'administrateur qui active).
   */
  @Column({ type: "simple-json", nullable: true }) decision: Decision | null;
  /**
   * ISO 8601 : derniere preuve de vie de la tache (ecrite a chaque progression). Un entrainement "en cours" dont personne
   * ne donne plus de nouvelles depuis plusieurs minutes a ete interrompu ; un autre serveur peut encore le faire tourner.
   */
  @Column({ type: "varchar", nullable: true }) maj: string | null;
  /** ISO 8601. */
  @Column({ type: "varchar", nullable: true }) termineLe: string | null;
  /** ISO 8601, a la milliseconde : l'ordre des entrainements ne depend pas de la precision de l'horloge de la base. */
  @Column({ type: "varchar" }) creeLe: string;
}
