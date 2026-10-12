// src/features/clubs/club.entity.ts

import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn } from "typeorm";

import { Equipe } from "@/features/equipes/equipe.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";

@Entity("clubs")
export class Club {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Column({ unique: true, nullable: true }) numeroFff: string;
  @Column() nom: string;
  @Column({ nullable: true }) ville: string;
  @Column({ nullable: true }) abbr: string;
  @Column({ default: "#b6f24a" }) couleur: string;
  @Column({ nullable: true }) logoUrl: string;
  @CreateDateColumn() creeLe: Date;

  @OneToMany(() => Equipe, (e) => e.club) equipes: Equipe[];
  @OneToMany(() => Joueur, (j) => j.club) joueurs: Joueur[];
}
