// src/modules/coachs/coachs.module.ts
//
// CRUD coachs + association coach/match via la table staff_matchs.
// Les cumuls (matchsPresent, V/N/D, categorie, motifsTop) sont alimentes
// par /api/derivation/rebuild.

import {
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Query,
} from "@nestjs/common";
import { IsIn, IsOptional, IsString } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Coach, StaffMatch } from "@/entities";

class CreateCoachDto {
  @IsString() nom: string;
  @IsOptional() @IsString() prenom?: string;
  @IsOptional() @IsString() licence?: string;
  @IsOptional() @IsString() clubId?: string;
}
class UpdateCoachDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() prenom?: string;
  @IsOptional() @IsString() licence?: string;
  @IsOptional() @IsString() clubId?: string;
}
class CreateStaffMatchDto {
  @IsString() matchId: string;
  @IsString() coachId: string;
  @IsIn(["dom", "ext"]) cote: "dom" | "ext";
  @IsOptional() @IsString() fonctions?: string;
}

@Injectable()
export class CoachsService {
  constructor(
    @InjectRepository(Coach) private repo: Repository<Coach>,
    @InjectRepository(StaffMatch) private joinRepo: Repository<StaffMatch>,
  ) {}

  findAll(clubId?: string, q?: string) {
    let qb = this.repo.createQueryBuilder("c");
    if (clubId) qb = qb.where("c.club_id = :id", { id: clubId });
    if (q) {
      qb = qb.andWhere("LOWER(c.nom) LIKE :q OR LOWER(c.prenom) LIKE :q",
        { q: `%${q.toLowerCase()}%` });
    }
    return qb.getMany();
  }
  async findOne(id: string) {
    const c = await this.repo.findOne({
      where: { id },
      relations: ["participations", "participations.match", "club"],
    });
    if (!c) throw new NotFoundException(`Coach ${id} introuvable`);
    return c;
  }
  create(dto: CreateCoachDto) {
    return this.repo.save(this.repo.create(dto));
  }
  async update(id: string, dto: UpdateCoachDto) {
    const c = await this.findOne(id);
    Object.assign(c, dto);
    return this.repo.save(c);
  }
  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { ok: true, id };
  }

  /**
   * Cherche un coach par licence (clef forte) ou par nom complet+club.
   * Cree l'entree s'il n'existe pas. Utilise par l'import FMI.
   */
  async upsert(nomComplet: string, licence: string | undefined, clubId: string)
  : Promise<Coach> {
    if (licence) {
      const byLic = await this.repo.findOne({ where: { licence } });
      if (byLic) return byLic;
    }
    // Heuristique : majuscules = nom, le reste = prenom.
    const cleaned = (nomComplet ?? "").trim().replace(/\s+/g, " ");
    const parts = cleaned.split(" ");
    const nomParts = parts.filter((p) => p === p.toUpperCase() && /[A-Z]/.test(p));
    const prenomParts = parts.filter((p) => !(p === p.toUpperCase() && /[A-Z]/.test(p)));
    const nom = nomParts.join(" ") || cleaned;
    const prenom = prenomParts.join(" ") || undefined;
    // Tentative de fusion par nom+prenom+club (cas: meme coach, sans licence).
    const same = await this.repo.findOne({ where: { nom, prenom: prenom ?? null as any, clubId } });
    if (same) {
      // Ajout de la licence si on l'avait pas.
      if (licence && !same.licence) {
        same.licence = licence;
        return this.repo.save(same);
      }
      return same;
    }
    return this.repo.save(this.repo.create({ nom, prenom, licence, clubId }));
  }

  /* ---- liens coach <-> match ---- */
  listForMatch(matchId: string) {
    return this.joinRepo.find({ where: { matchId }, relations: ["coach"] });
  }
  addToMatch(dto: CreateStaffMatchDto) {
    return this.joinRepo.save(this.joinRepo.create(dto));
  }
  async removeJoin(id: string) {
    await this.joinRepo.delete(id);
    return { ok: true, id };
  }
}

@Controller("coachs")
class CoachsController {
  constructor(private svc: CoachsService) {}
  @Get() find(@Query("clubId") clubId?: string, @Query("q") q?: string) {
    return this.svc.findAll(clubId, q);
  }
  @Get(":id") one(@Param("id") id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: CreateCoachDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpdateCoachDto) {
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Param("id") id: string) { return this.svc.remove(id); }

  @Get("match/:matchId") byMatch(@Param("matchId") matchId: string) {
    return this.svc.listForMatch(matchId);
  }
  @Post("link") link(@Body() dto: CreateStaffMatchDto) {
    return this.svc.addToMatch(dto);
  }
  @Delete("link/:id") deleteLink(@Param("id") id: string) {
    return this.svc.removeJoin(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Coach, StaffMatch])],
  controllers: [CoachsController],
  providers: [CoachsService],
  exports: [CoachsService],
})
export class CoachsModule {}
