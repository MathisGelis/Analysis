// src/features/audit/journal-audit.entity.ts

import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Une trace du journal d'audit : qui (compte, role, club) a fait quoi (action), sur quoi (cible), quand. Ecrite par
 * l'API, jamais modifiee ; lue par les administrateurs ; purgee apres AUDIT_RETENTION_MOIS mois (12 par defaut).
 *
 * Minimisation : ni nom, ni login, ni donnee medicale ; des identifiants techniques et des nombres. L'adresse IP n'est
 * conservee que pour les evenements de connexion (detection des attaques). Les dates sont des chaines ISO 8601 (UTC).
 */
@Entity("journal_audit")
export class JournalAudit {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ type: "varchar" }) le: string;
  @Index() @Column({ type: "varchar" }) action: string;
  // Compte a l'origine (null : systeme, ou connexion d'un login inconnu).
  @Index() @Column({ type: "varchar", nullable: true }) utilisateurId: string | null;
  @Column({ type: "varchar", nullable: true }) role: string | null;
  @Column({ type: "varchar", nullable: true }) clubId: string | null;
  // Objet vise, "type:identifiant" (ex. "joueur:...", "utilisateur:...", "blessure:...").
  @Column({ type: "varchar", nullable: true }) cible: string | null;
  // Club de l'objet vise (un joueur d'un autre club, par exemple).
  @Column({ type: "varchar", nullable: true }) cibleClubId: string | null;
  // Complements sans donnee personnelle (compteurs, motif...).
  @Column({ type: "simple-json", nullable: true }) details: Record<string, unknown> | null;
  @Column({ type: "varchar", nullable: true }) ip: string | null;
}
