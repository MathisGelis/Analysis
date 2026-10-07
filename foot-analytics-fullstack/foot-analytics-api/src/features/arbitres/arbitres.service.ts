// src/features/arbitres/arbitres.service.ts
//
// CRUD arbitres + association arbitre/match avec note.
// Les cumuls (matchsOfficies, cartons donnes, profil, noteMoyenne) sont
// alimentes par /api/derivation/rebuild.

import { Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { Arbitre } from "./arbitre.entity";
import { ArbitreMatch } from "./arbitre-match.entity";
import { CreateArbitreDto, UpdateArbitreDto, CreateArbitreMatchDto, UpdateArbitreMatchDto } from "./arbitres.dto";

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
  /** Le lien arbitre/match (404 s'il n'existe pas) : sert a verifier les droits sur le match avant d'y toucher. */
  async lien(id: string) {
    const j = await this.joinRepo.findOne({ where: { id } });
    if (!j) throw new NotFoundException(`Lien arbitre-match ${id} introuvable`);
    return j;
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

  /**
   * Maintenance : supprime les liens de role "autre" issus des DELEGUES de
   * rencontre, enregistres a tort comme arbitres par les imports FMI d'avant
   * la normalisation des libelles de role ("Délégué principal" n'etait pas
   * reconnu). Les vrais roles (principal, assistant1/2, 4e) ne sont jamais
   * touches ; un arbitre qui n'a plus aucun lien apres nettoyage est supprime.
   *
   * SIMULATION par defaut (appliquer = false) : ne modifie rien, renvoie ce qui
   * serait supprime. Apres application, relancer POST /derivation/rebuild pour
   * recalculer les statistiques d'arbitres.
   */
  async nettoyerDelegues(appliquer = false) {
    const liensAutre = await this.joinRepo.find({ where: { role: "autre" } });
    const parArbitre = new Map<string, number>();
    for (const l of liensAutre) parArbitre.set(l.arbitreId, (parArbitre.get(l.arbitreId) ?? 0) + 1);

    // Un arbitre est supprime si TOUS ses liens sont de role "autre".
    const totalParArbitre = new Map<string, number>();
    for (const id of parArbitre.keys()) {
      totalParArbitre.set(id, await this.joinRepo.count({ where: { arbitreId: id } }));
    }
    const aSupprimer = [...parArbitre.keys()].filter(
      (id) => totalParArbitre.get(id) === parArbitre.get(id),
    );
    const noms = new Map(
      (await this.repo.find()).map((a) => [a.id, `${a.prenom ?? ""} ${a.nom}`.trim()]),
    );
    const rapport = {
      appliquer,
      liensAutre: liensAutre.length,
      arbitresConcernes: parArbitre.size,
      arbitresSupprimes: aSupprimer.length,
      exemples: [...parArbitre.entries()].slice(0, 10).map(([id, n]) => ({
        arbitre: noms.get(id) ?? id, liensAutre: n, supprime: aSupprimer.includes(id),
      })),
      suite: appliquer
        ? "Lance POST /api/derivation/rebuild pour recalculer les statistiques d'arbitres."
        : "Simulation : rien n'a ete modifie. Relance avec ?appliquer=true pour supprimer.",
    };
    if (!appliquer || liensAutre.length === 0) return rapport;

    await this.joinRepo.delete({ role: "autre" });
    if (aSupprimer.length > 0) await this.repo.delete(aSupprimer);
    return rapport;
  }
}
