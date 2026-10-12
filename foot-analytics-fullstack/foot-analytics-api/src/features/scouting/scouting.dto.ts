// src/features/scouting/scouting.dto.ts

import { IsArray, IsInt, IsOptional, IsString } from "class-validator";

export class UpsertRapportDto {
  @IsString() clubId: string;
  @IsString() equipeNom: string;
  @IsOptional() @IsString() auteur?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() classement?: string;
  @IsOptional() @IsInt() points?: number;
  @IsOptional() @IsString() bilan?: string;
  @IsOptional() @IsString() bilanDom?: string;
  @IsOptional() @IsString() bilanExt?: string;
  @IsOptional() @IsInt() butsMarques?: number;
  @IsOptional() @IsInt() butsEncaisses?: number;
  @IsOptional() @IsInt() cartonsJaunes?: number;
  @IsOptional() @IsInt() cartonsRouges?: number;
  @IsOptional() @IsString() dispositifAttendu?: string;
  @IsOptional() @IsString() commentaires?: string;
  @IsOptional() @IsString() capitaine?: string;
  @IsOptional() @IsArray() joueursSuspendus?: string[];
  @IsOptional() @IsArray() joueursCles?: string[];
  @IsOptional() @IsArray() forces?: string[];
  @IsOptional() @IsArray() faiblesses?: string[];
  @IsOptional() @IsArray() resultats?: any[];
  @IsOptional() @IsArray() dernier11?: any[];
}
