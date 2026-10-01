// src/features/classement/ligne-classement.entity.ts

import { Column, Entity, Index, PrimaryColumn } from "typeorm";

@Entity("classement")
export class LigneClassement {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "club_id" }) clubId: string;
  // Equipe concretement classee (categorie + division + poule). Si null,
  // c'est une ligne ancienne au niveau club brut. Le rebuild produit
  // desormais des lignes par equipe.
  @Index() @Column({ name: "equipe_id", nullable: true }) equipeId: string;
  @Index() @Column({ name: "saison_id", nullable: true }) saisonId: string;
  @Column({ type: "int" }) rang: number;
  @Column({ type: "int" }) joues: number;
  @Column({ type: "int" }) v: number;
  @Column({ type: "int" }) n: number;
  @Column({ type: "int" }) d: number;
  @Column({ type: "int" }) bp: number;
  @Column({ type: "int" }) bc: number;
  @Column({ type: "int" }) pts: number;
  @Column({ type: "simple-array", nullable: true }) forme: string[];
}
