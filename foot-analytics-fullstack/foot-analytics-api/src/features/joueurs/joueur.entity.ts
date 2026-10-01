// src/features/joueurs/joueur.entity.ts

import {
  AfterLoad, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, Relation,
} from "typeorm";

import { Club } from "@/features/clubs/club.entity";

import { champsFatigue, deserialiserEntree } from "./fatigue";

@Entity("joueurs")
export class Joueur {
  @PrimaryColumn({ type: "varchar" }) id: string;
  @Column({ nullable: true }) licence: string;
  @Column() nom: string;
  @Column({ nullable: true }) prenom: string;
  @ManyToOne(() => Club, (c) => c.joueurs, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "club_id" }) club: Relation<Club>;
  @Index() @Column({ name: "club_id", nullable: true }) clubId: string;
  // Equipes auxquelles le joueur est explicitement attache (en plus
  // des matchs joues). Permet de constituer l'effectif d'une saison
  // future avant qu'aucune FMI n'ait ete importee : on cree le joueur
  // et on lui attache son equipe (Seniors D2 2026-2027 par ex.).
  // Format CSV stocke par TypeORM.
  @Column({ type: "simple-array", nullable: true }) equipesAttachees: string[];
  @Column({ nullable: true }) poste: string;
  @Column({ type: "int", nullable: true }) numeroFavori: number;
  // "Pas mutation" (defaut pour mon club), "Mutation", "Mutation hors delai",
  // ou "Non connu" (uniquement adversaires).
  @Column({ nullable: true }) statutMutation: string;
  // Vrai quand le staff a MODIFIE le statut a la main : le calcul automatique (club different de la saison
  // precedente => Mutation) ne le remplace plus.
  @Column({ default: false }) statutMutationSaisi: boolean;
  @Column({ nullable: true }) commentaire: string;
  @Column({ nullable: true }) dateNaissance: string;
  // donnees morphologiques (saisie manuelle, mon effectif)
  @Column({ type: "int", nullable: true }) tailleCm: number;
  @Column({ type: "int", nullable: true }) poidsKg: number;
  // "droit" | "gauche" | "ambidextre"
  @Column({ nullable: true }) piedFort: string;

  // statistiques agregees (denormalisees pour l'affichage rapide ;
  // recalculables a partir des matchs)
  @Column({ type: "int", default: 0 }) matchs: number;
  @Column({ type: "int", default: 0 }) titularisations: number;
  @Column({ type: "int", default: 0 }) minutes: number;
  @Column({ type: "int", default: 0 }) cartonsJaunes: number;
  @Column({ type: "int", default: 0 }) cartonsRouges: number;
  @Column({ type: "int", default: 0 }) buts: number;
  @Column({ type: "int", default: 0 }) passesDecisives: number;
  // Nombre de blessures cumulees historiquement (impacte le risque).
  @Column({ type: "int", default: 0 }) blessuresAnt: number;
  @Column({ type: "float", nullable: true }) noteMoyenne: number;
  // Score de FATIGUE 0-100 (bas = frais, haut = surcharge), derive de la charge d'entrainement, de la
  // charge en match, de la congestion et des antecedents (voir features/joueurs/fatigue.ts). Recalcule a chaque
  // lecture depuis `fatigueEntree` : la fatigue depend de la date du jour.
  @Column({ type: "int", nullable: true }) scoreFatigue: number;
  // Entrees du calcul (efforts des 28 derniers jours, statut, antecedents), JSON compact.
  @Column({ type: "text", nullable: true }) fatigueEntree: string;
  // Decomposition du score (niveau, facteurs, fiabilite), JSON servi tel quel a l'interface.
  @Column({ type: "text", nullable: true }) fatigueDetail: string;
  // ACWR brut, pour l'afficher si besoin (debug / UI).
  @Column({ type: "float", nullable: true }) acwr: number;
  // Charge aigue (7j) et chronique (moyenne hebdo 28j), en UA-RPE.
  @Column({ type: "float", nullable: true }) chargeAcute7j: number;
  @Column({ type: "float", nullable: true }) chargeChronic28j: number;
  @Column({ nullable: true }) postes: string; // "5 (18) / R (3)"
  // Profil derive de l'analyse des motifs de cartons :
  // "contestateur" | "rugueux" | "exclusion" | null.
  @Column({ nullable: true }) typeDiscipline: string;

  @CreateDateColumn() createdAt: Date;

  /**
   * La fatigue se lit AU JOUR J : a chaque chargement, elle est recalculee a partir des entrees stockees
   * (les efforts vieillissent, un joueur au repos redevient frais sans nouvel import). Sans entrees
   * stockees (joueur saisi a la main, base ancienne), les valeurs enregistrees restent telles quelles.
   */
  @AfterLoad()
  rafraichirFatigue() {
    const entree = deserialiserEntree(this.fatigueEntree, new Date());
    if (!entree) return;
    const c = champsFatigue(entree);
    this.scoreFatigue = c.scoreFatigue as number;
    this.acwr = c.acwr as number;
    this.chargeAcute7j = c.chargeAcute7j as number;
    this.chargeChronic28j = c.chargeChronic28j as number;
    this.fatigueDetail = c.fatigueDetail;
  }
}
