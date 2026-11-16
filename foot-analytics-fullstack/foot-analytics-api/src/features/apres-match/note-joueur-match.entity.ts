// src/features/apres-match/note-joueur-match.entity.ts

import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * La note qu'un staff donne a un joueur pour un match (sur 10, par demi-point) et son commentaire. Propriete du club qui l'a
 * saisie (`clubId`) : jamais lue par un autre club, jamais montree aux joueurs. L'identifiant est `matchId:joueurId`.
 */
@Entity("notes_joueurs_match")
export class NoteJoueurMatch {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "match_id", type: "varchar" }) matchId: string;
  @Column({ name: "joueur_id", type: "varchar" }) joueurId: string;
  @Column({ name: "club_id", type: "varchar" }) clubId: string;
  @Column({ type: "float", nullable: true }) note: number | null;
  @Column({ type: "text", nullable: true }) commentaire: string | null;
  @Column({ type: "varchar", nullable: true }) auteurId: string | null;
  @UpdateDateColumn() modifieLe: Date;
}
