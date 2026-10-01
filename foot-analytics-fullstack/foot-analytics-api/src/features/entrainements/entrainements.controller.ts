// src/features/entrainements/entrainements.controller.ts

import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { CreateEntrainementDto } from "./entrainements.dto";
import { EntrainementsService } from "./entrainements.service";

@Controller("entrainements")
export class EntrainementsController {
  constructor(private svc: EntrainementsService, private acces: AccesService) {}

  /** Une seance est privee a l'equipe : seul le compte qui gere cette equipe (de son club, saison ouverte) y touche. */
  private async exigerEquipe(ctx: ContexteAcces, equipeId: string | null | undefined) {
    if (!equipeId) {
      if (ctx.admin) return;
      throw new BadRequestException("equipeId requis.");
    }
    await this.acces.equipeGeree(ctx, equipeId);
  }

  @Get() async list(@Acces() ctx: ContexteAcces, @Query("equipeId") equipeId?: string) {
    if (equipeId) {
      await this.acces.equipeGeree(ctx, equipeId);
      return this.svc.findAll(equipeId);
    }
    if (ctx.admin) return this.svc.findAll();
    const mesEquipes = new Set((await this.acces.equipesGerees(ctx)).map((e) => e.id));
    return (await this.svc.findAll()).filter((e) => !!e.equipeId && mesEquipes.has(e.equipeId));
  }
  @Get(":id") async get(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    const e = await this.svc.findOne(id);
    await this.exigerEquipe(ctx, e.equipeId);
    return e;
  }
  @Post() async create(@Acces() ctx: ContexteAcces, @Body() dto: CreateEntrainementDto) {
    await this.exigerEquipe(ctx, dto.equipeId);
    return this.svc.create(dto);
  }
  @Patch(":id") async update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: CreateEntrainementDto) {
    await this.exigerEquipe(ctx, (await this.svc.findOne(id)).equipeId);
    if (dto.equipeId !== undefined) await this.exigerEquipe(ctx, dto.equipeId);             // pas de transfert vers une autre equipe
    return this.svc.update(id, dto);
  }
  @Delete(":id") async remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    await this.exigerEquipe(ctx, (await this.svc.findOne(id)).equipeId);
    return this.svc.remove(id);
  }
}
