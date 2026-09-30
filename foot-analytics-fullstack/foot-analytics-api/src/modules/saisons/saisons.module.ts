// src/modules/saisons/saisons.module.ts
//
// Gestion des saisons. AUTO-CLONE : a chaque CREATION d'une nouvelle
// saison (manuelle via POST /saisons ou automatique via ensureForDate
// declenchee par l'import FMI), on clone les equipes de la saison
// anterieure la plus recente. L'effectif reste vide, seules les
// meta-equipes (nom, categorie, division, poule, competitionLibelle)
// sont reportees.

import {
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Query, forwardRef, Inject, Logger,
} from "@nestjs/common";
import { IsBoolean, IsInt, IsOptional, IsString } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Saison } from "@/entities";
import { EquipesModule, EquipesService } from "@/modules/equipes/equipes.module";

class CreateSaisonDto {
  @IsString() nom: string;
  @IsInt() anneeDebut: number;
  @IsOptional() @IsBoolean() actif?: boolean;
  @IsOptional() @IsString() statut?: string;
}
class UpdateSaisonDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsInt() anneeDebut?: number;
  @IsOptional() @IsBoolean() actif?: boolean;
  @IsOptional() @IsString() statut?: string;
}

@Injectable()
export class SaisonsService {
  private readonly log = new Logger(SaisonsService.name);

  constructor(
    @InjectRepository(Saison) private repo: Repository<Saison>,
    @Inject(forwardRef(() => EquipesService))
    private equipesService: EquipesService,
  ) {}

  findAll() {
    return this.repo.find({ order: { anneeDebut: "DESC" } });
  }
  async findOne(id: string) {
    const s = await this.repo.findOne({ where: { id } });
    if (!s) throw new NotFoundException(`Saison ${id} introuvable`);
    return s;
  }
  findActive() {
    return this.repo.findOne({ where: { actif: true } });
  }

  /** Saison anterieure la plus recente, par anneeDebut decroissante. */
  private async findPrevious(saison: Saison): Promise<Saison | null> {
    const candidates = await this.repo.find({ order: { anneeDebut: "DESC" } });
    return candidates.find((s) =>
      s.id !== saison.id
      && typeof s.anneeDebut === "number"
      && typeof saison.anneeDebut === "number"
      && s.anneeDebut < saison.anneeDebut,
    ) ?? null;
  }

  /**
   * Cherche N'IMPORTE QUELLE saison anterieure ayant des equipes pour
   * ce club. Robuste au cas ou `anneeDebut` est mal renseigne (null,
   * string, etc.).
   *
   * Strategie :
   * 1. Essaie d'abord findPrevious (saison la plus recente < par anneeDebut)
   * 2. Verifie qu'elle a des equipes pour ce club
   * 3. Sinon, iter sur TOUTES les autres saisons de la BDD (tri par
   *    anneeDebut desc puis createdAt desc pour prendre la plus recente)
   *    et retourne la 1ere qui a des equipes pour ce club
   */
  private async findSaisonSourceAvecEquipes(
    nouvelle: Saison,
    clubId: string,
  ): Promise<Saison | null> {
    const all = await this.repo.find({
      order: { anneeDebut: "DESC" },
    });
    for (const s of all) {
      if (s.id === nouvelle.id) continue;
      // Compte les equipes de ce club sur cette saison via requete
      // raw pour eviter d'injecter equipesRepo (couplage minimal).
      const count = await this.repo.manager
        .createQueryBuilder()
        .select("COUNT(*)", "count")
        .from("equipes", "e")
        .where("e.club_id = :cid", { cid: clubId })
        .andWhere("e.saison_id = :sid", { sid: s.id })
        .getRawOne();
      const n = parseInt(count?.count ?? "0", 10);
      if (n > 0) return s;
    }
    return null;
  }

  /**
   * Apres creation d'une saison : si une saison anterieure existe,
   * on clone TOUTES les equipes de TOUS les clubs vers la nouvelle.
   * Sans joueurs. Idempotent, tolerant aux erreurs.
   *
   * Public : expose aussi via `POST /saisons/:id/auto-clone` pour
   * permettre de trigger manuellement le clone si la saison a ete
   * creee avant que cette logique existe (retro-compat).
   */
  /**
   * Apres creation d'une saison : si une saison anterieure existe,
   * on clone les meta-equipes vers la nouvelle saison. Sans joueurs.
   *
   * @param clubId Optionnel. Si fourni, on ne clone QUE pour ce club
   * (utile pour le trigger manuel depuis le switcher qui vise le club
   * entraine). Si absent, on clone pour TOUS les clubs qui avaient
   * des equipes sur la saison anterieure (comportement auto-trigger
   * a la creation d'une saison).
   */
  async autoCloneEquipesFromPreviousSaison(nouvelle: Saison, clubId?: string) {
    try {
      // Cas cible : on cherche la saison anterieure ayant des equipes
      // pour CE club. Robuste au cas ou anneeDebut est mal typee.
      if (clubId) {
        const src = await this.findSaisonSourceAvecEquipes(nouvelle, clubId);
        this.log.debug(`[autoClone] club=${clubId} nouvelle=${nouvelle.id} (${nouvelle.nom}) -> source trouvee: ${src?.id ?? "NULL"} (${src?.nom ?? "-"})`);
        if (!src) {
          return {
            clubs: 0, creees: 0, existaient: 0,
            message: `Aucune saison anterieure avec des equipes pour le club ${clubId}. Verifie que ton club a bien des equipes sur une saison anterieure.`,
          };
        }
        const r = await this.equipesService.cloneSaison({
          clubId,
          fromSaisonId: src.id,
          toSaisonId: nouvelle.id,
        });
        this.log.debug(`[autoClone] clone ${src.nom} -> ${nouvelle.nom} pour club ${clubId} : ${r.creees} creees, ${r.existaient} existaient`);
        return {
          clubs: r.creees > 0 || r.existaient > 0 ? 1 : 0,
          creees: r.creees,
          existaient: r.existaient,
          fromSaisonId: src.id,
          toSaisonId: nouvelle.id,
          fromSaisonNom: src.nom,
        };
      }

      // Cas auto-trigger (creation saison sans clubId) : clone pour tous.
      const prev = await this.findPrevious(nouvelle);
      if (!prev) {
        return {
          clubs: 0, creees: 0, existaient: 0,
          message: "Aucune saison anterieure trouvee.",
        };
      }
      const r = await this.equipesService.cloneSaisonForAllClubs({
        fromSaisonId: prev.id,
        toSaisonId: nouvelle.id,
      });
      return { ...r, fromSaisonId: prev.id, toSaisonId: nouvelle.id, fromSaisonNom: prev.nom };
    } catch (err) {
      this.log.error(`[autoClone] echec : ${(err as Error).message}`, (err as Error).stack);
      return { error: (err as Error).message };
    }
  }

  /** Cree ou retrouve la saison qui contient la date donnee.
   *  Convention foot : N/N+1 = aout N -> juin N+1.
   *  Auto-clone declenche si nouvelle saison creee ici. */
  async ensureForDate(dateStr: string): Promise<Saison | null> {
    if (!dateStr) return null;
    let year: number | null = null;
    let month: number | null = null;
    let m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) { year = +m[1]; month = +m[2]; }
    else {
      m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) { year = +m[3]; month = +m[2]; }
    }
    if (year == null || month == null) return null;
    const debut = month >= 7 ? year : year - 1;
    const nom = `${debut}-${debut + 1}`;
    let s = await this.repo.findOne({ where: { nom } });
    if (s) return s;
    s = await this.repo.save(this.repo.create({
      nom, anneeDebut: debut, actif: false, statut: "en_cours",
    }));
    await this.autoCloneEquipesFromPreviousSaison(s);
    return s;
  }
  async create(dto: CreateSaisonDto) {
    const s = await this.repo.save(this.repo.create(dto));
    if (dto.actif) await this.activer(s.id);
    await this.autoCloneEquipesFromPreviousSaison(s);
    return this.findOne(s.id);
  }
  async update(id: string, dto: UpdateSaisonDto) {
    const s = await this.findOne(id);
    Object.assign(s, dto);
    return this.repo.save(s);
  }
  async activer(id: string) {
    await this.findOne(id);
    await this.repo.update({}, { actif: false });
    await this.repo.update(id, { actif: true });
    return this.findOne(id);
  }
  async remove(id: string) {
    await this.findOne(id);
    await this.repo.delete(id);
    return { ok: true, id };
  }
}

@Controller("saisons")
class SaisonsController {
  constructor(private svc: SaisonsService) {}
  @Get() findAll() { return this.svc.findAll(); }
  @Get("active") active() { return this.svc.findActive(); }
  @Get(":id") one(@Param("id") id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: CreateSaisonDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpdateSaisonDto) {
    return this.svc.update(id, dto);
  }
  @Patch(":id/activer") activer(@Param("id") id: string) {
    return this.svc.activer(id);
  }
  /**
   * Trigger manuel du clone d'equipes depuis la saison anterieure.
   * Utile si la saison a ete creee avant que l'auto-clone existe,
   * ou pour rejouer le clone apres suppression d'equipes.
   *
   * Idempotent : ne re-cree pas ce qui existe deja.
   */
  @Post(":id/auto-clone")
  async autoClone(
    @Param("id") id: string,
    @Query("clubId") clubId?: string,
  ) {
    const s = await this.svc.findOne(id);
    return this.svc.autoCloneEquipesFromPreviousSaison(s, clubId);
  }
  @Delete(":id") remove(@Param("id") id: string) { return this.svc.remove(id); }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([Saison]),
    forwardRef(() => EquipesModule),
  ],
  controllers: [SaisonsController],
  providers: [SaisonsService],
  exports: [SaisonsService],
})
export class SaisonsModule {}
