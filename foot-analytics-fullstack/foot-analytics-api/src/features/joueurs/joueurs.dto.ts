// src/features/joueurs/joueurs.dto.ts
import {
  ArrayMaxSize, IsArray, IsIn, IsInt, IsNumber, IsOptional, IsString, Max, MaxLength, Min,
} from "class-validator";

import { POSTES_FICHE, STATUTS_SITUATION } from "./recherche-avancee";

const STATUTS_VALIDES = [
  "Pas mutation", "Mutation", "Mutation hors delai", "Non connu",
];
const PIEDS_VALIDES = ["droit", "gauche", "ambidextre"];

export class CreateJoueurDto {
  @IsString() nom: string;
  @IsOptional() @IsString() prenom?: string;
  @IsString() clubId: string;
  @IsOptional() @IsString() poste?: string;
  @IsOptional() @IsInt() @Min(1) @Max(99) numeroFavori?: number;
  @IsOptional() @IsString() licence?: string;
  @IsOptional() @IsIn(STATUTS_VALIDES) statutMutation?: string;
  @IsOptional() @IsString() commentaire?: string;
  @IsOptional() @IsString() dateNaissance?: string;
  @IsOptional() @IsInt() @Min(100) @Max(230) tailleCm?: number;
  @IsOptional() @IsInt() @Min(30) @Max(160) poidsKg?: number;
  @IsOptional() @IsIn(PIEDS_VALIDES) piedFort?: string;
  @IsOptional() @IsInt() matchs?: number;
  @IsOptional() @IsInt() titularisations?: number;
  @IsOptional() @IsInt() minutes?: number;
  @IsOptional() @IsInt() cartonsJaunes?: number;
  @IsOptional() @IsInt() cartonsRouges?: number;
  @IsOptional() @IsInt() @Min(0) buts?: number;
  @IsOptional() @IsInt() @Min(0) passesDecisives?: number;
  @IsOptional() @IsNumber() noteMoyenne?: number;
  @IsOptional() @IsString() postes?: string;
  @IsOptional() @IsString() typeDiscipline?: string;
}

// Toutes les proprietes optionnelles pour la mise a jour partielle (PATCH).
export class UpdateJoueurDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() prenom?: string;
  @IsOptional() @IsString() clubId?: string;
  @IsOptional() @IsString() poste?: string;
  @IsOptional() @IsInt() @Min(1) @Max(99) numeroFavori?: number;
  @IsOptional() @IsString() licence?: string;
  @IsOptional() @IsIn(STATUTS_VALIDES) statutMutation?: string;
  @IsOptional() @IsString() commentaire?: string;
  @IsOptional() @IsString() dateNaissance?: string;
  @IsOptional() @IsInt() @Min(100) @Max(230) tailleCm?: number;
  @IsOptional() @IsInt() @Min(30) @Max(160) poidsKg?: number;
  @IsOptional() @IsIn(PIEDS_VALIDES) piedFort?: string;
  @IsOptional() @IsInt() matchs?: number;
  @IsOptional() @IsInt() titularisations?: number;
  @IsOptional() @IsInt() minutes?: number;
  @IsOptional() @IsInt() cartonsJaunes?: number;
  @IsOptional() @IsInt() cartonsRouges?: number;
  @IsOptional() @IsInt() @Min(0) buts?: number;
  @IsOptional() @IsInt() @Min(0) passesDecisives?: number;
  @IsOptional() @IsNumber() noteMoyenne?: number;
  @IsOptional() @IsString() postes?: string;
  @IsOptional() @IsString() typeDiscipline?: string;
}

/** Saisie manuelle des buts / passes d'un joueur dans une equipe (une saison). */
export class StatEquipeDto {
  @IsOptional() @IsInt() @Min(0) @Max(200) buts?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(200) passesDecisives?: number | null;
}

/** Recherche libre (nom, prenom, ou debut de licence dans son club). */
export class RechercheDto {
  @IsString() @MaxLength(100) q: string;
}

/**
 * Recherche avancee (voir recherche-avancee.ts) : a joue la saison `saisonId` (categorie, division, club), a tel poste,
 * et sa situation la saison `situationSaisonId` (sans club, meme club, autre club). Que des criteres publics.
 */
export class RechercheAvanceeDto {
  @IsString() @MaxLength(64) saisonId: string;
  @IsOptional() @IsString() @MaxLength(40) categorie?: string;
  @IsOptional() @IsString() @MaxLength(40) division?: string;
  @IsOptional() @IsString() @MaxLength(64) clubId?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(POSTES_FICHE.length) @IsIn(POSTES_FICHE, { each: true }) postes?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(60) minMatchs?: number;
  @IsOptional() @IsString() @MaxLength(64) situationSaisonId?: string;
  @IsOptional() @IsIn(STATUTS_SITUATION) situation?: string;
}
