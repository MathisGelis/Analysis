// src/features/apres-match/apres-match.dto.ts

import { IsNumber, IsOptional, IsString, Max, MaxLength, Min, Validate, ValidatorConstraint, ValidatorConstraintInterface } from "class-validator";

/** Par demi-point : 0, 0.5, 1 ... 10. */
@ValidatorConstraint({ name: "demiPoint", async: false })
class DemiPoint implements ValidatorConstraintInterface {
  validate(v: unknown) { return typeof v === "number" && Number.isFinite(v) && Number.isInteger(v * 2); }
  defaultMessage() { return "La note se donne par demi-point, de 0 a 10."; }
}

export class NoteJoueurDto {
  @IsOptional() @IsNumber() @Min(0) @Max(10) @Validate(DemiPoint) note?: number | null;
  @IsOptional() @IsString() @MaxLength(500) commentaire?: string | null;
}

export class BilanDto {
  @IsOptional() @IsString() @MaxLength(2000) positifs?: string | null;
  @IsOptional() @IsString() @MaxLength(2000) aTravailler?: string | null;
  @IsOptional() @IsString() @MaxLength(4000) bilan?: string | null;
}
