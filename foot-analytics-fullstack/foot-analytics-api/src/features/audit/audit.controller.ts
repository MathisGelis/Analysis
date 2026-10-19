// src/features/audit/audit.controller.ts
//
// Lecture du journal d'audit, reservee aux administrateurs. Aucune route d'ecriture, de modification ni de suppression.
//   GET /audit?action=&utilisateurId=&depuis=&jusqua=&page=&parPage=   (action "alerte.*" : toutes les alertes)

import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { AdministrateurGuard } from "@/features/acces/administrateur.guard";

import { JournalAuditService } from "./journal-audit.service";

@UseGuards(AdministrateurGuard)
@Controller("audit")
export class AuditController {
  constructor(private journal: JournalAuditService) {}

  @Get()
  lister(
    @Query("action") action?: string, @Query("utilisateurId") utilisateurId?: string,
    @Query("depuis") depuis?: string, @Query("jusqua") jusqua?: string,
    @Query("page") page?: string, @Query("parPage") parPage?: string,
  ) {
    return this.journal.lister({
      action: action || undefined, utilisateurId: utilisateurId || undefined,
      depuis: depuis || undefined, jusqua: jusqua || undefined,
      page: page ? Number(page) : undefined, parPage: parPage ? Number(parPage) : undefined,
    });
  }
}
