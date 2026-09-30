// src/modules/equipes/equipes.module.ts
//
// CRUD equipes + upsert depuis FMI (recherche par club+competition+poule+
// saison, et creation si absent). Une equipe represente une combinaison
// (categorie, division, poule, saison) pour un club. La meme equipe
// physique (ex. "Seniors D2 poule C") existe en plusieurs versions, une
// par saison, pour garder l'historique des classements.

import {
  Body, Controller, Delete, Get, Injectable, Logger, Module, NotFoundException,
  Param, Patch, Post, Query,
} from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Equipe, Match } from "@/entities";

class UpsertEquipeDto {
  @IsString() clubId: string;
  @IsString() nom: string;
  @IsOptional() @IsString() categorie?: string;
  @IsOptional() @IsString() division?: string;
  @IsOptional() @IsString() poule?: string;
  @IsOptional() @IsString() competitionLibelle?: string;
  @IsOptional() @IsString() saisonId?: string;
  @IsOptional() @IsString() coach?: string;
  @IsOptional() @IsString() formationDef?: string;
}

@Injectable()
export class EquipesService {
  private readonly log = new Logger(EquipesService.name);

  constructor(@InjectRepository(Equipe) private repo: Repository<Equipe>) {}

  findAll(opts: { clubId?: string; saisonId?: string } = {}) {
    const where: any = {};
    if (opts.clubId) where.clubId = opts.clubId;
    if (opts.saisonId) where.saisonId = opts.saisonId;
    return this.repo.find({ where, order: { nom: "ASC" } });
  }
  async findOne(id: string) {
    const e = await this.repo.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Equipe ${id} introuvable`);
    return e;
  }
  create(dto: UpsertEquipeDto) { return this.repo.save(this.repo.create(dto)); }
  async update(id: string, dto: Partial<UpsertEquipeDto>) {
    const e = await this.findOne(id);
    Object.assign(e, dto);
    return this.repo.save(e);
  }
  async remove(id: string) {
    await this.repo.remove(await this.findOne(id));
    return { ok: true, id };
  }

  /**
   * Clone les equipes d'une saison vers une autre, pour un club donne.
   * Permet de constituer le squelette d'equipes pour la saison a venir
   * (ex. 2026-2027) sans avoir a importer une FMI : on copie les
   * equipes engagees l'an passe avec les memes categories/divisions/
   * poules supposees.
   *
   * Comportement :
   *  - Pour chaque equipe `from` du club, si une equipe equivalente
   *    n'existe pas encore en `to`, on la cree (nom + categorie +
   *    division + poule conserves, saisonId = to).
   *  - L'effectif n'est pas clone (les joueurs ne sont pas attaches
   *    automatiquement -> a faire manuellement via /joueurs/equipe/.../attach).
   *
   * Retourne le nombre d'equipes creees.
   */
  async cloneSaison(args: {
    clubId: string; fromSaisonId: string; toSaisonId: string;
  }): Promise<{ creees: number; existaient: number }> {
    const sources = await this.repo.find({
      where: { clubId: args.clubId, saisonId: args.fromSaisonId },
    });
    this.log.debug(`[cloneSaison] club=${args.clubId} from=${args.fromSaisonId} to=${args.toSaisonId} : ${sources.length} equipes trouvees dans la source`);
    const cibles = await this.repo.find({
      where: { clubId: args.clubId, saisonId: args.toSaisonId },
    });
    const existanteParCle = new Map(cibles.map((e) => [
      `${e.competitionLibelle ?? ""}|${e.poule ?? ""}|${e.categorie ?? ""}`,
      e,
    ]));
    let creees = 0;
    let existaient = 0;
    for (const src of sources) {
      const cle = `${src.competitionLibelle ?? ""}|${src.poule ?? ""}|${src.categorie ?? ""}`;
      if (existanteParCle.has(cle)) { existaient++; continue; }
      const nouvelle = this.repo.create({
        clubId: src.clubId,
        nom: src.nom,
        categorie: src.categorie,
        division: src.division,
        poule: src.poule,
        competitionLibelle: src.competitionLibelle,
        saisonId: args.toSaisonId,
        // IMPORTANT : on ne reprend AUCUN joueur (effectif vide
        // par defaut sur la nouvelle saison). Les joueurs seront
        // attaches manuellement via /effectif ou auto via FMI.
      });
      await this.repo.save(nouvelle);
      creees++;
    }
    return { creees, existaient };
  }

  /**
   * Clone les equipes pour TOUS les clubs de la BDD depuis la saison
   * source vers la saison cible. Appele automatiquement quand une
   * nouvelle saison est creee (cf. SaisonsService.create + ensureForDate).
   *
   * Sans joueurs : seulement les meta-equipes (nom, categorie, division,
   * poule, competitionLibelle). L'effectif reste vide jusqu'a ajout
   * manuel ou import FMI.
   */
  async cloneSaisonForAllClubs(args: {
    fromSaisonId: string; toSaisonId: string;
  }): Promise<{ clubs: number; creees: number; existaient: number }> {
    // Liste tous les clubs ayant au moins une equipe sur la saison source.
    const sourcesAll = await this.repo.find({
      where: { saisonId: args.fromSaisonId },
    });
    const clubIds = Array.from(new Set(sourcesAll.map((e) => e.clubId)));
    let totalCreees = 0, totalExistaient = 0;
    for (const clubId of clubIds) {
      const r = await this.cloneSaison({
        clubId,
        fromSaisonId: args.fromSaisonId,
        toSaisonId: args.toSaisonId,
      });
      totalCreees += r.creees;
      totalExistaient += r.existaient;
    }
    return {
      clubs: clubIds.length,
      creees: totalCreees,
      existaient: totalExistaient,
    };
  }

  /**
   * Trouve l'equipe d'un club pour (competition, poule, saison), ou la
   * cree. Trois strategies dans l'ordre :
   *
   * 1. **Match strict** (competitionLibelle + poule + saison) : si l'equipe
   *    exacte existe deja, on la retourne. Cas nominal quand la FMI
   *    correspond a l'equipe deja en BDD.
   *
   * 2. **Match par categorie sur equipe orpheline** : si aucune equipe
   *    exacte n'est trouvee mais qu'il existe une equipe clonee (par
   *    auto-clone de saison anterieure) de la meme categorie, sans
   *    aucun match encore, on la MET A JOUR avec les nouvelles valeurs
   *    (division, poule, competitionLibelle, nom). Cela couvre le cas
   *    d'une equipe qui monte/descend (D2 -> D1 par exemple) : on ne
   *    cree pas de doublon, on adapte l'equipe clonee.
   *
   * 3. **Creation** : rien trouve -> nouvelle equipe.
   */
  async upsertForFmi(args: {
    clubId: string;
    competitionLibelle: string | null;
    poule: string | null;
    saisonId: string | null;
  }): Promise<Equipe> {
    const competitionLibelle = (args.competitionLibelle ?? "").trim() || null;
    const poule = (args.poule ?? "").trim() || null;

    // -------- Etape 1 : match strict --------
    const qb = this.repo.createQueryBuilder("e")
      .where("e.club_id = :cid", { cid: args.clubId });
    if (competitionLibelle) qb.andWhere("e.competitionLibelle = :cl", { cl: competitionLibelle });
    else qb.andWhere("e.competitionLibelle IS NULL");
    if (poule) qb.andWhere("e.poule = :p", { p: poule });
    else qb.andWhere("e.poule IS NULL");
    if (args.saisonId) qb.andWhere("e.saison_id = :sid", { sid: args.saisonId });
    else qb.andWhere("e.saison_id IS NULL");
    const existing = await qb.getOne();
    if (existing) return existing;

    // Deduit la categorie / division depuis le libelle FMI.
    // Ex. : "Seniors D2 / Phase Unique", "U20 Regional 2 / Unique / Poule B".
    const lib = competitionLibelle ?? "";
    let categorie: string | null = null;
    let division: string | null = null;
    const mCat = lib.match(/(Seniors?|U\d{1,2}|Veterans?|Feminines?)/i);
    if (mCat) categorie = mCat[1];
    const mDivRegional = lib.match(/Regional\s*(\d)/i);
    const mDivDepart = lib.match(/Departemental\s*(\d)/i);
    const mDivCourt = lib.match(/\b(D\d|R\d|N\d|National\s*\d?|PHR|PH|DSR|DH)\b/i);
    if (mDivRegional) division = `R${mDivRegional[1]}`;
    else if (mDivDepart) division = `D${mDivDepart[1]}`;
    else if (mDivCourt) division = mDivCourt[1];

    const nomParts = [categorie, division, poule ? `Poule ${poule}` : ""].filter(Boolean);
    const nom = nomParts.length ? nomParts.join(" ") : (competitionLibelle ?? "Equipe");

    // -------- Etape 2 : match par categorie sur equipe orpheline --------
    // Une "equipe orpheline" = equipe cote BDD sans aucun match encore
    // (auto-clone recente, jamais associee a une FMI).
    // Cela permet de corriger une equipe D2 clonee qui doit devenir D1.
    if (categorie && args.saisonId) {
      // Jointure sur l'entite Match avec les NOMS DE PROPRIETES : les colonnes
      // reelles sont equipe_dom / equipe_ext (et non equipe_dom_id).
      const memeCategorie = await this.repo.createQueryBuilder("e")
        .leftJoin(Match, "m",
          "(m.equipeDomId = e.id OR m.equipeExtId = e.id)")
        .where("e.club_id = :cid", { cid: args.clubId })
        .andWhere("e.saison_id = :sid", { sid: args.saisonId })
        .andWhere("LOWER(e.categorie) = LOWER(:cat)", { cat: categorie })
        // GROUP BY + HAVING pour ne garder que les orphelines (0 matchs)
        .groupBy("e.id")
        .having("COUNT(m.id) = 0")
        .getMany();

      // Cas simple : UNE seule equipe orpheline de cette categorie ->
      // on la met a jour. Ambigu si plusieurs (Seniors 1, Seniors 2) :
      // on ne touche a rien et on cree une nouvelle equipe pour ne pas
      // faire de choix arbitraire.
      if (memeCategorie.length === 1) {
        const orph = memeCategorie[0] as any;
        // Mise a jour : la FMI est plus fiable que le clone. On
        // n'ecrase que si on a une valeur — inutile de mettre a
        // undefined si la FMI ne fournit rien.
        if (competitionLibelle) orph.competitionLibelle = competitionLibelle;
        if (poule) orph.poule = poule;
        if (division) orph.division = division;
        orph.nom = nom;
        return this.repo.save(orph);
      }
    }

    // -------- Etape 3 : creation --------
    return this.repo.save(this.repo.create({
      clubId: args.clubId, nom,
      categorie: categorie ?? undefined, division: division ?? undefined,
      poule: poule ?? undefined, competitionLibelle: competitionLibelle ?? undefined,
      saisonId: args.saisonId ?? undefined,
    }));
  }
}

@Controller("equipes")
class EquipesController {
  constructor(private svc: EquipesService) {}
  @Get() list(@Query("clubId") clubId?: string, @Query("saisonId") saisonId?: string) {
    return this.svc.findAll({ clubId, saisonId });
  }
  @Get(":id") get(@Param("id") id: string) { return this.svc.findOne(id); }
  @Post() create(@Body() dto: UpsertEquipeDto) { return this.svc.create(dto); }
  @Patch(":id") update(@Param("id") id: string, @Body() dto: UpsertEquipeDto) {
    return this.svc.update(id, dto);
  }
  @Delete(":id") remove(@Param("id") id: string) { return this.svc.remove(id); }

  // Clone toutes les equipes d'un club d'une saison vers une autre.
  // Usage : preparer la saison 2026-2027 en clonant les equipes engagees
  // en 2025-2026 (effectif vide a remplir manuellement).
  @Post("clone-saison")
  cloneSaison(@Body() body: { clubId: string; fromSaisonId: string; toSaisonId: string }) {
    return this.svc.cloneSaison(body);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Equipe])],
  controllers: [EquipesController],
  providers: [EquipesService],
  exports: [EquipesService],
})
export class EquipesModule {}
