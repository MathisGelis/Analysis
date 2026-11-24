// src/features/planning-equipe/planning-equipe.dto.ts

import { ArrayMaxSize, IsArray, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from "class-validator";

export const ID_EVENEMENT = /^[A-Za-z0-9_-]{8,64}$/;

export class PlanningDto {
  @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) jours: number[];
  @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "heure : HH:MM" }) heure: string;
}

export class EvenementEquipeDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: "date : AAAA-MM-JJ" }) date: string;
  @IsOptional() @IsString() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "heure : HH:MM" }) heure?: string;
  @IsString() @MinLength(1) @MaxLength(120) titre: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}
