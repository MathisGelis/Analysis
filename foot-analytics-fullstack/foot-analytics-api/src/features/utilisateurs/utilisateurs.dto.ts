// src/features/utilisateurs/utilisateurs.dto.ts

import { IsArray, IsBoolean, IsIn, IsOptional, IsString } from "class-validator";

import { ROLES } from "./droits-comptes";

export class CreateUserDto {
  @IsString() prenom: string;
  @IsString() nom: string;
  /** Defaut : educateur ("user"). Un referent ne peut creer que des educateurs. */
  @IsOptional() @IsIn([...ROLES]) role?: string;
  @IsOptional() @IsString() clubId?: string;
  @IsOptional() @IsArray() equipeIds?: string[];
  /** Educateur : false = saison actuelle + `saisonIds` seulement. Absent = toutes les saisons. */
  @IsOptional() @IsBoolean() toutesSaisons?: boolean;
  /** Saisons passees consultables en plus de la saison actuelle (educateur, quand `toutesSaisons` est faux). */
  @IsOptional() @IsArray() @IsString({ each: true }) saisonIds?: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() prenom?: string;
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsIn([...ROLES]) role?: string;
  @IsOptional() @IsString() clubId?: string;
  @IsOptional() @IsArray() equipeIds?: string[];
  @IsOptional() @IsBoolean() toutesSaisons?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) saisonIds?: string[];
  // Si fourni, reset le mdp et force mustChangePassword=true.
  @IsOptional() @IsString() resetPassword?: string;
}
