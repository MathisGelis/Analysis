// src/features/matchs/composition.entity.ts

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Relation } from "typeorm";

import { Match } from "./match.entity";

@Entity("compositions")
export class Composition {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @ManyToOne(() => Match, (m) => m.compositions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "match_id" }) match: Relation<Match>;
  @Index() @Column({ name: "match_id" }) matchId: string;
  @Column() cote: "dom" | "ext";
  @Column({ type: "int" }) numero: number;
  @Index() @Column() nom: string;
  @Column({ nullable: true }) prenom: string;
  @Index() @Column({ nullable: true }) licence: string;
  @Column({ default: true }) titulaire: boolean;
  @Column({ default: false }) capitaine: boolean;
  @Column({ type: "int", default: 0 }) minutes: number;
  @Column({ type: "float", nullable: true }) note: number;
}
