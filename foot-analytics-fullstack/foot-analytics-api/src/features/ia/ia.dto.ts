// src/features/ia/ia.dto.ts

import { IsArray, IsBoolean, IsOptional, IsString } from "class-validator";

export class LancerEntrainementDto {
  /** Essayer plusieurs hyperparametres (defaut : oui) ; non = un seul passage, plus rapide. */
  @IsOptional() @IsBoolean() optimiser?: boolean;
  /** Restreindre aux matchs de ces saisons ; absent ou vide = toutes les saisons. */
  @IsOptional() @IsArray() @IsString({ each: true }) saisonIds?: string[];
}
