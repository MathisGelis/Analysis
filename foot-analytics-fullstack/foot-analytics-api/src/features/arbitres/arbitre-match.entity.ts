// src/features/arbitres/arbitre-match.entity.ts

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Relation } from "typeorm";

import { Match } from "@/features/matchs/match.entity";

import { Arbitre } from "./arbitre.entity";

@Entity("arbitres_matchs")
export class ArbitreMatch {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @ManyToOne(() => Match, (m) => m.arbitres, { onDelete: "CASCADE" })
  @JoinColumn({ name: "match_id" }) match: Relation<Match>;
  @Index() @Column({ name: "match_id" }) matchId: string;
  @ManyToOne(() => Arbitre, (a) => a.participationsLies, { onDelete: "CASCADE" })
  @JoinColumn({ name: "arbitre_id" }) arbitre: Relation<Arbitre>;
  @Index() @Column({ name: "arbitre_id" }) arbitreId: string;
  // "principal" | "assistant1" | "assistant2" | "4e"
  @Column() role: string;
  // Note 1..10, donnee par MON club uniquement (sinon NULL).
  @Column({ type: "float", nullable: true }) note: number;
}
