// src/modules/matchs/matchs.module.ts
import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, NotFoundException, Param,
  Patch, Post, Query, Module,
} from "@nestjs/common";
import { IsArray, IsInt, IsOptional, IsString } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";
import { Composition, EvenementMatch, Match } from "@/entities";
import { choisirProgramme, STATUTS_PROGRAMMES } from "@/common/programme";
import { estFormationInventee, formationValide, normaliserFormation } from "@/common/systeme";

class UpsertMatchDto {
  @IsOptional() @IsString() numeroFmi?: string;
  @IsOptional() @IsString() journee?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() heure?: string;
  @IsOptional() @IsString() competition?: string;
  @IsOptional() @IsString() poule?: string;
  @IsOptional() @IsString() terrain?: string;
  @IsString() clubDom: string;
  @IsString() clubExt: string;
  @IsOptional() @IsInt() scoreDom?: number;
  @IsOptional() @IsInt() scoreExt?: number;
  @IsOptional() @IsString() arbitre?: string;
  @IsOptional() @IsString() formationDom?: string;
  @IsOptional() @IsString() formationExt?: string;
  @IsOptional() @IsString() statut?: string;
  @IsOptional() @IsArray() compositions?: any[];
  @IsOptional() @IsArray() evenements?: any[];
}

/**
 * Les deux dispositifs d'un match saisis par le staff : espaces retires, vide -> null (effacement), valeur qui
 * n'est pas un dispositif (2 a 5 lignes, dix joueurs de champ) refusee.
 */
function dispositifsSaisis(dto: { formationDom?: string; formationExt?: string }): { formationDom?: string | null; formationExt?: string | null } {
  const res: { formationDom?: string | null; formationExt?: string | null } = {};
  for (const cle of ["formationDom", "formationExt"] as const) {
    if (dto[cle] === undefined) continue;
    const v = normaliserFormation(dto[cle]);
    if (v !== null && !formationValide(v)) {
      throw new BadRequestException(`Dispositif invalide : "${dto[cle]}" (attendu par exemple 4-3-3 ou 4-2-3-1, dix joueurs de champ).`);
    }
    res[cle] = v;
  }
  return res;
}

/** Les "4-4-2 / 4-2-3-1" ecrits en dur par l'ancien import ne sont pas des dispositifs : rendus vides (voir common/systeme.ts). */
function sansFormationInventee<T extends { formationDom?: string | null; formationExt?: string | null }>(m: T): T {
  if (estFormationInventee(m)) { m.formationDom = null; m.formationExt = null; }
  return m;
}

/** PATCH : tout est facultatif (saisir un seul dispositif, changer un score...), contrairement a la creation. */
export class UpdateMatchDto {
  @IsOptional() @IsString() numeroFmi?: string;
  @IsOptional() @IsString() journee?: string;
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() heure?: string;
  @IsOptional() @IsString() competition?: string;
  @IsOptional() @IsString() poule?: string;
  @IsOptional() @IsString() terrain?: string;
  @IsOptional() @IsString() clubDom?: string;
  @IsOptional() @IsString() clubExt?: string;
  @IsOptional() @IsInt() scoreDom?: number;
  @IsOptional() @IsInt() scoreExt?: number;
  @IsOptional() @IsString() arbitre?: string;
  @IsOptional() @IsString() formationDom?: string;
  @IsOptional() @IsString() formationExt?: string;
  @IsOptional() @IsString() statut?: string;
  @IsOptional() @IsArray() compositions?: any[];
  @IsOptional() @IsArray() evenements?: any[];
}

@Injectable()
export class MatchsService {
  constructor(
    @InjectRepository(Match) private repo: Repository<Match>,
    @InjectRepository(Composition) private compos: Repository<Composition>,
    @InjectRepository(EvenementMatch) private evts: Repository<EvenementMatch>,
  ) {}

  findAll(clubId?: string) {
    const qb = this.repo.createQueryBuilder("m").orderBy("m.journee", "ASC");
    if (clubId) {
      qb.where("m.club_dom = :c OR m.club_ext = :c", { c: clubId });
    }
    return qb.getMany().then((l) => l.map(sansFormationInventee));
  }

  /** Match deja importe pour ce numero de feuille FMI (ou null). */
  findByNumeroFmi(numeroFmi: string) {
    return this.repo.findOne({ where: { numeroFmi } });
  }

  /**
   * Match deja programme (sans feuille) que la feuille FMI `dateFeuille` vient jouer : memes clubs,
   * meme sens, date proche. Permet a l'import de COMPLETER ce match plutot que d'en creer un second
   * (le plan de jeu prepare reste ainsi attache au bon match).
   */
  async trouverProgramme(clubDom: string, clubExt: string, dateFeuille?: string | null) {
    const candidats = await this.repo.find({
      where: STATUTS_PROGRAMMES.map((statut) => ({ clubDom, clubExt, statut, numeroFmi: IsNull() })),
    });
    return choisirProgramme(candidats, dateFeuille);
  }

  async findOne(id: string) {
    const m = await this.repo.findOne({
      where: { id },
      relations: ["compositions", "evenements", "arbitres", "arbitres.arbitre"],
    });
    if (!m) throw new NotFoundException(`Match ${id} introuvable`);
    // tri des evenements par minute
    m.evenements?.sort(
      (a, b) => (a.minute ?? 0) - (b.minute ?? 0) || (a.arret ?? 0) - (b.arret ?? 0),
    );
    return sansFormationInventee(m);
  }

  async create(dto: UpsertMatchDto) {
    const { compositions, evenements, ...rest } = dto;
    const match = await this.repo.save(this.repo.create({ ...rest, ...dispositifsSaisis(dto) } as any) as unknown as Match);
    if (compositions?.length) {
      await this.compos.save(
        compositions.map((c) => ({ ...c, matchId: match.id })) as any,
      );
    }
    if (evenements?.length) {
      await this.evts.save(
        evenements.map((e) => ({ ...e, matchId: match.id })) as any,
      );
    }
    return this.findOne(match.id);
  }

  async update(id: string, dto: UpdateMatchDto) {
    const m = await this.findOne(id);
    const { compositions, evenements, ...rest } = dto;
    Object.assign(m, rest, dispositifsSaisis(dto));
    await this.repo.save(m);
    if (compositions) {
      await this.compos.delete({ matchId: id });
      await this.compos.save(
        compositions.map((c) => ({ ...c, matchId: id })) as any,
      );
    }
    if (evenements) {
      await this.evts.delete({ matchId: id });
      await this.evts.save(
        evenements.map((e) => ({ ...e, matchId: id })) as any,
      );
    }
    return this.findOne(id);
  }

  async remove(id: string) {
    await this.repo.remove(await this.findOne(id));
    return { ok: true, id };
  }
}

@Controller("matchs")
class MatchsController {
  constructor(private svc: MatchsService) {}
  @Get() list(@Query("clubId") clubId?: string) { return this.svc.findAll(clubId); }
  @Get(":id") get(@Param("id") id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: UpsertMatchDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpdateMatchDto) {
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Param("id") id: string) { return this.svc.remove(id); }
}

@Module({
  imports: [TypeOrmModule.forFeature([Match, Composition, EvenementMatch])],
  controllers: [MatchsController],
  providers: [MatchsService],
  exports: [MatchsService],
})
export class MatchsModule {}
