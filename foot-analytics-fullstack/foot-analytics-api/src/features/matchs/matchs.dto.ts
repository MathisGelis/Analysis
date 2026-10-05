// src/features/matchs/matchs.dto.ts

import { IsArray, IsInt, IsOptional, IsString } from "class-validator";

export class UpsertMatchDto {
  @IsOptional() @IsString() numeroFmi?: string;
  @IsOptional() @IsString() journee?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() heure?: string;
  @IsOptional() @IsString() competition?: string;
  @IsOptional() @IsString() poule?: string;
  @IsOptional() @IsString() terrain?: string;
  @IsString() clubDom: string;
  @IsString() clubExt: string;
  // Equipes (categorie + division + poule) et saison : ce qui rattache le match a une equipe. Sans eux, le match
  // existe mais n'apparait ni au calendrier ni au dashboard de l'equipe (la validation retire les champs inconnus).
  @IsOptional() @IsString() equipeDomId?: string;
  @IsOptional() @IsString() equipeExtId?: string;
  @IsOptional() @IsString() saisonId?: string;
  @IsOptional() @IsInt() scoreDom?: number;
  @IsOptional() @IsInt() scoreExt?: number;
  @IsOptional() @IsString() arbitre?: string;
  @IsOptional() @IsString() formationDom?: string;
  @IsOptional() @IsString() formationExt?: string;
  @IsOptional() @IsString() statut?: string;
  @IsOptional() @IsArray() compositions?: any[];
  @IsOptional() @IsArray() evenements?: any[];
}

/** PATCH : tout est facultatif (saisir un seul dispositif, changer un score...), contrairement a la creation. */
export class UpdateMatchDto {
  @IsOptional() @IsString() numeroFmi?: string;
  @IsOptional() @IsString() journee?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() heure?: string;
  @IsOptional() @IsString() competition?: string;
  @IsOptional() @IsString() poule?: string;
  @IsOptional() @IsString() terrain?: string;
  @IsOptional() @IsString() clubDom?: string;
  @IsOptional() @IsString() clubExt?: string;
  @IsOptional() @IsString() equipeDomId?: string;
  @IsOptional() @IsString() equipeExtId?: string;
  @IsOptional() @IsString() saisonId?: string;
  @IsOptional() @IsInt() scoreDom?: number;
  @IsOptional() @IsInt() scoreExt?: number;
  @IsOptional() @IsString() arbitre?: string;
  @IsOptional() @IsString() formationDom?: string;
  @IsOptional() @IsString() formationExt?: string;
  @IsOptional() @IsString() statut?: string;
  @IsOptional() @IsArray() compositions?: any[];
  @IsOptional() @IsArray() evenements?: any[];
}

/** Saisie des seuls dispositifs d'un match ("" pour effacer) : voir `refusSaisieDispositifs` pour qui peut quoi. */
export class DispositifsMatchDto {
  @IsOptional() @IsString() formationDom?: string;
  @IsOptional() @IsString() formationExt?: string;
}
