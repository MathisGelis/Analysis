// src/features/ia/ia-entrainement.entity.ts

import { Column, Entity, PrimaryColumn } from "typeorm";

import type { ResultatEntrainement } from "./ia-entrainement";

export type StatutEntrainement = "en_cours" | "termine" | "echec" | "annule";

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
  /** ISO 8601. */
  @Column({ type: "varchar", nullable: true }) termineLe: string | null;
  /** ISO 8601, a la milliseconde : l'ordre des entrainements ne depend pas de la precision de l'horloge de la base. */
  @Column({ type: "varchar" }) creeLe: string;
}
