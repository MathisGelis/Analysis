// src/features/equipes/equipes.dto.ts

import { IsOptional, IsString } from "class-validator";

export class UpsertEquipeDto {
  @IsString() clubId: string;
  @IsString() nom: string;
  @IsOptional() @IsString() categorie?: string;
  @IsOptional() @IsString() division?: string;
  @IsOptional() @IsString() poule?: string;
  @IsOptional() @IsString() competitionLibelle?: string;
  @IsOptional() @IsString() saisonId?: string;
  @IsOptional() @IsString() coach?: string;
  @IsOptional() @IsString() formationDef?: string;
}
