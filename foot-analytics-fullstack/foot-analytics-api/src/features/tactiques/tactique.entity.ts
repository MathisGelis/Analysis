// src/features/tactiques/tactique.entity.ts

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Plan de jeu d'une equipe : dispositif, onze de depart et remplacants, eventuellement pour un match
 * precis. Un seul plan par (equipe, match) ; sans match, c'est le plan courant de l'equipe.
 */
@Entity("tactiques")
export class Tactique {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "equipe_id" }) equipeId: string;
  @Index() @Column({ name: "match_id", type: "varchar", nullable: true }) matchId: string | null;
  @Column() formation: string;
  // 11 cases dans l'ordre des postes du terrain (gardien d'abord) : id du joueur, "" = poste vide.
  @Column({ type: "simple-json" }) titulaires: string[];
  @Column({ type: "simple-json" }) remplacants: string[];
  @Column({ type: "varchar", nullable: true }) capitaineId: string | null;
  @Column({ type: "text", nullable: true }) notes: string | null;
  @CreateDateColumn() creeLe: Date;
  @UpdateDateColumn() modifieLe: Date;
}
