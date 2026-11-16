// src/features/apres-match/bilan-match.entity.ts

import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm";

/** Le bilan de l'entraineur apres le match : ce qui a marche, ce qu'il faut travailler, un mot libre. Un par club et par match (`matchId:clubId`). */
@Entity("bilans_match")
export class BilanMatch {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "match_id", type: "varchar" }) matchId: string;
  @Column({ name: "club_id", type: "varchar" }) clubId: string;
  @Column({ type: "text", nullable: true }) positifs: string | null;
  @Column({ type: "text", nullable: true }) aTravailler: string | null;
  @Column({ type: "text", nullable: true }) bilan: string | null;
  @Column({ type: "varchar", nullable: true }) auteurId: string | null;
  @UpdateDateColumn() modifieLe: Date;
}
