// src/features/direct/evenement-direct.entity.ts

import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from "typeorm";

/**
 * Un evenement saisi pendant le match. L'identifiant est fabrique par l'appareil qui saisit : rejouer la meme requete (reseau
 * coupe, saisie hors ligne renvoyee plus tard) ne cree jamais de doublon. Un evenement supprime n'est pas efface : il garde
 * sa trace (annuler, puis restaurer, reste possible et le journal reste complet).
 *
 * `cote` : « dom » ou « ext » (l'equipe qui recoit ou qui se deplace), comme les evenements de la feuille de match.
 * Les zones sont celles de l'equipe qui joue (voir types.ts) ; les joueurs sont reperes par leur numero de maillot, avec
 * leur nom et leur fiche quand on les connait (un adversaire n'a que son numero).
 */
@Entity("evenements_direct")
export class EvenementDirect {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Index() @Column({ name: "match_id", type: "varchar" }) matchId: string;
  @Column({ type: "varchar" }) cote: "dom" | "ext";
  @Column({ type: "varchar" }) type: string;
  @Column({ type: "varchar", nullable: true }) resultat: string | null;
  @Column({ type: "int" }) periode: number;
  @Column({ type: "int" }) minute: number;
  @Column({ type: "int", nullable: true }) joueurNumero: number | null;
  @Column({ type: "varchar", nullable: true }) joueurNom: string | null;
  @Column({ type: "varchar", nullable: true }) joueurId: string | null;
  /** Le passeur d'un but, le joueur qui entre sur un remplacement. */
  @Column({ type: "int", nullable: true }) joueur2Numero: number | null;
  @Column({ type: "varchar", nullable: true }) joueur2Nom: string | null;
  @Column({ type: "varchar", nullable: true }) joueur2Id: string | null;
  @Column({ type: "int", nullable: true }) zoneTier: number | null;
  @Column({ type: "int", nullable: true }) zoneCouloir: number | null;
  @Column({ type: "int", nullable: true }) zoneCadre: number | null;
  /** Le contexte du jeu (attaque placee, recuperation haute, CPA...) : une liste de libelles courts, choisis par le staff. */
  @Column({ type: "simple-json" }) contextes: string[];
  @Column({ type: "varchar", nullable: true }) auteurId: string | null;
  /** ISO ; nul = l'evenement compte. */
  @Column({ type: "varchar", nullable: true }) supprimeLe: string | null;
  @CreateDateColumn() creeLe: Date;
  @UpdateDateColumn() modifieLe: Date;
}
