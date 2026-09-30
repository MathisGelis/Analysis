// src/modules/arbitres/arbitres.module.ts
//
// CRUD arbitres + association arbitre/match avec note.
// Les cumuls (matchsOfficies, cartons donnes, profil, noteMoyenne) sont
// alimentes par /api/derivation/rebuild.

import {
  Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Param, Patch, Post, Query,
} from "@nestjs/common";
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Arbitre, ArbitreMatch } from "@/entities";

const ROLES = ["principal", "assistant1", "assistant2", "4e"] as const;

class CreateArbitreDto {
  @IsString() nom: string;
  @IsOptional() @IsString() prenom?: string;
}
class UpdateArbitreDto {
  @IsOptional() @IsString() nom?: string;
  @IsOptional() @IsString() prenom?: string;
}
class CreateArbitreMatchDto {
  @IsString() matchId: string;
  @IsString() arbitreId: string;
  @IsIn(ROLES as any) role: string;
  @IsOptional() @IsNumber() @Min(0) @Max(10) note?: number;
}
class UpdateArbitreMatchDto {
  @IsOptional() @IsIn(ROLES as any) role?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(10) note?: number;
}

@Injectable()
export class ArbitresService {
  constructor(
    @InjectRepository(Arbitre) private repo: Repository<Arbitre>,
    @InjectRepository(ArbitreMatch) private joinRepo: Repository<ArbitreMatch>,
  ) {}

  findAll(q?: string) {
    return q
      ? this.repo
          .createQueryBuilder("a")
          .where("LOWER(a.nom) LIKE :q OR LOWER(a.prenom) LIKE :q", { q: `%${q.toLowerCase()}%` })
          .getMany()
      : this.repo.find();
  }
  async findOne(id: string) {
    const a = await this.repo.findOne({
      where: { id },
      relations: ["participationsLies", "participationsLies.match"],
    });
    if (!a) throw new NotFoundException(`Arbitre ${id} introuvable`);
    // L'attribut `participations` (colonne JSON denormalisee) est une
    // string. Pour le front, on l'expose sous forme parse + on renomme
    // la relation TypeORM en `liensMatchs` pour eviter la confusion.
    let parChampionnat: any[] = [];
    try {
      parChampionnat = a.participations ? JSON.parse(a.participations) : [];
    } catch { parChampionnat = []; }
    return {
      ...a,
      liensMatchs: a.participationsLies,
      participationsLies: undefined,
      participations: parChampionnat,   // [] | [{saisonNom, profil, ...}]
    };
  }
  /** Lookup interne minimal pour update/remove (sans relations ni
   *  parsing JSON). */
  private async findEntity(id: string) {
    const a = await this.repo.findOne({ where: { id } });
    if (!a) throw new NotFoundException(`Arbitre ${id} introuvable`);
    return a;
  }
  create(dto: CreateArbitreDto) {
    return this.repo.save(this.repo.create(dto));
  }
  async update(id: string, dto: UpdateArbitreDto) {
    const a = await this.findEntity(id);
    Object.assign(a, dto);
    return this.repo.save(a);
  }
  async remove(id: string) {
    await this.findEntity(id);
    await this.repo.delete(id);
    return { ok: true, id };
  }

  // Cherche ou cree un arbitre a partir d'un nom complet (utilise par
  // l'import FMI). Le nom complet est split sur la 1re majuscule isolee.
  async upsertByNomComplet(nomComplet: string): Promise<Arbitre> {
    const cleaned = (nomComplet ?? "").trim().replace(/\s+/g, " ");
    if (!cleaned) throw new NotFoundException("Nom arbitre vide");

    // Heuristique de parse — robuste a la casse.
    // - "DUPONT Jean Pierre"   -> nom = "DUPONT",        prenom = "Jean Pierre"
    // - "Dupont Jean Pierre"   -> nom = "DUPONT",        prenom = "Jean Pierre"
    // - "DE LA TOUR Jean"      -> nom = "DE LA TOUR",    prenom = "Jean"
    // - "Perier Cedric"        -> nom = "PERIER",        prenom = "Cedric"
    //
    // Strategie :
    // - Si au moins un token est en UPPERCASE pur, on prend tous les
    //   tokens UPPERCASE consecutifs en debut de chaine comme nom.
    // - Sinon (tous en Pascal Case "Dupont Jean"), on prend le 1er
    //   token comme nom et le reste comme prenom.
    // - Le nom est NORMALISE en uppercase avant insertion en base.
    const parts = cleaned.split(" ");
    let nom: string;
    let prenom: string | undefined;
    const isPureUpper = (p: string) =>
      p === p.toUpperCase() && p !== p.toLowerCase();
    if (parts.some(isPureUpper)) {
      // Cas FMI standard : nom en MAJ, prenom en Pascal.
      const nomParts: string[] = [];
      let i = 0;
      while (i < parts.length && isPureUpper(parts[i])) {
        nomParts.push(parts[i]);
        i++;
      }
      nom = nomParts.join(" ").toUpperCase();
      prenom = parts.slice(i).join(" ").trim() || undefined;
    } else {
      // Cas degrade : aucune majuscule pure -> 1er token = nom.
      nom = (parts[0] ?? "").toUpperCase();
      prenom = parts.slice(1).join(" ").trim() || undefined;
    }
    if (!nom) nom = cleaned.toUpperCase();

    // Lookup INSENSIBLE A LA CASSE pour dedupliquer les variantes
    // d'ecriture entre FMI ("Perier" vs "PERIER", "Cedric" vs "CEDRIC").
    const qb = this.repo.createQueryBuilder("a")
      .where("UPPER(a.nom) = UPPER(:nom)", { nom });
    if (prenom) qb.andWhere("UPPER(COALESCE(a.prenom, '')) = UPPER(:prenom)", { prenom });
    else qb.andWhere("(a.prenom IS NULL OR a.prenom = '')");
    let a = await qb.getOne();
    if (a) return a;

    // Nouveau : on persiste le nom en uppercase pour une presentation
    // FMI canonique, et le prenom en Pascal Case (1ere majuscule).
    const prenomCanon = prenom
      ? prenom
        .split(/\s+/)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(" ")
      : undefined;
    a = this.repo.create({ nom, prenom: prenomCanon ?? null as any });
    return this.repo.save(a);
  }

  // CRUD sur la table d'association arbitre/match
  listForMatch(matchId: string) {
    return this.joinRepo.find({ where: { matchId }, relations: ["arbitre"] });
  }
  addToMatch(dto: CreateArbitreMatchDto) {
    return this.joinRepo.save(this.joinRepo.create(dto));
  }
  async updateJoin(id: string, dto: UpdateArbitreMatchDto) {
    const j = await this.joinRepo.findOne({ where: { id } });
    if (!j) throw new NotFoundException(`Lien arbitre-match ${id} introuvable`);
    Object.assign(j, dto);
    return this.joinRepo.save(j);
  }
  async removeJoin(id: string) {
    await this.joinRepo.delete(id);
    return { ok: true, id };
  }
}

@Controller("arbitres")
class ArbitresController {
  constructor(private svc: ArbitresService) {}
  @Get() find(@Query("q") q?: string) { return this.svc.findAll(q); }
  @Get(":id") one(@Param("id") id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: CreateArbitreDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpdateArbitreDto) {
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Param("id") id: string) { return this.svc.remove(id); }

  // Liens arbitre <-> match
  @Get("match/:matchId") byMatch(@Param("matchId") matchId: string) {
    return this.svc.listForMatch(matchId);
  }
  @Post("link") link(@Body() dto: CreateArbitreMatchDto) {
    return this.svc.addToMatch(dto);
  }
  @Patch("link/:id") updateLink(@Param("id") id: string, @Body() dto: UpdateArbitreMatchDto) {
    return this.svc.updateJoin(id, dto);
  }
  @Delete("link/:id") deleteLink(@Param("id") id: string) {
    return this.svc.removeJoin(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Arbitre, ArbitreMatch])],
  controllers: [ArbitresController],
  providers: [ArbitresService],
  exports: [ArbitresService],
})
export class ArbitresModule {}
