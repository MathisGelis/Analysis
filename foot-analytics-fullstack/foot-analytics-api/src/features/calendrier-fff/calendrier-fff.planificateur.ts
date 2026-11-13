// src/features/calendrier-fff/calendrier-fff.planificateur.ts
//
// Synchronisation quotidienne des calendriers FFF : toutes les equipes qui ont une adresse, pour la saison actuelle et les
// suivantes (une saison terminee ne change plus). Cinq minutes apres le demarrage, puis toutes les 24 h ; une equipe en
// echec n'arrete pas les autres. ENTRETIEN_AUTO=false coupe la planification (tests). Les journaux ne contiennent que des nombres.

import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Not, Repository } from "typeorm";

import { saisonActuelle } from "@/features/acces/contexte-acces";
import { Equipe } from "@/features/equipes/equipe.entity";
import { Saison } from "@/features/saisons/saison.entity";

import { CalendrierFffService } from "./calendrier-fff.service";

const JOUR_MS = 86_400_000;

@Injectable()
export class CalendrierFffPlanificateur implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly log = new Logger(CalendrierFffPlanificateur.name);
  private premier?: NodeJS.Timeout;
  private quotidien?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
    @InjectRepository(Saison) private saisons: Repository<Saison>,
    private svc: CalendrierFffService,
  ) {}

  onApplicationBootstrap() {
    if (process.env.ENTRETIEN_AUTO === "false") return;
    const lancer = () => { this.toutSynchroniser().catch((e) => this.log.error(`Calendriers FFF : ${(e as Error).message}`)); };
    this.premier = setTimeout(lancer, 5 * 60_000);
    this.premier.unref();
    this.quotidien = setInterval(lancer, JOUR_MS);
    this.quotidien.unref();
  }

  onModuleDestroy() {
    if (this.premier) clearTimeout(this.premier);
    if (this.quotidien) clearInterval(this.quotidien);
  }

  /** Synchronise chaque equipe a adresse ; rend le nombre d'equipes traitees avec succes et en echec. */
  async toutSynchroniser(maintenant = new Date()): Promise<{ reussies: number; echecs: number }> {
    const saisons = await this.saisons.find();
    const actuelle = saisonActuelle(saisons);
    const ouvertes = new Set(saisons.filter((s) => !actuelle || s.anneeDebut >= actuelle.anneeDebut).map((s) => s.id));
    const equipes = (await this.equipes.find({ where: { calendrierUrl: Not(IsNull()) } })).filter((e) => !e.saisonId || ouvertes.has(e.saisonId));
    let reussies = 0, echecs = 0;
    for (const e of equipes) {
      try {
        await this.svc.synchroniserAdresse(e, null, maintenant);
        reussies++;
      } catch (err) {
        echecs++;
        this.log.warn(`Calendrier FFF d'une equipe non synchronise : ${(err as Error).message}`);
      }
    }
    if (equipes.length) this.log.log(`Calendriers FFF : ${reussies} equipe(s) synchronisee(s), ${echecs} en echec`);
    return { reussies, echecs };
  }
}
