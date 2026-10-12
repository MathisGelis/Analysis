// src/features/arbitres/arbitres.dto.ts

import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";

const ROLES = ["principal", "assistant1", "assistant2", "4e"] as const;

export class CreateArbitreDto {
  @IsString() nom: string;
  @IsOptional() @IsString() prenom?: string;
}
export class UpdateArbitreDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() prenom?: string;
}
export class CreateArbitreMatchDto {
  @IsString() matchId: string;
  @IsString() arbitreId: string;
  @IsIn(ROLES as any) role: string;
  @IsOptional() @IsNumber() @Min(0) @Max(10) note?: number;
}
export class UpdateArbitreMatchDto {
  @IsOptional() @IsIn(ROLES as any) role?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(10) note?: number;
}
