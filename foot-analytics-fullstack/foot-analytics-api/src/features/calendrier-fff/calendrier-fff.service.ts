// src/features/calendrier-fff/calendrier-fff.service.ts
//
// Synchronisation du calendrier FFF d'une equipe (fichier .ics, voir ics.ts) avec les matchs de l'application :
//   - un match du calendrier qui n'existe pas encore est cree "prevu" (comme depuis la page Calendrier) ; la feuille de match
//     importee plus tard le complete (rapprochement existant : features/matchs/programme.ts) ;
//   - un match connu dont la ligue a change la date, l'heure ou le lieu est mis a jour (et signale dans le rapport) ;
//   - un match programme qui a disparu du calendrier est SIGNALE (reporte ? annule ?), jamais supprime tout seul ;
//   - les matchs deja passes ne sont pas crees : sans score, ils fausseraient classement et statistiques (la feuille de match
//     les creera) ; un match qui a deja sa feuille ou son score n'est jamais modifie.
// Source : l'adresse enregistree sur l'equipe (telechargement quotidien) ou un fichier depose a la main : meme traitement.

import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";

import { parseDateFlexible } from "@/common/dates";
import { ActeurAudit, JournalAuditService } from "@/features/audit/journal-audit.service";
import { Club } from "@/features/clubs/club.entity";
import { cleNomClub, sansSuffixeEquipe } from "@/features/clubs/nom-club";
import { Equipe } from "@/features/equipes/equipe.entity";
import { Match } from "@/features/matchs/match.entity";
import { choisirProgramme, STATUTS_PROGRAMMES } from "@/features/matchs/programme";
import { Saison } from "@/features/saisons/saison.entity";

import { CalendrierInjoignable, normaliserAdresseCalendrier, telechargerCalendrier } from "./adresse-calendrier";
import { analyserCalendrier, MatchCalendrier, nomLisible } from "./ics";

export interface LigneRapport { journee: string | null; date: string; heure: string | null; adversaire: string }
export interface Modification extends LigneRapport { avant: string; apres: string }

export interface RapportSynchro {
  equipeId: string;
  source: "adresse" | "fichier";
  /** Matchs lus dans le calendrier. */
  total: number;
  crees: LigneRapport[];
  modifies: Modification[];
  /** Matchs programmes qui ne sont plus dans le calendrier (a verifier), nouvellement signales. */
  disparus: LigneRapport[];
  /** Matchs signales disparus qui reviennent dans le calendrier. */
  reapparus: number;
  inchanges: number;
  /** Matchs deja passes, non crees : leur feuille de match les creera. */
  passes: number;
  /** Matchs qui ont deja leur feuille ou leur score : jamais touches. */
  dejaJoues: number;
  avertissements: string[];
}

const JOUR = 86_400_000;

/** Aujourd'hui a Paris, AAAA-MM-JJ. */
function aujourdhuiParis(maintenant: Date): string {
  const p = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(maintenant);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

const jourFr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
const quand = (date: string, heure: string | null) => `${jourFr(date)}${heure ? ` ${heure}` : ""}`;
const estProgramme = (m: Pick<Match, "statut">) => (STATUTS_PROGRAMMES as readonly string[]).includes(m.statut ?? "");
const aSaFeuille = (m: Pick<Match, "numeroFmi" | "statut" | "scoreDom" | "scoreExt">) =>
  !!m.numeroFmi || m.statut === "joue" || !!m.scoreDom || !!m.scoreExt;

@Injectable()
export class CalendrierFffService {
  private readonly log = new Logger(CalendrierFffService.name);

  constructor(
    @InjectRepository(Equipe) private equipes: Repository<Equipe>,
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(Club) private clubs: Repository<Club>,
    @InjectRepository(Saison) private saisons: Repository<Saison>,
    private journal: JournalAuditService,
  ) {}

  /** Enregistre (ou efface, avec null) l'adresse du calendrier d'une equipe. 400 si ce n'est pas un calendrier d'equipe de la FFF. */
  async definirAdresse(equipe: Equipe, entree: string | null): Promise<Equipe> {
    if (entree === null || entree.trim() === "") {
      equipe.calendrierUrl = null;
      return this.equipes.save(equipe);
    }
    const adresse = normaliserAdresseCalendrier(entree);
    if (!adresse) {
      throw new BadRequestException(
        "Adresse invalide : colle l'adresse du calendrier de l'equipe (media.fff.fr/calendars/AAAA/eq/....ics), " +
        "celle que myFFF propose pour ajouter les matchs au calendrier.",
      );
    }
    equipe.calendrierUrl = adresse;
    return this.equipes.save(equipe);
  }

  /** Telecharge le calendrier a l'adresse de l'equipe et le synchronise. */
  async synchroniserAdresse(equipe: Equipe, acteur?: ActeurAudit | null, maintenant = new Date()): Promise<RapportSynchro> {
    if (!equipe.calendrierUrl) throw new BadRequestException("Cette equipe n'a pas d'adresse de calendrier FFF.");
    let texte: string;
    try {
      texte = await telechargerCalendrier(equipe.calendrierUrl);
    } catch (e) {
      if (e instanceof CalendrierInjoignable) throw new BadRequestException(e.message);
      throw e;
    }
    return this.synchroniser(equipe, texte, "adresse", acteur, maintenant);
  }

  /** Synchronise le contenu d'un fichier .ics (telecharge ou depose a la main). */
  async synchroniser(
    equipe: Equipe, texte: string, source: RapportSynchro["source"], acteur?: ActeurAudit | null, maintenant = new Date(),
  ): Promise<RapportSynchro> {
    const analyse = analyserCalendrier(texte);
    if (analyse.matchs.length === 0) {
      throw new BadRequestException(
        "Aucun match lisible dans ce fichier : est-ce bien le calendrier d'une equipe de la FFF (fichier .ics de myFFF) ?" +
        (analyse.ignores.length ? ` Evenements ignores : ${analyse.ignores.slice(0, 3).join(" ; ")}.` : ""),
      );
    }
    const rapport: RapportSynchro = {
      equipeId: equipe.id, source, total: analyse.matchs.length, crees: [], modifies: [], disparus: [], reapparus: 0,
      inchanges: 0, passes: 0, dejaJoues: 0, avertissements: [],
    };

    // Le calendrier doit etre celui de la saison de l'equipe, et ressembler a celui deja synchronise.
    const saison = equipe.saisonId ? await this.saisons.findOne({ where: { id: equipe.saisonId } }) : null;
    if (analyse.saisonDebut !== null && saison && saison.anneeDebut !== analyse.saisonDebut) {
      throw new BadRequestException(
        `Ce calendrier est celui de la saison ${analyse.saisonDebut}/${analyse.saisonDebut + 1} : l'equipe ${equipe.nom} ` +
        `est dans la saison ${saison.nom}. Choisis la bonne equipe, ou la bonne saison, avant de l'importer.`,
      );
    }
    const club = await this.clubs.findOne({ where: { id: equipe.clubId } });
    const nomDuClub = (analyse.nom ?? "").split(/\s+-\s+/)[0];
    if (club && nomDuClub) {
      const mots = (s: string) => cleNomClub(s).split(" ").filter((m) => m.length >= 3);
      const siens = new Set(mots(club.nom));
      if (mots(nomDuClub).length && !mots(nomDuClub).some((m) => siens.has(m))) {
        rapport.avertissements.push(`Ce calendrier est celui de « ${nomDuClub} », l'equipe appartient au club « ${club.nom} » : verifie que c'est la bonne.`);
      }
    }
    if (analyse.ignores.length) rapport.avertissements.push(`${analyse.ignores.length} evenement(s) du fichier ignores (titre illisible).`);

    const deLEquipe = (await this.matchs.find({ where: [{ equipeDomId: equipe.id }, { equipeExtId: equipe.id }] }))
      .filter((m) => !equipe.saisonId || m.saisonId === equipe.saisonId);
    const idsDuFichier = new Set(analyse.matchs.map((m) => m.idFff));
    const connus = deLEquipe.filter((m) => m.idFff && estProgramme(m));
    if (connus.length >= 3 && !connus.some((m) => idsDuFichier.has(m.idFff!))) {
      throw new BadRequestException(
        "Ce calendrier n'a aucun match en commun avec celui deja synchronise pour cette equipe : ce n'est probablement pas " +
        "la meme equipe. Pour changer de calendrier, supprime d'abord l'adresse, ou verifie l'equipe choisie.",
      );
    }

    const cleClubs = new Map<string, string>();
    for (const c of await this.clubs.find()) cleClubs.set(cleNomClub(c.nom), c.id);
    const derniere = equipe.calendrierSynchroLe;
    const aujourdhui = aujourdhuiParis(maintenant);

    for (const ev of analyse.matchs) {
      const adversaireId = await this.resoudreClub(ev, cleClubs);
      const clubDom = ev.domicile ? equipe.clubId : adversaireId;
      const clubExt = ev.domicile ? adversaireId : equipe.clubId;
      const ligne: LigneRapport = { journee: ev.journee, date: ev.date, heure: ev.heure, adversaire: ev.adversaireComplet ?? ev.adversaire };

      // 1) Le match deja relie (identifiant FFF, ou numero de feuille identique) ; 2) un match programme a la main, meme sens,
      // a quelques jours pres ; 3) un match deja joue le meme jour (feuille importee avant le calendrier).
      // Jamais le match d'une AUTRE equipe du club (U20 contre le meme adversaire, la semaine d'apres) : de notre cote, le match
      // doit etre rattache a cette equipe, ou a aucune.
      const monCote = (m: Match) => (ev.domicile ? m.equipeDomId : m.equipeExtId);
      const entreCes2Clubs = (await this.matchs.find({ where: { clubDom, clubExt } }))
        .filter((m) => !equipe.saisonId || !m.saisonId || m.saisonId === equipe.saisonId)
        .filter((m) => !monCote(m) || monCote(m) === equipe.id);
      let existant: Match | null = deLEquipe.find((m) => m.idFff === ev.idFff || m.numeroFmi === ev.idFff)
        ?? entreCes2Clubs.find((m) => m.idFff === ev.idFff || m.numeroFmi === ev.idFff) ?? null;
      let adopte = false;
      if (!existant) {
        const manuel = choisirProgramme(entreCes2Clubs.filter((m) => !m.idFff), ev.date, 14);
        if (manuel) { existant = manuel; adopte = true; }
      }
      if (!existant) {
        const cible = parseDateFlexible(ev.date);
        const memeJour = entreCes2Clubs.find((m) => {
          const d = parseDateFlexible(m.date);
          return aSaFeuille(m) && !m.idFff && d !== null && cible !== null && Math.abs(d - cible) <= JOUR;
        });
        if (memeJour) { existant = memeJour; adopte = true; }
      }

      if (existant) {
        if (existant.calendrierDisparu) { existant.calendrierDisparu = false; rapport.reapparus++; }
        if (aSaFeuille(existant)) {
          rapport.dejaJoues++;
          if (existant.idFff !== ev.idFff) existant.idFff = ev.idFff;
          await this.matchs.save(existant);
          continue;
        }
        const changements = this.changements(existant, ev, adopte, derniere);
        existant.idFff = ev.idFff;
        if (changements.length) {
          this.appliquer(existant, ev);
          rapport.modifies.push({ ...ligne, avant: changements.map((c) => c.avant).join(" ; "), apres: changements.map((c) => c.apres).join(" ; ") });
        } else rapport.inchanges++;
        await this.matchs.save(existant);
        continue;
      }

      if (ev.date < aujourdhui) { rapport.passes++; continue; }
      await this.matchs.save(this.matchs.create({
        idFff: ev.idFff, journee: ev.journee ?? undefined, date: ev.date, heure: ev.heure ?? undefined,
        terrain: ev.lieu ?? undefined, competition: equipe.competitionLibelle ?? ev.competition ?? undefined,
        poule: equipe.poule ?? undefined, clubDom, clubExt,
        equipeDomId: ev.domicile ? equipe.id : undefined, equipeExtId: ev.domicile ? undefined : equipe.id,
        saisonId: equipe.saisonId ?? undefined, scoreDom: 0, scoreExt: 0, statut: "prevu", calendrierDisparu: false,
      }));
      rapport.crees.push(ligne);
    }

    // Les matchs programmes relies au calendrier qui n'y sont plus : signales une fois, jamais supprimes.
    for (const m of connus) {
      if (idsDuFichier.has(m.idFff!) || m.calendrierDisparu) continue;
      m.calendrierDisparu = true;
      await this.matchs.save(m);
      const adv = m.clubDom === equipe.clubId ? m.clubExt : m.clubDom;
      const nomAdv = (await this.clubs.findOne({ where: { id: adv } }))?.nom ?? "adversaire inconnu";
      rapport.disparus.push({ journee: m.journee ?? null, date: this.isoDe(m.date), heure: m.heure ?? null, adversaire: nomAdv });
    }

    equipe.calendrierSynchroLe = maintenant.toISOString();
    await this.equipes.save(equipe);
    await this.journal.noter("calendrier.synchronisation", {
      acteur, cible: `equipe:${equipe.id}`, cibleClubId: equipe.clubId,
      details: {
        source, total: rapport.total, crees: rapport.crees.length, modifies: rapport.modifies.length,
        disparus: rapport.disparus.length, passes: rapport.passes,
      },
    }, maintenant);
    this.log.log(`Calendrier FFF : ${rapport.crees.length} cree(s), ${rapport.modifies.length} modifie(s), ${rapport.disparus.length} disparu(s) (${source})`);
    return rapport;
  }

  /** La date d'un match en AAAA-MM-JJ, quel que soit son format. */
  private isoDe(date: string | null | undefined): string {
    const ms = parseDateFlexible(date);
    return ms === null ? "" : new Date(ms).toISOString().slice(0, 10);
  }

  /**
   * Ce que le calendrier change sur un match programme. Un match deja relie n'est mis a jour que si la ligue l'a modifie depuis
   * la derniere synchronisation (une retouche faite a la main dans l'application tient jusque-la) ; un match programme a la
   * main, adopte, prend les valeurs de la FFF.
   */
  private changements(m: Match, ev: MatchCalendrier, adopte: boolean, derniereSynchro: string | null): { avant: string; apres: string }[] {
    if (!adopte && derniereSynchro && ev.modifieLe && ev.modifieLe <= derniereSynchro) return [];
    const res: { avant: string; apres: string }[] = [];
    const jourAvant = parseDateFlexible(m.date);
    const dateChange = jourAvant === null || jourAvant !== parseDateFlexible(ev.date);
    const heureChange = !!ev.heure && (m.heure ?? "") !== ev.heure;
    if (dateChange || heureChange) res.push({ avant: quand(this.isoDe(m.date) || ev.date, m.heure ?? null), apres: quand(ev.date, ev.heure ?? m.heure ?? null) });
    if (ev.lieu && (m.terrain ?? "") !== ev.lieu) res.push({ avant: m.terrain ?? "lieu non renseigne", apres: ev.lieu });
    if (ev.journee && (m.journee ?? "") !== ev.journee) res.push({ avant: `journee ${m.journee ?? "?"}`, apres: `journee ${ev.journee}` });
    return res;
  }

  private appliquer(m: Match, ev: MatchCalendrier) {
    m.date = ev.date;
    if (ev.heure) m.heure = ev.heure;
    if (ev.lieu) m.terrain = ev.lieu;
    if (ev.journee) m.journee = ev.journee;
  }

  /**
   * Le club adverse : par son nom complet (celui des fiches, comme l'import des feuilles de match), puis par le nom abrege du
   * titre ; sinon il est cree, sous son nom complet quand on l'a.
   */
  private async resoudreClub(ev: MatchCalendrier, cles: Map<string, string>): Promise<string> {
    for (const nom of [ev.adversaireComplet, ev.adversaire]) {
      const id = nom ? cles.get(cleNomClub(nom)) : undefined;
      if (id) return id;
    }
    const nom = ev.adversaireComplet ?? nomLisible(sansSuffixeEquipe(ev.adversaire).toLowerCase().split(/[^a-z0-9À-ſ]+/i).filter(Boolean));
    const cree = await this.clubs.save(this.clubs.create({ nom, abbr: nom.slice(0, 3).toUpperCase() }));
    cles.set(cleNomClub(cree.nom), cree.id);
    return cree.id;
  }
}
