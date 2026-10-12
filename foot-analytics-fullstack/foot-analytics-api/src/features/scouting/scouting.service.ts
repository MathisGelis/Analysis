// src/features/scouting/scouting.service.ts
//
// Saison : un rapport est un document date. Avec `saisonId`, on ne garde que
// ceux dont la date tombe dans cette saison (1er juillet -> 30 juin) ; un rapport
// sans date lisible n'appartient qu'a la saison active.
//
// IMPORTANT : `findByClub` retourne null si aucun rapport trouve (au
// lieu de throw NotFoundException). Le front consomme cette route pour
// afficher un placeholder "pas de rapport" sur la fiche club — un 404
// generait un warning inutile en boucle dans les logs.

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Saison } from "@/features/saisons/saison.entity";
import { dateDansSaison } from "@/common/saison-date";
import { parseDateFlexible } from "@/common/dates";

import { RapportScouting } from "./rapport-scouting.entity";
import { UpsertRapportDto } from "./scouting.dto";

@Injectable()
export class ScoutingService {
  constructor(
    @InjectRepository(RapportScouting) private repo: Repository<RapportScouting>,
    @InjectRepository(Saison) private saisons: Repository<Saison>,
  ) {}

  /** Ne garde que les rapports de la saison (tous si `saisonId` est absent, aucun s'il est inconnu). */
  private async dansSaison(rapports: RapportScouting[], saisonId?: string) {
    if (!saisonId) return rapports;
    const saison = await this.saisons.findOne({ where: { id: saisonId } });
    if (!saison) return [];
    return rapports.filter((r) => dateDansSaison(r.date, saison.anneeDebut) ?? saison.actif);
  }

  async findAll(clubId?: string, saisonId?: string, visible: (r: RapportScouting) => boolean = () => true) {
    return (await this.dansSaison(await this.repo.find({ where: clubId ? { clubId } : {} }), saisonId)).filter(visible);
  }
  /** Rapport le plus recent pour ce club (dans la saison si donnee), null si aucun (pas de 404). */
  async findLatestByClub(clubId: string, saisonId?: string, visible: (r: RapportScouting) => boolean = () => true): Promise<RapportScouting | null> {
    const tous = (await this.dansSaison(await this.repo.find({ where: { clubId } }), saisonId)).filter(visible);
    // Les dates sont en jj/mm/aaaa ou ISO : on trie sur les timestamps, pas sur les chaines.
    const ts = (r: RapportScouting) => parseDateFlexible(r.date) ?? 0;
    return [...tous].sort((a, b) => ts(b) - ts(a))[0] ?? null;
  }
  async findOne(id: string) {
    const r = await this.repo.findOne({ where: { id } });
    if (!r) throw new NotFoundException(`Rapport ${id} introuvable`);
    return r;
  }
  create(dto: UpsertRapportDto) { return this.repo.save(this.repo.create(dto)); }
  async update(id: string, dto: Partial<UpsertRapportDto>) {
    const r = await this.findOne(id);
    Object.assign(r, dto);
    return this.repo.save(r);
  }
  async remove(id: string) {
    await this.repo.remove(await this.findOne(id));
    return { ok: true, id };
  }
}
