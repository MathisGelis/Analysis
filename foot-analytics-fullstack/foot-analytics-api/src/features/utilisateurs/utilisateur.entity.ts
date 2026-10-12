// src/features/utilisateurs/utilisateur.entity.ts

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Compte utilisateur de l'application. Deux roles :
 *   - "admin" : peut creer/editer/supprimer des utilisateurs, voit tout
 *   - "user"  : limite a son clubId + ses equipeIds
 *
 * Login : format "PrenomNom" en MAJUSCULES (1ere lettre prenom + nom).
 * Ex: prenom "Admin", nom "Admin" -> login "AADMIN".
 */
@Entity("utilisateurs")
export class Utilisateur {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index({ unique: true }) @Column() login: string;
  @Column() prenom: string;
  @Column() nom: string;
  // Hash bcrypt du mot de passe.
  @Column() passwordHash: string;
  // True tant que l'utilisateur n'a pas change son mdp initial.
  @Column({ default: true }) mustChangePassword: boolean;
  // "admin" ou "user".
  @Column({ default: "user" }) role: string;
  // Club autorise (1 seul). Null pour les admins.
  @Column({ nullable: true }) clubId: string;
  // Equipes autorisees (CSV serialise). Vide si pas de filtre par equipe.
  @Column({ type: "simple-array", nullable: true }) equipeIds: string[];
  // Saisons consultables (educateur) : toutes, ou la saison actuelle + les saisons passees listees dans `saisonIds`
  // (liste vide = la saison actuelle seulement). Les comptes anterieurs au suivi gardent "toutes".
  @Column({ default: true }) toutesSaisons: boolean;
  @Column({ type: "simple-array", nullable: true }) saisonIds: string[] | null;
  // Compte qui a cree celui-ci (null : creation initiale ou compte anterieur au suivi). Pas de cle etrangere : le
  // createur peut etre supprime, le compte cree reste.
  @Column({ type: "varchar", nullable: true }) createdById: string | null;
  @CreateDateColumn() createdAt: Date;
}
