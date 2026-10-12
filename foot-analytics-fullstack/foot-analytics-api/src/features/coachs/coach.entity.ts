// src/features/coachs/coach.entity.ts

import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany, PrimaryColumn, Relation,
} from "typeorm";

import { Club } from "@/features/clubs/club.entity";

import { StaffMatch } from "./staff-match.entity";

@Entity("coachs")
export class Coach {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Column() nom: string;
  @Column({ nullable: true }) prenom: string;
  @Column({ nullable: true }) licence: string;
  // Club courant deduit : le club ou il a accompagne le plus souvent
  // sur les dernieres journees.
  @ManyToOne(() => Club, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "club_id" }) club: Relation<Club>;
  @Index() @Column({ name: "club_id", nullable: true }) clubId: string;
  // Cumuls denormalises, recalcules par la derivation.
  @Column({ type: "int", default: 0 }) matchsPresent: number;
  @Column({ type: "int", default: 0 }) v: number;
  @Column({ type: "int", default: 0 }) n: number;
  @Column({ type: "int", default: 0 }) d: number;
  // Pour la categorie : "principal" si fonction E majoritaire, sinon
  // "assistant" si M majoritaire, "dirigeant" pour D etc.
  @Column({ nullable: true }) categorie: string;
  // Cartons RECUS par ce coach (different des cartons donnes par un
  // arbitre). Issus des evenements de cartons dont le motif mentionne
  // "Banc" / "Educateur" / "Coach" et le nom matche.
  @Column({ type: "int", default: 0 }) cartonsJaunes: number;
  @Column({ type: "int", default: 0 }) cartonsRouges: number;
  // Motifs frequents des cartons recus (joints).
  @Column({ nullable: true }) motifsTop: string;
  @CreateDateColumn() createdAt: Date;

  @OneToMany(() => StaffMatch, (sm) => sm.coach) participations: StaffMatch[];
}
