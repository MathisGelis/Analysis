// src/features/classement/classement.service.ts

import { Injectable, Logger, NotFoundException, OnApplicationBootstrap, Optional } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { trierChronologiquement } from "@/common/dates";
import { Club } from "@/features/clubs/club.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { attendusDuModele, MatchPasse, poidsScoreInitiaux } from "@/features/ia/ia-score";
import { IaService } from "@/features/ia/ia.service";
import { Match } from "@/features/matchs/match.entity";
import { estMatchJoue } from "@/features/matchs/match-joue";

import { calculerClassement } from "./calcul-classement";
import { ClassementPredit, MatchJoue, predireClassement } from "./classement-predit";
import { LigneClassement } from "./ligne-classement.entity";

/** Le club ; suivi du nom de l'equipe seulement si le club en aligne plusieurs dans ce championnat. */
export function nomAffiche(e: Pick<Equipe, "id" | "clubId" | "nom">, nomClub: string | undefined, championnat: readonly Pick<Equipe, "id" | "clubId">[]): string {
  const club = nomClub ?? e.nom;
  return championnat.filter((x) => x.clubId === e.clubId).length > 1 ? `${club} (${e.nom})` : club;
}

/** Ce que la reponse ajoute a la simulation : la saison (controle d'acces) et l'origine des buts attendus. */
export interface ReponsePredit { saisonId: string | null; source: "ia" | "poisson"; modele: string | null }

@Injectable()
export class ClassementService implements OnApplicationBootstrap {
  private readonly log = new Logger(ClassementService.name);

  constructor(
    @InjectRepository(LigneClassement) private repo: Repository<LigneClassement>,
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
    @InjectRepository(Club) private clubs: Repository<Club>,
    // Le modele de l'IA actif (absent : le modele de score de depart, lisse, sans apprentissage).
    @Optional() private readonly ia?: IaService,
  ) {}
  private readonly cachePredit = new Map<string, ClassementPredit & ReponsePredit>();
  /** Au demarrage : une regle de calcul corrigee s'applique tout de suite, sans attendre un import ni un rebuild manuel. */
  async onApplicationBootstrap() {
    try {
      const n = await this.recalculer();
      this.log.log(`Classement recalcule au demarrage : ${n} ligne(s).`);
    } catch (e) {
      this.log.warn(`Classement non recalcule au demarrage : ${(e as Error).message}`);
    }
  }

  /**
   * Le classement final predit du championnat d'une equipe (meme saison, competition et poule) : les matchs joues sont acquis,
   * le reste de la double confrontation est simule avec les buts attendus du modele de score (voir classement-predit.ts).
   */
  async predit(equipeId: string): Promise<(ClassementPredit & ReponsePredit) | null> {
    const equipe = await this.equipes.findOne({ where: { id: equipeId } });
    if (!equipe) throw new NotFoundException(`Equipe ${equipeId} introuvable`);
    const memeChampionnat = (e: Equipe) => (e.saisonId ?? null) === (equipe.saisonId ?? null)
      && (e.competitionLibelle ?? null) === (equipe.competitionLibelle ?? null) && (e.poule ?? null) === (equipe.poule ?? null);
    const championnat = (await this.equipes.find({ where: equipe.saisonId ? { saisonId: equipe.saisonId } : {} })).filter(memeChampionnat);
    const ids = new Set(championnat.map((e) => e.id));
    const joues = (await this.matchs.find({ where: equipe.saisonId ? { saisonId: equipe.saisonId } : {} }))
      .filter((m) => estMatchJoue(m) && !/\bcoupe\b/i.test(m.competition ?? "")
        && !!m.equipeDomId && !!m.equipeExtId && ids.has(m.equipeDomId) && ids.has(m.equipeExtId));

    const modele = this.ia ? await this.ia.modeleActif() : null;
    const cle = `${equipeId}|${joues.length}|${modele?.id ?? "-"}|${modele?.poids.scoreRetenu ? 1 : 0}`;
    const connu = this.cachePredit.get(cle);
    if (connu) return connu;

    // Les matchs passes de chaque equipe, le plus recent d'abord : ce que lit le modele de score.
    const passes = new Map<string, MatchPasse[]>();
    for (const e of championnat) {
      const siens = joues.filter((m) => m.equipeDomId === e.id || m.equipeExtId === e.id);
      passes.set(e.id, trierChronologiquement(siens.map((m) => ({ m, date: m.date ?? null, journee: m.journee ?? null }))).map((x) => x.m).reverse().map((m) => {
        const dom = m.equipeDomId === e.id;
        return { buts: dom ? m.scoreDom : m.scoreExt, butsContre: dom ? m.scoreExt : m.scoreDom, domicile: dom };
      }));
    }
    const buts = joues.flatMap((m) => [m.scoreDom, m.scoreExt]);
    const moyenne = buts.length ? buts.reduce((s, b) => s + b, 0) / buts.length : 1.3;
    const score = modele?.poids.scoreRetenu && modele.poids.score ? modele.poids.score : null;
    const poids = score ?? { ...poidsScoreInitiaux(), moyenneLigue: moyenne };
    // Une equipe qui a trop peu joue pour que le modele la lise : la moyenne du championnat, avec l'avantage du terrain.
    const attendus = (dom: string, ext: string) => {
      const a = attendusDuModele(poids, passes.get(dom) ?? [], passes.get(ext) ?? [], true);
      return a ? { dom: a.moi, ext: a.adv } : { dom: moyenne * 1.12, ext: moyenne * 0.88 };
    };
    const matchsJoues: MatchJoue[] = joues.map((m) => ({ dom: m.equipeDomId!, ext: m.equipeExtId!, butsDom: m.scoreDom, butsExt: m.scoreExt }));
    // Le nom affiche est celui du club (comme au classement) : le nom d'une equipe est sa division et sa poule ("Seniors D2 Poule C").
    const clubs = new Map((await this.clubs.find({ where: { id: In([...new Set(championnat.map((e) => e.clubId))]) } })).map((c) => [c.id, c.nom]));
    const res = predireClassement(championnat.map((e) => ({ id: e.id, clubId: e.clubId, nom: nomAffiche(e, clubs.get(e.clubId), championnat) })), matchsJoues, attendus);
    if (!res) return null;
    const reponse = { ...res, saisonId: equipe.saisonId ?? null, source: score ? "ia" as const : "poisson" as const, modele: score ? modele!.nom : null };
    if (this.cachePredit.size > 50) this.cachePredit.clear();
    this.cachePredit.set(cle, reponse);
    return reponse;
  }

  findAll() {
    return this.repo.find({ order: { rang: "ASC" } });
  }

  /**
   * Recalcule tout le classement : a appeler apres toute ecriture d'un match (score saisi, match cree, modifie ou supprime),
   * sans quoi la table reste celle du dernier import.
   */
  async recalculer() {
    const [matchs, equipes] = await Promise.all([this.matchs.find(), this.equipes.find()]);
    const rows = calculerClassement(matchs, equipes);
    await this.repo.clear();
    if (rows.length) await this.repo.save(rows as any);
    return rows.length;
  }
}
