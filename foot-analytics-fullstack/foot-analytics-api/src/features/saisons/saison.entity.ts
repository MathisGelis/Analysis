// src/features/saisons/saison.entity.ts

import { Column, CreateDateColumn, Entity, PrimaryColumn } from "typeorm";

@Entity("saisons")
export class Saison {
  @PrimaryColumn({ type: "varchar" }) id: string;
  // Libelle : ex. "2025-2026". Unique pour eviter les doublons.
  @Column({ unique: true }) nom: string;
  // Annee de debut (entier). Utile pour deduire la saison d'une date.
  @Column({ type: "int" }) anneeDebut: number;
  // Une seule saison active a la fois — c'est la saison "courante"
  // utilisee par defaut dans les imports et les vues. On peut basculer
  // d'une saison a l'autre via PATCH /saisons/:id/activer.
  @Column({ default: false }) actif: boolean;
  // Etat libre : "en_cours", "terminee", "a_venir". Informatif.
  @Column({ default: "en_cours" }) statut: string;
  @CreateDateColumn() createdAt: Date;
}
