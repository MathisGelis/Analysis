// src/modules/blessures/blessures.module.ts
import {
  Body, ConflictException, Controller, Delete, Get, Injectable, NotFoundException,
  Param, Patch, Post, Query, Module,
} from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Blessure } from "@/entities";
import { seChevauchent } from "@/common/periode";

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
  constructor(@InjectRepository(Blessure) private repo: Repository<Blessure>) {}
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
    return this.repo.save(this.repo.create(data));
  }
  async update(id: string, dto: Partial<UpsertBlessureDto>) {
    const b = await this.findOne(id);
    const { forcer, ...data } = dto;
    Object.assign(b, data);
    await this.verifierChevauchement(b, forcer, id);
    return this.repo.save(b);
  }
  async remove(id: string) {
    await this.repo.remove(await this.findOne(id));
    return { ok: true, id };
  }
}

@Controller("blessures")
class BlessuresController {
  constructor(private svc: BlessuresService) {}
  @Get() list(@Query("joueurId") joueurId?: string) { return this.svc.findAll(joueurId); }
  @Get(":id") get(@Param("id") id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: UpsertBlessureDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpsertBlessureDto) {
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Param("id") id: string) { return this.svc.remove(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([Blessure])],
  controllers: [BlessuresController],
  providers: [BlessuresService],
})
export class BlessuresModule {}
