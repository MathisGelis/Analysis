// src/features/sante/sante.controller.ts
//
// Sonde de sante pour l'hebergeur (Render, Fly, Docker HEALTHCHECK) : publique, elle ne livre aucune donnee. Elle
// interroge la base, pour qu'une API vivante mais coupee de sa base soit signalee en panne (503) et redemarree.

import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import { DataSource } from "typeorm";

import { Public } from "@/features/auth/public.decorator";

@Controller("health")
export class SanteController {
  constructor(private readonly ds: DataSource) {}

  @Public()
  @Get()
  async sante() {
    try {
      await this.ds.query("SELECT 1");
    } catch {
      throw new ServiceUnavailableException({ ok: false });
    }
    return { ok: true };
  }
}
