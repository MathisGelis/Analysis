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
import { In, IsNull, Not, Repository } from "typeorm";
import { Composition, Equipe, EvenementMatch, Joueur, Match, Tactique } from "@/entities";
import { bilanMutations, MAX_HORS_DELAI, MAX_MUTES } from "@/common/mutations";
import { estMatchJoue } from "@/common/match-joue";
import { designeLeJoueur, minutesJouees } from "@/common/minutes";
import { parseDateFlexible } from "@/common/periode";
import { comparerPlanRealise, ComparaisonPlanRealise } from "@/common/plan-realise";
import { formationValide, systemesRenseignes } from "@/common/systeme";

export const NB_TITULAIRES = 11;
export const MAX_REMPLACANTS = 7;

// Re-exporte : la regle vit dans common/systeme.ts (elle sert aussi a la saisie du dispositif d'un match).
export { formationValide };

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

/** Plan compare a la feuille d'un match joue (GET /tactiques/comparaison). */
export interface PlanContreRealise {
  /**
   * ok : comparaison faite. aucun_match_prepare : aucun match joue n'a de plan (sans `matchId`).
   * match_non_joue / pas_de_plan / feuille_vide : le match est connu mais la comparaison est impossible.
   */
  etat: "ok" | "aucun_match_prepare" | "match_non_joue" | "pas_de_plan" | "feuille_vide";
  match: {
    id: string; date: string | null; journee: string | null; domicile: boolean;
    adversaireClubId: string; buts: number; butsAdversaire: number;
  } | null;
  plan: {
    formation: string; modifieLe: string;
    /** "match" : plan rattache a ce match ; "courant" : plan courant de l'equipe, a defaut. */
    source: "match" | "courant";
    /** Plan modifie apres la rencontre : il a pu etre ajuste sur le realise, a lire avec prudence. */
    modifieApresMatch: boolean;
  } | null;
  comparaison: ComparaisonPlanRealise | null;
}

const JOUR = 86_400_000;

@Injectable()
export class TactiquesService {
  constructor(
    @InjectRepository(Tactique) private repo: Repository<Tactique>,
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
    @InjectRepository(Joueur) private joueurs: Repository<Joueur>,
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(Composition) private compos: Repository<Composition>,
    @InjectRepository(EvenementMatch) private evenements: Repository<EvenementMatch>,
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

  /**
   * Plan contre realise. Avec `matchId` : ce match ; sans : le dernier match JOUE de l'equipe pour
   * lequel un plan avait ete prepare (plan rattache a ce match).
   */
  async comparer(equipeId: string, matchId?: string | null): Promise<PlanContreRealise> {
    if (!equipeId) throw new BadRequestException("equipeId requis");
    const equipe = await this.equipes.findOne({ where: { id: equipeId } });
    if (!equipe) throw new NotFoundException(`Equipe ${equipeId} introuvable`);
    const vide = (etat: PlanContreRealise["etat"], match: PlanContreRealise["match"] = null, plan: PlanContreRealise["plan"] = null): PlanContreRealise =>
      ({ etat, match, plan, comparaison: null });

    let match: Match | null;
    if (matchId) {
      match = await this.matchs.findOne({ where: { id: matchId } });
      if (!match) throw new NotFoundException(`Match ${matchId} introuvable`);
    } else {
      const plans = await this.repo.find({ where: { equipeId, matchId: Not(IsNull()) } });
      const candidats = plans.length
        ? (await this.matchs.find({ where: { id: In(plans.map((p) => p.matchId as string)) } })).filter(estMatchJoue)
        : [];
      candidats.sort((a, b) => (parseDateFlexible(b.date) ?? 0) - (parseDateFlexible(a.date) ?? 0));
      match = candidats[0] ?? null;
      if (!match) return vide("aucun_match_prepare");
    }

    const domicile = match.equipeDomId === equipeId
      || (match.equipeExtId !== equipeId && match.clubDom === equipe.clubId);
    if (!domicile && match.equipeExtId !== equipeId && match.clubExt !== equipe.clubId) {
      throw new BadRequestException("Ce match n'est pas un match de cette equipe.");
    }
    const resume: PlanContreRealise["match"] = {
      id: match.id, date: match.date ?? null, journee: match.journee ?? null, domicile,
      adversaireClubId: domicile ? match.clubExt : match.clubDom,
      buts: domicile ? match.scoreDom : match.scoreExt, butsAdversaire: domicile ? match.scoreExt : match.scoreDom,
    };
    if (!estMatchJoue(match)) return vide("match_non_joue", resume);

    // Plan rattache au match ; a defaut le plan courant, s'il date d'avant la rencontre.
    const dateMatch = parseDateFlexible(match.date);
    const apres = (p: Tactique) => dateMatch !== null && p.modifieLe.getTime() > dateMatch + 2 * JOUR;
    let plan = await this.lire(equipeId, match.id);
    let source: "match" | "courant" = "match";
    if (!plan) {
      const courant = await this.lire(equipeId, null);
      if (courant && dateMatch !== null && !apres(courant)) { plan = courant; source = "courant"; }
    }
    if (!plan) return vide("pas_de_plan", resume);
    const resumePlan: PlanContreRealise["plan"] = {
      formation: plan.formation, modifieLe: plan.modifieLe.toISOString(), source, modifieApresMatch: apres(plan),
    };

    const cote = domicile ? "dom" : "ext";
    // Les minutes ne sont pas stockees apres un import FMI : on les deduit des remplacements.
    const [compos, evts] = await Promise.all([
      this.compos.find({ where: { matchId: match.id, cote } }),
      this.evenements.find({ where: { matchId: match.id, type: "remplacement" } }),
    ]);
    const feuille = compos.map((c) => ({
      nom: c.nom, prenom: c.prenom, licence: c.licence, titulaire: c.titulaire, capitaine: c.capitaine,
      minutes: minutesJouees(c, evts),
      // Une entree a la 90e vaut zero minute : l'evenement dit qu'il est bien entre.
      entre: !c.titulaire && (c.minutes > 0 || evts.some((e) => e.equipe === cote && designeLeJoueur(e.joueur2, c))),
    }));
    const ids = [...plan.titulaires, ...plan.remplacants].filter(Boolean);
    const base = ids.length ? await this.joueurs.find({ where: { id: In(ids) } }) : [];
    const comparaison = comparerPlanRealise({
      plan, joueurs: base, feuille,
      // Dispositif reellement renseigne : jamais les "4-4-2 / 4-2-3-1" ecrits en dur par l'ancien import.
      formationReelle: systemesRenseignes(match)[domicile ? "dom" : "ext"],
    });
    return {
      etat: comparaison.etat === "feuille_vide" ? "feuille_vide" : "ok",
      match: resume, plan: resumePlan, comparaison,
    };
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
  // GET /tactiques/comparaison?equipeId=...[&matchId=...] : plan prepare contre feuille de match jouee.
  @Get("comparaison") comparer(@Query("equipeId") equipeId: string, @Query("matchId") matchId?: string) {
    return this.svc.comparer(equipeId, matchId);
  }
  @Put() enregistrer(@Body() dto: EnregistrerTactiqueDto) { return this.svc.enregistrer(dto); }
  @Delete() supprimer(@Query("equipeId") equipeId: string, @Query("matchId") matchId?: string) {
    return this.svc.supprimer(equipeId, matchId);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Tactique, Equipe, Joueur, Match, Composition, EvenementMatch])],
  controllers: [TactiquesController],
  providers: [TactiquesService],
  exports: [TactiquesService],
})
export class TactiquesModule {}
