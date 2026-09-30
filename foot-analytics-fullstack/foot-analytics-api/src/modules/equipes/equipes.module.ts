// src/modules/equipes/equipes.module.ts
//
// CRUD equipes + upsert depuis FMI (recherche par club+competition+poule+
// saison, et creation si absent). Une equipe represente une combinaison
// (categorie, division, poule, saison) pour un club. La meme equipe
// physique (ex. "Seniors D2 poule C") existe en plusieurs versions, une
// par saison, pour garder l'historique des classements.

import {
  Body, Controller, Delete, Get, Injectable, Logger, Module, NotFoundException,
  Param, Patch, Post, Query, UseGuards,
} from "@nestjs/common";
import { IsOptional, IsString } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Club, Entrainement, Equipe, Joueur, LigneClassement, Match, StatJoueurEquipe, Utilisateur,
} from "@/entities";
import { AdminGuard, AuthModule } from "../auth/auth.module";

const minuscule = (v: string | null | undefined) => (v ?? "").trim().toLowerCase();

/** Meme "niveau" dans un club : categorie ET division connues et identiques (poule ignoree). */
export function memeNiveau(
  a: Pick<Equipe, "categorie" | "division">,
  b: Pick<Equipe, "categorie" | "division">,
): boolean {
  return !!minuscule(a.categorie) && !!minuscule(a.division)
    && minuscule(a.categorie) === minuscule(b.categorie)
    && minuscule(a.division) === minuscule(b.division);
}

export interface RapportFusion {
  club: string;
  saison: string;
  source: { id: string; nom: string; poule: string | null };
  cible: { id: string; nom: string; poule: string | null };
  joueursDeplaces: number;
  seancesDeplacees: number;
}
export interface RapportReconciliation {
  appliquer: boolean;
  fusions: RapportFusion[];
  /** Cas que l'on ne tranche pas : plusieurs equipes deja jouees au meme niveau, ou plusieurs clones sans equipe reelle. */
  ambigus: { club: string; saison: string; niveau: string; equipes: string[] }[];
}

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
      // Une equipe du MEME NIVEAU (categorie + division) existe deja sur la
      // saison cible : la poule a change entre les deux saisons (Seniors D2
      // poule C puis poule A), l'equipe reelle est deja la. Recreer le clone
      // de l'an passe ferait un doublon provisoire que rien n'absorberait.
      if (cibles.some((c) => memeNiveau(c, src))) { existaient++; continue; }
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
    if (existing) return this.absorberDoublons(existing);

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

      // 2a. Meme NIVEAU (categorie + division) : la poule a change d'une
      //     saison a l'autre (Seniors D2 poule C -> poule A) mais c'est la meme
      //     equipe. C'est le cas courant, et il reste non ambigu meme quand le
      //     club aligne plusieurs equipes de la categorie (Seniors D2 et R2).
      // 2b. Sinon, UNE seule orpheline de la categorie : montee / descente
      //     (D2 -> D1), on l'adapte. Plusieurs : on ne choisit pas au hasard.
      const memeNiveauOrph = division
        ? memeCategorie.filter((e) => minuscule(e.division) === minuscule(division))
        : [];
      const choisie: any =
        memeNiveauOrph.length === 1 ? memeNiveauOrph[0]
        : memeNiveauOrph.length === 0 && memeCategorie.length === 1 ? memeCategorie[0]
        : null;
      if (choisie) {
        // Mise a jour : la FMI est plus fiable que le clone. On
        // n'ecrase que si on a une valeur — inutile de mettre a
        // undefined si la FMI ne fournit rien.
        if (competitionLibelle) choisie.competitionLibelle = competitionLibelle;
        if (poule) choisie.poule = poule;
        if (division) choisie.division = division;
        choisie.nom = nom;
        return this.absorberDoublons(await this.repo.save(choisie));
      }
    }

    // -------- Etape 3 : creation --------
    return this.absorberDoublons(await this.repo.save(this.repo.create({
      clubId: args.clubId, nom,
      categorie: categorie ?? undefined, division: division ?? undefined,
      poule: poule ?? undefined, competitionLibelle: competitionLibelle ?? undefined,
      saisonId: args.saisonId ?? undefined,
    })));
  }

  /* ------------------------------------------------------------------ */
  /*  Doublons provisoires (clones de la saison precedente)               */
  /* ------------------------------------------------------------------ */

  private async nbMatchs(equipeId: string): Promise<number> {
    return this.repo.manager.getRepository(Match).count({
      where: [{ equipeDomId: equipeId }, { equipeExtId: equipeId }],
    });
  }

  /**
   * Fusionne `sourceId` dans `cibleId` puis supprime la source : joueurs
   * attaches, seances d'entrainement et matchs sont rattaches a la cible.
   */
  async fusionner(sourceId: string, cibleId: string): Promise<{ joueursDeplaces: number; seancesDeplacees: number }> {
    if (sourceId === cibleId) return { joueursDeplaces: 0, seancesDeplacees: 0 };
    const m = this.repo.manager;

    // Joueurs attaches (colonne CSV) : remplace la source par la cible, sans doublon.
    const joueurs = await m.getRepository(Joueur).createQueryBuilder("j")
      .where("j.equipesAttachees LIKE :p", { p: `%${sourceId}%` })
      .getMany();
    let joueursDeplaces = 0;
    for (const j of joueurs) {
      const avant = j.equipesAttachees ?? [];
      if (!avant.includes(sourceId)) continue; // LIKE peut matcher une sous-chaine
      j.equipesAttachees = [...new Set(avant.map((id) => (id === sourceId ? cibleId : id)))];
      await m.getRepository(Joueur).save(j);
      joueursDeplaces++;
    }

    // Droits d'acces : un utilisateur limite a l'equipe fusionnee doit garder l'acces a
    // celle qui la remplace (sinon elle disparait de son selecteur).
    const users = await m.getRepository(Utilisateur).createQueryBuilder("u")
      .where("u.equipeIds LIKE :p", { p: `%${sourceId}%` })
      .getMany();
    for (const u of users) {
      if (!(u.equipeIds ?? []).includes(sourceId)) continue;
      u.equipeIds = [...new Set(u.equipeIds.map((id) => (id === sourceId ? cibleId : id)))];
      await m.getRepository(Utilisateur).save(u);
    }

    const seances = await m.getRepository(Entrainement).update({ equipeId: sourceId }, { equipeId: cibleId });
    // Buts / passes saisis a la main : ils suivent l'equipe ; si un joueur a deja
    // une saisie dans la cible, c'est elle qui fait foi.
    const statsRepo = m.getRepository(StatJoueurEquipe);
    const deCible = new Set((await statsRepo.find({ where: { equipeId: cibleId } })).map((r) => r.joueurId));
    for (const r of await statsRepo.find({ where: { equipeId: sourceId } })) {
      if (deCible.has(r.joueurId)) await statsRepo.remove(r);
      else { r.equipeId = cibleId; await statsRepo.save(r); }
    }
    await m.getRepository(Match).update({ equipeDomId: sourceId }, { equipeDomId: cibleId });
    await m.getRepository(Match).update({ equipeExtId: sourceId }, { equipeExtId: cibleId });
    // Lignes de classement de la source : recalculees par la derivation, on ne les deplace pas.
    await m.getRepository(LigneClassement).delete({ equipeId: sourceId });
    await this.repo.delete(sourceId);

    this.log.log(`[fusion] equipe ${sourceId} -> ${cibleId} : ${joueursDeplaces} joueur(s), ${seances.affected ?? 0} seance(s)`);
    return { joueursDeplaces, seancesDeplacees: seances.affected ?? 0 };
  }

  /**
   * Absorbe dans `equipe` les equipes SANS MATCH du meme club, de la meme
   * saison et du meme niveau (categorie + division) : ce sont les clones
   * provisoires de la saison precedente, devenus des doublons des que la vraie
   * equipe (autre poule) existe. Un club ne peut pas avoir deux equipes au meme
   * niveau, donc la fusion est sure. Ne touche jamais une equipe deja jouee.
   */
  async absorberDoublons(equipe: Equipe): Promise<Equipe> {
    if (!equipe.saisonId || !equipe.categorie || !equipe.division) return equipe;
    const memeClub = await this.repo.find({ where: { clubId: equipe.clubId, saisonId: equipe.saisonId } });
    for (const autre of memeClub) {
      if (autre.id === equipe.id || !memeNiveau(autre, equipe)) continue;
      if ((await this.nbMatchs(autre.id)) > 0) continue;
      await this.fusionner(autre.id, equipe.id);
    }
    return equipe;
  }

  /**
   * Reconciliation des donnees EXISTANTES : pour chaque (club, saison, niveau)
   * qui a une equipe jouee et une ou plusieurs equipes sans match, fusionne les
   * secondes dans la premiere. Les cas ambigus sont listes, jamais fusionnes.
   * Simulation par defaut.
   */
  async reconcilier(appliquer = false, saisonId?: string): Promise<RapportReconciliation> {
    const equipes = await this.repo.find({ where: saisonId ? { saisonId } : {} });
    const manager = this.repo.manager;
    const clubs = new Map((await manager.getRepository(Club).find()).map((c) => [c.id, c.nom]));
    const saisons = new Map(
      (await manager.getRepository("Saison").find() as any[]).map((s) => [s.id, s.nom as string]),
    );

    const groupes = new Map<string, Equipe[]>();
    for (const e of equipes) {
      if (!e.saisonId || !minuscule(e.categorie) || !minuscule(e.division)) continue;
      const cle = `${e.clubId}|${e.saisonId}|${minuscule(e.categorie)}|${minuscule(e.division)}`;
      groupes.set(cle, [...(groupes.get(cle) ?? []), e]);
    }

    const rapport: RapportReconciliation = { appliquer, fusions: [], ambigus: [] };
    for (const groupe of groupes.values()) {
      if (groupe.length < 2) continue;
      const avecMatchs: Equipe[] = [];
      const orphelines: Equipe[] = [];
      for (const e of groupe) ((await this.nbMatchs(e.id)) > 0 ? avecMatchs : orphelines).push(e);

      const ref = groupe[0];
      const club = clubs.get(ref.clubId) ?? ref.clubId;
      const saison = saisons.get(ref.saisonId) ?? ref.saisonId;
      if (avecMatchs.length !== 1) {
        rapport.ambigus.push({
          club, saison, niveau: `${ref.categorie} ${ref.division}`,
          equipes: groupe.map((e) => e.nom),
        });
        continue;
      }
      const cible = avecMatchs[0];
      for (const source of orphelines) {
        const joueursAttaches = (await manager.getRepository(Joueur).createQueryBuilder("j")
          .where("j.equipesAttachees LIKE :p", { p: `%${source.id}%` }).getMany())
          .filter((j) => (j.equipesAttachees ?? []).includes(source.id)).length;
        const seances = await manager.getRepository(Entrainement).count({ where: { equipeId: source.id } });
        const fusion: RapportFusion = {
          club, saison,
          source: { id: source.id, nom: source.nom, poule: source.poule ?? null },
          cible: { id: cible.id, nom: cible.nom, poule: cible.poule ?? null },
          joueursDeplaces: joueursAttaches, seancesDeplacees: seances,
        };
        if (appliquer) await this.fusionner(source.id, cible.id);
        rapport.fusions.push(fusion);
      }
    }
    return rapport;
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

  // Maintenance (admin) : fusionne les clones provisoires de la saison
  // precedente devenus doublons de la vraie equipe (autre poule). Simulation par
  // defaut ; ?appliquer=true pour fusionner ; ?saisonId= pour limiter a une saison.
  @Post("maintenance/reconcilier") @UseGuards(AdminGuard)
  reconcilier(@Query("appliquer") appliquer?: string, @Query("saisonId") saisonId?: string) {
    return this.svc.reconcilier(appliquer === "true", saisonId);
  }

  // Clone toutes les equipes d'un club d'une saison vers une autre.
  // Usage : preparer la saison 2026-2027 en clonant les equipes engagees
  // en 2025-2026 (effectif vide a remplir manuellement).
  @Post("clone-saison")
  cloneSaison(@Body() body: { clubId: string; fromSaisonId: string; toSaisonId: string }) {
    return this.svc.cloneSaison(body);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Equipe]), AuthModule],
  controllers: [EquipesController],
  providers: [EquipesService],
  exports: [EquipesService],
})
export class EquipesModule {}
