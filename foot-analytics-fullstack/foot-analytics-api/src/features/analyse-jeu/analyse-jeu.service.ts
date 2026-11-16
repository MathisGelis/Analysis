// src/features/analyse-jeu/analyse-jeu.service.ts
//
// Les analyses tirees du jeu saisi en direct, jointes a la feuille de match (FMI). Lecture seule : ce module ne modifie rien.

import { Injectable } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { AccesService } from "@/features/acces/acces.service";
import { ContexteAcces } from "@/features/acces/contexte-acces";
import { monCote } from "@/features/direct/direct.service";
import { EvenementDirect } from "@/features/direct/evenement-direct.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";

import { resumerMatch } from "./stats-jeu";

@Injectable()
export class AnalyseJeuService {
  constructor(
    @InjectRepository(EvenementDirect) private direct: Repository<EvenementDirect>,
    @InjectRepository(EvenementMatch) private fmi: Repository<EvenementMatch>,
    private acces: AccesService,
  ) {}

  /** Le resume d'un de MES matchs : stats des deux equipes, buts par tranche, carte des tirs, constats. */
  async resume(ctx: ContexteAcces, matchId: string) {
    const m = await this.acces.matchGere(ctx, matchId);
    const [evs, fmi] = await Promise.all([this.direct.find({ where: { matchId } }), this.fmi.find({ where: { matchId } })]);
    return resumerMatch({
      nousCote: monCote(ctx, m),
      evenements: evs.filter((e) => !e.supprimeLe),
      fmi: fmi.map((e) => ({ type: e.type, sousType: e.sousType, minute: e.minute, equipe: e.equipe })),
      scoreDom: m.scoreDom ?? 0, scoreExt: m.scoreExt ?? 0, scoreOfficiel: m.statut === "joue",
    });
  }
}
