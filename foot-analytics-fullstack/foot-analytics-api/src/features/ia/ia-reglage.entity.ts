// src/features/ia/ia-reglage.entity.ts

import { Column, Entity, PrimaryColumn } from "typeorm";

import type { ReglagePlanning } from "./ia-planning";

/** Reglages de l'IA qui doivent survivre a un redemarrage : une cle, une valeur JSON. Aujourd'hui, le planning ("planning"). */
@Entity("ia_reglages")
export class IaReglage {
  @PrimaryColumn({ type: "varchar" }) cle: string;
  @Column({ type: "simple-json" }) valeur: ReglagePlanning;
}
