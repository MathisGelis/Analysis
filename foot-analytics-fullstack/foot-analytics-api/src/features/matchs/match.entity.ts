// src/features/matchs/match.entity.ts

import { Column, CreateDateColumn, Entity, Index, OneToMany, PrimaryColumn } from "typeorm";

import { ArbitreMatch } from "@/features/arbitres/arbitre-match.entity";

import { Composition } from "./composition.entity";
import { EvenementMatch } from "./evenement-match.entity";

@Entity("matchs")
export class Match {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Column({ unique: true, nullable: true }) numeroFmi: string;
  @Column({ nullable: true }) journee: string;
  @Column({ nullable: true }) date: string;
  @Column({ nullable: true }) heure: string;
  @Column({ nullable: true }) competition: string;
  @Column({ nullable: true }) poule: string;
  @Column({ nullable: true }) terrain: string;
  @Index() @Column({ name: "club_dom" }) clubDom: string;
  @Index() @Column({ name: "club_ext" }) clubExt: string;
  // Equipes precises (categorie + division + poule). Nullable pour
  // retro-compatibilite : un match existant sans equipe rattachee peut
  // etre re-lie a posteriori via rebuild.
  @Index() @Column({ name: "equipe_dom", nullable: true }) equipeDomId: string;
  @Index() @Column({ name: "equipe_ext", nullable: true }) equipeExtId: string;
  // Saison de rattachement. Nullable pour retro-compat ; le rebuild la
  // remplit en fonction de la date.
  @Index() @Column({ name: "saison_id", nullable: true }) saisonId: string;
  @Column({ type: "int", default: 0 }) scoreDom: number;
  @Column({ type: "int", default: 0 }) scoreExt: number;
  @Column({ nullable: true }) arbitre: string;
  @Column({ nullable: true }) formationDom: string;
  @Column({ nullable: true }) formationExt: string;
  @Column({ default: "joue" }) statut: string;
  @Column({ nullable: true }) pdfUrl: string;
  @CreateDateColumn() createdAt: Date;

  @OneToMany(() => Composition, (c) => c.match, { cascade: true }) compositions: Composition[];
  @OneToMany(() => EvenementMatch, (e) => e.match, { cascade: true }) evenements: EvenementMatch[];
  @OneToMany(() => ArbitreMatch, (a) => a.match, { cascade: true }) arbitres: ArbitreMatch[];
}
