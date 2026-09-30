// src/seed/seed.service.ts
import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Blessure, Club, Composition, Entrainement, Equipe, EvenementMatch,
  Joueur, LigneClassement, Match, RapportScouting,
} from "@/entities";
import { SEED } from "./seed-data";

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly log = new Logger("Seed");

  constructor(
    private cfg: ConfigService,
    @InjectRepository(Club) private clubs: Repository<Club>,
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
    @InjectRepository(Joueur) private joueurs: Repository<Joueur>,
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(Composition) private compos: Repository<Composition>,
    @InjectRepository(EvenementMatch) private evts: Repository<EvenementMatch>,
    @InjectRepository(RapportScouting) private rapports: Repository<RapportScouting>,
    @InjectRepository(LigneClassement) private classement: Repository<LigneClassement>,
    @InjectRepository(Entrainement) private entrainements: Repository<Entrainement>,
    @InjectRepository(Blessure) private blessures: Repository<Blessure>,
  ) {}

  async onApplicationBootstrap() {
    const auto = this.cfg.get<string>("AUTO_SEED", "true") === "true";
    if (!auto) return;
    const count = await this.clubs.count();
    if (count > 0) {
      this.log.log(`Base deja peuplee (${count} clubs) — seed ignore.`);
      return;
    }
    await this.run();
  }

  /** Vide puis re-remplit toutes les tables a partir des donnees reelles. */
  async run() {
    this.log.log("Peuplement de la base avec les donnees reelles...");

    await this.clubs.save(SEED.clubs as any);
    await this.equipes.save(SEED.equipes as any);
    await this.joueurs.save(SEED.joueurs as any);

    for (const m of SEED.matchs as any[]) {
      const { compositions, evenements, ...match } = m;
      await this.matchs.save(match);
      if (compositions?.length) {
        await this.compos.save(
          compositions.map((c: any) => ({ ...c, matchId: m.id })),
        );
      }
      if (evenements?.length) {
        await this.evts.save(
          evenements.map((e: any) => ({ ...e, matchId: m.id })),
        );
      }
    }

    await this.rapports.save(SEED.rapports as any);
    await this.classement.save(SEED.classement as any);
    await this.entrainements.save(SEED.entrainements as any);
    await this.blessures.save(SEED.blessures as any);

    this.log.log(
      `Seed termine : ${SEED.clubs.length} clubs, ` +
      `${SEED.joueurs.length} joueurs, ${SEED.matchs.length} matchs.`,
    );
  }

  /** Reinitialise completement (utilise par l'endpoint admin /seed/reset). */
  async reset() {
    await this.evts.clear();
    await this.compos.clear();
    await this.matchs.clear();
    await this.blessures.clear();
    await this.entrainements.clear();
    await this.classement.clear();
    await this.rapports.clear();
    await this.joueurs.clear();
    await this.equipes.clear();
    await this.clubs.clear();
    await this.run();
    return { ok: true };
  }
}
