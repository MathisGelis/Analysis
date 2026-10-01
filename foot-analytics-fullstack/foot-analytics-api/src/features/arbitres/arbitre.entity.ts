// src/features/arbitres/arbitre.entity.ts

import { Column, CreateDateColumn, Entity, OneToMany, PrimaryColumn } from "typeorm";

import { ArbitreMatch } from "./arbitre-match.entity";

@Entity("arbitres")
export class Arbitre {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Column() nom: string;
  @Column({ nullable: true }) prenom: string;
  // Cumuls denormalises GLOBAUX, recalcules par la derivation.
  @Column({ type: "int", default: 0 }) matchsOfficies: number;
  @Column({ type: "int", default: 0 }) cartonsJaunesDonnes: number;
  @Column({ type: "int", default: 0 }) cartonsRougesDonnes: number;
  // Compteurs par role (un meme arbitre peut avoir officie comme principal
  // sur un match et assistant sur un autre).
  @Column({ type: "int", default: 0 }) matchsPrincipal: number;
  @Column({ type: "int", default: 0 }) matchsAssistant: number;
  // "Autre" regroupe delegues, observateurs, autres officiels non
  // arbitres au sens strict.
  @Column({ type: "int", default: 0 }) matchsAutre: number;
  // Liste serialisee des roles joues : "principal,assistant,autre".
  @Column({ nullable: true }) roles: string;
  // Profil derive : "Permissif" | "Standard" | "Strict"
  @Column({ nullable: true }) profil: string;
  // Motifs les plus frequents (top 3, joints en chaine).
  @Column({ nullable: true }) motifsTop: string;
  // Note moyenne donnee par MON club, sur les matchs ou il a officie chez nous.
  @Column({ type: "float", nullable: true }) noteMoyenne: number;
  // Stats decomposees par championnat (saison + competition + poule).
  // Stocke en JSON serialise pour eviter une table dediee.
  // Permet le filtrage cote front sur le championnat de l'equipe propre
  // ET la comparaison entre saisons consecutives.
  @Column({ type: "text", nullable: true }) participations: string;
  @CreateDateColumn() createdAt: Date;

  @OneToMany(() => ArbitreMatch, (a) => a.arbitre) participationsLies: ArbitreMatch[];
}
