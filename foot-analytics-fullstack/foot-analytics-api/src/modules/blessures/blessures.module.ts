// src/modules/blessures/blessures.module.ts
import {
  Body, ConflictException, Controller, Delete, Get, Injectable, NotFoundException,
  Optional, Param, Patch, Post, Query, Module,
} from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Blessure } from "@/entities";
import { seChevauchent } from "@/common/periode";
import { DerivationModule, DerivationService } from "../derivation/derivation.module";
import { Acces, AccesModule, AccesService, ContexteAcces } from "@/modules/acces/acces.module";

class UpsertBlessureDto {
  @IsString() joueurId: string;
  @IsOptional() @IsString() joueurNom?: string;
  @IsOptional() @IsString() localisation?: string;
  @IsOptional() @IsString() gravite?: string;
  @IsOptional() @IsString() dateDebut?: string;
  @IsOptional() @IsString() retourEstime?: string;
  @IsOptional() @IsString() statut?: string;
  @IsOptional() @IsString() details?: string;
  @IsOptional() @IsInt() risqueRecidive?: number;
  /** Confirme l'enregistrement malgre un chevauchement avec une blessure existante. */
  @IsOptional() @IsBoolean() forcer?: boolean;
}

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

@Controller("blessures")
class BlessuresController {
  constructor(private svc: BlessuresService, private acces: AccesService) {}

  /** La blessure d'un joueur de mon club, d'une saison ouverte (404 sinon). */
  private async exigerBlessure(ctx: ContexteAcces, id: string) {
    const b = await this.svc.findOne(id);
    await this.acces.joueurDuClub(ctx, b.joueurId);
    if (!ctx.voitDate(b.dateDebut)) throw new NotFoundException(`Blessure ${id} introuvable`);
    return b;
  }

  // Donnee de sante : jamais celles d'un autre club, ni celles d'une saison fermee au compte.
  @Get() async list(@Acces() ctx: ContexteAcces, @Query("joueurId") joueurId?: string) {
    const mes = await this.acces.idsJoueursDuClub(ctx);
    const toutes = await this.svc.findAll(joueurId);
    return toutes.filter((b) => (!mes || mes.has(b.joueurId)) && ctx.voitDate(b.dateDebut));
  }
  @Get(":id") get(@Acces() ctx: ContexteAcces, @Param("id") id: string) { return this.exigerBlessure(ctx, id); }
  @Post() async create(@Acces() ctx: ContexteAcces, @Body() dto: UpsertBlessureDto) {
    await this.acces.joueurDuClub(ctx, dto.joueurId);
    if (!ctx.voitDate(dto.dateDebut)) throw new NotFoundException("Saison introuvable");
    return this.svc.create(dto);
  }
  @Patch(":id") async update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpsertBlessureDto) {
    await this.exigerBlessure(ctx, id);
    if (dto.joueurId) await this.acces.joueurDuClub(ctx, dto.joueurId);          // pas de transfert vers le joueur d'un autre club
    if (dto.dateDebut !== undefined && !ctx.voitDate(dto.dateDebut)) throw new NotFoundException("Saison introuvable");
    return this.svc.update(id, dto);
  }
  @Delete(":id") async remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    await this.exigerBlessure(ctx, id);
    return this.svc.remove(id);
  }
}

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Blessure]), DerivationModule],
  controllers: [BlessuresController],
  providers: [BlessuresService],
})
export class BlessuresModule {}
