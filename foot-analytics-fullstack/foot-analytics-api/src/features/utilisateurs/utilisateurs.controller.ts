// src/features/utilisateurs/utilisateurs.controller.ts

import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";

import { GestionnaireGuard } from "@/features/auth/auth.guards";

import { CreateUserDto, UpdateUserDto } from "./utilisateurs.dto";
import { UtilisateursService } from "./utilisateurs.service";

@UseGuards(GestionnaireGuard)
@Controller("utilisateurs")
export class UtilisateursController {
  constructor(private svc: UtilisateursService) {}

  @Get() async list(@Req() req: any) { return this.svc.findAll(await this.svc.acteur(req.user)); }
  @Get(":id") async one(@Req() req: any, @Param("id") id: string) { return this.svc.findOne(await this.svc.acteur(req.user), id); }
  @Post() async create(@Req() req: any, @Body() dto: CreateUserDto) { return this.svc.create(await this.svc.acteur(req.user), dto); }
  @Patch(":id") async update(@Req() req: any, @Param("id") id: string, @Body() dto: UpdateUserDto) {
    return this.svc.update(await this.svc.acteur(req.user), id, dto);
  }
  @Delete(":id") async remove(@Req() req: any, @Param("id") id: string) { return this.svc.remove(await this.svc.acteur(req.user), id); }
}
