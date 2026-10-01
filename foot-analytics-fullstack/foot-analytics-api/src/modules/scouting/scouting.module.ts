// src/modules/scouting/scouting.module.ts
//
// Saison : un rapport est un document date. Avec `saisonId`, on ne garde que
// ceux dont la date tombe dans cette saison (1er juillet -> 30 juin) ; un rapport
// sans date lisible n'appartient qu'a la saison active.
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
import { RapportScouting, Saison } from "@/entities";
import { dateDansSaison } from "@/common/saison-date";
import { parseDateFlexible } from "@/common/periode";
import { Acces, ContexteAcces } from "@/modules/acces/acces.module";

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

@Controller("scouting")
class ScoutingController {
  constructor(private svc: ScoutingService) {}

  /** Un rapport est date : ceux d'une saison fermee au compte ne sont pas renvoyes. */
  private visible = (ctx: ContexteAcces) => (r: RapportScouting) => ctx.voitDate(r.date);

  @Get() list(@Acces() ctx: ContexteAcces, @Query("clubId") clubId?: string, @Query("saisonId") saisonId?: string) {
    if (saisonId && !ctx.voitSaison(saisonId)) return [];
    return this.svc.findAll(clubId, saisonId || undefined, this.visible(ctx));
  }
  /** Fiche club : renvoie null si aucun rapport (200 pas 404). */
  @Get("club/:clubId") byClub(@Acces() ctx: ContexteAcces, @Param("clubId") clubId: string, @Query("saisonId") saisonId?: string) {
    if (saisonId && !ctx.voitSaison(saisonId)) return null;
    return this.svc.findLatestByClub(clubId, saisonId || undefined, this.visible(ctx));
  }
  @Get(":id") async get(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    const r = await this.svc.findOne(id);
    if (!ctx.voitDate(r.date)) throw new NotFoundException(`Rapport ${id} introuvable`);
    return r;
  }
  @Post() create(@Acces() ctx: ContexteAcces, @Body() dto: UpsertRapportDto) {
    if (!ctx.voitDate(dto.date)) throw new NotFoundException("Saison introuvable");
    return this.svc.create(dto);
  }
  @Patch(":id") async update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpsertRapportDto) {
    if (!ctx.voitDate((await this.svc.findOne(id)).date) || !ctx.voitDate(dto.date)) throw new NotFoundException(`Rapport ${id} introuvable`);
    return this.svc.update(id, dto);
  }
  @Delete(":id") async remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    if (!ctx.voitDate((await this.svc.findOne(id)).date)) throw new NotFoundException(`Rapport ${id} introuvable`);
    return this.svc.remove(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([RapportScouting, Saison])],
  controllers: [ScoutingController],
  providers: [ScoutingService],
})
export class ScoutingModule {}
