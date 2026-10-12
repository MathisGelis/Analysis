// src/features/matchs/matchs.service.ts

import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { IsNull, Repository } from "typeorm";

import { Composition } from "./composition.entity";
import { EvenementMatch } from "./evenement-match.entity";
import { Match } from "./match.entity";
import { choisirProgramme, programmeIdentique, STATUTS_PROGRAMMES } from "./programme";
import { estFormationInventee, formationValide, normaliserFormation } from "./systeme";
import { UpsertMatchDto, UpdateMatchDto } from "./matchs.dto";

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

/** Les "4-4-2 / 4-2-3-1" ecrits en dur par l'ancien import ne sont pas des dispositifs : rendus vides (voir features/matchs/systeme.ts). */
function sansFormationInventee<T extends { formationDom?: string | null; formationExt?: string | null }>(m: T): T {
  if (estFormationInventee(m)) { m.formationDom = null; m.formationExt = null; }
  return m;
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
    // Un match programme identique (memes clubs, meme sens, meme jour) existe deja.
    if (!dto.numeroFmi && dto.date) {
      const existants = await this.repo.find({ where: { clubDom: dto.clubDom, clubExt: dto.clubExt } });
      const identique = programmeIdentique(existants, dto);
      if (identique) {
        if (identique.equipeDomId || identique.equipeExtId) {
          throw new ConflictException("Ce match est deja programme a cette date : modifie-le depuis le calendrier plutot que d'en creer un second.");
        }
        // Reliquat d'une ancienne creation (equipes et saison perdues, donc invisible au calendrier) : on le complete.
        return this.update(identique.id, dto);
      }
    }
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
