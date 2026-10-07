// src/features/classement/classement.service.ts

import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Equipe } from "@/features/equipes/equipe.entity";
import { Match } from "@/features/matchs/match.entity";

import { calculerClassement } from "./calcul-classement";
import { LigneClassement } from "./ligne-classement.entity";

@Injectable()
export class ClassementService implements OnApplicationBootstrap {
  private readonly log = new Logger(ClassementService.name);

  constructor(
    @InjectRepository(LigneClassement) private repo: Repository<LigneClassement>,
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
  ) {}
  /** Au demarrage : une regle de calcul corrigee s'applique tout de suite, sans attendre un import ni un rebuild manuel. */
  async onApplicationBootstrap() {
    try {
      const n = await this.recalculer();
      this.log.log(`Classement recalcule au demarrage : ${n} ligne(s).`);
    } catch (e) {
      this.log.warn(`Classement non recalcule au demarrage : ${(e as Error).message}`);
    }
  }

  findAll() {
    return this.repo.find({ order: { rang: "ASC" } });
  }

  /**
   * Recalcule tout le classement : a appeler apres toute ecriture d'un match (score saisi, match cree, modifie ou supprime),
   * sans quoi la table reste celle du dernier import.
   */
  async recalculer() {
    const [matchs, equipes] = await Promise.all([this.matchs.find(), this.equipes.find()]);
    const rows = calculerClassement(matchs, equipes);
    await this.repo.clear();
    if (rows.length) await this.repo.save(rows as any);
    return rows.length;
  }
}
