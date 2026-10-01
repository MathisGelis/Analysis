// src/features/scouting/rapport-scouting.entity.ts

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("rapports_scouting")
export class RapportScouting {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "club_id" }) clubId: string;
  @Column() equipeNom: string;
  @Column({ nullable: true }) auteur: string;
  @Column({ nullable: true }) date: string;
  @Column({ nullable: true }) classement: string;
  @Column({ type: "int", default: 0 }) points: number;
  @Column({ nullable: true }) bilan: string;
  @Column({ nullable: true }) bilanDom: string;
  @Column({ nullable: true }) bilanExt: string;
  @Column({ type: "int", default: 0 }) butsMarques: number;
  @Column({ type: "int", default: 0 }) butsEncaisses: number;
  @Column({ type: "int", default: 0 }) cartonsJaunes: number;
  @Column({ type: "int", default: 0 }) cartonsRouges: number;
  @Column({ nullable: true }) dispositifAttendu: string;
  @Column({ type: "text", nullable: true }) commentaires: string;
  @Column({ nullable: true }) capitaine: string;
  @Column({ type: "simple-array", nullable: true }) joueursSuspendus: string[];
  @Column({ type: "simple-array", nullable: true }) joueursCles: string[];
  @Column({ type: "simple-array", nullable: true }) forces: string[];
  @Column({ type: "simple-array", nullable: true }) faiblesses: string[];
  @Column({ type: "simple-json", nullable: true }) resultats: any[];
  @Column({ type: "simple-json", nullable: true }) dernier11: any[];
  @CreateDateColumn() createdAt: Date;
}
