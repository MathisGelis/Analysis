// src/modules/stats/stats.module.ts
//
// Statistiques agregees calculees a la volee. Reproduit les vues SQL
// v_bilan_equipe / v_discipline_joueur de maniere portable.

import { Controller, Get, Injectable, Param, Module } from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Joueur, Match } from "@/entities";

@Injectable()
export class StatsService {
  constructor(
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(Joueur) private joueurs: Repository<Joueur>,
  ) {}

  /** Bilan saison d'un club a partir de tous ses matchs joues. */
  async bilanClub(clubId: string) {
    const matchs = await this.matchs
      .createQueryBuilder("m")
      .where("(m.club_dom = :c OR m.club_ext = :c) AND m.statut = :s", {
        c: clubId, s: "joue",
      })
      .getMany();

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

  /** Indicateurs effectif (forme moyenne, indice discipline). */
  async effectif(clubId: string) {
    const joueurs = await this.joueurs.find({ where: { clubId } });
    const actifs = joueurs.filter((j) => j.matchs >= 4);
    const formeMoyenne = actifs.length
      ? Math.round(actifs.reduce((s, j) => s + (j.scoreForme ?? 0), 0) / actifs.length)
      : 0;
    const indiceDiscipline = joueurs.reduce(
      (s, j) => s + j.cartonsJaunes + j.cartonsRouges * 3, 0,
    );
    return {
      clubId,
      effectifTotal: joueurs.length,
      formeMoyenne,
      indiceDiscipline,
      totalCartonsJaunes: joueurs.reduce((s, j) => s + j.cartonsJaunes, 0),
      totalCartonsRouges: joueurs.reduce((s, j) => s + j.cartonsRouges, 0),
    };
  }
}

@Controller("stats")
class StatsController {
  constructor(private svc: StatsService) {}
  @Get("bilan/:clubId") bilan(@Param("clubId") id: string) {
    return this.svc.bilanClub(id);
  }
  @Get("effectif/:clubId") effectif(@Param("clubId") id: string) {
    return this.svc.effectif(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Match, Joueur])],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
