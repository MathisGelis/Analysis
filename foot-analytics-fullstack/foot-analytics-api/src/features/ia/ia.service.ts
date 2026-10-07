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

import { parseDateFlexible } from "@/common/dates";
import { Club } from "@/features/clubs/club.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { Match } from "@/features/matchs/match.entity";
import { estMatchJoue } from "@/features/matchs/match-joue";
import { Saison } from "@/features/saisons/saison.entity";

import { Decision, decider } from "./ia-decision";
import { construireJeuDonnees, EntreesDonnees, JeuDonnees, lundiDe } from "./ia-donnees";
import {
  DonneesInsuffisantes, entrainer, GRILLE_COMPLETE, OptionsEntrainement, Progression, ResultatEntrainement, resumeDuResultat, ResumeModele,
} from "./ia-entrainement";
import { Declencheur, IaEntrainement, OptionsLancement, StatutEntrainement } from "./ia-entrainement.entity";
import { IaModele } from "./ia-modele.entity";
import { estDu, FUSEAU, HEURE_AUTO, JOUR_AUTO, planificateurActif, prochainPassage, ReglagePlanning } from "./ia-planning";
import { IaReglage } from "./ia-reglage.entity";
import { CARACTERISTIQUES_NUMERO, CARACTERISTIQUES_SYSTEME, CARACTERISTIQUES_TITULAIRE, HYPER_PAR_DEFAUT, PoidsIa, poidsInitiaux } from "./ia-modele";

const TAILLE_LOT = 500;
const VALIDITE_CACHE_MS = 30_000;
/** Un entrainement "en cours" sans nouvelles depuis aussi longtemps a ete interrompu (arret du serveur). */
const SILENCE_ORPHELIN_MS = 3 * 60_000;
const CLE_PLANNING = "planning";

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
    @InjectRepository(IaReglage) private readonly reglages: Repository<IaReglage>,
  ) {}

  /** Un entrainement "en cours" sans tache vivante a ete interrompu par un arret du serveur. */
  async onModuleInit(): Promise<void> {
    await this.marquerOrphelins();
  }

  /**
   * Un entrainement "en cours" dont aucune tache de CE serveur ne s'occupe et dont plus personne ne donne de nouvelles
   * (preuve de vie `maj`) depuis quelques minutes a ete interrompu. Un autre serveur peut tres bien en faire tourner un :
   * on ne le marque pas tant qu'il donne signe de vie.
   */
  private async marquerOrphelins(maintenant = Date.now()): Promise<void> {
    const enCours = await this.entrainements.find({ where: { statut: "en_cours" }, select: { id: true, maj: true, creeLe: true } });
    for (const { id, maj, creeLe } of enCours) {
      if (this.jobs.has(id)) continue;
      if (maintenant - Date.parse(maj ?? creeLe) < SILENCE_ORPHELIN_MS) continue;
      await this.entrainements.update(id, { statut: "echec", message: "Interrompu : le serveur a ete arrete pendant l'entrainement.", termineLe: new Date().toISOString() });
    }
  }

  /* ----------------------------------------- lancement ----------------------------------------- */

  async lancer(
    acteurId: string | null, demande: { optimiser?: boolean; saisonIds?: string[] } = {}, declencheur: Declencheur = "manuel", horloge = Date.now(),
  ): Promise<EntrainementResume> {
    await this.marquerOrphelins(horloge);
    if ((await this.entrainements.count({ where: { statut: "en_cours" } })) > 0) {
      throw new ConflictException("Un entrainement est deja en cours : attendez qu'il se termine ou annulez-le.");
    }
    const options: OptionsLancement = { optimiser: demande.optimiser !== false, saisonIds: demande.saisonIds?.length ? demande.saisonIds : null };
    const maintenant = new Date(horloge).toISOString();
    const ligne = await this.entrainements.save(this.entrainements.create({
      statut: "en_cours", progression: 0, message: "Demarrage", options, lancePar: acteurId, modeleId: null, resultat: null, termineLe: null,
      declencheur, decision: null, maj: maintenant, creeLe: maintenant,
    }));
    // Lance en arriere-plan : la requete rend la main tout de suite, le suivi se fait en interrogeant l'entrainement.
    const tache = this.executer(ligne.id, options, declencheur).finally(() => { this.jobs.delete(ligne.id); this.annulations.delete(ligne.id); });
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

  /** Lundi (ms UTC) de la derniere semaine de matchs qu'un modele a vue ; null si on ne sait pas (tres ancien modele). */
  private async derniereSemaineDuModele(m: Pick<IaModele, "entrainementId" | "resume">): Promise<number | null> {
    if (m.resume.derniereSemaine != null) return m.resume.derniereSemaine;
    const donnees = (await this.entrainements.findOne({ where: { id: m.entrainementId } }))?.resultat?.donnees;
    if (!donnees) return null;
    if (donnees.derniereSemaine != null) return donnees.derniereSemaine;
    const t = parseDateFlexible(donnees.derniere);
    return t === null ? null : lundiDe(t);
  }

  private async executer(id: string, options: OptionsLancement, declencheur: Declencheur): Promise<void> {
    let chaine: Promise<unknown> = Promise.resolve();
    let derniereEcriture = 0;
    const progression = (p: Progression) => {
      const maintenant = Date.now();
      if (maintenant - derniereEcriture < 400 && p.pourcentage < 100) return;
      derniereEcriture = maintenant;
      chaine = chaine
        .then(() => this.entrainements.update(id, { progression: p.pourcentage, message: p.message, maj: new Date().toISOString() }))
        .catch((e) => this.log.warn(`progression : ${(e as Error).message}`));
    };
    try {
      const jeu = await this.chargerJeu(options.saisonIds);
      // Le modele actif, a mesurer face au nouveau sur les semaines qu'il n'avait pas vues.
      const actif = await this.modeles.findOne({ where: { actif: true } });
      const apres = actif ? await this.derniereSemaineDuModele(actif) : null;
      const reference: OptionsEntrainement["reference"] = actif && apres !== null ? { id: actif.id, nom: actif.nom, poids: actif.poids, apres } : undefined;
      const resultat = await entrainer(jeu, {
        grille: options.optimiser ? GRILLE_COMPLETE : [HYPER_PAR_DEFAUT],
        progression, cooperer, annule: () => this.annulations.has(id), reference,
      });
      await chaine;
      const libelles = Object.fromEntries((await this.saisons.find()).map((s) => [s.id, s.nom]));
      const complet: ResultatEntrainement = { ...resultat, saisons: libelles };
      const nombre = await this.modeles.count();
      const modele = await this.modeles.save(this.modeles.create({
        nom: `Modele n°${nombre + 1}`, entrainementId: id, poids: resultat.poids, resume: resumeDuResultat(resultat), actif: false,
        creeLe: new Date().toISOString(),
      }));
      // La regle de securite : l'entrainement automatique ne remplace le modele actif que s'il fait au moins aussi bien.
      // Un lancement manuel recoit le meme avis, mais c'est l'administrateur qui active.
      const avis = decider(!!actif, resultat.comparaison);
      const appliquee = declencheur === "auto" && avis.action === "remplace";
      if (appliquee) {
        await this.activer(modele.id);
        this.log.log(`${modele.nom} remplace ${actif!.nom} : ${avis.raison}`);
      } else if (declencheur === "auto") {
        this.log.log(`${modele.nom} garde dans l'historique (${avis.action}) : ${avis.raison}`);
      }
      const decision: Decision = { ...avis, appliquee };
      await this.entrainements.update(id, {
        statut: "termine", progression: 100, message: "Termine", resultat: complet, modeleId: modele.id, decision,
        termineLe: new Date().toISOString(), maj: new Date().toISOString(),
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
    return {
      id: true, statut: true, progression: true, message: true, options: true, lancePar: true, modeleId: true, termineLe: true,
      declencheur: true, decision: true, maj: true, creeLe: true,
    } as const;
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
      planning: await this.planning(),
      donnees: {
        matchsJoues: joues.length,
        saisons: saisons.map((s) => ({ id: s.id, nom: s.nom, matchs: parSaison.get(s.id) ?? 0 })),
      },
    };
  }

  /* ------------------------------------------ planning ------------------------------------------ */

  /** Le reglage du planning ; la premiere lecture le cree (actif, a compter de maintenant : pas de rattrapage d'une semaine passee). */
  private async lirePlanning(maintenant = Date.now()): Promise<ReglagePlanning> {
    const ligne = await this.reglages.findOne({ where: { cle: CLE_PLANNING } });
    if (ligne) return ligne.valeur;
    const valeur: ReglagePlanning = { actif: true, depuis: new Date(maintenant).toISOString() };
    await this.reglages.save(this.reglages.create({ cle: CLE_PLANNING, valeur }));
    return valeur;
  }

  /** Le reentrainement automatique : actif ou non, prochain passage, dernier entrainement automatique et son verdict. */
  async planning(maintenant = Date.now()) {
    const reglage = await this.lirePlanning(maintenant);
    const dernier = await this.entrainements.findOne({ where: { declencheur: "auto" }, select: this.colonnesLegeres(), order: { creeLe: "DESC" } });
    return {
      actif: reglage.actif, depuis: reglage.depuis,
      /** Le planificateur tourne-t-il sur ce serveur ? (production, ou IA_PLANIFICATEUR=on) */
      operationnel: planificateurActif(),
      /** Chaque semaine, a cette heure (heure de Paris) : le jour, 0 = dimanche. */
      jour: JOUR_AUTO, heure: HEURE_AUTO, fuseau: FUSEAU,
      prochain: reglage.actif ? new Date(prochainPassage(maintenant)).toISOString() : null,
      dernier: dernier ? await this.resume(dernier.id) : null,
    };
  }

  /** Active ou suspend le reentrainement automatique. Reactive, il ne rattrape pas la semaine en cours : le premier est le mercredi suivant. */
  async definirPlanning(actif: boolean, maintenant = Date.now()) {
    const actuel = await this.lirePlanning(maintenant);
    if (actuel.actif !== actif) {
      await this.reglages.save(this.reglages.create({ cle: CLE_PLANNING, valeur: { actif, depuis: actif ? new Date(maintenant).toISOString() : actuel.depuis } }));
    }
    return this.planning(maintenant);
  }

  /**
   * Appelee regulierement par le planificateur : lance l'entrainement automatique de la semaine s'il est du (voir
   * ia-planning.ts). Renvoie l'entrainement lance, ou null s'il n'y avait rien a faire.
   */
  async verifierPlanning(maintenant = Date.now()): Promise<EntrainementResume | null> {
    // Un entrainement automatique interrompu (serveur arrete) ne doit pas compter pour la semaine : on le marque d'abord.
    await this.marquerOrphelins(maintenant);
    const reglage = await this.lirePlanning(maintenant);
    const autos = await this.entrainements.find({ where: { declencheur: "auto" }, select: { creeLe: true, statut: true, message: true }, order: { creeLe: "DESC" }, take: 5 });
    if (!estDu(maintenant, reglage, autos)) return null;
    try {
      this.log.log("Reentrainement automatique de la semaine");
      return await this.lancer(null, { optimiser: true }, "auto", maintenant);
    } catch (e) {
      if (e instanceof ConflictException) return null;      // un entrainement tourne deja : on reverra au prochain passage
      throw e;
    }
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
