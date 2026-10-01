// src/features/entrainements/entrainements.dto.ts

import { IsArray, IsInt, IsOptional, IsString, Min } from "class-validator";

export class CreateEntrainementDto {
  @IsOptional() @IsString() equipeId?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() jour?: string;
  @IsOptional() @IsString() heure?: string;
  @IsOptional() @IsString() type?: string;
  @IsOptional() @IsString() theme?: string;
  @IsOptional() @IsInt() @Min(0) dureeMin?: number;
  @IsOptional() @IsInt() @Min(0) intensite?: number;
  @IsOptional() @IsString() terrain?: string;
  @IsOptional() @IsString() espace?: string;
  @IsOptional() @IsInt() presents?: number;
  @IsOptional() @IsInt() total?: number;
  @IsOptional() @IsArray() joueursPresents?: string[];
}
