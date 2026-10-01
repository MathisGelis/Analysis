// src/modules/stats/stats.module.ts
//
// Bilan d'un club calcule a la volee. Les stats de joueurs (buts, cartons...)
// sont calculees par equipe et par saison dans JoueursService.

import { Controller, Get, Injectable, Param, Query, Module } from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Match } from "@/entities";
import { trierChronologiquement } from "@/common/tendances";
import { Acces, AccesModule, AccesService, ContexteAcces } from "@/modules/acces/acces.module";

@Injectable()
export class StatsService {
  constructor(@InjectRepository(Match) private matchs: Repository<Match>) {}

  /**
   * Bilan d'un club sur ses matchs joues. `saisonId` / `equipeId` restreignent a
   * une saison ou a une equipe (sans eux : toutes saisons et equipes melangees).
   */
  async bilanClub(clubId: string, portee: { equipeId?: string; saisonId?: string } = {}) {
    const qb = this.matchs
      .createQueryBuilder("m")
      .where("(m.club_dom = :c OR m.club_ext = :c) AND m.statut = :s", {
        c: clubId, s: "joue",
      });
    if (portee.saisonId) qb.andWhere("m.saison_id = :sid", { sid: portee.saisonId });
    if (portee.equipeId) qb.andWhere("(m.equipe_dom = :eid OR m.equipe_ext = :eid)", { eid: portee.equipeId });
    // Chronologique : la forme est la fin de cette liste, quel que soit l'ordre d'import des feuilles
    // (et l'ordre de lecture de la base, qui n'est garanti nulle part).
    const matchs = trierChronologiquement(await qb.getMany());

    let v = 0, n = 0, d = 0, bp = 0, bc = 0;
    const forme: string[] = [];
    for (const m of matchs) {
      const dom = m.clubDom === clubId;
      const _bp = dom ? m.scoreDom : m.scoreExt;
      const _bc = dom ? m.scoreExt : m.scoreDom;
      bp += _bp; bc += _bc;
      const r = _bp > _bc ? "V" : _bp === _bc ? "N" : "D";
      forme.push(r);
      if (r === "V") v++; else if (r === "N") n++; else d++;
    }
    return {
      clubId, joues: matchs.length, v, n, d, bp, bc,
      diff: bp - bc, pts: v * 3 + n, forme: forme.slice(-5),
      bpMoy: matchs.length ? +(bp / matchs.length).toFixed(2) : 0,
      bcMoy: matchs.length ? +(bc / matchs.length).toFixed(2) : 0,
    };
  }
}

@Controller("stats")
class StatsController {
  constructor(private svc: StatsService, private acces: AccesService) {}
  // Equipe consultable et saison ouverte ; sans precision, un compte aux saisons restreintes obtient la saison actuelle.
  @Get("bilan/:clubId") async bilan(
    @Acces() ctx: ContexteAcces,
    @Param("clubId") id: string,
    @Query("equipeId") equipeId?: string,
    @Query("saisonId") saisonId?: string,
  ) {
    return this.svc.bilanClub(id, await this.acces.portee(ctx, { equipeId, saisonId }));
  }
}

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Match])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
