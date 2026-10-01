// src/features/tactiques/tactiques.dto.ts

import { IsArray, IsOptional, IsString } from "class-validator";

export class EnregistrerTactiqueDto {
  @IsString() equipeId: string;
  @IsOptional() @IsString() matchId?: string | null;
  @IsString() formation: string;
  /** 11 cases dans l'ordre des postes ; null ou "" = poste vide. */
  @IsArray() titulaires: (string | null)[];
  @IsArray() remplacants: string[];
  @IsOptional() @IsString() capitaineId?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}
