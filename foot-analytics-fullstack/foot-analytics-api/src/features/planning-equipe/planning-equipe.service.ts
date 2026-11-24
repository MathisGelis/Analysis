// src/features/planning-equipe/planning-equipe.service.ts

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { EvenementEquipeDto, PlanningDto } from "./planning-equipe.dto";
import { EvenementEquipe, PlanningEquipe } from "./planning-equipe.entity";

@Injectable()
export class PlanningEquipeService {
  constructor(
    @InjectRepository(PlanningEquipe) private plannings: Repository<PlanningEquipe>,
    @InjectRepository(EvenementEquipe) private evenements: Repository<EvenementEquipe>,
  ) {}

  async lire(equipeId: string) {
    const [planning, autres] = await Promise.all([
      this.plannings.findOne({ where: { equipeId } }),
      this.evenements.find({ where: { equipeId }, order: { date: "ASC", heure: "ASC" } }),
    ]);
    return {
      planning: planning ? { jours: planning.jours, heure: planning.heure } : null,
      autres: autres.map((e) => ({ id: e.id, date: e.date, heure: e.heure ?? undefined, titre: e.titre, description: e.description ?? undefined })),
    };
  }

  async enregistrerPlanning(equipeId: string, dto: PlanningDto) {
    const jours = [...new Set(dto.jours)].sort((a, b) => a - b);
    await this.plannings.save(this.plannings.create({ equipeId, jours, heure: dto.heure }));
    return { jours, heure: dto.heure };
  }

  /** Idempotent : l'identifiant est celui de l'appareil. Un identifiant deja pris par une autre equipe est refuse (sans le reveler). */
  async enregistrerEvenement(equipeId: string, id: string, dto: EvenementEquipeDto) {
    const existant = await this.evenements.findOne({ where: { id } });
    if (existant && existant.equipeId !== equipeId) throw new NotFoundException("Evenement introuvable.");
    const e = await this.evenements.save(this.evenements.create({
      ...(existant ?? { id, equipeId }), date: dto.date, heure: dto.heure || null, titre: dto.titre.trim(), description: dto.description?.trim() || null,
    }));
    return { id: e.id, date: e.date, heure: e.heure ?? undefined, titre: e.titre, description: e.description ?? undefined };
  }

  async supprimerEvenement(equipeId: string, id: string) {
    const e = await this.evenements.findOne({ where: { id, equipeId } });
    if (e) await this.evenements.delete({ id });
  }
}
