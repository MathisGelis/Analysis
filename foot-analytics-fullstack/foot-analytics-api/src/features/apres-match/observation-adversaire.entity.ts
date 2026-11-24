// src/features/apres-match/observation-adversaire.entity.ts

import { Column, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Ce que le staff d'un club a observe de l'adversaire pendant UN match (dispositif, points forts, pressing...). Un par club et par match
 * (`matchId:clubId`), garde avec le club adverse pour resservir au prochain rapport pre-match contre lui. Les valeurs suivent le
 * catalogue de observations-adversaire.ts : { section: { champ: valeur } }. Donnee privee du club.
 */
@Entity("observations_adversaire")
export class ObservationAdversaire {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "match_id", type: "varchar" }) matchId: string;
  @Index() @Column({ name: "club_id", type: "varchar" }) clubId: string;
  @Index() @Column({ name: "adversaire_id", type: "varchar" }) adversaireId: string;
  @Column({ type: "simple-json" }) valeurs: Record<string, Record<string, unknown>>;
  @Column({ type: "varchar", nullable: true }) auteurId: string | null;
  @UpdateDateColumn() modifieLe: Date;
}
