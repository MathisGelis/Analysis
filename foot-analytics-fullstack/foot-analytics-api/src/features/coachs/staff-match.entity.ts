// src/features/coachs/staff-match.entity.ts

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Relation } from "typeorm";

import { Match } from "@/features/matchs/match.entity";

import { Coach } from "./coach.entity";

@Entity("staff_matchs")
export class StaffMatch {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @ManyToOne(() => Match, { onDelete: "CASCADE" })
  @JoinColumn({ name: "match_id" }) match: Relation<Match>;
  @Index() @Column({ name: "match_id" }) matchId: string;
  @ManyToOne(() => Coach, (c) => c.participations, { onDelete: "CASCADE" })
  @JoinColumn({ name: "coach_id" }) coach: Relation<Coach>;
  @Index() @Column({ name: "coach_id" }) coachId: string;
  // Cote au moment de ce match (le coach peut avoir change de club).
  @Column() cote: "dom" | "ext";
  // Liste brute des fonctions vues sur cette FMI (peut etre "E", "E/DR",
  // "D", "M", "A"...). On exclut "DR" (delegue de rencontre) cote
  // derivation.
  @Column() fonctions: string;
}
