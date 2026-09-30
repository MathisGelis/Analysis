// src/entities/index.ts
//
// Entites TypeORM — alignees sur supabase/schema.sql.
// Compatibles SQLite (dev, zero config) et Postgres/Supabase (prod).
// On evite les types PG-specifiques (text[], jsonb) : les tableaux sont
// stockes en "simple-array", les payloads en "simple-json" (portable).

import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, Index,
} from "typeorm";

@Entity("clubs")
export class Club {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ unique: true, nullable: true }) numeroFff: string;
  @Column() nom: string;
  @Column({ nullable: true }) ville: string;
  @Column({ nullable: true }) abbr: string;
  @Column({ default: "#b6f24a" }) couleur: string;
  @Column({ nullable: true }) logoUrl: string;
  @CreateDateColumn() creeLe: Date;

  @OneToMany(() => Equipe, (e) => e.club) equipes: Equipe[];
  @OneToMany(() => Joueur, (j) => j.club) joueurs: Joueur[];
}

@Entity("saisons")
export class Saison {
  @PrimaryGeneratedColumn("uuid") id: string;
  // Libelle : ex. "2025-2026". Unique pour eviter les doublons.
  @Column({ unique: true }) nom: string;
  // Annee de debut (entier). Utile pour deduire la saison d'une date.
  @Column({ type: "int" }) anneeDebut: number;
  // Une seule saison active a la fois — c'est la saison "courante"
  // utilisee par defaut dans les imports et les vues. On peut basculer
  // d'une saison a l'autre via PATCH /saisons/:id/activer.
  @Column({ default: false }) actif: boolean;
  // Etat libre : "en_cours", "terminee", "a_venir". Informatif.
  @Column({ default: "en_cours" }) statut: string;
  @CreateDateColumn() createdAt: Date;
}

@Entity("equipes")
export class Equipe {
  @PrimaryGeneratedColumn("uuid") id: string;
  @ManyToOne(() => Club, (c) => c.equipes, { onDelete: "CASCADE" })
  @JoinColumn({ name: "club_id" }) club: Club;
  @Index() @Column({ name: "club_id" }) clubId: string;
  @Column() nom: string;
  // Categorie d'age : "Seniors", "U20", "U17", "U15", "Veterans", "Feminines"...
  @Column({ nullable: true }) categorie: string;
  // Division : "D1", "D2", "R2", "R3", "D5"...
  @Column({ nullable: true }) division: string;
  // Poule au sein de la division (ex. "A", "B", "C"...).
  @Column({ nullable: true }) poule: string;
  // Libelle competition exact tel qu'il apparait dans la FMI (utilise
  // pour le matching auto). Ex. "Seniors D2 / Phase Unique".
  @Column({ nullable: true }) competitionLibelle: string;
  // Saison de rattachement. Une meme equipe physique (ex. "Seniors D2")
  // est dupliquee par saison pour garder l'historique des classements.
  @ManyToOne(() => Saison, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "saison_id" }) saison: Saison;
  @Index() @Column({ name: "saison_id", nullable: true }) saisonId: string;
  @Column({ nullable: true }) coach: string;
  @Column({ default: "4-2-3-1" }) formationDef: string;
  @CreateDateColumn() createdAt: Date;
}

@Entity("joueurs")
export class Joueur {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column({ nullable: true }) licence: string;
  @Column() nom: string;
  @Column({ nullable: true }) prenom: string;
  @ManyToOne(() => Club, (c) => c.joueurs, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "club_id" }) club: Club;
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
  @Column({ type: "int", nullable: true }) scoreForme: number;
  // Score de fatigue 0-100, derive de l'ACWR (Acute:Chronic Workload
  // Ratio sur la charge entrainement + match). Bas = repose, haut =
  // surcharge. Sweet spot ACWR 0.8-1.3 -> fatigue ~50.
  @Column({ type: "int", nullable: true }) scoreFatigue: number;
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
}

@Entity("matchs")
export class Match {
  @PrimaryGeneratedColumn("uuid") id: string;
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

@Entity("compositions")
export class Composition {
  @PrimaryGeneratedColumn("uuid") id: string;
  @ManyToOne(() => Match, (m) => m.compositions, { onDelete: "CASCADE" })
  @JoinColumn({ name: "match_id" }) match: Match;
  @Index() @Column({ name: "match_id" }) matchId: string;
  @Column() cote: "dom" | "ext";
  @Column({ type: "int" }) numero: number;
  @Index() @Column() nom: string;
  @Column({ nullable: true }) prenom: string;
  @Index() @Column({ nullable: true }) licence: string;
  @Column({ default: true }) titulaire: boolean;
  @Column({ default: false }) capitaine: boolean;
  @Column({ type: "int", default: 0 }) minutes: number;
  @Column({ type: "float", nullable: true }) note: number;
}

@Entity("evenements_match")
export class EvenementMatch {
  @PrimaryGeneratedColumn("uuid") id: string;
  @ManyToOne(() => Match, (m) => m.evenements, { onDelete: "CASCADE" })
  @JoinColumn({ name: "match_id" }) match: Match;
  @Index() @Column({ name: "match_id" }) matchId: string;
  @Column() type: string;            // carton | but | remplacement | blessure
  @Column({ nullable: true }) sousType: string;
  @Column({ nullable: true }) motif: string;
  @Column({ type: "int", nullable: true }) minute: number;
  @Column({ type: "int", default: 0 }) arret: number;
  @Column() joueur: string;
  @Column({ nullable: true }) joueur2: string;
  @Column() equipe: "dom" | "ext";
}

@Entity("entrainements")
export class Entrainement {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Index() @Column({ name: "equipe_id", nullable: true }) equipeId: string;
  @Column({ nullable: true }) date: string;
  @Column({ nullable: true }) jour: string;
  @Column({ nullable: true }) heure: string;
  @Column({ nullable: true }) type: string;       // tactique/physique/recup...
  @Column({ nullable: true }) theme: string;
  @Column({ type: "int", default: 90 }) dureeMin: number;
  @Column({ type: "int", nullable: true }) intensite: number;  // /10 (echelle RPE)
  // Charge en UA-RPE (Unite Arbitraire de Foster) : duree x RPE_modulee.
  // Voir EntrainementsService.calcCharge pour la formule.
  @Column({ type: "float", default: 0 }) charge: number;
  @Column({ nullable: true }) terrain: string;
  // Espace de jeu utilise : terrain_entier / demi_terrain / quart_terrain /
  // espace_reduit / salle / autre. Module la charge (plus l'espace est
  // restreint, plus la densite physique est forte).
  @Column({ nullable: true }) espace: string;
  @Column({ type: "int", default: 0 }) presents: number;
  @Column({ type: "int", default: 0 }) total: number;
  // Liste des ids de joueurs ayant assiste a la seance.
  @Column({ type: "simple-array", nullable: true })
  joueursPresents: string[];
  @CreateDateColumn() createdAt: Date;
}

@Entity("blessures")
export class Blessure {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Index() @Column({ name: "joueur_id" }) joueurId: string;
  @Column({ nullable: true }) joueurNom: string;
  @Column({ nullable: true }) localisation: string;
  @Column({ nullable: true }) gravite: string;
  @Column({ nullable: true }) dateDebut: string;
  @Column({ nullable: true }) retourEstime: string;
  @Column({ nullable: true }) statut: string;     // Indisponible/Reprise/Suspendu
  // Champ texte libre pour notes complementaires : "IRM prevu",
  // "Recoit physiothérapie", "Reprise progressive", etc.
  @Column({ type: "text", nullable: true }) details: string;
  @Column({ type: "int", nullable: true }) risqueRecidive: number;
  @CreateDateColumn() createdAt: Date;
}

@Entity("rapports_scouting")
export class RapportScouting {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Index() @Column({ name: "club_id" }) clubId: string;
  @Column() equipeNom: string;
  @Column({ nullable: true }) auteur: string;
  @Column({ nullable: true }) date: string;
  @Column({ nullable: true }) classement: string;
  @Column({ type: "int", default: 0 }) points: number;
  @Column({ nullable: true }) bilan: string;
  @Column({ nullable: true }) bilanDom: string;
  @Column({ nullable: true }) bilanExt: string;
  @Column({ type: "int", default: 0 }) butsMarques: number;
  @Column({ type: "int", default: 0 }) butsEncaisses: number;
  @Column({ type: "int", default: 0 }) cartonsJaunes: number;
  @Column({ type: "int", default: 0 }) cartonsRouges: number;
  @Column({ nullable: true }) dispositifAttendu: string;
  @Column({ type: "text", nullable: true }) commentaires: string;
  @Column({ nullable: true }) capitaine: string;
  @Column({ type: "simple-array", nullable: true }) joueursSuspendus: string[];
  @Column({ type: "simple-array", nullable: true }) joueursCles: string[];
  @Column({ type: "simple-array", nullable: true }) forces: string[];
  @Column({ type: "simple-array", nullable: true }) faiblesses: string[];
  @Column({ type: "simple-json", nullable: true }) resultats: any[];
  @Column({ type: "simple-json", nullable: true }) dernier11: any[];
  @CreateDateColumn() createdAt: Date;
}

@Entity("classement")
export class LigneClassement {
  @PrimaryGeneratedColumn("uuid") id: string;
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

@Entity("arbitres")
export class Arbitre {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column() nom: string;
  @Column({ nullable: true }) prenom: string;
  // Cumuls denormalises GLOBAUX, recalcules par la derivation.
  @Column({ type: "int", default: 0 }) matchsOfficies: number;
  @Column({ type: "int", default: 0 }) cartonsJaunesDonnes: number;
  @Column({ type: "int", default: 0 }) cartonsRougesDonnes: number;
  // Compteurs par role (un meme arbitre peut avoir officie comme principal
  // sur un match et assistant sur un autre).
  @Column({ type: "int", default: 0 }) matchsPrincipal: number;
  @Column({ type: "int", default: 0 }) matchsAssistant: number;
  // "Autre" regroupe delegues, observateurs, autres officiels non
  // arbitres au sens strict.
  @Column({ type: "int", default: 0 }) matchsAutre: number;
  // Liste serialisee des roles joues : "principal,assistant,autre".
  @Column({ nullable: true }) roles: string;
  // Profil derive : "Permissif" | "Standard" | "Strict"
  @Column({ nullable: true }) profil: string;
  // Motifs les plus frequents (top 3, joints en chaine).
  @Column({ nullable: true }) motifsTop: string;
  // Note moyenne donnee par MON club, sur les matchs ou il a officie chez nous.
  @Column({ type: "float", nullable: true }) noteMoyenne: number;
  // Stats decomposees par championnat (saison + competition + poule).
  // Stocke en JSON serialise pour eviter une table dediee.
  // Permet le filtrage cote front sur le championnat de l'equipe propre
  // ET la comparaison entre saisons consecutives.
  @Column({ type: "text", nullable: true }) participations: string;
  @CreateDateColumn() createdAt: Date;

  @OneToMany(() => ArbitreMatch, (a) => a.arbitre) participationsLies: ArbitreMatch[];
}

@Entity("arbitres_matchs")
export class ArbitreMatch {
  @PrimaryGeneratedColumn("uuid") id: string;
  @ManyToOne(() => Match, (m) => m.arbitres, { onDelete: "CASCADE" })
  @JoinColumn({ name: "match_id" }) match: Match;
  @Index() @Column({ name: "match_id" }) matchId: string;
  @ManyToOne(() => Arbitre, (a) => a.participationsLies, { onDelete: "CASCADE" })
  @JoinColumn({ name: "arbitre_id" }) arbitre: Arbitre;
  @Index() @Column({ name: "arbitre_id" }) arbitreId: string;
  // "principal" | "assistant1" | "assistant2" | "4e"
  @Column() role: string;
  // Note 1..10, donnee par MON club uniquement (sinon NULL).
  @Column({ type: "float", nullable: true }) note: number;
}

@Entity("coachs")
export class Coach {
  @PrimaryGeneratedColumn("uuid") id: string;
  @Column() nom: string;
  @Column({ nullable: true }) prenom: string;
  @Column({ nullable: true }) licence: string;
  // Club courant deduit : le club ou il a accompagne le plus souvent
  // sur les dernieres journees.
  @ManyToOne(() => Club, { onDelete: "SET NULL", nullable: true })
  @JoinColumn({ name: "club_id" }) club: Club;
  @Index() @Column({ name: "club_id", nullable: true }) clubId: string;
  // Cumuls denormalises, recalcules par la derivation.
  @Column({ type: "int", default: 0 }) matchsPresent: number;
  @Column({ type: "int", default: 0 }) v: number;
  @Column({ type: "int", default: 0 }) n: number;
  @Column({ type: "int", default: 0 }) d: number;
  // Pour la categorie : "principal" si fonction E majoritaire, sinon
  // "assistant" si M majoritaire, "dirigeant" pour D etc.
  @Column({ nullable: true }) categorie: string;
  // Cartons RECUS par ce coach (different des cartons donnes par un
  // arbitre). Issus des evenements de cartons dont le motif mentionne
  // "Banc" / "Educateur" / "Coach" et le nom matche.
  @Column({ type: "int", default: 0 }) cartonsJaunes: number;
  @Column({ type: "int", default: 0 }) cartonsRouges: number;
  // Motifs frequents des cartons recus (joints).
  @Column({ nullable: true }) motifsTop: string;
  @CreateDateColumn() createdAt: Date;

  @OneToMany(() => StaffMatch, (sm) => sm.coach) participations: StaffMatch[];
}

@Entity("staff_matchs")
export class StaffMatch {
  @PrimaryGeneratedColumn("uuid") id: string;
  @ManyToOne(() => Match, { onDelete: "CASCADE" })
  @JoinColumn({ name: "match_id" }) match: Match;
  @Index() @Column({ name: "match_id" }) matchId: string;
  @ManyToOne(() => Coach, (c) => c.participations, { onDelete: "CASCADE" })
  @JoinColumn({ name: "coach_id" }) coach: Coach;
  @Index() @Column({ name: "coach_id" }) coachId: string;
  // Cote au moment de ce match (le coach peut avoir change de club).
  @Column() cote: "dom" | "ext";
  // Liste brute des fonctions vues sur cette FMI (peut etre "E", "E/DR",
  // "D", "M", "A"...). On exclut "DR" (delegue de rencontre) cote
  // derivation.
  @Column() fonctions: string;
}

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
  @PrimaryGeneratedColumn("uuid") id: string;
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
  @CreateDateColumn() createdAt: Date;
}

export const ALL_ENTITIES = [
  Club, Equipe, Joueur, Match, Composition, EvenementMatch,
  Entrainement, Blessure, RapportScouting, LigneClassement,
  Arbitre, ArbitreMatch, Coach, StaffMatch, Saison, Utilisateur,
];
