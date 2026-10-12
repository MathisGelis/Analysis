// src/features/equipes/equipe.entity.ts

import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Relation } from "typeorm";

import { Club } from "@/features/clubs/club.entity";
import { Saison } from "@/features/saisons/saison.entity";

@Entity("equipes")
export class Equipe {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @ManyToOne(() => Club, (c) => c.equipes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "club_id" }) club: Relation<Club>;
  @Index() @Column({ name: "club_id" }) clubId: string;
  @Column() nom: string;
  // Categorie d'age : "Seniors", "U20", "U17", "U15", "Veterans", "Feminines"...
  @Column({ nullable: true }) categorie: string;
  // Division : "D1", "D2", "R2", "R3", "D5"...
  @Column({ nullable: true }) division: string;
  // Poule au sein de la division (ex. "A", "B", "C"...).
  @Column({ nullable: true }) poule: string;
  // Libelle competition exact tel qu'il apparait dans la FMI (utilise
  // pour le matching auto). Ex. "Seniors D2 / Phase Unique".
  @Column({ nullable: true }) competitionLibelle: string;
  // Saison de rattachement. Une meme equipe physique (ex. "Seniors D2")
  // est dupliquee par saison pour garder l'historique des classements.
  @ManyToOne(() => Saison, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "saison_id" }) saison: Relation<Saison>;
  @Index() @Column({ name: "saison_id", nullable: true }) saisonId: string;
  @Column({ nullable: true }) coach: string;
  @Column({ default: "4-2-3-1" }) formationDef: string;
  @CreateDateColumn() createdAt: Date;
}
