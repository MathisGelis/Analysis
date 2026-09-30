// src/modules/joueurs/joueurs.module.ts
import {
  Body, Controller, Delete, Get, Injectable, Logger, NotFoundException, Param,
  Patch, Post, Put, Query, Module,
} from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Composition, Equipe, EvenementMatch, Joueur, Match, Saison, StatJoueurEquipe,
} from "@/entities";
import { CreateJoueurDto, StatEquipeDto, UpdateJoueurDto } from "./joueur.dto";
import { equipeDuCote, isEquipeSurCote } from "@/common/matching-cote";
import { scoreRecherche } from "@/common/fuzzy";
import { minutesJouees } from "@/common/minutes";
import { cumuler, statsDuMatch, STATS_MATCH_VIDES, StatsMatch } from "@/common/stats-match";
import { noteIndicative } from "@/common/indicateurs";
import { parseDateFlexible } from "@/common/periode";

/** Score minimal (0-1) pour qu'un joueur apparaisse dans la recherche. */
const SEUIL_RECHERCHE = 0.6;

@Injectable()
export class JoueursService {
  private readonly log = new Logger(JoueursService.name);

  constructor(
    @InjectRepository(Joueur) private repo: Repository<Joueur>,
    @InjectRepository(Composition) private compos: Repository<Composition>,
    @InjectRepository(Match) private matchsRepo: Repository<Match>,
    @InjectRepository(EvenementMatch) private evtsRepo: Repository<EvenementMatch>,
    @InjectRepository(Equipe) private equipesRepo: Repository<Equipe>,
    @InjectRepository(Saison) private saisonsRepo: Repository<Saison>,
    @InjectRepository(StatJoueurEquipe) private statsEquipeRepo: Repository<StatJoueurEquipe>,
  ) {}

  findAll(clubId?: string, poste?: string) {
    const where: any = {};
    if (clubId) where.clubId = clubId;
    if (poste) where.poste = poste;
    return this.repo.find({ where, order: { matchs: "DESC" } });
  }

  /**
   * Effectif d'une equipe specifique (ex. Seniors D2 saison 2025-2026).
   *
   * Selectionne les joueurs ayant **au moins une composition** dans les
   * matchs de cette equipe. Les stats `matchs`, `buts`, `cartonsJaunes`...
   * affichees sont calculees UNIQUEMENT sur les matchs de cette equipe
   * (donc Marcon avec 1 match en U20 et 3 en Seniors apparait dans les
   * deux effectifs avec respectivement 1 et 3 matchs).
   *
   * Le `scoreFatigue` reste celui calcule globalement (toutes equipes
   * confondues) car la fatigue se mesure sur la charge physique recente
   * du joueur (entrainements + matchs), peu importe la categorie.
   */
  async effectif(equipeId: string): Promise<any[]> {
    const equipe = await this.equipesRepo.findOne({ where: { id: equipeId } });
    if (!equipe) throw new NotFoundException(`Equipe ${equipeId} introuvable`);

    // Determine si l'equipe appartient a la saison active.
    // - Si OUI : on affiche la fatigue globale du joueur (elle evolue en
    //   temps reel des qu'il joue ou s'entraine ailleurs).
    // - Si NON (saison passee ou future) : on n'affiche PAS la fatigue,
    //   car elle est par definition une mesure du moment present.
    const saisonActive = await this.saisonsRepo.findOne({ where: { actif: true } });
    const equipeDansSaisonActive = !!saisonActive
      && equipe.saisonId === saisonActive.id;

    // Matchs ou cette equipe est impliquee (cote dom ou ext).
    const matchs = await this.matchsRepo.find({
      where: [{ equipeDomId: equipeId }, { equipeExtId: equipeId }],
    });
    const matchIds = matchs.map((m) => m.id);
    const matchById = new Map(matchs.map((m) => [m.id, m]));

    // Compos relatives a cette equipe : il faut filtrer par cote dom/ext
    // selon le club de l'equipe pour chaque match. Si pas de match,
    // on saute cette partie (les joueurs attaches manuellement seront
    // ajoutes plus bas).
    const compos = matchIds.length > 0
      ? await this.compos
          .createQueryBuilder("c")
          .where("c.match_id IN (:...ids)", { ids: matchIds })
          .getMany()
      : [];
    const composPourEquipe = compos.filter((c) => {
      const m = matchById.get(c.matchId);
      return !!m && isEquipeSurCote(m, equipe, c.cote);
    });

    // Tous les joueurs en base du club (referentiel pour recuperer
    // poste, fatigue, statut...).
    const joueursClub = await this.repo.find({ where: { clubId: equipe.clubId } });
    const joueursParNomCle = new Map<string, Joueur>();
    const cleNom = (nom: string, prenom?: string | null) =>
      `${(nom ?? "").toLowerCase().trim()}|${(prenom ?? "").toLowerCase().trim()}`;
    for (const j of joueursClub) {
      joueursParNomCle.set(cleNom(j.nom, j.prenom), j);
    }

    // Evenements des matchs : minutes (remplacements), buts, passes, cartons.
    const evtsAll = matchIds.length > 0
      ? await this.evtsRepo
          .createQueryBuilder("e")
          .where("e.match_id IN (:...ids)", { ids: matchIds })
          .getMany()
      : [];
    const evtsByMatch = new Map<string, EvenementMatch[]>();
    for (const e of evtsAll) {
      const arr = evtsByMatch.get(e.matchId) ?? [];
      arr.push(e);
      evtsByMatch.set(e.matchId, arr);
    }
    // Agrege par joueur : matchs joues (titu OU remplacant), buts, passes,
    // cartons DANS LE CADRE de cette equipe (donc de sa saison).
    type Acc = {
      joueur: Joueur | null;
      nom: string; prenom?: string; licence?: string;
      matchs: number; titularisations: number; minutes: number;
      stats: StatsMatch;
      numeros: Record<number, number>;
    };
    const acc = new Map<string, Acc>();
    for (const c of composPourEquipe) {
      const key = cleNom(c.nom, c.prenom);
      let a = acc.get(key);
      if (!a) {
        a = {
          joueur: joueursParNomCle.get(key) ?? null,
          nom: c.nom, prenom: c.prenom ?? undefined,
          licence: c.licence ?? undefined,
          matchs: 0, titularisations: 0, minutes: 0,
          stats: { ...STATS_MATCH_VIDES }, numeros: {},
        };
        acc.set(key, a);
      }
      const evtsDuMatch = evtsByMatch.get(c.matchId) ?? [];
      // Un carton recu depuis le banc compte, meme sans entrer en jeu.
      a.stats = cumuler(a.stats, statsDuMatch(c, evtsDuMatch));
      // Matchs / minutes : titulaires ET remplacants effectivement entres en
      // jeu. Les remplacants restes sur le banc n'ont pas joue.
      const minutesCeMatch = minutesJouees(c, evtsDuMatch);
      if (!c.titulaire && minutesCeMatch === 0) continue;
      a.matchs++;
      if (c.titulaire) a.titularisations++;
      a.minutes += minutesCeMatch;
      if (typeof c.numero === "number" && c.numero > 0) {
        a.numeros[c.numero] = (a.numeros[c.numero] ?? 0) + 1;
      }
    }

    // Buts / passes saisis a la main pour CETTE equipe : ils priment sur le
    // calcul depuis les feuilles (qui n'ont pas toujours les buteurs).
    const saisies = await this.saisiesEquipe(equipeId);

    // Resultat : on prend le joueur global si dispo, sinon on bricole.
    const rows = [...acc.values()].map((a) => {
      const saisie = a.joueur ? saisies.get(a.joueur.id) : undefined;
      // Numeros portes DANS CETTE equipe : le numero favori et les "postes
      // joues" d'un joueur n'ont pas le meme sens en Seniors et en U20.
      const numeros = Object.entries(a.numeros).sort((x, y) => y[1] - x[1]);
      return {
        id: a.joueur?.id ?? null,
        nom: a.nom, prenom: a.prenom, licence: a.licence,
        poste: a.joueur?.poste ?? null,
        numeroFavori: numeros.length ? +numeros[0][0] : (a.joueur?.numeroFavori ?? null),
        statut: a.joueur?.statutMutation ?? null,
        statutMutation: a.joueur?.statutMutation ?? null,
        scoreFatigue: equipeDansSaisonActive ? (a.joueur?.scoreFatigue ?? null) : null,
        fatigueDetail: equipeDansSaisonActive ? (a.joueur?.fatigueDetail ?? null) : null,
        acwr: equipeDansSaisonActive ? (a.joueur?.acwr ?? null) : null,
        chargeAcute7j: equipeDansSaisonActive ? (a.joueur?.chargeAcute7j ?? null) : null,
        chargeChronic28j: equipeDansSaisonActive ? (a.joueur?.chargeChronic28j ?? null) : null,
        // Stats specifiques a CETTE equipe :
        matchs: a.matchs,
        titularisations: a.titularisations,
        minutes: a.minutes,
        buts: saisie?.buts ?? a.stats.buts,
        passesDecisives: saisie?.passesDecisives ?? a.stats.passesDecisives,
        cartonsJaunes: a.stats.cartonsJaunes,
        cartonsRouges: a.stats.cartonsRouges,
        noteMoyenne: a.matchs > 0 ? noteIndicative(a.matchs, a.stats.cartonsRouges) : null,
        postes: numeros.length ? numeros.map(([n, k]) => `${n} (${k})`).join(" / ") : null,
        typeDiscipline: a.joueur?.typeDiscipline ?? null,
        tailleCm: a.joueur?.tailleCm ?? null,
        poidsKg: a.joueur?.poidsKg ?? null,
        piedFort: a.joueur?.piedFort ?? null,
        blessuresAnt: a.joueur?.blessuresAnt ?? null,
        clubId: equipe.clubId,
        equipeId, equipeNom: equipe.nom,
      };
    }).sort((a, b) => b.matchs - a.matchs);

    // -- Joueurs attaches manuellement (en plus de ceux ayant joue) --
    // Permet de constituer l'effectif d'une saison future quand aucun
    // match n'a encore ete joue (cas du switch saison 2026-2027).
    // Ces joueurs ont des stats a 0 (rien joue), mais sont visibles
    // dans la liste.
    const rowJoueurIds = new Set(rows.map((r) => r.id).filter(Boolean));
    const attaches = await this.repo
      .createQueryBuilder("j")
      .where("j.equipesAttachees LIKE :pat", { pat: `%${equipeId}%` })
      .getMany();
    const rowsAttaches = attaches
      .filter((j) => !rowJoueurIds.has(j.id))
      // Verifie strictement que l'id est dans la liste (LIKE peut matcher
      // une sous-chaine, ex. id1=abc1 et id2=abc12).
      .filter((j) => (j.equipesAttachees ?? []).includes(equipeId))
      .map((j) => ({
        id: j.id, nom: j.nom, prenom: j.prenom,
        licence: j.licence, dateNaissance: j.dateNaissance,
        poste: j.poste, postes: j.poste ? `${j.poste} (0)` : null,
        numeroFavori: j.numeroFavori, statutMutation: j.statutMutation,
        scoreFatigue: equipeDansSaisonActive ? j.scoreFatigue : null,
        fatigueDetail: equipeDansSaisonActive ? j.fatigueDetail : null,
        acwr: equipeDansSaisonActive ? j.acwr : null,
        chargeAcute7j: equipeDansSaisonActive ? j.chargeAcute7j : null,
        chargeChronic28j: equipeDansSaisonActive ? j.chargeChronic28j : null,
        noteMoyenne: null,
        matchs: 0, titularisations: 0, minutes: 0,
        buts: saisies.get(j.id)?.buts ?? 0, passesDecisives: saisies.get(j.id)?.passesDecisives ?? 0,
        cartonsJaunes: 0, cartonsRouges: 0,
        typeDiscipline: j.typeDiscipline ?? null,
        tailleCm: j.tailleCm, poidsKg: j.poidsKg, piedFort: j.piedFort,
        blessuresAnt: j.blessuresAnt ?? null,
        clubId: j.clubId ?? equipe!.clubId,
        equipeId, equipeNom: equipe!.nom,
      }));
    this.log.debug(`[effectif] equipe=${equipe.nom} (${equipeId}) : ${rows.length} via matchs + ${rowsAttaches.length} attaches manuels = ${rows.length + rowsAttaches.length} total`);
    return [...rows, ...rowsAttaches];
  }

  /**
   * Retourne les joueurs ayant joue au moins 1 match du championnat
   * (= meme saison + meme competitionLibelle + meme poule que
   * l'equipe donnee), avec leurs stats agrégées sur ces matchs UNIQUEMENT.
   *
   * Sert au sous-onglet "Stats joueurs" du classement : seuls les
   * joueurs effectivement engages dans la poule apparaissent, et leurs
   * stats refletent leur saison dans CETTE competition (pas un total
   * toutes equipes / toutes saisons confondu).
   */
  async championnat(equipeId: string): Promise<any[]> {
    const equipe = await this.equipesRepo.findOne({ where: { id: equipeId } });
    if (!equipe) throw new NotFoundException(`Equipe ${equipeId} introuvable`);

    // Equipes du meme championnat (saison + competition + poule).
    const equipesChamp = await this.equipesRepo.find({
      where: {
        saisonId: equipe.saisonId,
        competitionLibelle: equipe.competitionLibelle,
        poule: equipe.poule,
      },
    });
    if (equipesChamp.length === 0) return [];
    const equipeIds = new Set(equipesChamp.map((e) => e.id));
    const equipeById = new Map(equipesChamp.map((e) => [e.id, e]));

    // Matchs ou au moins une de ces equipes joue.
    const matchs = await this.matchsRepo.find({
      where: [
        ...[...equipeIds].map((id) => ({ equipeDomId: id })),
        ...[...equipeIds].map((id) => ({ equipeExtId: id })),
      ],
    });
    if (matchs.length === 0) return [];
    const matchById = new Map(matchs.map((m) => [m.id, m]));
    const matchIds = matchs.map((m) => m.id);

    // Compositions de ces matchs.
    const compos = matchIds.length === 0 ? [] : await this.compos
      .createQueryBuilder("c")
      .where("c.match_id IN (:...ids)", { ids: matchIds })
      .getMany();
    const evts = matchIds.length === 0 ? [] : await this.evtsRepo
      .createQueryBuilder("e")
      .where("e.match_id IN (:...ids)", { ids: matchIds })
      .getMany();
    const evtsByMatch = new Map<string, EvenementMatch[]>();
    for (const e of evts) {
      const arr = evtsByMatch.get(e.matchId) ?? [];
      arr.push(e);
      evtsByMatch.set(e.matchId, arr);
    }
    // Agreg par joueur (cle = licence si dispo, sinon nom+prenom).
    type Acc = {
      licence: string | null; nom: string; prenom: string | null;
      clubId: string; equipeId: string;
      matchs: number; titularisations: number; minutes: number;
      stats: StatsMatch;
    };
    const accByKey = new Map<string, Acc>();
    const keyOf = (lic: string | null, nom: string, prenom: string | null) =>
      lic ? `lic:${lic}` : `name:${nom}|${prenom ?? ""}`;

    for (const c of compos) {
      const m = matchById.get(c.matchId);
      if (!m) continue;
      const { clubId, equipeId: equipeIdComp } = equipeDuCote(m, c.cote);
      // Filtre defensif : ignore les compositions cote oppose si l'equipe
      // n'appartient pas au championnat (ex: match coupe contre une
      // equipe d'une autre poule).
      if (!equipeIdComp || !equipeIds.has(equipeIdComp)) continue;
      const evtsDuMatch = evtsByMatch.get(m.id) ?? [];
      const minutes = minutesJouees(c, evtsDuMatch);
      const k = keyOf(c.licence, c.nom, c.prenom);
      let a = accByKey.get(k);
      if (!a) {
        a = {
          licence: c.licence, nom: c.nom, prenom: c.prenom, clubId, equipeId: equipeIdComp,
          matchs: 0, titularisations: 0, minutes: 0, stats: { ...STATS_MATCH_VIDES },
        };
        accByKey.set(k, a);
      }
      a.stats = cumuler(a.stats, statsDuMatch(c, evtsDuMatch));
      // Skip remplacant non entre en jeu (coherent avec effectif()).
      if (!c.titulaire && minutes === 0) continue;
      a.matchs++;
      a.minutes += minutes;
      if (c.titulaire) a.titularisations++;
    }

    // Reconciliation avec les Joueur en base pour recuperer poste, numero,
    // etc. Match par licence en priorite, sinon par nom. Le perimetre est le
    // club des joueurs du championnat, pas toute la base.
    const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().trim();
    const clubIds = [...new Set([...accByKey.values()].map((a) => a.clubId))];
    const joueursTous = clubIds.length === 0 ? [] : await this.repo
      .createQueryBuilder("j")
      .where("j.clubId IN (:...ids)", { ids: clubIds })
      .getMany();
    const byLicence = new Map(joueursTous.filter((j) => j.licence).map((j) => [j.licence, j]));
    const findJoueurEnBase = (a: Acc): Joueur | null => {
      if (a.licence && byLicence.has(a.licence)) return byLicence.get(a.licence)!;
      const ln = norm(a.nom);
      const pn = norm(a.prenom);
      return joueursTous.find((j) =>
        j.clubId === a.clubId && norm(j.nom) === ln && (pn === "" || norm(j.prenom).startsWith(pn[0]))
      ) ?? null;
    };

    // Saisies manuelles (buts / passes) de chaque equipe du championnat.
    const saisiesParEquipe = new Map<string, Map<string, { buts: number | null; passesDecisives: number | null }>>();
    for (const eid of equipeIds) saisiesParEquipe.set(eid, await this.saisiesEquipe(eid));

    return [...accByKey.values()]
      .filter((a) => a.matchs > 0)
      .map((a) => {
        const j = findJoueurEnBase(a);
        const saisie = j ? saisiesParEquipe.get(a.equipeId)?.get(j.id) : undefined;
        const buts = saisie?.buts ?? a.stats.buts;
        return {
          id: j?.id ?? null,
          licence: a.licence, nom: a.nom, prenom: a.prenom,
          clubId: a.clubId, equipeId: a.equipeId,
          matchs: a.matchs, titularisations: a.titularisations,
          minutes: a.minutes,
          buts, butsMarques: buts,
          passesDecisives: saisie?.passesDecisives ?? a.stats.passesDecisives,
          cartonsJaunes: a.stats.cartonsJaunes, cartonsRouges: a.stats.cartonsRouges,
          // Profil persistant (poste, numero) ; pas de compteur global.
          poste: j?.poste ?? null,
          numeroFavori: j?.numeroFavori ?? null,
          scoreFatigue: null,
          fatigueDetail: null,
          noteMoyenne: noteIndicative(a.matchs, a.stats.cartonsRouges),
        };
      })
      .sort((a, b) => b.matchs - a.matchs);
  }

  /**
   * Buts / passes saisis a la main pour une equipe, par joueur. Seule une
   * valeur non nulle prime sur le calcul depuis les feuilles.
   */
  private async saisiesEquipe(equipeId: string) {
    const rows = await this.statsEquipeRepo.find({ where: { equipeId } });
    return new Map(rows.map((r) => [r.joueurId, { buts: r.buts, passesDecisives: r.passesDecisives }]));
  }

  /**
   * Enregistre les buts / passes d'un joueur dans une equipe (donc une saison).
   * `undefined` laisse la valeur en l'etat, `null` l'efface (retour au calcul
   * depuis les feuilles). Une ligne devenue vide est supprimee.
   */
  async definirStatEquipe(joueurId: string, equipeId: string, dto: StatEquipeDto) {
    await this.findOne(joueurId);
    const eq = await this.equipesRepo.findOne({ where: { id: equipeId } });
    if (!eq) throw new NotFoundException(`Equipe ${equipeId} introuvable`);
    const ligne = await this.statsEquipeRepo.findOne({ where: { joueurId, equipeId } })
      ?? this.statsEquipeRepo.create({ joueurId, equipeId, buts: null, passesDecisives: null });
    if (dto.buts !== undefined) ligne.buts = dto.buts;
    if (dto.passesDecisives !== undefined) ligne.passesDecisives = dto.passesDecisives;
    if (ligne.buts == null && ligne.passesDecisives == null) {
      if (ligne.id) await this.statsEquipeRepo.remove(ligne);
      return { joueurId, equipeId, buts: null, passesDecisives: null };
    }
    const saved = await this.statsEquipeRepo.save(ligne);
    return { joueurId, equipeId, buts: saved.buts, passesDecisives: saved.passesDecisives };
  }

  /**
   * Recherche floue par nom/prenom (accents, casse, ordre, fautes de frappe)
   * ou par debut de licence. Classement par pertinence puis par nom. Utilisee
   * par JoueurAddModal (mode "joueur existant").
   *
   * Le scoring se fait en memoire : quelques milliers de joueurs au plus, et
   * un pre-filtre SQL LIKE ferait justement disparaitre les fautes de frappe.
   */
  async search(q: string, limit = 20): Promise<Joueur[]> {
    const needle = (q ?? "").trim();
    if (needle.length < 2) return [];
    const parLicence = /^\d{3,}$/.test(needle);

    const tous = await this.repo.find();
    return tous
      .map((j) => ({
        j,
        score: parLicence
          ? ((j.licence ?? "").startsWith(needle) ? 1 : 0)
          : scoreRecherche(needle, [`${j.nom} ${j.prenom ?? ""}`, `${j.prenom ?? ""} ${j.nom}`]),
      }))
      .filter((x) => x.score >= SEUIL_RECHERCHE)
      .sort((a, b) => b.score - a.score || (a.j.nom ?? "").localeCompare(b.j.nom ?? ""))
      .slice(0, limit)
      .map((x) => x.j);
  }

  /** Attache un joueur existant a une equipe. */
  async attachEquipe(joueurId: string, equipeId: string): Promise<Joueur> {
    const j = await this.repo.findOne({ where: { id: joueurId } });
    if (!j) throw new NotFoundException(`Joueur ${joueurId} introuvable`);
    const eq = await this.equipesRepo.findOne({ where: { id: equipeId } });
    if (!eq) throw new NotFoundException(`Equipe ${equipeId} introuvable`);
    const list = new Set(j.equipesAttachees ?? []);
    list.add(equipeId);
    j.equipesAttachees = [...list];
    const saved = await this.repo.save(j);
    this.log.debug(`[attach] joueur=${j.prenom} ${j.nom} (${joueurId}) -> equipe=${eq.nom} (${equipeId}) | equipesAttachees=[${saved.equipesAttachees.join(",")}]`);
    return saved;
  }

  /** Detache un joueur d'une equipe. Le joueur reste en BDD. */
  async detachEquipe(joueurId: string, equipeId: string): Promise<Joueur> {
    const j = await this.repo.findOne({ where: { id: joueurId } });
    if (!j) throw new NotFoundException(`Joueur ${joueurId} introuvable`);
    j.equipesAttachees = (j.equipesAttachees ?? []).filter((id) => id !== equipeId);
    return await this.repo.save(j);
  }

  /**
   * Cree un nouveau joueur ET l'attache directement a l'equipe donnee.
   * Tous les champs sauf le nom sont optionnels. Pas de stats (matchs,
   * buts, etc.) -> elles se constitueront automatiquement quand des
   * FMI seront importees.
   */
  async createDansEquipe(equipeId: string, data: Partial<Joueur>): Promise<Joueur> {
    const eq = await this.equipesRepo.findOne({ where: { id: equipeId } });
    if (!eq) throw new NotFoundException(`Equipe ${equipeId} introuvable`);
    if (!data.nom || !data.nom.trim()) {
      throw new NotFoundException(`Le nom du joueur est requis`);
    }
    // On normalise : `null` -> `undefined`. Le front envoie des `null`
    // pour les champs vides (apres JSON.stringify), mais TypeORM/TS
    // attendent `undefined` pour les colonnes nullables. Sinon, l'overload
    // de `repo.create(...)` ne trouve pas le bon prototype et bascule
    // sur celui qui attend un Joueur[].
    const cleaned: any = {};
    for (const [k, v] of Object.entries(data)) {
      cleaned[k] = v === null ? undefined : v;
    }
    const payload: Partial<Joueur> = {
      ...cleaned,
      nom: data.nom.trim(),
      prenom: data.prenom?.trim() || undefined,
      clubId: data.clubId ?? eq.clubId,
      equipesAttachees: [equipeId],
      // Stats a zero, calculees ensuite par derivation au prochain match.
      matchs: 0, titularisations: 0, minutes: 0,
      buts: 0, passesDecisives: 0,
      cartonsJaunes: 0, cartonsRouges: 0,
      blessuresAnt: 0,
    };
    const j = this.repo.create(payload);
    return await this.repo.save(j);
  }

  async findOne(id: string) {
    const j = await this.repo.findOne({ where: { id } });
    if (!j) throw new NotFoundException(`Joueur ${id} introuvable`);
    return j;
  }

  /**
   * Frequence d'utilisation des numeros de maillot par un joueur, sur
   * l'ensemble de ses matchs (toutes equipes / saisons confondues).
   * Le matching se fait par licence si dispo, sinon par nom+prenom du
   * joueur en base. Retourne `{ "6": 3, "8": 5, "10": 1 }` par exemple.
   */
  async numerosFreq(joueurId: string): Promise<Record<number, number>> {
    const j = await this.findOne(joueurId);
    // Filtrage SQL : on selectionne UNIQUEMENT les compositions de ce
    // joueur, soit par licence (clef forte), soit par nom+prenom. Au
    // lieu de charger toutes les compositions de la base (potentiellement
    // des milliers) puis filtrer en memoire.
    const qb = this.compos.createQueryBuilder("c")
      .select(["c.numero"]);
    if (j.licence) {
      qb.where("c.licence = :lic", { lic: j.licence });
    } else if (j.prenom) {
      qb.where("LOWER(TRIM(c.nom)) = LOWER(TRIM(:nom)) AND LOWER(TRIM(c.prenom)) = LOWER(TRIM(:prenom))",
        { nom: j.nom, prenom: j.prenom });
    } else {
      qb.where("LOWER(TRIM(c.nom)) = LOWER(TRIM(:nom))", { nom: j.nom });
    }
    const compos = await qb.getMany();
    const freq: Record<number, number> = {};
    for (const c of compos) {
      if (typeof c.numero !== "number" || c.numero <= 0) continue;
      freq[c.numero] = (freq[c.numero] ?? 0) + 1;
    }
    return freq;
  }

  /** Helper de matching joueur <-> composition : licence prioritaire,
   *  fallback nom+prenom (insensible casse/espaces). */
  private composMatchesJoueur(c: Composition, j: Joueur): boolean {
    if (j.licence && c.licence) return c.licence === j.licence;
    const sameNom = (c.nom ?? "").toLowerCase().trim() === (j.nom ?? "").toLowerCase().trim();
    const samePrenom = !j.prenom
      ? true
      : (c.prenom ?? "").toLowerCase().trim() === (j.prenom ?? "").toLowerCase().trim();
    return sameNom && samePrenom;
  }

  /** Compositions d'un joueur : licence si connue, sinon nom + prenom. */
  private composDuJoueur(j: Joueur): Promise<Composition[]> {
    const qb = this.compos.createQueryBuilder("c");
    if (j.licence) {
      qb.where("c.licence = :lic", { lic: j.licence });
    } else if (j.prenom) {
      qb.where("LOWER(TRIM(c.nom)) = LOWER(TRIM(:nom)) AND LOWER(TRIM(c.prenom)) = LOWER(TRIM(:prenom))",
        { nom: j.nom, prenom: j.prenom });
    } else {
      qb.where("LOWER(TRIM(c.nom)) = LOWER(TRIM(:nom))", { nom: j.nom });
    }
    return qb.getMany();
  }

  /**
   * Derniers matchs joues par le joueur, du plus recent au plus ancien,
   * restreints a une saison quand `saisonId` est donne. Chaque ligne porte
   * l'adversaire, le score de SON point de vue et sa feuille personnelle
   * (titulaire, minutes, buts, passes, cartons) : la fiche joueur n'a plus a
   * charger chaque match un par un.
   */
  async matchsJoues(joueurId: string, saisonId?: string, limite = 8) {
    const j = await this.findOne(joueurId);
    const composJoueur = await this.composDuJoueur(j);
    if (composJoueur.length === 0) return [];
    const matchIds = [...new Set(composJoueur.map((c) => c.matchId))];
    const matchs = (await this.matchsRepo.createQueryBuilder("m").whereInIds(matchIds).getMany())
      .filter((m) => !saisonId || m.saisonId === saisonId);
    if (matchs.length === 0) return [];
    const matchById = new Map(matchs.map((m) => [m.id, m]));
    const evts = await this.evtsRepo
      .createQueryBuilder("e")
      .where("e.match_id IN (:...ids)", { ids: matchs.map((m) => m.id) })
      .getMany();
    const evtsByMatch = new Map<string, EvenementMatch[]>();
    for (const e of evts) {
      const arr = evtsByMatch.get(e.matchId) ?? [];
      arr.push(e);
      evtsByMatch.set(e.matchId, arr);
    }

    const lignes: any[] = [];
    for (const c of composJoueur) {
      const m = matchById.get(c.matchId);
      if (!m) continue;
      const evtsDuMatch = evtsByMatch.get(m.id) ?? [];
      const minutes = minutesJouees(c, evtsDuMatch);
      if (!c.titulaire && minutes === 0) continue; // reste sur le banc
      const dom = c.cote === "dom";
      lignes.push({
        matchId: m.id, date: m.date ?? null, journee: m.journee ?? null,
        clubId: dom ? m.clubDom : m.clubExt,
        adversaireId: dom ? m.clubExt : m.clubDom,
        domicile: dom,
        scoreEquipe: dom ? m.scoreDom : m.scoreExt,
        scoreAdversaire: dom ? m.scoreExt : m.scoreDom,
        titulaire: c.titulaire, minutes, numero: c.numero ?? null,
        ...statsDuMatch(c, evtsDuMatch),
      });
    }
    return lignes
      // Dates au format "jj/mm/aaaa" (FMI) ou ISO : on compare des timestamps, pas des chaines.
      .sort((a, b) => (parseDateFlexible(b.date) ?? 0) - (parseDateFlexible(a.date) ?? 0))
      .slice(0, limite);
  }

  /**
   * Historique club/equipe du joueur, groupe par saison. Pour chaque
   * saison ou il a au moins un match, on remonte :
   *  - le nom de la saison ("2024-2025")
   *  - la liste des equipes ou il a evolue (peut etre plusieurs si
   *    monte/descend entre categories au cours de la saison)
   *  - le nombre de matchs joues dans chacune
   *
   * Utile pour afficher un "parcours" du joueur saison par saison.
   */
  async historique(joueurId: string): Promise<any[]> {
    const j = await this.findOne(joueurId);

    // 1) Filtre SQL : recupere UNIQUEMENT les compos de ce joueur.
    const composJoueur = await this.composDuJoueur(j);
    // Un joueur jamais aligne mais attache a un effectif (recrue d'une saison
    // en preparation) a quand meme un parcours : ses lignes a 0 (etape 6a).
    const attachedEqIds: string[] = j.equipesAttachees ?? [];
    if (composJoueur.length === 0 && attachedEqIds.length === 0) return [];

    // 2) Recupere UNIQUEMENT les matchs concernes en 1 seule query.
    const matchIds = [...new Set(composJoueur.map((c) => c.matchId))];
    const matchs = matchIds.length === 0 ? [] : await this.matchsRepo
      .createQueryBuilder("m")
      .whereInIds(matchIds)
      .getMany();
    const matchById = new Map(matchs.map((m) => [m.id, m]));

    // Evenements de ces matchs : les minutes ne sont pas stockees sur les
    // compositions importees (0), on les deduit des remplacements comme
    // effectif() ; buts, passes et cartons viennent des memes evenements.
    const evts = matchIds.length === 0 ? [] : await this.evtsRepo
      .createQueryBuilder("e")
      .where("e.match_id IN (:...ids)", { ids: matchIds })
      .getMany();
    const evtsByMatch = new Map<string, EvenementMatch[]>();
    for (const e of evts) {
      const arr = evtsByMatch.get(e.matchId) ?? [];
      arr.push(e);
      evtsByMatch.set(e.matchId, arr);
    }

    // 3) Recupere UNIQUEMENT les equipes referencees par ces matchs.
    const equipeIds = new Set<string>();
    for (const m of matchs) {
      if (m.equipeDomId) equipeIds.add(m.equipeDomId);
      if (m.equipeExtId) equipeIds.add(m.equipeExtId);
    }
    const equipeById = new Map<string, Equipe>();
    if (equipeIds.size > 0) {
      const equipes = await this.equipesRepo
        .createQueryBuilder("e")
        .whereInIds([...equipeIds])
        .getMany();
      for (const e of equipes) equipeById.set(e.id, e);
    }

    // 4) Saisons : que celles referencees.
    const saisonIds = new Set<string>();
    for (const m of matchs) if (m.saisonId) saisonIds.add(m.saisonId);
    const saisonById = new Map<string, Saison>();
    if (saisonIds.size > 0) {
      const ss = await this.saisonsRepo
        .createQueryBuilder("s")
        .whereInIds([...saisonIds])
        .getMany();
      for (const s of ss) saisonById.set(s.id, s);
    }

    // 5) Agregation memoire : par (saisonId, equipeId, clubId).
    type Cle = { saisonId: string | null; equipeId: string | null; clubId: string };
    type AccLigne = {
      cle: Cle; matchs: number; minutes: number; titu: number;
      stats: StatsMatch; numeros: Record<number, number>;
    };
    const accByKey = new Map<string, AccLigne>();
    for (const c of composJoueur) {
      const m = matchById.get(c.matchId);
      if (!m) continue;
      const { clubId, equipeId } = equipeDuCote(m, c.cote);
      const saisonId = m.saisonId ?? null;
      const key = `${saisonId ?? ""}|${equipeId ?? clubId}`;
      let a = accByKey.get(key);
      if (!a) {
        a = { cle: { saisonId, equipeId, clubId }, matchs: 0, minutes: 0, titu: 0, stats: { ...STATS_MATCH_VIDES }, numeros: {} };
        accByKey.set(key, a);
      }
      const evtsDuMatch = evtsByMatch.get(c.matchId) ?? [];
      a.stats = cumuler(a.stats, statsDuMatch(c, evtsDuMatch));
      // Un remplacant reste sur le banc n'a pas joue (comme effectif()) : la
      // ligne d'equipe existe, mais le match n'est pas compte.
      const minutes = minutesJouees(c, evtsDuMatch);
      if (!c.titulaire && minutes === 0) continue;
      a.matchs++;
      a.minutes += minutes;
      if (c.titulaire) a.titu++;
      if (typeof c.numero === "number" && c.numero > 0) a.numeros[c.numero] = (a.numeros[c.numero] ?? 0) + 1;
    }

    // 6a) AJOUT : equipes attachees manuellement sans matchs joues
    // (typiquement joueur ajoute a un nouvel effectif de saison future).
    // On les inclut dans l'historique avec stats a 0 pour matcher le
    // comportement demande : "historique avec une nouvelle ligne si
    // dans un effectif".
    if (attachedEqIds.length > 0) {
      // Fetch les equipes attachees qui ne sont pas deja dans equipeById
      const missingIds = attachedEqIds.filter((id) => !equipeById.has(id));
      if (missingIds.length > 0) {
        const missing = await this.equipesRepo
          .createQueryBuilder("e")
          .whereInIds(missingIds)
          .getMany();
        for (const e of missing) equipeById.set(e.id, e);
        // Ajoute aussi leurs saisons si non deja fetch
        const missingSaisonIds = missing
          .map((e) => e.saisonId)
          .filter((sid): sid is string => !!sid && !saisonById.has(sid));
        if (missingSaisonIds.length > 0) {
          const ss = await this.saisonsRepo
            .createQueryBuilder("s")
            .whereInIds(missingSaisonIds)
            .getMany();
          for (const s of ss) saisonById.set(s.id, s);
        }
      }
      // Pour chaque equipe attachee, ajoute une ligne SI aucune compo
      // pour cette equipe n'existe deja dans l'aggregation.
      for (const eqId of attachedEqIds) {
        const eq = equipeById.get(eqId);
        if (!eq) continue;
        const key = `${eq.saisonId ?? ""}|${eqId}`;
        if (accByKey.has(key)) continue; // deja represente par ses matchs
        accByKey.set(key, {
          cle: { saisonId: eq.saisonId ?? null, equipeId: eqId, clubId: eq.clubId },
          matchs: 0, minutes: 0, titu: 0, stats: { ...STATS_MATCH_VIDES }, numeros: {},
        });
      }
    }

    // Buts / passes saisis a la main, par equipe (donc par saison).
    const equipeIdsLignes = [...accByKey.values()].map((a) => a.cle.equipeId).filter((x): x is string => !!x);
    const saisies = equipeIdsLignes.length === 0 ? [] : await this.statsEquipeRepo
      .createQueryBuilder("s")
      .where("s.joueurId = :jid", { jid: joueurId })
      .andWhere("s.equipeId IN (:...eids)", { eids: equipeIdsLignes })
      .getMany();
    const saisieParEquipe = new Map(saisies.map((r) => [r.equipeId, r]));

    // 6) Resultat groupe par saison + tri.
    const bySaison = new Map<string, { saison: any; lignes: any[] }>();
    for (const [, a] of accByKey) {
      const sid = a.cle.saisonId ?? "_inconnue";
      const saison = a.cle.saisonId ? saisonById.get(a.cle.saisonId) : null;
      if (!bySaison.has(sid)) bySaison.set(sid, { saison, lignes: [] });
      const eq = a.cle.equipeId ? equipeById.get(a.cle.equipeId) : null;
      bySaison.get(sid)!.lignes.push({
        clubId: a.cle.clubId,
        equipeId: a.cle.equipeId,
        equipeNom: eq?.nom ?? null,
        competitionLibelle: eq?.competitionLibelle ?? null,
        poule: eq?.poule ?? null,
        matchs: a.matchs,
        titularisations: a.titu,
        minutes: a.minutes,
        buts: saisieParEquipe.get(a.cle.equipeId ?? "")?.buts ?? a.stats.buts,
        passesDecisives: saisieParEquipe.get(a.cle.equipeId ?? "")?.passesDecisives ?? a.stats.passesDecisives,
        cartonsJaunes: a.stats.cartonsJaunes,
        cartonsRouges: a.stats.cartonsRouges,
        noteMoyenne: a.matchs > 0 ? noteIndicative(a.matchs, a.stats.cartonsRouges) : null,
        // Numeros portes dans CETTE equipe / saison : { "6": 3, "8": 5 }.
        numeros: a.numeros,
      });
    }
    // Totaux de la saison (toutes ses equipes) : ce que la fiche affiche.
    const totaux = (lignes: any[]) => {
      const t = { matchs: 0, titularisations: 0, minutes: 0, buts: 0, passesDecisives: 0, cartonsJaunes: 0, cartonsRouges: 0 };
      const numeros: Record<number, number> = {};
      for (const l of lignes) {
        for (const k of Object.keys(t) as (keyof typeof t)[]) t[k] += l[k] ?? 0;
        for (const [n, k] of Object.entries(l.numeros ?? {})) numeros[+n] = (numeros[+n] ?? 0) + (k as number);
      }
      return { ...t, numeros, noteMoyenne: t.matchs > 0 ? noteIndicative(t.matchs, t.cartonsRouges) : null };
    };
    const result = [...bySaison.entries()].map(([sid, v]) => ({
      saisonId: sid === "_inconnue" ? null : sid,
      totaux: totaux(v.lignes),
      saisonNom: (v.saison as any)?.nom ?? "Saison inconnue",
      anneeDebut: (v.saison as any)?.anneeDebut ?? 0,
      saisonActive: !!(v.saison as any)?.actif,
      lignes: v.lignes.sort((a, b) => b.matchs - a.matchs),
    }));
    result.sort((a, b) => (b.anneeDebut ?? 0) - (a.anneeDebut ?? 0));
    return result;
  }

  create(dto: CreateJoueurDto) {
    const j = this.repo.create(dto);
    return this.repo.save(j);
  }

  async update(id: string, dto: UpdateJoueurDto) {
    const j = await this.findOne(id);
    Object.assign(j, dto);
    return this.repo.save(j);
  }

  async remove(id: string) {
    const j = await this.findOne(id);
    await this.repo.remove(j);
    return { ok: true, id };
  }
}

@Controller("joueurs")
class JoueursController {
  constructor(private svc: JoueursService) {}

  @Get()
  list(@Query("clubId") clubId?: string, @Query("poste") poste?: string) {
    return this.svc.findAll(clubId, poste);
  }

  /** GET /joueurs/effectif?equipeId=... : effectif d'une equipe avec
   *  stats filtrees sur ses propres matchs (matchs, buts, cartons...)
   *  et fatigue globale. */
  @Get("effectif")
  effectif(@Query("equipeId") equipeId: string) {
    return this.svc.effectif(equipeId);
  }

  // Stats joueurs du championnat (= meme saison + competition + poule
  // que l'equipe donnee). Ne renvoie QUE les joueurs ayant joue au
  // moins 1 match du championnat, avec leurs stats restreintes a ces
  // matchs (vs stats globales toutes saisons confondues).
  @Get("championnat")
  championnat(@Query("equipeId") equipeId: string) {
    return this.svc.championnat(equipeId);
  }

  // Recherche libre par nom (pour le modal d'ajout de joueur).
  @Get("search")
  search(@Query("q") q: string) {
    return this.svc.search(q ?? "");
  }

  // Attache un joueur existant a une equipe.
  @Post("equipe/:equipeId/attach/:joueurId")
  attach(@Param("equipeId") equipeId: string, @Param("joueurId") joueurId: string) {
    return this.svc.attachEquipe(joueurId, equipeId);
  }

  // Detache un joueur d'une equipe (le joueur reste en base).
  @Delete("equipe/:equipeId/attach/:joueurId")
  detach(@Param("equipeId") equipeId: string, @Param("joueurId") joueurId: string) {
    return this.svc.detachEquipe(joueurId, equipeId);
  }

  // Cree un nouveau joueur ET l'attache a l'equipe.
  @Post("equipe/:equipeId/create")
  createDansEquipe(@Param("equipeId") equipeId: string, @Body() body: any) {
    return this.svc.createDansEquipe(equipeId, body);
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.svc.findOne(id);
  }

  /** GET /joueurs/:id/numeros : { "6": 3, "8": 5 } repartition des
   *  numeros de maillot portes par ce joueur sur ses matchs. */
  @Get(":id/numeros")
  numeros(@Param("id") id: string) {
    return this.svc.numerosFreq(id);
  }

  /** GET /joueurs/:id/matchs?saisonId=&limite= : derniers matchs joues, avec
   *  la feuille personnelle du joueur (titulaire, minutes, buts, cartons). */
  @Get(":id/matchs")
  matchs(@Param("id") id: string, @Query("saisonId") saisonId?: string, @Query("limite") limite?: string) {
    return this.svc.matchsJoues(id, saisonId || undefined, limite ? Math.min(50, Math.max(1, parseInt(limite, 10) || 8)) : 8);
  }

  /** PUT /joueurs/:id/stats-equipe/:equipeId : buts / passes saisis a la main
   *  pour CETTE equipe (donc cette saison) ; null efface la saisie. */
  @Put(":id/stats-equipe/:equipeId")
  definirStatEquipe(
    @Param("id") id: string, @Param("equipeId") equipeId: string, @Body() dto: StatEquipeDto,
  ) {
    return this.svc.definirStatEquipe(id, equipeId, dto);
  }

  /** GET /joueurs/:id/historique : parcours du joueur par saison
   *  (saisons / equipes / clubs ou il a evolue). */
  @Get(":id/historique")
  historique(@Param("id") id: string) {
    return this.svc.historique(id);
  }

  @Post()
  create(@Body() dto: CreateJoueurDto) {
    return this.svc.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateJoueurDto) {
    return this.svc.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.svc.remove(id);
  }
}

@Module({
  imports: [TypeOrmModule.forFeature([Joueur, Composition, Match, EvenementMatch, Equipe, Saison, StatJoueurEquipe])],
  controllers: [JoueursController],
  providers: [JoueursService],
  exports: [JoueursService],
})
export class JoueursModule {}
