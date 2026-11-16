// src/features/direct/invitation-direct.entity.ts

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Une invitation a saisir le direct d'UN match : un lien a usage unique. Seuls des empreintes (SHA-256) du jeton et de la session
 * sont gardees : la base ne permet jamais de reconstituer un lien. Le lien s'ouvre une seule fois (`ouvertLe`) et donne alors une
 * session liee a l'appareil, valable jusqu'a `expireLe` ou jusqu'a la revocation. L'invite agit au nom de la personne qui l'a invitee
 * (`creePar`) et n'atteint que ce match, que le direct (jamais le reste de l'application, jamais les donnees medicales).
 */
@Entity("invitations_direct")
export class InvitationDirect {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "match_id", type: "varchar" }) matchId: string;
  @Column({ type: "varchar" }) creePar: string;
  @Column({ type: "varchar" }) libelle: string;
  @Column({ type: "boolean", default: false }) peutChrono: boolean;
  @Index({ unique: true }) @Column({ type: "varchar" }) jetonEmpreinte: string;
  @Index() @Column({ type: "varchar", nullable: true }) sessionEmpreinte: string | null;
  @Column({ type: "varchar" }) expireLe: string;
  @Column({ type: "varchar", nullable: true }) ouvertLe: string | null;
  @Column({ type: "varchar", nullable: true }) revoqueLe: string | null;
  @Column({ type: "varchar", nullable: true }) derniereActiviteLe: string | null;
  @CreateDateColumn() creeLe: Date;
}
