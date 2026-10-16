// src/features/blessures/blessure.entity.ts

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Donnee de sante : propriete du club qui l'a saisie (`clubId`). Elle ne suit pas le joueur s'il change de club, et
 * n'est jamais lue par un autre club (voir BlessuresController et acces/visibilite.ts).
 */
@Entity("blessures")
export class Blessure {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "joueur_id" }) joueurId: string;
  @Index() @Column({ type: "varchar", nullable: true }) clubId: string | null;
  @Column({ nullable: true }) localisation: string;
  @Column({ nullable: true }) gravite: string;
  @Column({ nullable: true }) dateDebut: string;
  @Column({ nullable: true }) retourEstime: string;
  @Column({ nullable: true }) statut: string;     // Indisponible/Reprise/Suspendu
  // Champ texte libre pour notes complementaires : "IRM prevu",
  // "Recoit physiothérapie", "Reprise progressive", etc.
  @Column({ type: "text", nullable: true }) details: string;
  @CreateDateColumn() createdAt: Date;
}
