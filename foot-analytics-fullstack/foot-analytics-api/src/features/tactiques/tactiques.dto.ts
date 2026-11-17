// src/features/tactiques/tactiques.dto.ts

import { IsArray, IsObject, IsOptional, IsString } from "class-validator";

export class EnregistrerTactiqueDto {
  @IsString() equipeId: string;
  @IsOptional() @IsString() matchId?: string | null;
  @IsString() formation: string;
  /** 11 cases dans l'ordre des postes ; null ou "" = poste vide. */
  @IsArray() titulaires: (string | null)[];
  @IsArray() remplacants: string[];
  /** Numero porte par chaque joueur retenu (id -> numero, 1 a 99, tous differents). Absent : les numeros deja choisis sont conserves. */
  @IsOptional() @IsObject() numeros?: Record<string, number> | null;
  @IsOptional() @IsString() capitaineId?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}
