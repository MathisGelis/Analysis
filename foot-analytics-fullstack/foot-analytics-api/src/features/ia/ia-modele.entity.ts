// src/features/ia/ia-modele.entity.ts

import { Column, Entity, PrimaryColumn } from "typeorm";

import type { ResumeModele } from "./ia-entrainement";
import type { PoidsIa } from "./ia-modele";

/**
 * Un modele entraine : ses poids, et de quoi le presenter sans recharger l'entrainement. Un seul modele est actif a la
 * fois ; sans modele actif, l'application garde son moteur a regles.
 */
@Entity("ia_modeles")
export class IaModele {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Column() nom: string;
  @Column({ type: "varchar" }) entrainementId: string;
  @Column({ type: "simple-json" }) poids: PoidsIa;
  @Column({ type: "simple-json" }) resume: ResumeModele;
  @Column({ default: false }) actif: boolean;
  /** ISO 8601, a la milliseconde : l'ordre des entrainements ne depend pas de la precision de l'horloge de la base. */
  @Column({ type: "varchar" }) creeLe: string;
}
