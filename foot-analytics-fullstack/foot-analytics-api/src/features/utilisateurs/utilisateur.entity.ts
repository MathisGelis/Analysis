// src/features/utilisateurs/utilisateur.entity.ts

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from "typeorm";

/**
 * Compte utilisateur de l'application. Trois roles (voir droits-comptes.ts) :
 *   - "admin"    : peut creer/editer/supprimer des utilisateurs, voit tout
 *   - "referent" : gere les educateurs de son club
 *   - "user"     : limite a son clubId + ses equipeIds
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

  // --- Sessions et securite (voir features/auth). Les dates sont des chaines ISO 8601 (UTC), comparables telles quelles.
  // Incremente pour revoquer d'un coup tous les jetons d'acces emis (deconnexion partout, mot de passe change).
  @Column({ type: "int", default: 0 }) versionJeton: number;
  // Derniere connexion ou reactivation : base de la desactivation automatique des comptes inactifs.
  @Column({ type: "varchar", nullable: true }) derniereActivite: string | null;
  // Compte desactive (inactivite prolongee ou decision d'un gestionnaire) : connexion refusee. Null = actif.
  @Column({ type: "varchar", nullable: true }) desactiveLe: string | null;
  // Echecs de connexion consecutifs, et verrouillage temporaire quand le seuil est atteint.
  @Column({ type: "int", default: 0 }) echecsConnexion: number;
  @Column({ type: "varchar", nullable: true }) verrouilleJusqua: string | null;
  // Conditions d'utilisation acceptees : version et date (null : jamais acceptees).
  @Column({ type: "varchar", nullable: true }) cguVersion: string | null;
  @Column({ type: "varchar", nullable: true }) cguAccepteesLe: string | null;
}
