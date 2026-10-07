// src/features/blessures/blessures.service.ts

import { ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { DerivationService } from "@/features/derivation/derivation.service";

import { Blessure } from "./blessure.entity";
import { seChevauchent } from "./periode-blessure";
import { UpsertBlessureDto } from "./blessures.dto";

@Injectable()
export class BlessuresService {
  constructor(
    @InjectRepository(Blessure) private repo: Repository<Blessure>,
    @Optional() private derivation?: DerivationService,
  ) {}

  /**
   * Une blessure (ou sa fin) change le statut du joueur : indisponible = pas de score de fatigue, reprise =
   * vulnerabilite. On recalcule les joueurs sans jamais faire echouer la saisie de la blessure.
   */
  private async rafraichirFatigue() {
    try { await this.derivation?.recomputeJoueurs(); }
    catch { /* la blessure est deja enregistree */ }
  }
  findAll(joueurId?: string) {
    return this.repo.find({ where: joueurId ? { joueurId } : {} });
  }
  async findOne(id: string) {
    const b = await this.repo.findOne({ where: { id } });
    if (!b) throw new NotFoundException(`Blessure ${id} introuvable`);
    return b;
  }
  /** Blessures du meme joueur dont la periode chevauche celle fournie. */
  async chevauchements(
    periode: Pick<Blessure, "joueurId" | "dateDebut" | "retourEstime" | "statut">,
    exclureId?: string,
  ): Promise<Blessure[]> {
    const memeJoueur = await this.repo.find({ where: { joueurId: periode.joueurId } });
    return memeJoueur.filter((b) => b.id !== exclureId && seChevauchent(periode, b));
  }

  /**
   * Refuse (409) une blessure qui chevauche une autre du meme joueur, sauf
   * `forcer: true`. Deux blessures simultanees sont possibles (cheville +
   * epaule) mais le plus souvent c'est un doublon de saisie : on demande
   * confirmation plutot que de trancher.
   */
  private async verifierChevauchement(
    periode: Pick<Blessure, "joueurId" | "dateDebut" | "retourEstime" | "statut" | "localisation">,
    forcer: boolean | undefined,
    exclureId?: string,
  ) {
    if (forcer) return;
    const conflits = await this.chevauchements(periode, exclureId);
    if (conflits.length === 0) return;
    throw new ConflictException({
      code: "BLESSURE_CHEVAUCHANTE",
      message: "Cette blessure chevauche une blessure existante du meme joueur.",
      conflits: conflits.map((c) => ({
        id: c.id, localisation: c.localisation, dateDebut: c.dateDebut,
        retourEstime: c.retourEstime, statut: c.statut,
        memeZone: !!periode.localisation
          && (c.localisation ?? "").toLowerCase() === periode.localisation.toLowerCase(),
      })),
    });
  }

  async create(dto: UpsertBlessureDto) {
    const { forcer, ...data } = dto;
    await this.verifierChevauchement(data as any, forcer);
    const cree = await this.repo.save(this.repo.create(data));
    await this.rafraichirFatigue();
    return cree;
  }
  async update(id: string, dto: Partial<UpsertBlessureDto>) {
    const b = await this.findOne(id);
    const { forcer, ...data } = dto;
    Object.assign(b, data);
    await this.verifierChevauchement(b, forcer, id);
    const maj = await this.repo.save(b);
    await this.rafraichirFatigue();
    return maj;
  }
  async remove(id: string) {
    await this.repo.remove(await this.findOne(id));
    await this.rafraichirFatigue();
    return { ok: true, id };
  }
}
