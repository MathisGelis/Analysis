// src/features/direct/invitation.guard.ts
//
// Le garde des routes /saisie : l'invite presente sa session (Authorization: Invite <session>), jamais un jeton de compte. Les routes
// sont @Public() pour les gardes globaux (pas de compte) ; celui-ci en prend la place et ne donne acces qu'a ce que l'invitation permet.

import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";

import { InvitationsService } from "./invitations.service";

@Injectable()
export class InvitationGuard implements CanActivate {
  constructor(private invitations: InvitationsService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest();
    const h = (req.headers["authorization"] ?? "") as string;
    const m = h.match(/^Invite\s+(\S+)$/i);
    if (!m) throw new UnauthorizedException("Invitation absente.");
    const { invitation, ctx: acces, origine } = await this.invitations.authentifier(m[1]);
    req.invitation = invitation;
    req.acces = acces;
    req.origine = origine;
    return true;
  }
}
