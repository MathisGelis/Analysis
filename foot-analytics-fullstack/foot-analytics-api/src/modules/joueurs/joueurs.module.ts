// src/modules/joueurs/joueurs.module.ts
import {
  Body, Controller, Delete, Get, Injectable, Logger, NotFoundException, Param,
  Patch, Post, Query, Module,
} from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Composition, Equipe, EvenementMatch, Joueur, Match, Saison } from "@/entities";
import { CreateJoueurDto, UpdateJoueurDto } from "./joueur.dto";
import { equipeDuCote, isEquipeSurCote } from "@/common/matching-cote";

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
   * Le `scoreForme` reste celui calcule globalement (toutes equipes
   * confondues) car la forme se mesure sur la presence physique recente
   * du joueur, peu importe la categorie.
   */
  async effectif(equipeId: string): Promise<any[]> {
    const equipe = await this.equipesRepo.findOne({ where: { id: equipeId } });
    if (!equipe) throw new NotFoundException(`Equipe ${equipeId} introuvable`);

    // Determine si l'equipe appartient a la saison active.
    // - Si OUI : on affiche le scoreForme global du joueur (il evolue en
    //   temps reel des qu'il joue ailleurs).
    // - Si NON (saison passee ou future) : on n'affiche PAS la forme,
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
    // poste, scoreForme, statut...).
    const joueursClub = await this.repo.find({ where: { clubId: equipe.clubId } });
    const joueursParNomCle = new Map<string, Joueur>();
    const cleNom = (nom: string, prenom?: string | null) =>
      `${(nom ?? "").toLowerCase().trim()}|${(prenom ?? "").toLowerCase().trim()}`;
    for (const j of joueursClub) {
      joueursParNomCle.set(cleNom(j.nom, j.prenom), j);
    }

    // Charge les evenements pour le fallback de calcul minutes
    // (utile si les anciennes compositions ont minutes=0 par defaut).
    // Skip si aucun match (les joueurs attaches seulement).
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
    // Helper : si la composition a deja des minutes (import recent), on
    // les utilise. Sinon on retombe sur les events de remplacement.
    const computeMinutes = (c: Composition, evts: EvenementMatch[]): number => {
      if (typeof c.minutes === "number" && c.minutes > 0) return c.minutes;
      const subs = evts.filter(
        (e) => e.type === "remplacement" && (e as any).equipe === (c as any).cote,
      );
      if (c.titulaire) {
        // Titulaire : 90 min sauf s'il est sorti (apparait comme joueur sortant d'un sub).
        const off = subs.find((s) => {
          const nom = (s.joueur ?? "").toLowerCase();
          return nom.includes((c.nom ?? "").toLowerCase());
        });
        return off ? (off.minute ?? 90) : 90;
      }
      // Remplacant : entre a la minute X -> 90 - X.
      const on = subs.find((s) => {
        const nom = (s.joueur2 ?? "").toLowerCase();
        return nom.includes((c.nom ?? "").toLowerCase());
      });
      return on ? Math.max(0, 90 - (on.minute ?? 90)) : 0;
    };

    // Agrege par joueur : matchs joues (titu OU remplacant), buts,
    // passes, cartons jaunes/rouges DANS LE CADRE de cette equipe.
    type Acc = {
      joueur: Joueur | null;
      nom: string; prenom?: string; licence?: string;
      matchs: number; titularisations: number; minutes: number;
      buts: number; passes: number;
      cartonsJaunes: number; cartonsRouges: number;
      derniersMatchs: { matchId: string; date: string | null; titu: boolean }[];
    };
    const acc = new Map<string, Acc>();
    for (const c of composPourEquipe) {
      const key = cleNom(c.nom, c.prenom);
      let a = acc.get(key);
      if (!a) {
        const j = joueursParNomCle.get(key) ?? null;
        a = {
          joueur: j, nom: c.nom, prenom: c.prenom ?? undefined,
          licence: c.licence ?? undefined,
          matchs: 0, titularisations: 0, minutes: 0,
          buts: 0, passes: 0,
          cartonsJaunes: 0, cartonsRouges: 0, derniersMatchs: [],
        };
        acc.set(key, a);
      }
      // Comptabilise seulement les titulaires ET les remplacants
      // effectivement entres en jeu (minutes > 0). Les remplacants restes
      // sur le banc ne comptent pas comme un match joue.
      const minutesCePmatch = computeMinutes(c, evtsByMatch.get(c.matchId) ?? []);
      if (!c.titulaire && minutesCePmatch === 0) continue;
      a.matchs++;
      if (c.titulaire) a.titularisations++;
      a.minutes += minutesCePmatch;
      const m = matchById.get(c.matchId);
      a.derniersMatchs.push({
        matchId: c.matchId, date: m?.date ?? null, titu: c.titulaire,
      });
    }

    // Buts / passes / cartons : on reutilise evtsAll deja fetche pour
    // le calcul des minutes (evite un second round-trip SQL).
    //
    // Optim : on parse "NOM Prenom" UNE seule fois par string distincte
    // (memoisation), pas par event. Sur 10 events qui referencent le
    // meme joueur, le parsing nom est fait 1 fois au lieu de 10.
    const parseNameCache = new Map<string, string>();
    const parseEventName = (raw: string): string => {
      const cached = parseNameCache.get(raw);
      if (cached !== undefined) return cached;
      let nomFam = "";
      let prenom = "";
      // Split sur espaces, separation nom (UPPER) vs prenom (autre).
      // On evite l'expression reguliere complexe et on teste simplement
      // si le premier char est en majuscule ET il n'y a pas de minuscule
      // dans le mot (= patronyme FFF "DUPONT", "DE LA TOUR").
      const parts = raw.split(/\s+/);
      for (const p of parts) {
        if (!p) continue;
        // Test ultra-rapide : "DUPONT" -> tout en upper ; "Pierre" -> mixed.
        const isUpper = p === p.toUpperCase() && p !== p.toLowerCase();
        if (isUpper) nomFam += (nomFam ? " " : "") + p;
        else prenom += (prenom ? " " : "") + p;
      }
      if (!nomFam) nomFam = raw;
      const key = cleNom(nomFam, prenom);
      parseNameCache.set(raw, key);
      return key;
    };

    for (const e of evtsAll) {
      const m = matchById.get(e.matchId);
      if (!m) continue;
      if (!isEquipeSurCote(m, equipe, (e as any).equipe)) continue;
      const nomJoueur = (e.joueur ?? "").trim();
      if (!nomJoueur) continue;
      const key = parseEventName(nomJoueur);
      const a = acc.get(key);
      if (!a) continue;
      if (e.type === "but") a.buts++;
      if (e.type === "but" && e.joueur2) {
        const passKey = parseEventName((e.joueur2 ?? "").trim());
        const pa = acc.get(passKey);
        if (pa) pa.passes++;
      }
      if (e.type === "carton" && e.sousType === "jaune") a.cartonsJaunes++;
      if (e.type === "carton" && (e.sousType === "rouge" || e.sousType === "double_jaune")) a.cartonsRouges++;
    }

    // Resultat : on prend le joueur global si dispo, sinon on bricole.
    const rows = [...acc.values()].map((a) => ({
      id: a.joueur?.id ?? null,
      nom: a.nom, prenom: a.prenom, licence: a.licence,
      poste: a.joueur?.poste ?? null,
      numeroFavori: a.joueur?.numeroFavori ?? null,
      statut: a.joueur?.statutMutation ?? null,
      scoreForme: equipeDansSaisonActive ? (a.joueur?.scoreForme ?? null) : null,
      // Stats specifiques a CETTE equipe :
      matchs: a.matchs,
      titularisations: a.titularisations,
      minutes: a.minutes,
      buts: a.buts,
      passesDecisives: a.passes,
      cartonsJaunes: a.cartonsJaunes,
      cartonsRouges: a.cartonsRouges,
      typeDiscipline: a.joueur?.typeDiscipline ?? null,
      tailleCm: a.joueur?.tailleCm ?? null,
      poidsKg: a.joueur?.poidsKg ?? null,
      piedFort: a.joueur?.piedFort ?? null,
      blessuresAnt: a.joueur?.blessuresAnt ?? null,
      clubId: equipe.clubId,
      equipeId, equipeNom: equipe.nom,
    })).sort((a, b) => b.matchs - a.matchs);

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
        scoreForme: equipeDansSaisonActive ? j.scoreForme : null,
        noteMoyenne: null,
        matchs: 0, titularisations: 0, minutes: 0,
        butsMarques: 0, passesDecisives: 0,
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
    // Re-use du helper minutes (titulaire = 90 sauf si sorti, sinon
    // 90 - minute d'entree pour les remplacants). Identique a effectif().
    const computeMinutes = (c: Composition, evtsM: EvenementMatch[]): number => {
      if (typeof c.minutes === "number" && c.minutes > 0) return c.minutes;
      const subs = evtsM.filter(
        (e) => e.type === "remplacement" && (e as any).equipe === (c as any).cote,
      );
      if (c.titulaire) {
        const off = subs.find((s) =>
          (s.joueur ?? "").toLowerCase().includes((c.nom ?? "").toLowerCase()));
        return off ? (off.minute ?? 90) : 90;
      }
      const on = subs.find((s) =>
        (s.joueur2 ?? "").toLowerCase().includes((c.nom ?? "").toLowerCase()));
      return on ? Math.max(0, 90 - (on.minute ?? 90)) : 0;
    };

    // Agreg par joueur (cle = licence si dispo, sinon nom+prenom+cote).
    type Acc = {
      licence: string | null; nom: string; prenom: string | null;
      clubId: string;
      matchs: number; titularisations: number; minutes: number;
      buts: number; passes: number; jaunes: number; rouges: number;
    };
    const accByKey = new Map<string, Acc>();
    const keyOf = (lic: string | null, nom: string, prenom: string | null) =>
      lic ? `lic:${lic}` : `name:${nom}|${prenom ?? ""}`;

    for (const c of compos) {
      const m = matchById.get(c.matchId);
      if (!m) continue;
      const cote: "dom" | "ext" = (c as any).cote;
      const { clubId, equipeId: equipeIdComp } = equipeDuCote(m, cote);
      // Filtre defensif : ignore les composiions cote oppose si l'equipe
      // n'appartient pas au championnat (ex: match coupe contre une
      // equipe d'une autre poule).
      if (!equipeIdComp || !equipeIds.has(equipeIdComp)) continue;
      const minutes = computeMinutes(c, evtsByMatch.get(m.id) ?? []);
      // Skip remplacant non entre en jeu (coherent avec effectif()).
      if (!c.titulaire && minutes === 0) continue;
      const k = keyOf(c.licence, c.nom, c.prenom);
      let a = accByKey.get(k);
      if (!a) {
        a = {
          licence: c.licence, nom: c.nom, prenom: c.prenom, clubId,
          matchs: 0, titularisations: 0, minutes: 0,
          buts: 0, passes: 0, jaunes: 0, rouges: 0,
        };
        accByKey.set(k, a);
      }
      a.matchs++;
      a.minutes += minutes;
      if (c.titulaire) a.titularisations++;
    }

    // Buts/passes/cartons : depuis les evenements (qui pointent un joueur
    // par son nom — match approximatif).
    const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().trim();
    const findAccByName = (name: string): Acc | null => {
      const n = norm(name);
      for (const a of accByKey.values()) {
        const ln = norm(a.nom);
        const pn = norm(a.prenom);
        if (n.includes(ln) && (pn === "" || n.includes(pn.charAt(0)))) {
          return a;
        }
      }
      return null;
    };
    for (const e of evts) {
      const m = matchById.get(e.matchId);
      if (!m) continue;
      const equipeIdEvt = e.equipe === "dom" ? m.equipeDomId : m.equipeExtId;
      if (!equipeIdEvt || !equipeIds.has(equipeIdEvt)) continue;
      const a = findAccByName(e.joueur ?? "");
      if (!a) continue;
      if (e.type === "but" && (e as any).sousType !== "csc") a.buts++;
      else if (e.type === "passe_decisive") a.passes++;
      else if (e.type === "carton" && e.sousType === "jaune") a.jaunes++;
      else if (e.type === "carton" && e.sousType === "rouge") a.rouges++;
    }

    // Reconciliation avec les Joueur en base pour recuperer le scoreForme,
    // poste, numero, etc. Match par licence en priorite, sinon par nom.
    const jouersTous = await this.repo.find();
    const byLicence = new Map(jouersTous.filter((j) => j.licence).map((j) => [j.licence, j]));
    const findJoueurEnBase = (a: Acc): Joueur | null => {
      if (a.licence && byLicence.has(a.licence)) return byLicence.get(a.licence)!;
      const ln = norm(a.nom);
      const pn = norm(a.prenom);
      return jouersTous.find((j) =>
        norm(j.nom) === ln && (pn === "" || norm(j.prenom).startsWith(pn[0]))
      ) ?? null;
    };

    return [...accByKey.values()]
      .filter((a) => a.matchs > 0)
      .map((a) => {
        const j = findJoueurEnBase(a);
        return {
          id: j?.id ?? null,
          licence: a.licence, nom: a.nom, prenom: a.prenom,
          clubId: a.clubId, equipeId: null,
          matchs: a.matchs, titularisations: a.titularisations,
          minutes: a.minutes,
          buts: a.buts, butsMarques: a.buts,
          passesDecisives: a.passes,
          cartonsJaunes: a.jaunes, cartonsRouges: a.rouges,
          // Stats du PROFIL persistent (poste, photo, etc.) ;
          // pas de stat de match globale.
          poste: j?.poste ?? null,
          numeroFavori: j?.numeroFavori ?? null,
          scoreForme: j?.scoreForme ?? null,
          noteMoyenne: null,
        };
      })
      .sort((a, b) => b.matchs - a.matchs);
  }
  async search(q: string, limit = 20): Promise<Joueur[]> {
    const needle = (q ?? "").trim();
    if (needle.length < 2) return [];
    const lower = needle.toLowerCase();
    return this.repo
      .createQueryBuilder("j")
      .where("LOWER(j.nom) LIKE :p", { p: `%${lower}%` })
      .orWhere("LOWER(j.prenom) LIKE :p", { p: `%${lower}%` })
      .orderBy("j.nom", "ASC")
      .limit(limit)
      .getMany();
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
    const qb = this.compos.createQueryBuilder("c");
    if (j.licence) {
      qb.where("c.licence = :lic", { lic: j.licence });
    } else if (j.prenom) {
      qb.where("LOWER(TRIM(c.nom)) = LOWER(TRIM(:nom)) AND LOWER(TRIM(c.prenom)) = LOWER(TRIM(:prenom))",
        { nom: j.nom, prenom: j.prenom });
    } else {
      qb.where("LOWER(TRIM(c.nom)) = LOWER(TRIM(:nom))", { nom: j.nom });
    }
    const composJoueur = await qb.getMany();
    if (composJoueur.length === 0) return [];

    // 2) Recupere UNIQUEMENT les matchs concernes en 1 seule query.
    const matchIds = [...new Set(composJoueur.map((c) => c.matchId))];
    const matchs = await this.matchsRepo
      .createQueryBuilder("m")
      .whereInIds(matchIds)
      .getMany();
    const matchById = new Map(matchs.map((m) => [m.id, m]));

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

    // 4) Saisons : que celles referencees. On utilise le repo Saison via
    //    le manager pour eviter une injection supplementaire.
    const saisonIds = new Set<string>();
    for (const m of matchs) if (m.saisonId) saisonIds.add(m.saisonId);
    const saisonById = new Map<string, any>();
    if (saisonIds.size > 0) {
      const saisonRepo = this.equipesRepo.manager.getRepository("Saison" as any);
      const ss = await saisonRepo
        .createQueryBuilder("s")
        .whereInIds([...saisonIds])
        .getMany();
      for (const s of ss as any[]) saisonById.set(s.id, s);
    }

    // 5) Agregation memoire : par (saisonId, equipeId, clubId).
    type Cle = { saisonId: string | null; equipeId: string | null; clubId: string };
    const accByKey = new Map<string, { cle: Cle; matchs: number; minutes: number; titu: number }>();
    for (const c of composJoueur) {
      const m = matchById.get(c.matchId);
      if (!m) continue;
      const { clubId, equipeId } = equipeDuCote(m, c.cote);
      const saisonId = m.saisonId ?? null;
      const key = `${saisonId ?? ""}|${equipeId ?? clubId}`;
      let a = accByKey.get(key);
      if (!a) {
        a = { cle: { saisonId, equipeId, clubId }, matchs: 0, minutes: 0, titu: 0 };
        accByKey.set(key, a);
      }
      a.matchs++;
      a.minutes += c.minutes ?? 0;
      if (c.titulaire) a.titu++;
    }

    // 6a) AJOUT : equipes attachees manuellement sans matchs joues
    // (typiquement joueur ajoute a un nouvel effectif de saison future).
    // On les inclut dans l'historique avec stats a 0 pour matcher le
    // comportement demande : "historique avec une nouvelle ligne si
    // dans un effectif".
    const attachedEqIds: string[] = j.equipesAttachees ?? [];
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
          const saisonRepo = this.equipesRepo.manager.getRepository("Saison" as any);
          const ss = await saisonRepo
            .createQueryBuilder("s")
            .whereInIds(missingSaisonIds)
            .getMany();
          for (const s of ss as any[]) saisonById.set(s.id, s);
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
          matchs: 0, minutes: 0, titu: 0,
        });
      }
    }

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
      });
    }
    const result = [...bySaison.entries()].map(([sid, v]) => ({
      saisonId: sid === "_inconnue" ? null : sid,
      saisonNom: (v.saison as any)?.nom ?? "Saison inconnue",
      anneeDebut: (v.saison as any)?.anneeDebut ?? 0,
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
   *  et scoreForme global. */
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
  imports: [TypeOrmModule.forFeature([Joueur, Composition, Match, EvenementMatch, Equipe, Saison])],
  controllers: [JoueursController],
  providers: [JoueursService],
  exports: [JoueursService],
})
export class JoueursModule {}
