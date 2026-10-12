// src/features/joueurs/joueurs.controller.ts

import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { CreateJoueurDto, StatEquipeDto, UpdateJoueurDto } from "./joueurs.dto";
import { JoueursService } from "./joueurs.service";

@Controller("joueurs")
export class JoueursController {
  constructor(private svc: JoueursService, private acces: AccesService) {}

  // Les fiches de joueurs sont des donnees de championnat (scouting) : lisibles par tous. Ce que le staff d'un club a saisi
  // ou calcule en prive (commentaire, fatigue, morphologie...) n'est montre que pour les joueurs de SON club.
  @Get()
  async list(@Acces() ctx: ContexteAcces, @Query("clubId") clubId?: string, @Query("poste") poste?: string) {
    return (await this.svc.findAll(clubId, poste)).map((j) => ctx.masquerPrive(j));
  }

  /** GET /joueurs/effectif?equipeId=... : effectif d'une equipe avec
   *  stats filtrees sur ses propres matchs (matchs, buts, cartons...)
   *  et fatigue globale. */
  @Get("effectif")
  async effectif(@Acces() ctx: ContexteAcces, @Query("equipeId") equipeId: string) {
    await this.acces.equipe(ctx, equipeId);
    return (await this.svc.effectif(equipeId)).map((j) => ctx.masquerPrive(j));
  }

  // Stats joueurs du championnat (= meme saison + competition + poule
  // que l'equipe donnee). Ne renvoie QUE les joueurs ayant joue au
  // moins 1 match du championnat, avec leurs stats restreintes a ces
  // matchs (vs stats globales toutes saisons confondues).
  @Get("championnat")
  async championnat(@Acces() ctx: ContexteAcces, @Query("equipeId") equipeId: string) {
    await this.acces.equipe(ctx, equipeId);
    return (await this.svc.championnat(equipeId)).map((j) => ctx.masquerPrive(j));
  }

  // Recherche libre par nom (pour le modal d'ajout de joueur).
  @Get("search")
  async search(@Acces() ctx: ContexteAcces, @Query("q") q: string) {
    return (await this.svc.search(q ?? "")).map((j) => ctx.masquerPrive(j));
  }

  // Attache un joueur existant a une equipe (de mon perimetre).
  @Post("equipe/:equipeId/attach/:joueurId")
  async attach(@Acces() ctx: ContexteAcces, @Param("equipeId") equipeId: string, @Param("joueurId") joueurId: string) {
    await this.acces.equipeGeree(ctx, equipeId);
    return ctx.masquerPrive(await this.svc.attachEquipe(joueurId, equipeId));
  }

  // Detache un joueur d'une equipe (le joueur reste en base).
  @Delete("equipe/:equipeId/attach/:joueurId")
  async detach(@Acces() ctx: ContexteAcces, @Param("equipeId") equipeId: string, @Param("joueurId") joueurId: string) {
    await this.acces.equipeGeree(ctx, equipeId);
    return ctx.masquerPrive(await this.svc.detachEquipe(joueurId, equipeId));
  }

  // Cree un nouveau joueur ET l'attache a l'equipe : il est toujours du club de l'equipe.
  @Post("equipe/:equipeId/create")
  async createDansEquipe(@Acces() ctx: ContexteAcces, @Param("equipeId") equipeId: string, @Body() body: any) {
    const equipe = await this.acces.equipeGeree(ctx, equipeId);
    return this.svc.createDansEquipe(equipeId, ctx.admin ? body : { ...body, clubId: equipe.clubId });
  }

  @Get(":id")
  async get(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    return ctx.masquerPrive(await this.svc.findOne(id));
  }

  /** GET /joueurs/:id/numeros : { "6": 3, "8": 5 } repartition des
   *  numeros de maillot portes par ce joueur sur ses matchs. */
  @Get(":id/numeros")
  numeros(@Param("id") id: string) {
    return this.svc.numerosFreq(id);
  }

  /** GET /joueurs/:id/matchs?saisonId=&limite= : derniers matchs joues, avec
   *  la feuille personnelle du joueur (titulaire, minutes, buts, cartons). Jamais un match d'une saison fermee. */
  @Get(":id/matchs")
  async matchs(
    @Acces() ctx: ContexteAcces, @Param("id") id: string, @Query("saisonId") saisonId?: string, @Query("limite") limite?: string,
  ) {
    if (saisonId && !ctx.voitSaison(saisonId)) return [];
    const lignes = await this.svc.matchsJoues(id, saisonId || undefined, limite ? Math.min(50, Math.max(1, parseInt(limite, 10) || 8)) : 8);
    return ctx.saisonsRestreintes ? lignes.filter((l: { date: string | null }) => ctx.voitDate(l.date)) : lignes;
  }

  /** PUT /joueurs/:id/stats-equipe/:equipeId : buts / passes saisis a la main
   *  pour CETTE equipe (donc cette saison) ; null efface la saisie. */
  @Put(":id/stats-equipe/:equipeId")
  async definirStatEquipe(
    @Acces() ctx: ContexteAcces, @Param("id") id: string, @Param("equipeId") equipeId: string, @Body() dto: StatEquipeDto,
  ) {
    await this.acces.equipeGeree(ctx, equipeId);
    return this.svc.definirStatEquipe(id, equipeId, dto);
  }

  /** GET /joueurs/:id/historique : parcours du joueur par saison
   *  (saisons / equipes / clubs ou il a evolue). Les saisons fermees au compte n'y figurent pas. */
  @Get(":id/historique")
  async historique(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    return ctx.filtrerSaison(await this.svc.historique(id), (h: { saisonId: string | null }) => h.saisonId);
  }

  @Post()
  create(@Acces() ctx: ContexteAcces, @Body() dto: CreateJoueurDto) {
    // Un compte non admin ne cree des joueurs que pour son club.
    this.acces.exigerClub(ctx, dto.clubId);
    return this.svc.create(dto);
  }

  @Patch(":id")
  async update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpdateJoueurDto) {
    await this.acces.joueurDuClub(ctx, id);
    if (dto.clubId !== undefined) this.acces.exigerClub(ctx, dto.clubId);          // pas de transfert vers un autre club
    return this.svc.update(id, dto);
  }

  @Delete(":id")
  async remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    await this.acces.joueurDuClub(ctx, id);
    return this.svc.remove(id);
  }
}
