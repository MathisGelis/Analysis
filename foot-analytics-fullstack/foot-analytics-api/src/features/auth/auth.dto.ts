// src/features/auth/auth.dto.ts

import { IsString, MinLength } from "class-validator";

export class LoginDto {
  @IsString() login: string;
  @IsString() password: string;
}
export class ChangePasswordDto {
  @IsString() oldPassword: string;
  @IsString() @MinLength(6) newPassword: string;
}
