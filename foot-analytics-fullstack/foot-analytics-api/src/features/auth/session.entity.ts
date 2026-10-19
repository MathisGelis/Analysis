// src/features/auth/session.entity.ts

import { Column, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Une session ouverte : le jeton de rafraichissement qui permet d'obtenir de nouveaux jetons d'acces (courts). Le jeton
 * lui-meme n'est jamais stocke, seulement son empreinte SHA-256 : une fuite de la table ne donne aucune session.
 *
 * Rotation : chaque rafraichissement remplace la session par une nouvelle de la meme `famille`. Presenter un jeton deja
 * remplace (rejeu d'un jeton vole) revoque toute la famille. Les dates sont des chaines ISO 8601 (UTC).
 */
@Entity("sessions")
export class Session {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ type: "varchar" }) utilisateurId: string;
  // Toutes les sessions issues d'une meme connexion.
  @Index() @Column({ type: "varchar" }) famille: string;
  @Index({ unique: true }) @Column({ type: "varchar" }) empreinte: string;
  @Column({ type: "varchar" }) creeeLe: string;
  @Column({ type: "varchar" }) expireLe: string;
  // Remplacee par un rafraichissement (rotation) : le jeton ne sert plus.
  @Column({ type: "varchar", nullable: true }) remplaceeLe: string | null;
  // Revoquee : deconnexion, rejeu detecte, mot de passe change, compte desactive.
  @Column({ type: "varchar", nullable: true }) revoqueeLe: string | null;
}
