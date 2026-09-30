// src/modules/tactiques/tactiques.module.ts
//
// Plan de jeu d'une equipe : dispositif, onze de depart, remplacants, capitaine. Un plan par
// (equipe, match) ; sans match, c'est le plan courant de l'equipe.
//
// La REGLE DES MUTES est imposee ici, pas seulement dans l'interface : au plus 6 joueurs mutes sur la
// liste (titulaires + remplacants), dont au plus 2 hors delai. Un plan qui la viole est refuse (422).

import {
  BadRequestException, Body, Controller, Delete, Get, Injectable, Module, NotFoundException,
  Put, Query, UnprocessableEntityException,
} from "@nestjs/common";
import { IsArray, IsOptional, IsString } from "class-validator";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { In, IsNull, Repository } from "typeorm";
import { Equipe, Joueur, Match, Tactique } from "@/entities";
import { bilanMutations, MAX_HORS_DELAI, MAX_MUTES } from "@/common/mutations";

export const NB_TITULAIRES = 11;
export const MAX_REMPLACANTS = 7;

/** "4-2-3-1" : 2 a 5 lignes de 1 a 6 joueurs, dix joueurs de champ au total. */
export function formationValide(formation: string): boolean {
  const n = (formation ?? "").split("-").map((x) => Number(x.trim()));
  return n.length >= 2 && n.length <= 5 && n.every((x) => Number.isInteger(x) && x >= 1 && x <= 6)
    && n.reduce((s, x) => s + x, 0) === NB_TITULAIRES - 1;
}

class EnregistrerTactiqueDto {
  @IsString() equipeId: string;
  @IsOptional() @IsString() matchId?: string | null;
  @IsString() formation: string;
  /** 11 cases dans l'ordre des postes ; null ou "" = poste vide. */
  @IsArray() titulaires: (string | null)[];
  @IsArray() remplacants: string[];
  @IsOptional() @IsString() capitaineId?: string | null;
  @IsOptional() @IsString() notes?: string | null;
}

@Injectable()
export class TactiquesService {
  constructor(
    @InjectRepository(Tactique) private repo: Repository<Tactique>,
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
    @InjectRepository(Joueur) private joueurs: Repository<Joueur>,
    @InjectRepository(Match) private matchs: Repository<Match>,
  ) {}

  private ou(equipeId: string, matchId?: string | null) {
    return { equipeId, matchId: matchId ? matchId : IsNull() };
  }

  /** Plan de l'equipe (pour ce match, ou plan courant) ; null s'il n'y en a pas. */
  async lire(equipeId: string, matchId?: string | null): Promise<Tactique | null> {
    if (!equipeId) throw new BadRequestException("equipeId requis");
    return this.repo.findOne({ where: this.ou(equipeId, matchId) });
  }

  async enregistrer(dto: EnregistrerTactiqueDto): Promise<Tactique> {
    const equipe = await this.equipes.findOne({ where: { id: dto.equipeId } });
    if (!equipe) throw new NotFoundException(`Equipe ${dto.equipeId} introuvable`);

    if (dto.matchId) {
      const match = await this.matchs.findOne({ where: { id: dto.matchId } });
      if (!match) throw new NotFoundException(`Match ${dto.matchId} introuvable`);
      if (match.equipeDomId !== dto.equipeId && match.equipeExtId !== dto.equipeId) {
        throw new BadRequestException("Ce match n'est pas un match de cette equipe.");
      }
    }
    if (!formationValide(dto.formation)) {
      throw new BadRequestException(`Dispositif invalide : "${dto.formation}" (attendu par exemple 4-2-3-1, dix joueurs de champ).`);
    }
    if (dto.titulaires.length !== NB_TITULAIRES) {
      throw new BadRequestException(`Il faut ${NB_TITULAIRES} cases de titulaires (postes vides compris).`);
    }
    if (dto.remplacants.length > MAX_REMPLACANTS) {
      throw new BadRequestException(`Au plus ${MAX_REMPLACANTS} remplacants.`);
    }

    const titulaires = dto.titulaires.map((id) => id ?? "");
    const choisis = [...titulaires.filter(Boolean), ...dto.remplacants];
    if (new Set(choisis).size !== choisis.length) {
      throw new BadRequestException("Un joueur ne peut figurer qu'une seule fois dans la composition.");
    }
    if (dto.capitaineId && !titulaires.includes(dto.capitaineId)) {
      throw new BadRequestException("Le capitaine doit etre l'un des titulaires.");
    }

    const base = choisis.length ? await this.joueurs.find({ where: { id: In(choisis) } }) : [];
    const inconnus = choisis.filter((id) => !base.some((j) => j.id === id));
    if (inconnus.length > 0) throw new BadRequestException(`Joueur(s) inconnu(s) : ${inconnus.join(", ")}`);

    // La regle des mutes porte sur TOUTE la liste : titulaires et remplacants.
    const bilan = bilanMutations(base.map((j) => j.statutMutation));
    if (!bilan.valide) {
      throw new UnprocessableEntityException({
        code: "REGLE_MUTATIONS",
        message: `Regle des mutes non respectee (maximum ${MAX_MUTES} joueurs mutes dont ${MAX_HORS_DELAI} hors delai).`,
        violations: bilan.violations,
        mutes: bilan.mutes,
        horsDelai: bilan.horsDelai,
      });
    }

    const existant = await this.lire(dto.equipeId, dto.matchId);
    const plan = existant ?? this.repo.create({ equipeId: dto.equipeId, matchId: dto.matchId || null });
    Object.assign(plan, {
      formation: dto.formation.trim(),
      titulaires,
      remplacants: dto.remplacants,
      capitaineId: dto.capitaineId || null,
      notes: dto.notes?.trim() || null,
    });
    return this.repo.save(plan);
  }

  async supprimer(equipeId: string, matchId?: string | null) {
    const plan = await this.lire(equipeId, matchId);
    if (plan) await this.repo.remove(plan);
    return { ok: true, supprime: !!plan };
  }
}

@Controller("tactiques")
class TactiquesController {
  constructor(private svc: TactiquesService) {}

  // GET /tactiques?equipeId=...&matchId=... : le plan, ou null.
  @Get() async lire(@Query("equipeId") equipeId: string, @Query("matchId") matchId?: string) {
    return (await this.svc.lire(equipeId, matchId)) ?? null;
  }
  @Put() enregistrer(@Body() dto: EnregistrerTactiqueDto) { return this.svc.enregistrer(dto); }
  @Delete() supprimer(@Query("equipeId") equipeId: string, @Query("matchId") matchId?: string) {
    return this.svc.supprimer(equipeId, matchId);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Tactique, Equipe, Joueur, Match])],
  controllers: [TactiquesController],
  providers: [TactiquesService],
  exports: [TactiquesService],
})
export class TactiquesModule {}
