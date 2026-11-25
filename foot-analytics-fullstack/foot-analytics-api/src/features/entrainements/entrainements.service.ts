// src/features/entrainements/entrainements.service.ts

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { DerivationService } from "@/features/derivation/derivation.service";
import { seanceChangeLaFatigue } from "@/features/derivation/pertinence";

import { Entrainement } from "./entrainement.entity";
import { calcCharge } from "./charge-entrainement";
import { CreateEntrainementDto } from "./entrainements.dto";

@Injectable()
export class EntrainementsService {
  constructor(
    @InjectRepository(Entrainement) private repo: Repository<Entrainement>,
    private derivation: DerivationService,
  ) {}

  findAll(equipeId?: string) {
    return this.repo.find({
      where: equipeId ? { equipeId } : {},
      order: { date: "ASC" },
    });
  }
  async findOne(id: string) {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Entrainement ${id} introuvable`);
    return e;
  }
  /**
   * Apres toute mutation d'entrainement (create / update / delete), on
   * recalcule la fatigue des joueurs : la charge d'entrainement des 28
   * derniers jours intervient dans le calcul, donc une nouvelle seance ou
   * une seance modifiee/supprimee doit propager. On ne refait QUE recomputeJoueurs
   * (pas tout le rebuildAll), c'est suffisant et bien plus rapide.
   */
  private async refreshFatigueAsync(...equipeIds: (string | null | undefined)[]) {
    try {
      // Seulement les joueurs du ou des clubs concernes, sans relire les matchs : la fatigue d'un autre club ne bouge pas.
      for (const id of new Set(equipeIds.filter((x): x is string => !!x))) await this.derivation.rafraichirFatigueEquipe(id);
    } catch (e) { /* swallow : la sauvegarde principale a deja reussi */ }
  }

  async create(dto: CreateEntrainementDto) {
    const charge = calcCharge(dto.dureeMin, dto.intensite, dto.type, dto.espace);
    const presents = dto.joueursPresents
      ? dto.joueursPresents.length
      : dto.presents ?? 0;
    const saved = await this.repo.save(this.repo.create({ ...dto, charge, presents }));
    await this.refreshFatigueAsync(saved.equipeId);
    return saved;
  }
  async update(id: string, dto: Partial<CreateEntrainementDto>) {
    const e = await this.findOne(id);
    const avant = { equipeId: e.equipeId, date: e.date, charge: e.charge, joueursPresents: [...(e.joueursPresents ?? [])] };
    Object.assign(e, dto);
    e.charge = calcCharge(e.dureeMin, e.intensite, e.type, e.espace);
    if (dto.joueursPresents) e.presents = dto.joueursPresents.length;
    const saved = await this.repo.save(e);
    // Un changement de theme, de terrain ou de duree sans effet sur la charge ne touche pas a la fatigue : rien a recalculer.
    if (seanceChangeLaFatigue(avant, saved)) await this.refreshFatigueAsync(avant.equipeId, saved.equipeId);
    return saved;
  }
  async remove(id: string) {
    const e = await this.findOne(id);
    const equipeId = e.equipeId;
    await this.repo.remove(e);
    await this.refreshFatigueAsync(equipeId);
    return { ok: true, id };
  }
}
