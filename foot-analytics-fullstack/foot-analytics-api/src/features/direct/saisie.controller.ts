// src/features/direct/saisie.controller.ts
//
// Le direct vu par un saisisseur invite (sans compte) : ouvrir son lien, lire le match, saisir et annuler des evenements, et, si
// l'invitation l'autorise, piloter le chrono. Rien d'autre : pas de cloture, pas de reouverture, pas d'invitation, pas d'autre match.
// Les identifiants de comptes ne sortent jamais d'ici.

import { BadRequestException, Body, Controller, Delete, Get, HttpCode, Param, Post, Put, Req, UseGuards } from "@nestjs/common";
import { IsString, MaxLength } from "class-validator";

import { Acces } from "@/features/acces/acces.decorator";
import { ContexteAcces } from "@/features/acces/contexte-acces";
import { Public } from "@/features/auth/public.decorator";

import { ActionChronoDto, EvenementDirectDto, ID_CLIENT } from "./direct.dto";
import { DirectService } from "./direct.service";
import { InvitationDirect } from "./invitation-direct.entity";
import { InvitationGuard } from "./invitation.guard";
import { InvitationsService } from "./invitations.service";

class OuvrirDto { @IsString() @MaxLength(100) jeton: string }

const idValide = (id: string) => { if (!ID_CLIENT.test(id)) throw new BadRequestException("Identifiant d'evenement invalide."); return id; };
/** Ce que l'invite a le droit de voir d'un evenement : jamais l'identifiant du compte qui l'a saisi. */
const sansAuteur = <T extends { auteurId?: unknown }>({ auteurId: _a, ...reste }: T) => { void _a; return reste; };

@Controller("saisie")
@Public()
export class SaisieController {
  constructor(private invitations: InvitationsService, private direct: DirectService) {}

  /** Consomme le lien (une seule fois) et donne sa session a l'appareil. Public : c'est le jeton du lien qui fait foi. */
  @Post("ouvrir") @HttpCode(200)
  ouvrir(@Body() dto: OuvrirDto) { return this.invitations.ouvrir(dto.jeton); }

  @Get("etat") @UseGuards(InvitationGuard)
  async etat(@Acces() ctx: ContexteAcces, @Req() req: { invitation: InvitationDirect }) {
    const e = await this.direct.etat(ctx, req.invitation.matchId);
    return { ...e, joueurs: e.joueurs.map(({ fatigue: _f, ...j }) => j), evenements: e.evenements.map(sansAuteur), invitation: { libelle: req.invitation.libelle, peutChrono: req.invitation.peutChrono, expireLe: req.invitation.expireLe } };
  }

  /** Idempotent, comme la saisie du staff : rejouer la requete ne cree jamais de doublon. */
  @Put("evenements/:id") @UseGuards(InvitationGuard)
  async enregistrer(@Acces() ctx: ContexteAcces, @Req() req: { invitation: InvitationDirect; origine: { auteurId: string; invite: string } }, @Param("id") id: string, @Body() dto: EvenementDirectDto) {
    return sansAuteur(await this.direct.enregistrer(ctx, req.invitation.matchId, idValide(id), dto, Date.now(), req.origine));
  }

  @Delete("evenements/:id") @UseGuards(InvitationGuard) @HttpCode(204)
  async supprimer(@Acces() ctx: ContexteAcces, @Req() req: { invitation: InvitationDirect; origine: { auteurId: string; invite: string } }, @Param("id") id: string) {
    await this.direct.supprimer(ctx, req.invitation.matchId, idValide(id), Date.now(), req.origine);
  }

  @Post("chrono") @UseGuards(InvitationGuard) @HttpCode(200)
  async chrono(@Acces() ctx: ContexteAcces, @Req() req: { invitation: InvitationDirect; origine: { auteurId: string; invite: string } }, @Body() dto: ActionChronoDto) {
    this.invitations.exigerChrono(req.invitation);
    const e = await this.direct.chrono(ctx, req.invitation.matchId, dto, Date.now(), req.origine);
    return { ...e, evenements: e.evenements.map(sansAuteur) };
  }
}
