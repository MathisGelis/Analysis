// src/features/joueurs/stat-joueur-equipe.entity.ts

import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Buts et passes decisives saisis a la main pour un joueur DANS UNE EQUIPE
 * (donc une saison). Les FMI ne listent pas toujours les buteurs : le staff
 * complete a la main, et cette saisie ne doit pas deborder sur les autres
 * saisons (contrairement aux compteurs globaux de `Joueur`).
 * Une valeur null = pas de saisie, on garde le calcul depuis les feuilles.
 */
@Entity("stats_joueur_equipe")
@Index(["joueurId", "equipeId"], { unique: true })
export class StatJoueurEquipe {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Column({ name: "joueur_id" }) joueurId: string;
  @Column({ name: "equipe_id" }) equipeId: string;
  @Column({ type: "int", nullable: true }) buts: number | null;
  @Column({ type: "int", nullable: true }) passesDecisives: number | null;
}
