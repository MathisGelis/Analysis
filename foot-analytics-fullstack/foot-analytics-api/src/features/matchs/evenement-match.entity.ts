// src/features/matchs/evenement-match.entity.ts

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Relation } from "typeorm";

import { Match } from "./match.entity";

@Entity("evenements_match")
export class EvenementMatch {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @ManyToOne(() => Match, (m) => m.evenements, { onDelete: "CASCADE" })
  @JoinColumn({ name: "match_id" }) match: Relation<Match>;
  @Index() @Column({ name: "match_id" }) matchId: string;
  @Column() type: string;            // carton | carton_vert (fair-play, pas une sanction) | but | remplacement | blessure
  @Column({ nullable: true }) sousType: string;
  @Column({ nullable: true }) motif: string;
  @Column({ type: "int", nullable: true }) minute: number;
  @Column({ type: "int", default: 0 }) arret: number;
  @Column() joueur: string;
  @Column({ nullable: true }) joueur2: string;
  @Column() equipe: "dom" | "ext";
}
