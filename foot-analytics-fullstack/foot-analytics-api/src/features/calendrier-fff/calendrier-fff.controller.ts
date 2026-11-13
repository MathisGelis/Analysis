// src/features/calendrier-fff/calendrier-fff.controller.ts

import {
  BadRequestException, Body, Controller, HttpCode, Param, Post, Put, UploadedFile, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { TAILLE_MAX_CALENDRIER } from "./adresse-calendrier";
import { CalendrierFffService } from "./calendrier-fff.service";
import { AdresseCalendrierDto } from "./calendrier-fff.dto";

/** Calendrier FFF d'une equipe : l'equipe doit etre dans le perimetre du compte (admin, referent du club, educateur de l'equipe). */
@Controller("calendrier-fff/equipes/:equipeId")
export class CalendrierFffController {
  constructor(private svc: CalendrierFffService, private acces: AccesService) {}

  // Enregistre l'adresse du calendrier de l'equipe (media.fff.fr/calendars/AAAA/eq/....ics, ou webcal://...), ou l'efface.
  @Put("adresse")
  async adresse(@Acces() ctx: ContexteAcces, @Param("equipeId") equipeId: string, @Body() dto: AdresseCalendrierDto) {
    const equipe = await this.acces.equipeGeree(ctx, equipeId);
    const sauvee = await this.svc.definirAdresse(equipe, dto.url ?? null);
    return { calendrierUrl: sauvee.calendrierUrl, calendrierSynchroLe: sauvee.calendrierSynchroLe };
  }

  // Telecharge le calendrier a l'adresse de l'equipe et le synchronise ; rend le rapport (crees, modifies, disparus...).
  @Post("synchroniser")
  @HttpCode(200)
  async synchroniser(@Acces() ctx: ContexteAcces, @Param("equipeId") equipeId: string) {
    const equipe = await this.acces.equipeGeree(ctx, equipeId);
    return this.svc.synchroniserAdresse(equipe, ctx.compte);
  }

  // Meme traitement pour un fichier .ics depose a la main (champ "file") : sans aucun telechargement par le serveur.
  @Post("importer")
  @HttpCode(200)
  @UseInterceptors(FileInterceptor("file", { limits: { fileSize: TAILLE_MAX_CALENDRIER, files: 1 } }))
  async importer(@Acces() ctx: ContexteAcces, @Param("equipeId") equipeId: string, @UploadedFile() file: Express.Multer.File) {
    const equipe = await this.acces.equipeGeree(ctx, equipeId);
    if (!file) throw new BadRequestException("Aucun fichier recu (champ 'file').");
    return this.svc.synchroniser(equipe, file.buffer.toString("utf8"), "fichier", ctx.compte);
  }
}
