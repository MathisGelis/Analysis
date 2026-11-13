// src/features/calendrier-fff/calendrier-fff.dto.ts
import { IsOptional, IsString, MaxLength } from "class-validator";

/** L'adresse du calendrier FFF d'une equipe ; vide ou absente : l'efface. */
export class AdresseCalendrierDto {
  @IsOptional() @IsString() @MaxLength(300) url?: string | null;
}
