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
import { In, Repository } from "typeorm";
import { Coach, Saison, StaffMatch } from "@/entities";
import { FicheCoach, ficheCoach } from "@/common/fiche-coach";
import { Acces, AccesModule, AccesService, ContexteAcces } from "@/modules/acces/acces.module";

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
      qb = qb.andWhere("(LOWER(c.nom) LIKE :q OR LOWER(c.prenom) LIKE :q)",
        { q: `%${q.toLowerCase()}%` });
    }
    return qb.getMany();
  }
  /**
   * Recherche par nom pour la barre de recherche : chaque mot saisi doit se retrouver dans le nom ou le prenom
   * (dans n'importe quel ordre). Le club renvoye est le plus recent d'apres les feuilles de match, pas celui de
   * la premiere apparition.
   */
  async rechercher(q: string, limite = 8) {
    const mots = (q ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    if (mots.length === 0) return [];
    let qb = this.repo.createQueryBuilder("c");
    mots.forEach((m, i) => {
      qb = qb.andWhere(`(LOWER(c.nom) LIKE :m${i} OR LOWER(COALESCE(c.prenom, '')) LIKE :m${i})`, { [`m${i}`]: `%${m}%` });
    });
    const ids = (await qb.orderBy("c.nom").take(limite).getMany()).map((c) => c.id);
    if (ids.length === 0) return [];
    const coachs = await this.repo.find({ where: { id: In(ids) }, relations: ["participations", "participations.match"] });
    const saisons = new Map((await this.repo.manager.getRepository(Saison).find())
      .map((s) => [s.id, { id: s.id, nom: s.nom, anneeDebut: s.anneeDebut }]));
    return ids.map((id) => coachs.find((c) => c.id === id)!).map((c) => ({
      id: c.id, nom: c.nom, prenom: c.prenom,
      clubId: ficheCoach(c.participations ?? [], saisons, null).clubActuelId ?? c.clubId,
    }));
  }
  async findOne(id: string) {
    const c = await this.repo.findOne({
      where: { id },
      relations: ["participations", "participations.match", "club"],
    });
    if (!c) throw new NotFoundException(`Coach ${id} introuvable`);
    return c;
  }
  /**
   * Fiche du coach : bilan sur la portee demandee (`saisonId`, sinon toute la carriere), bilan par saison
   * et par club, parcours de clubs, matchs. Les cumuls de la table `coachs` ne servent qu'aux cartons.
   */
  async fiche(id: string, saisonId?: string | null, voitSaison: (saisonId: string | null | undefined) => boolean = () => true): Promise<FicheCoach & {
    coach: Pick<Coach, "id" | "nom" | "prenom" | "licence" | "clubId" | "cartonsJaunes" | "cartonsRouges" | "motifsTop">;
  }> {
    const c = await this.findOne(id);
    const saisons = new Map((await this.repo.manager.getRepository(Saison).find())
      .map((s) => [s.id, { id: s.id, nom: s.nom, anneeDebut: s.anneeDebut }]));
    // Les matchs des saisons fermees au compte n'entrent pas dans la fiche (ni bilan, ni parcours, ni liste de matchs).
    const fiche = ficheCoach((c.participations ?? []).filter((p) => voitSaison(p.match?.saisonId)), saisons, saisonId || null);
    return {
      coach: {
        id: c.id, nom: c.nom, prenom: c.prenom, licence: c.licence, clubId: fiche.clubActuelId ?? c.clubId,
        cartonsJaunes: c.cartonsJaunes, cartonsRouges: c.cartonsRouges, motifsTop: c.motifsTop,
      },
      ...fiche,
    };
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
  /** Le lien coach/match (404 s'il n'existe pas) : sert a verifier les droits sur le match avant d'y toucher. */
  async lien(id: string) {
    const j = await this.joinRepo.findOne({ where: { id } });
    if (!j) throw new NotFoundException(`Lien coach-match ${id} introuvable`);
    return j;
  }
  async removeJoin(id: string) {
    await this.joinRepo.delete(id);
    return { ok: true, id };
  }
}

@Controller("coachs")
class CoachsController {
  constructor(private svc: CoachsService, private acces: AccesService) {}

  /** Un entraineur de mon club (404 s'il n'existe pas ; 403 sinon). Un entraineur sans club ne regarde que l'admin. */
  private async exigerCoachDuClub(ctx: ContexteAcces, id: string) {
    const c = await this.svc.findOne(id);
    this.acces.exigerClub(ctx, c.clubId, "Cet entraineur n'est pas de ton club.");
    return c;
  }

  // Les entraineurs sont une donnee de championnat : lisibles par tous, hors matchs des saisons fermees au compte.
  @Get() find(@Query("clubId") clubId?: string, @Query("q") q?: string) {
    return this.svc.findAll(clubId, q);
  }
  @Get("recherche") recherche(@Query("q") q?: string) { return this.svc.rechercher(q ?? ""); }
  @Get(":id") async one(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    const c = await this.svc.findOne(id);
    return ctx.saisonsRestreintes ? { ...c, participations: (c.participations ?? []).filter((p) => ctx.voitSaison(p.match?.saisonId)) } : c;
  }
  // GET /coachs/:id/fiche[?saisonId=...] : bilans, parcours et matchs du coach.
  @Get(":id/fiche") fiche(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Query("saisonId") saisonId?: string) {
    if (saisonId && !ctx.voitSaison(saisonId)) throw new NotFoundException(`Saison ${saisonId} introuvable`);
    return this.svc.fiche(id, saisonId, (s) => ctx.voitSaison(s));
  }
  @Post() create(@Acces() ctx: ContexteAcces, @Body() dto: CreateCoachDto) {
    this.acces.exigerClub(ctx, dto.clubId);
    return this.svc.create(dto);
  }
  @Patch(":id") async update(@Acces() ctx: ContexteAcces, @Param("id") id: string, @Body() dto: UpdateCoachDto) {
    await this.exigerCoachDuClub(ctx, id);
    if (dto.clubId !== undefined) this.acces.exigerClub(ctx, dto.clubId);
    return this.svc.update(id, dto);
  }
  @Delete(":id") async remove(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    await this.exigerCoachDuClub(ctx, id);
    return this.svc.remove(id);
  }

  @Get("match/:matchId") async byMatch(@Acces() ctx: ContexteAcces, @Param("matchId") matchId: string) {
    await this.acces.match(ctx, matchId);
    return this.svc.listForMatch(matchId);
  }
  @Post("link") async link(@Acces() ctx: ContexteAcces, @Body() dto: CreateStaffMatchDto) {
    await this.acces.matchGere(ctx, dto.matchId);
    return this.svc.addToMatch(dto);
  }
  @Delete("link/:id") async deleteLink(@Acces() ctx: ContexteAcces, @Param("id") id: string) {
    await this.acces.matchGere(ctx, (await this.svc.lien(id)).matchId);
    return this.svc.removeJoin(id);
  }
}

@Module({
  imports: [AccesModule, TypeOrmModule.forFeature([Coach, StaffMatch])],
  controllers: [CoachsController],
  providers: [CoachsService],
  exports: [CoachsService],
})
export class CoachsModule {}
