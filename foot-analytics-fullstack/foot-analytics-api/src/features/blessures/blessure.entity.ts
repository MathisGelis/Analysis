// src/features/blessures/blessure.entity.ts

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("blessures")
export class Blessure {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "joueur_id" }) joueurId: string;
  @Column({ nullable: true }) joueurNom: string;
  @Column({ nullable: true }) localisation: string;
  @Column({ nullable: true }) gravite: string;
  @Column({ nullable: true }) dateDebut: string;
  @Column({ nullable: true }) retourEstime: string;
  @Column({ nullable: true }) statut: string;     // Indisponible/Reprise/Suspendu
  // Champ texte libre pour notes complementaires : "IRM prevu",
  // "Recoit physiothérapie", "Reprise progressive", etc.
  @Column({ type: "text", nullable: true }) details: string;
  @Column({ type: "int", nullable: true }) risqueRecidive: number;
  @CreateDateColumn() createdAt: Date;
}
