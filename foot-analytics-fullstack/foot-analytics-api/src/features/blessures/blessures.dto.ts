// src/features/blessures/blessures.dto.ts

import { IsBoolean, IsInt, IsOptional, IsString } from "class-validator";

export class UpsertBlessureDto {
  @IsString() joueurId: string;
  @IsOptional() @IsString() localisation?: string;
  @IsOptional() @IsString() gravite?: string;
  @IsOptional() @IsString() dateDebut?: string;
  @IsOptional() @IsString() retourEstime?: string;
  @IsOptional() @IsString() statut?: string;
  @IsOptional() @IsString() details?: string;
  /** Confirme l'enregistrement malgre un chevauchement avec une blessure existante. */
  @IsOptional() @IsBoolean() forcer?: boolean;
}
