// src/features/coachs/coachs.dto.ts

import { IsIn, IsOptional, IsString } from "class-validator";

export class CreateCoachDto {
  @IsString() nom: string;
  @IsOptional() @IsString() prenom?: string;
  @IsOptional() @IsString() licence?: string;
  @IsOptional() @IsString() clubId?: string;
}
export class UpdateCoachDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() prenom?: string;
  @IsOptional() @IsString() licence?: string;
  @IsOptional() @IsString() clubId?: string;
}
export class CreateStaffMatchDto {
  @IsString() matchId: string;
  @IsString() coachId: string;
  @IsIn(["dom", "ext"]) cote: "dom" | "ext";
  @IsOptional() @IsString() fonctions?: string;
}
