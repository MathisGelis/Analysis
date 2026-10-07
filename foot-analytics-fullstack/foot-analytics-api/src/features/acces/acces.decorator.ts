// src/features/acces/acces.decorator.ts

import { createParamDecorator, ExecutionContext } from "@nestjs/common";

import { ContexteAcces } from "./contexte-acces";

/** Le contexte d'acces de la requete en cours (pose par AccesGuard). */
export const Acces = createParamDecorator((_data: unknown, ctx: ExecutionContext): ContexteAcces => {
  return ctx.switchToHttp().getRequest().acces;
});
