// src/features/direct/direct.entity.ts

import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

import { StatutDirect } from "./chrono";

/**
 * L'etat du direct d'un match : un seul par match (la cle est celle du match). Le chrono se resume a quatre valeurs (voir
 * chrono.ts) ; la cloture, faite par un staff, verrouille la saisie jusqu'a une reouverture.
 */
@Entity("directs")
export class Direct {
  @PrimaryColumn({ type: "varchar", name: "match_id" }) matchId: string;
  @Column({ type: "varchar", default: "avant" }) statut: StatutDirect;
  @Column({ type: "int", default: 1 }) periode: number;
  @Column({ type: "float", default: 0 }) accumuleMs: number;
  /** Instant (ms depuis 1970) du dernier demarrage de la periode ; nul si le chrono est arrete. */
  @Column({ type: "float", nullable: true }) demarreLe: number | null;
  @Column({ type: "int", default: 45 }) dureePeriodeMin: number;
  /** Quand et par qui le match a ete cloture (ISO) ; nul tant que la saisie est ouverte. */
  @Column({ type: "varchar", nullable: true }) clotureLe: string | null;
  @Column({ type: "varchar", nullable: true }) cloturePar: string | null;
  @CreateDateColumn() creeLe: Date;
}
