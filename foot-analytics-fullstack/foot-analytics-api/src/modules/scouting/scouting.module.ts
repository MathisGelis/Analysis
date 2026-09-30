// src/modules/scouting/scouting.module.ts
//
// IMPORTANT : `findByClub` retourne null si aucun rapport trouve (au
// lieu de throw NotFoundException). Le front consomme cette route pour
// afficher un placeholder "pas de rapport" sur la fiche club — un 404
// generait un warning inutile en boucle dans les logs.

import {
  Body, Controller, Delete, Get, Injectable, NotFoundException, Param,
  Patch, Post, Query, Module,
} from "@nestjs/common";
import { IsArray, IsInt, IsOptional, IsString } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { RapportScouting } from "@/entities";

class UpsertRapportDto {
  @IsString() clubId: string;
  @IsString() equipeNom: string;
  @IsOptional() @IsString() auteur?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() classement?: string;
  @IsOptional() @IsInt() points?: number;
  @IsOptional() @IsString() bilan?: string;
  @IsOptional() @IsString() bilanDom?: string;
  @IsOptional() @IsString() bilanExt?: string;
  @IsOptional() @IsInt() butsMarques?: number;
  @IsOptional() @IsInt() butsEncaisses?: number;
  @IsOptional() @IsInt() cartonsJaunes?: number;
  @IsOptional() @IsInt() cartonsRouges?: number;
  @IsOptional() @IsString() dispositifAttendu?: string;
  @IsOptional() @IsString() commentaires?: string;
  @IsOptional() @IsString() capitaine?: string;
  @IsOptional() @IsArray() joueursSuspendus?: string[];
  @IsOptional() @IsArray() joueursCles?: string[];
  @IsOptional() @IsArray() forces?: string[];
  @IsOptional() @IsArray() faiblesses?: string[];
  @IsOptional() @IsArray() resultats?: any[];
  @IsOptional() @IsArray() dernier11?: any[];
}

@Injectable()
export class ScoutingService {
  constructor(
    @InjectRepository(RapportScouting) private repo: Repository<RapportScouting>,
  ) {}
  findAll(clubId?: string) {
    return this.repo.find({ where: clubId ? { clubId } : {} });
  }
  /** Rapport le plus recent pour ce club, null si aucun (pas de 404). */
  async findLatestByClub(clubId: string): Promise<RapportScouting | null> {
    const r = await this.repo.findOne({
      where: { clubId },
      order: { date: "DESC" },
    });
    return r ?? null;
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

@Controller("scouting")
class ScoutingController {
  constructor(private svc: ScoutingService) {}
  @Get() list(@Query("clubId") clubId?: string) { return this.svc.findAll(clubId); }
  /** Fiche club : renvoie null si aucun rapport (200 pas 404). */
  @Get("club/:clubId") byClub(@Param("clubId") clubId: string) {
    return this.svc.findLatestByClub(clubId);
  }
  @Get(":id") get(@Param("id") id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: UpsertRapportDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpsertRapportDto) {
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Param("id") id: string) { return this.svc.remove(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([RapportScouting])],
  controllers: [ScoutingController],
  providers: [ScoutingService],
})
export class ScoutingModule {}
