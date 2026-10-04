// src/features/analyse/analyse.controller.ts

import { BadRequestException, Controller, Get, Param, Query, StreamableFile } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { DESCRIPTION_PAGES, lirePages, PAGES_RAPPORT } from "./rapport-pptx-contenu";
import { PrematchService } from "./prematch.service";
import { SituationService } from "./situation.service";
import { AnalyseService } from "./analyse.service";

@Controller("analyse")
export class AnalyseController {
  constructor(
    private svc: AnalyseService, private prematchSvc: PrematchService, private situationSvc: SituationService,
    private acces: AccesService,
  ) {}

  // Equipe consultable et saison ouverte ; sans precision, un compte aux saisons restreintes obtient la saison actuelle.
  @Get("club/:clubId")
  async rapport(
    @Acces() ctx: ContexteAcces,
    @Param("clubId") clubId: string,
    @Query("equipeId") equipeId?: string,
    @Query("saisonId") saisonId?: string,
  ) {
    return this.svc.rapportClub(clubId, await this.acces.portee(ctx, { equipeId, saisonId }));
  }

  /** Dispositif joue (d'apres les matchs renseignes) et dernier onze d'un club, ou de l'une de ses equipes. */
  @Get("club/:clubId/situation")
  async situation(
    @Acces() ctx: ContexteAcces,
    @Param("clubId") clubId: string,
    @Query("equipeId") equipeId?: string,
    @Query("saisonId") saisonId?: string,
  ) {
    const portee = await this.acces.portee(ctx, { equipeId, saisonId });
    return this.situationSvc.situation(clubId, { equipeId: portee.equipeId ?? null, saisonId: portee.saisonId ?? null });
  }

  /** Dynamique de toutes les equipes du championnat de `equipeId`. */
  @Get("poule")
  async poule(@Acces() ctx: ContexteAcces, @Query("equipeId") equipeId: string) {
    await this.acces.equipe(ctx, equipeId);
    return this.svc.dynamiquePoule(equipeId);
  }

  /** Rapport pre-match : mon equipe contre le club `adversaireId` (match optionnel). */
  @Get("prematch")
  async prematch(
    @Acces() ctx: ContexteAcces,
    @Query("equipeId") equipeId: string,
    @Query("adversaireId") adversaireId: string,
    @Query("matchId") matchId?: string,
  ) {
    if (!equipeId || !adversaireId) throw new BadRequestException("equipeId et adversaireId sont requis");
    await this.acces.equipe(ctx, equipeId);
    if (matchId) await this.acces.match(ctx, matchId);
    return this.prematchSvc.rapport(equipeId, adversaireId, matchId || null);
  }

  /** Les pages du rapport d'avant-match en PowerPoint, pour que le front propose le choix des pages a produire. */
  @Get("prematch/pages")
  pagesRapport() {
    return PAGES_RAPPORT.map((id) => ({ id, ...DESCRIPTION_PAGES[id] }));
  }

  /**
   * Rapport pre-match au format de la presentation du staff (.pptx). `pages` : les pages voulues, separees par des
   * virgules (toutes par defaut) ; les champs inconnus restent vides, a completer dans PowerPoint.
   */
  @Get("prematch/export")
  async prematchExport(
    @Acces() ctx: ContexteAcces,
    @Query("equipeId") equipeId: string,
    @Query("adversaireId") adversaireId: string,
    @Query("matchId") matchId?: string,
    @Query("pages") pages?: string,
  ) {
    if (!equipeId || !adversaireId) throw new BadRequestException("equipeId et adversaireId sont requis");
    const choisies = lirePages(pages);
    if ("erreur" in choisies) throw new BadRequestException(choisies.erreur);
    await this.acces.equipe(ctx, equipeId);
    if (matchId) await this.acces.match(ctx, matchId);
    const { fichier, nom } = await this.prematchSvc.exporterPptx(equipeId, adversaireId, matchId || null, choisies);
    return new StreamableFile(fichier, {
      type: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      disposition: `attachment; filename="${nom}"`,
    });
  }
}
