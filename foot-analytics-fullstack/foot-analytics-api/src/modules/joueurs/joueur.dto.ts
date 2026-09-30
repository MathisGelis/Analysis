// src/modules/joueurs/joueur.dto.ts
import {
  IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min,
} from "class-validator";

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
  @IsOptional() @IsInt() @Min(0) @Max(100) scoreForme?: number;
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
  @IsOptional() @IsInt() @Min(0) @Max(100) scoreForme?: number;
  @IsOptional() @IsString() postes?: string;
  @IsOptional() @IsString() typeDiscipline?: string;
}

/** Saisie manuelle des buts / passes d'un joueur dans une equipe (une saison). */
export class StatEquipeDto {
  @IsOptional() @IsInt() @Min(0) @Max(200) buts?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(200) passesDecisives?: number | null;
}
