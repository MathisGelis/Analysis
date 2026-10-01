// src/features/saisons/saisons.dto.ts

import { IsBoolean, IsInt, IsOptional, IsString } from "class-validator";

export class CreateSaisonDto {
  @IsString() nom: string;
  @IsInt() anneeDebut: number;
  @IsOptional() @IsBoolean() actif?: boolean;
  @IsOptional() @IsString() statut?: string;
}
export class UpdateSaisonDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsInt() anneeDebut?: number;
  @IsOptional() @IsBoolean() actif?: boolean;
  @IsOptional() @IsString() statut?: string;
}
