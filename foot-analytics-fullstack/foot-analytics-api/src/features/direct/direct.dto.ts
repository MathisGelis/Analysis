// src/features/direct/direct.dto.ts

import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from "class-validator";

import { ACTIONS_CHRONO, ActionChrono } from "./chrono";
import { COULOIRS, TIERS, TYPES_EVENEMENT, ZONES_CADRE } from "./types";

/** Identifiant fabrique par l'appareil (UUID ou equivalent) : lettres, chiffres, tirets, 8 a 64 caracteres. */
const ID_CLIENT = /^[A-Za-z0-9_-]{8,64}$/;

export class ActionChronoDto {
  @IsIn(ACTIONS_CHRONO as unknown as string[]) action: ActionChrono;
  /** Pour « corriger » : la minute de match sur laquelle recaler le chrono. */
  @IsOptional() @IsInt() @Min(0) @Max(200) minute?: number;
}

export class EvenementDirectDto {
  @IsIn(["dom", "ext"]) cote: "dom" | "ext";
  @IsIn(TYPES_EVENEMENT as unknown as string[]) type: string;
  @IsOptional() @IsString() @MaxLength(20) resultat?: string | null;
  @IsInt() @Min(1) @Max(4) periode: number;
  @IsInt() @Min(0) @Max(200) minute: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) joueurNumero?: number | null;
  @IsOptional() @IsString() @MaxLength(80) joueurNom?: string | null;
  @IsOptional() @IsString() @Matches(ID_CLIENT) joueurId?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(99) joueur2Numero?: number | null;
  @IsOptional() @IsString() @MaxLength(80) joueur2Nom?: string | null;
  @IsOptional() @IsString() @Matches(ID_CLIENT) joueur2Id?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(TIERS - 1) zoneTier?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(COULOIRS - 1) zoneCouloir?: number | null;
  @IsOptional() @IsInt() @Min(0) @Max(ZONES_CADRE - 1) zoneCadre?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(11) @IsString({ each: true }) @MaxLength(40, { each: true }) contextes?: string[];
}

export class InvitationDto {
  @IsString() @MaxLength(60) libelle: string;
  @IsOptional() @IsBoolean() peutChrono?: boolean;
  @IsOptional() @IsInt() @Min(1) @Max(48) dureeHeures?: number;
}

export { ID_CLIENT };
