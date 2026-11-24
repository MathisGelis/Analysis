// src/features/planning-equipe/planning-equipe.entity.ts
//
// Ce que le staff prevoit pour son equipe et qui ne vient d'aucune feuille de match : les jours d'entrainement recurrents et les
// evenements « autre » du calendrier (reunion, deplacement...). Garde cote serveur, par equipe : le meme calendrier sur tous les
// appareils des personnes qui gerent l'equipe (avant, un simple stockage du navigateur, perdu en changeant d'appareil).

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm";

@Entity("plannings_equipe")
export class PlanningEquipe {
  @PrimaryColumn({ name: "equipe_id", type: "varchar" }) equipeId: string;
  /** Jours de la semaine, 0 = lundi ... 6 = dimanche. */
  @Column({ type: "simple-json" }) jours: number[];
  /** « HH:MM » */
  @Column({ type: "varchar" }) heure: string;
  @UpdateDateColumn() modifieLe: Date;
}

@Entity("evenements_equipe")
export class EvenementEquipe {
  /** Fabrique par l'appareil : rejouer l'enregistrement ne cree jamais de doublon. */
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "equipe_id", type: "varchar" }) equipeId: string;
  /** « AAAA-MM-JJ » */
  @Column({ type: "varchar" }) date: string;
  @Column({ type: "varchar", nullable: true }) heure: string | null;
  @Column({ type: "varchar" }) titre: string;
  @Column({ type: "text", nullable: true }) description: string | null;
  @CreateDateColumn() creeLe: Date;
}
