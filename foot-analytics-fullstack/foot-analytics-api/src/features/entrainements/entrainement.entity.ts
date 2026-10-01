// src/features/entrainements/entrainement.entity.ts

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("entrainements")
export class Entrainement {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "equipe_id", nullable: true }) equipeId: string;
  @Column({ nullable: true }) date: string;
  @Column({ nullable: true }) jour: string;
  @Column({ nullable: true }) heure: string;
  @Column({ nullable: true }) type: string;       // tactique/physique/recup...
  @Column({ nullable: true }) theme: string;
  @Column({ type: "int", default: 90 }) dureeMin: number;
  @Column({ type: "int", nullable: true }) intensite: number;  // /10 (echelle RPE)
  // Charge en UA-RPE (Unite Arbitraire de Foster) : duree x RPE_modulee.
  // Voir EntrainementsService.calcCharge pour la formule.
  @Column({ type: "float", default: 0 }) charge: number;
  @Column({ nullable: true }) terrain: string;
  // Espace de jeu utilise : terrain_entier / demi_terrain / quart_terrain /
  // espace_reduit / salle / autre. Module la charge (plus l'espace est
  // restreint, plus la densite physique est forte).
  @Column({ nullable: true }) espace: string;
  @Column({ type: "int", default: 0 }) presents: number;
  @Column({ type: "int", default: 0 }) total: number;
  // Liste des ids de joueurs ayant assiste a la seance.
  @Column({ type: "simple-array", nullable: true })
  joueursPresents: string[];
  @CreateDateColumn() createdAt: Date;
}
