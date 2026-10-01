// src/features/clubs/clubs.controller.ts

import { Body, Controller, Delete, ForbiddenException, Get, Param, Patch, Post } from "@nestjs/common";

import { Acces } from "@/features/acces/acces.decorator";
import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";

import { UpsertClubDto } from "./clubs.dto";
import { ClubsService } from "./clubs.service";

@Controller("clubs")
export class ClubsController {
  constructor(private svc: ClubsService, private acces: AccesService) {}
  @Get() list() { return this.svc.findAll(); }
  @Get(":id") get(@Param("id") id: string) { return this.svc.findOne(id); }
  // Tout compte peut ajouter un club adverse absent de la base (calendrier, scouting) ; modifier un club, c'est l'affaire
  // de l'administrateur ou du referent de ce club ; le supprimer, de l'administrateur seul.
  @Post() create(@Body() dto: UpsertClubDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpsertClubDto) {
    if (!ctx.admin) {
      if (!ctx.referent) throw new ForbiddenException("Seuls l'administrateur et le referent du club modifient un club.");
      this.acces.exigerClub(ctx, id);
    }
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    this.acces.exigerAdmin(ctx);
    return this.svc.remove(id);
  }
}
