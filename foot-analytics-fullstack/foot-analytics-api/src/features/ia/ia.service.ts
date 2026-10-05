// src/features/ia/ia.service.ts
//
// L'IA cote serveur : lance un entrainement en arriere-plan sur toutes les feuilles de match de la base, suit sa
// progression, range le resultat et le modele obtenu, et sert le modele ACTIF a la prediction des compos.
//
// Un seul entrainement a la fois. Il tourne dans le processus du serveur, par etapes (une semaine de matchs a la fois),
// en rendant la main entre deux : les requetes continuent d'etre servies. Une interruption (redemarrage du serveur) est
// detectee au demarrage et marquee comme un echec, jamais laissee "en cours".

import { ConflictException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";

import { Club } from "@/features/clubs/club.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { Match } from "@/features/matchs/match.entity";
import { estMatchJoue } from "@/features/matchs/match-joue";
import { Saison } from "@/features/saisons/saison.entity";

import { construireJeuDonnees, EntreesDonnees, JeuDonnees } from "./ia-donnees";
import { DonneesInsuffisantes, entrainer, GRILLE_COMPLETE, Progression, ResultatEntrainement, resumeDuResultat, ResumeModele } from "./ia-entrainement";
import { IaEntrainement, OptionsLancement, StatutEntrainement } from "./ia-entrainement.entity";
import { IaModele } from "./ia-modele.entity";
import { CARACTERISTIQUES_NUMERO, CARACTERISTIQUES_SYSTEME, CARACTERISTIQUES_TITULAIRE, HYPER_PAR_DEFAUT, PoidsIa, poidsInitiaux } from "./ia-modele";

const TAILLE_LOT = 500;
const VALIDITE_CACHE_MS = 30_000;

/** Rend la main a la boucle d'evenements : les autres requetes passent entre deux etapes de l'entrainement. */
const cooperer = () => new Promise<void>((fin) => setImmediate(fin));

export interface ModeleActif { id: string; nom: string; poids: PoidsIa }

export type EntrainementResume = Omit<IaEntrainement, "resultat"> & {
  modele: { id: string; nom: string; actif: boolean; resume: ResumeModele } | null;
};

@Injectable()
export class IaService implements OnModuleInit {
  private readonly log = new Logger("IA");
  private readonly jobs = new Map<string, Promise<void>>();
  private readonly annulations = new Set<string>();
  private cache: { jusqua: number; modele: ModeleActif | null } | null = null;

  constructor(
    @InjectRepository(Match) private readonly matchs: Repository<Match>,
    @InjectRepository(Equipe) private readonly equipes: Repository<Equipe>,
    @InjectRepository(Club) private readonly clubs: Repository<Club>,
    @InjectRepository(Composition) private readonly compos: Repository<Composition>,
    @InjectRepository(Saison) private readonly saisons: Repository<Saison>,
    @InjectRepository(IaEntrainement) private readonly entrainements: Repository<IaEntrainement>,
    @InjectRepository(IaModele) private readonly modeles: Repository<IaModele>,
  ) {}

  /** Un entrainement "en cours" sans tache vivante a ete interrompu par un arret du serveur. */
  async onModuleInit(): Promise<void> {
    await this.marquerOrphelins();
  }

  private async marquerOrphelins(): Promise<void> {
    const orphelins = (await this.entrainements.find({ where: { statut: "en_cours" }, select: { id: true } })).filter((e) => !this.jobs.has(e.id));
    for (const { id } of orphelins) {
      await this.entrainements.update(id, { statut: "echec", message: "Interrompu : le serveur a ete arrete pendant l'entrainement.", termineLe: new Date().toISOString() });
    }
  }

  /* ----------------------------------------- lancement ----------------------------------------- */

  async lancer(acteurId: string | null, demande: { optimiser?: boolean; saisonIds?: string[] } = {}): Promise<EntrainementResume> {
    await this.marquerOrphelins();
    if ((await this.entrainements.count({ where: { statut: "en_cours" } })) > 0) {
      throw new ConflictException("Un entrainement est deja en cours : attendez qu'il se termine ou annulez-le.");
    }
    const options: OptionsLancement = { optimiser: demande.optimiser !== false, saisonIds: demande.saisonIds?.length ? demande.saisonIds : null };
    const ligne = await this.entrainements.save(this.entrainements.create({
      statut: "en_cours", progression: 0, message: "Demarrage", options, lancePar: acteurId, modeleId: null, resultat: null, termineLe: null,
      creeLe: new Date().toISOString(),
    }));
    // Lance en arriere-plan : la requete rend la main tout de suite, le suivi se fait en interrogeant l'entrainement.
    const tache = this.executer(ligne.id, options).finally(() => { this.jobs.delete(ligne.id); this.annulations.delete(ligne.id); });
    this.jobs.set(ligne.id, tache);
    return this.vers(ligne, null);
  }

  /** Attend la fin d'un entrainement lance (les tests ; le front interroge l'etat). */
  async attendre(id: string): Promise<void> {
    await this.jobs.get(id);
  }

  async annuler(id: string): Promise<EntrainementResume> {
    const ligne = await this.entrainements.findOne({ where: { id }, select: this.colonnesLegeres() });
    if (!ligne) throw new NotFoundException(`Entrainement ${id} introuvable`);
    if (ligne.statut === "en_cours" && this.jobs.has(id)) {
      this.annulations.add(id);
      await this.jobs.get(id);
    }
    return this.resume(id);
  }

  private async executer(id: string, options: OptionsLancement): Promise<void> {
    let chaine: Promise<unknown> = Promise.resolve();
    let derniereEcriture = 0;
    const progression = (p: Progression) => {
      const maintenant = Date.now();
      if (maintenant - derniereEcriture < 400 && p.pourcentage < 100) return;
      derniereEcriture = maintenant;
      chaine = chaine.then(() => this.entrainements.update(id, { progression: p.pourcentage, message: p.message })).catch((e) => this.log.warn(`progression : ${(e as Error).message}`));
    };
    try {
      const jeu = await this.chargerJeu(options.saisonIds);
      const resultat = await entrainer(jeu, {
        grille: options.optimiser ? GRILLE_COMPLETE : [HYPER_PAR_DEFAUT],
        progression, cooperer, annule: () => this.annulations.has(id),
      });
      await chaine;
      const libelles = Object.fromEntries((await this.saisons.find()).map((s) => [s.id, s.nom]));
      const complet: ResultatEntrainement = { ...resultat, saisons: libelles };
      const nombre = await this.modeles.count();
      const modele = await this.modeles.save(this.modeles.create({
        nom: `Modele n°${nombre + 1}`, entrainementId: id, poids: resultat.poids, resume: resumeDuResultat(resultat), actif: false,
        creeLe: new Date().toISOString(),
      }));
      await this.entrainements.update(id, {
        statut: "termine", progression: 100, message: "Termine", resultat: complet, modeleId: modele.id, termineLe: new Date().toISOString(),
      });
    } catch (e) {
      await chaine;
      const err = e as Error;
      const annule = this.annulations.has(id);
      const attendu = annule || e instanceof DonneesInsuffisantes;
      if (!attendu) this.log.error(`entrainement ${id} : ${err.stack ?? err.message}`);
      await this.entrainements.update(id, {
        statut: (annule ? "annule" : "echec") satisfies StatutEntrainement,
        message: annule ? "Annule par l'administrateur." : attendu ? err.message : `Erreur inattendue : ${err.message}`,
        termineLe: new Date().toISOString(),
      });
    }
  }

  /** Lit toute la base utile a l'entrainement : matchs joues, equipes, clubs, feuilles (par lots, en rendant la main). */
  async chargerJeu(saisonIds: string[] | null): Promise<JeuDonnees> {
    const matchs = await this.matchs.find({
      select: {
        id: true, date: true, journee: true, saisonId: true, competition: true, clubDom: true, clubExt: true,
        equipeDomId: true, equipeExtId: true, formationDom: true, formationExt: true, statut: true,
      },
    });
    const joues = matchs.filter(estMatchJoue);
    const [equipes, clubs] = await Promise.all([
      this.equipes.find({ select: { id: true, clubId: true, categorie: true, division: true, nom: true, saisonId: true } }),
      this.clubs.find({ select: { id: true, nom: true } }),
    ]);
    const compos: EntreesDonnees["compos"] = [];
    for (let i = 0; i < joues.length; i += TAILLE_LOT) {
      const lot = joues.slice(i, i + TAILLE_LOT).map((m) => m.id);
      const lignes = await this.compos.find({
        where: { matchId: In(lot) },
        select: { matchId: true, cote: true, nom: true, prenom: true, licence: true, numero: true, titulaire: true, minutes: true },
      });
      compos.push(...lignes);
      await cooperer();
    }
    return construireJeuDonnees({ matchs: joues, equipes, clubs, compos, saisonIds: saisonIds ?? undefined });
  }

  /* ------------------------------------------- lecture ------------------------------------------- */

  private colonnesLegeres() {
    return { id: true, statut: true, progression: true, message: true, options: true, lancePar: true, modeleId: true, termineLe: true, creeLe: true } as const;
  }

  private vers(e: Omit<IaEntrainement, "resultat">, modele: IaModele | null): EntrainementResume {
    return { ...e, modele: modele ? { id: modele.id, nom: modele.nom, actif: modele.actif, resume: modele.resume } : null };
  }

  /** Un entrainement sans son resultat detaille (liste, suivi de progression). */
  async resume(id: string): Promise<EntrainementResume> {
    const e = await this.entrainements.findOne({ where: { id }, select: this.colonnesLegeres() });
    if (!e) throw new NotFoundException(`Entrainement ${id} introuvable`);
    const modele = e.modeleId ? await this.modeles.findOne({ where: { id: e.modeleId }, select: { id: true, nom: true, actif: true, resume: true } }) : null;
    return this.vers(e, modele);
  }

  async liste(): Promise<EntrainementResume[]> {
    const lignes = await this.entrainements.find({ select: this.colonnesLegeres(), order: { creeLe: "DESC" }, take: 50 });
    const modeles = await this.modeles.find({ select: { id: true, nom: true, actif: true, resume: true } });
    const parId = new Map(modeles.map((m) => [m.id, m]));
    return lignes.map((e) => this.vers(e, e.modeleId ? parId.get(e.modeleId) ?? null : null));
  }

  /** Un entrainement avec son resultat complet (courbe, erreurs, calibration...) et le vocabulaire de ses poids. */
  async detail(id: string) {
    const e = await this.entrainements.findOne({ where: { id } });
    if (!e) throw new NotFoundException(`Entrainement ${id} introuvable`);
    const modele = e.modeleId ? await this.modeles.findOne({ where: { id: e.modeleId }, select: { id: true, nom: true, actif: true, resume: true } }) : null;
    return {
      ...this.vers(e, modele), resultat: e.resultat,
      /** Les poids de depart (l'heuristique a regles), pour montrer ce que l'entrainement a change. */
      poidsInitiaux: poidsInitiaux(e.resultat?.hyper ?? HYPER_PAR_DEFAUT),
      catalogue: { titularisation: CARACTERISTIQUES_TITULAIRE, numeros: CARACTERISTIQUES_NUMERO, systeme: CARACTERISTIQUES_SYSTEME },
    };
  }

  async listeModeles(): Promise<Omit<IaModele, "poids">[]> {
    return this.modeles.find({ select: { id: true, nom: true, entrainementId: true, resume: true, actif: true, creeLe: true }, order: { creeLe: "DESC" } });
  }

  /** Vue d'ensemble pour l'ecran admin : modele actif, entrainement en cours, dernier entrainement, donnees disponibles. */
  async etat() {
    await this.marquerOrphelins();
    const [enCours, dernier, actif, matchs, saisons] = await Promise.all([
      this.entrainements.findOne({ where: { statut: "en_cours" }, select: this.colonnesLegeres() }),
      this.entrainements.findOne({ where: { statut: In<StatutEntrainement>(["termine", "echec", "annule"]) }, select: this.colonnesLegeres(), order: { creeLe: "DESC" } }),
      this.modeles.findOne({ where: { actif: true }, select: { id: true, nom: true, entrainementId: true, resume: true, actif: true, creeLe: true } }),
      this.matchs.find({ select: { id: true, saisonId: true, statut: true, date: true } }),
      this.saisons.find({ order: { anneeDebut: "DESC" } }),
    ]);
    const joues = matchs.filter(estMatchJoue);
    const parSaison = new Map<string, number>();
    for (const m of joues) if (m.saisonId) parSaison.set(m.saisonId, (parSaison.get(m.saisonId) ?? 0) + 1);
    return {
      actif,
      enCours: enCours ? await this.resume(enCours.id) : null,
      dernier: dernier ? await this.resume(dernier.id) : null,
      donnees: {
        matchsJoues: joues.length,
        saisons: saisons.map((s) => ({ id: s.id, nom: s.nom, matchs: parSaison.get(s.id) ?? 0 })),
      },
    };
  }

  /* ------------------------------------------ modele actif ------------------------------------------ */

  async activer(id: string): Promise<void> {
    const modele = await this.modeles.findOne({ where: { id }, select: { id: true } });
    if (!modele) throw new NotFoundException(`Modele ${id} introuvable`);
    await this.modeles.manager.transaction(async (tx) => {
      await tx.update(IaModele, { actif: true }, { actif: false });
      await tx.update(IaModele, { id }, { actif: true });
    });
    this.cache = null;
  }

  async desactiver(): Promise<void> {
    await this.modeles.update({ actif: true }, { actif: false });
    this.cache = null;
  }

  async supprimerModele(id: string): Promise<void> {
    const modele = await this.modeles.findOne({ where: { id }, select: { id: true, actif: true } });
    if (!modele) throw new NotFoundException(`Modele ${id} introuvable`);
    if (modele.actif) throw new ConflictException("Ce modele est actif : desactivez-le avant de le supprimer.");
    await this.modeles.delete(id);
    await this.entrainements.update({ modeleId: id }, { modeleId: null });
  }

  /** Le modele actif (poids compris), mis en cache quelques secondes : la prediction d'un rapport ne relit pas la base a chaque fois. */
  async modeleActif(): Promise<ModeleActif | null> {
    if (this.cache && this.cache.jusqua > Date.now()) return this.cache.modele;
    const m = await this.modeles.findOne({ where: { actif: true } });
    const modele = m ? { id: m.id, nom: m.nom, poids: m.poids } : null;
    this.cache = { jusqua: Date.now() + VALIDITE_CACHE_MS, modele };
    return modele;
  }
}
