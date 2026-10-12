// src/features/clubs/clubs.dto.ts

import { IsOptional, IsString } from "class-validator";

export class UpsertClubDto {
  @IsOptional() @IsString() id?: string;
  @IsString() nom: string;
  @IsOptional() @IsString() abbr?: string;
  @IsOptional() @IsString() ville?: string;
  @IsOptional() @IsString() numeroFff?: string;
  @IsOptional() @IsString() couleur?: string;
  @IsOptional() @IsString() logoUrl?: string;
}
