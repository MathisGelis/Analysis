// src/features/coachs/coachs.service.ts
//
// CRUD coachs + association coach/match via la table staff_matchs.
// Les cumuls (matchsPresent, V/N/D, categorie, motifsTop) sont alimentes
// par /api/derivation/rebuild.

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { Saison } from "@/features/saisons/saison.entity";

import { Coach } from "./coach.entity";
import { StaffMatch } from "./staff-match.entity";
import { FicheCoach, ficheCoach } from "./fiche-coach";
import { CreateCoachDto, UpdateCoachDto, CreateStaffMatchDto } from "./coachs.dto";

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
