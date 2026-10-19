// src/features/auth/auth.dto.ts

import { IsString, MaxLength } from "class-validator";

export class LoginDto {
  @IsString() @MaxLength(64) login: string;
  @IsString() @MaxLength(256) password: string;
}
/** La politique (longueur, mots de passe courants...) est appliquee par AuthService : voir mots-de-passe.ts. */
export class ChangePasswordDto {
  @IsString() @MaxLength(256) oldPassword: string;
  @IsString() @MaxLength(256) newPassword: string;
}
export class RefreshDto {
  @IsString() @MaxLength(256) refreshToken: string;
}
export class CguDto {
  @IsString() @MaxLength(32) version: string;
}
