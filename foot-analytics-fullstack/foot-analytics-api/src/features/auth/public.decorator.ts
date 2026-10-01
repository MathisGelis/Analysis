// src/features/auth/public.decorator.ts

import { SetMetadata } from "@nestjs/common";

/**
 * Decorator @Public() : marque une route comme accessible sans token.
 * Utilise sur POST /auth/login pour pouvoir se connecter.
 */
export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
