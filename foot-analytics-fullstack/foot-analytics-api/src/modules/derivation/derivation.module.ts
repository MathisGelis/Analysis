// src/modules/derivation/derivation.module.ts
//
// Reconstruit des donnees "derivees" a partir des seuls matchs importes :
//   - l'effectif (table joueurs) de TOUS les clubs, a partir des compositions
//     de chaque feuille de match (cumul matchs / titularisations / minutes
//     estimees / cartons, numero favori, postes joues) ;
//   - le classement (table classement), calcule a partir de tous les scores.
//
// Ces routines sont appelees automatiquement apres chaque import FMI, et
// disponibles manuellement via POST /api/derivation/rebuild.

import { Controller, Injectable, Module, Post, Query, UseGuards } from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Arbitre, ArbitreMatch, Blessure, Club, Coach, Composition, Entrainement,
  Equipe, EvenementMatch, Joueur, LigneClassement, Match, Saison, StaffMatch,
} from "@/entities";
import { noteIndicative } from "@/common/indicateurs";
import { champsFatigue, Effort, RPE_MATCH } from "@/common/fatigue";
import { compterMotifs, resumeMotifs } from "@/common/motifs";
import { anneeDebutPourDate, nomSaison } from "@/common/saison-date";
import { AdminGuard, AuthModule } from "../auth/auth.module";

const POSTE_BY_NUM: Record<number, string> = {
  1: "GB", 2: "DD", 3: "DG", 4: "DC", 5: "DC",
  6: "MD", 7: "MD", 8: "MO", 9: "AT", 10: "MO", 11: "AG",
};

// Cache de normalisation : `norm()` est appelee des milliers de fois
// sur les memes strings (noms de joueurs, surnames d'events). Cacher
// le resultat par chaine d'entree elimine des regex repetitifs.
const _normCache = new Map<string, string>();
function norm(s?: string): string {
  if (!s) return "";
  const cached = _normCache.get(s);
  if (cached !== undefined) return cached;
  const out = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Cap memoire : on borne le cache a ~10k entrees ; au-dela on le purge
  // (cas extreme — en pratique on plafonne a quelques milliers).
  if (_normCache.size > 10000) _normCache.clear();
  _normCache.set(s, out);
  return out;
}

// Un evenement (carton, remplacement) reference le joueur par une chaine de
// nom. On considere qu'il correspond a une ligne de composition si le nom de
// famille de celle-ci est contenu dans la chaine de l'evenement.
function nameMatches(eventName: string | undefined, surname: string): boolean {
  const n = norm(eventName);
  const s = norm(surname);
  return s.length > 1 && n.includes(s);
}

// Parse une date au format ISO (YYYY-MM-DD) ou FFF (DD/MM/YYYY).
function parseDateAny(s?: string | null): Date | null {
  if (!s) return null;
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// Estimation des minutes jouees a partir des remplacements de la feuille.
function estimateMinutes(comp: Composition, evts: EvenementMatch[]): number {
  // Si l'import a deja calcule les minutes (FMI maj17+), on les utilise.
  // Sinon on retombe sur le calcul a partir des events de remplacement
  // (fallback pour les compositions saisies manuellement).
  if (typeof (comp as any).minutes === "number" && (comp as any).minutes > 0) {
    return (comp as any).minutes;
  }
  const subs = evts.filter(
    (e) => e.type === "remplacement" && e.equipe === (comp as any).cote,
  );
  if (comp.titulaire) {
    const off = subs.find((s) => nameMatches(s.joueur, comp.nom));
    return off ? off.minute ?? 90 : 90;
  }
  const on = subs.find((s) => nameMatches(s.joueur2, comp.nom));
  return on ? Math.max(0, 90 - (on.minute ?? 90)) : 0;
}

@Injectable()
export class DerivationService {
  constructor(
    @InjectRepository(Joueur) private joueurs: Repository<Joueur>,
    @InjectRepository(Match) private matchs: Repository<Match>,
    @InjectRepository(LigneClassement) private classement: Repository<LigneClassement>,
    @InjectRepository(Club) private clubs: Repository<Club>,
    @InjectRepository(Entrainement) private entrainements: Repository<Entrainement>,
    @InjectRepository(Blessure) private blessures: Repository<Blessure>,
    @InjectRepository(Arbitre) private arbitresRepo: Repository<Arbitre>,
    @InjectRepository(ArbitreMatch) private arbMatchsRepo: Repository<ArbitreMatch>,
    @InjectRepository(Coach) private coachsRepo: Repository<Coach>,
    @InjectRepository(StaffMatch) private staffMatchsRepo: Repository<StaffMatch>,
    @InjectRepository(Equipe) private equipesRepo: Repository<Equipe>,
    @InjectRepository(Saison) private saisonsRepo: Repository<Saison>,
    @InjectRepository(EvenementMatch) private evenementsRepo: Repository<EvenementMatch>,
  ) {}

  /** Reconstruit l'effectif de tous les clubs depuis les compositions. */
  async recomputeJoueurs() {
    const matchs = await this.matchs.find({
      relations: ["compositions", "evenements"],
    });

    type Agg = {
      clubId: string; nom: string; prenom: string; licence?: string;
      matchs: number; titularisations: number; minutes: number;
      cj: number; cr: number; numeroCounts: Record<number, number>;
      // Plus recent match (en compo) du joueur, pour la formule "decroissance".
      lastMatchDate: Date | null;
      // Nombre de remplacements entrants (entre en cours de match).
      subIns: number;
      // Minutes jouees a chaque match date : entree de la charge en match (fatigue).
      efforts: { date: Date; minutes: number }[];
    };
    const agg = new Map<string, Agg>();
    const nameKey = (nom: string, prenom: string, clubId: string) =>
      `n:${norm(nom)}|${norm(prenom)}|${clubId}`;
    const keyOf = (licence: string | undefined, nom: string, prenom: string, clubId: string) =>
      licence ? `lic:${licence}` : nameKey(nom, prenom, clubId);

    for (const m of matchs) {
      const comps = m.compositions ?? [];
      const evts = m.evenements ?? [];
      const matchDate = parseDateAny(m.date);

      // Pre-index : pour ce match, on construit deux index
      // (cote -> liste de {comp, normSurname}) pour resoudre les events
      // en O(1) au lieu de scanner toutes les compos par nameMatches.
      // Cle = `${cote}|${surnameNorm}` ; valeur = la composition.
      // On garde aussi un fallback liste pour les matches partiels.
      type CompIdx = { comp: Composition; surnameNorm: string };
      const compsByCote: Record<"dom" | "ext", CompIdx[]> = { dom: [], ext: [] };
      for (const c of comps) {
        const cote = (c as any).cote as "dom" | "ext";
        compsByCote[cote].push({ comp: c, surnameNorm: norm(c.nom) });
      }
      // Cache des resolutions : evtName -> Composition trouvee. On evite
      // 22 nameMatches par event si le meme nom est reference plusieurs
      // fois (events but/passe/carton d'un meme joueur, etc.).
      const resolveCache = new Map<string, Composition | null>();
      const resolveCompFromEvent = (
        evtName: string | undefined, cote: "dom" | "ext",
      ): Composition | null => {
        if (!evtName) return null;
        const k = `${cote}|${evtName}`;
        if (resolveCache.has(k)) return resolveCache.get(k) ?? null;
        const nNorm = norm(evtName);
        let hit: Composition | null = null;
        for (const ci of compsByCote[cote]) {
          if (ci.surnameNorm.length > 1 && nNorm.includes(ci.surnameNorm)) {
            hit = ci.comp; break;
          }
        }
        resolveCache.set(k, hit);
        return hit;
      };

      for (const c of comps) {
        const clubId = (c as any).cote === "dom" ? m.clubDom : m.clubExt;
        const k = keyOf(c.licence, c.nom, c.prenom, clubId);
        let a = agg.get(k);
        if (!a) {
          a = {
            clubId, nom: c.nom, prenom: c.prenom ?? "", licence: c.licence || undefined,
            matchs: 0, titularisations: 0, minutes: 0, cj: 0, cr: 0,
            numeroCounts: {}, lastMatchDate: null, subIns: 0, efforts: [],
          };
          agg.set(k, a);
        }
        a.matchs++;
        if (c.titulaire) a.titularisations++;
        const minutesMatch = estimateMinutes(c, evts);
        a.minutes += minutesMatch;
        if (matchDate && minutesMatch > 0) a.efforts.push({ date: matchDate, minutes: minutesMatch });
        if (c.numero != null) a.numeroCounts[c.numero] = (a.numeroCounts[c.numero] ?? 0) + 1;
        if (matchDate && (!a.lastMatchDate || matchDate > a.lastMatchDate)) {
          a.lastMatchDate = matchDate;
        }
        // Entree en jeu (remplacant qui rentre). On detecte via un index
        // O(1) sur le cote au lieu d'un .some() lineaire.
        if (!c.titulaire) {
          const cSurnameNorm = norm(c.nom);
          const isSubIn = evts.some((e) => {
            if (e.type !== "remplacement" || e.equipe !== (c as any).cote) return false;
            const j2 = norm(e.joueur2);
            return cSurnameNorm.length > 1 && j2.includes(cSurnameNorm);
          });
          if (isSubIn) a.subIns++;
        }
      }

      // Cartons -> rattaches a la composition correspondante via le
      // resolver indexe (O(1) avec cache au lieu de .find lineaire).
      for (const e of evts) {
        if (e.type !== "carton") continue;
        const comp = resolveCompFromEvent(e.joueur, (e.equipe as "dom" | "ext"));
        if (!comp) continue;
        const clubId = (comp as any).cote === "dom" ? m.clubDom : m.clubExt;
        const a = agg.get(keyOf(comp.licence, comp.nom, comp.prenom, clubId));
        if (a) {
          if (e.sousType === "rouge") a.cr++;
          else a.cj++;
        }
      }
    }

    // ---- Donnees additionnelles pour le calcul de la fatigue ----
    const [trainings, blessuresAll] = await Promise.all([
      this.entrainements.find(),
      this.blessures.find(),
    ]);

    // "Own clubs" = clubs ayant au moins une seance d'entrainement avec des
    // joueursPresents. On utilise ces ids pour appliquer la formule "mon
    // effectif" (training presence + decroissance + blessures). Les autres
    // clubs sont traites en "scouting" (titularisations + entrees en jeu).
    const playerIdsWithPresence = new Set<string>();
    for (const t of trainings) {
      for (const pid of (t.joueursPresents ?? [])) playerIdsWithPresence.add(pid);
    }

    // Index des joueurs existants (pour conserver l'id et les champs edites
    // manuellement comme le poste, le statut, le commentaire, mais aussi
    // buts/passes saisis a la main).
    const existing = await this.joueurs.find();
    const ownClubIds = new Set<string>();
    for (const j of existing) {
      if (playerIdsWithPresence.has(j.id)) ownClubIds.add(j.clubId);
    }

    const idxLic = new Map(
      existing.filter((j) => j.licence).map((j) => [`lic:${j.licence}`, j]),
    );
    const idxName = new Map(
      existing.map((j) => [nameKey(j.nom, j.prenom ?? "", j.clubId), j]),
    );

    // ---- Fatigue : charge d'entrainement + charge en match (voir common/fatigue.ts) ----
    // Chaque joueur recoit ses EFFORTS des 28 derniers jours : ses seances (charge UA-RPE calculee a la
    // saisie de la seance, pour les seances ou il etait present) et ses matchs (minutes jouees x RPE de
    // match). On stocke les entrees, pas seulement le score : la fatigue est recalculee a la lecture.
    const now = new Date();
    const seancesParJoueur = new Map<string, Effort[]>();
    for (const t of trainings) {
      const d = parseDateAny(t.date);
      if (!d || !(t.charge > 0)) continue;
      for (const pid of (t.joueursPresents ?? [])) {
        const arr = seancesParJoueur.get(pid) ?? [];
        arr.push({ date: d, ua: t.charge, source: "entrainement" });
        seancesParJoueur.set(pid, arr);
      }
    }

    // Blessures par joueur (id, sinon nom) : antecedents, statut du moment, retour recent.
    const blessuresParJoueur = new Map<string, number>();
    const blessuresParNom = new Map<string, number>();
    const indisponibles = new Set<string>();
    const enReprise = new Set<string>();
    const finBlessure = new Map<string, Date>();
    for (const b of blessuresAll) {
      blessuresParJoueur.set(b.joueurId, (blessuresParJoueur.get(b.joueurId) ?? 0) + 1);
      if (b.joueurNom) {
        const k = norm(b.joueurNom);
        blessuresParNom.set(k, (blessuresParNom.get(k) ?? 0) + 1);
      }
      if (b.statut && /indisp/i.test(b.statut)) indisponibles.add(b.joueurId);
      if (b.statut && /reprise/i.test(b.statut)) enReprise.add(b.joueurId);
      const fin = parseDateAny(b.retourEstime);
      if (fin && fin <= now && (!finBlessure.get(b.joueurId) || fin > finBlessure.get(b.joueurId)!)) {
        finBlessure.set(b.joueurId, fin);
      }
    }
    const ageDe = (naissance?: string | null): number | null => {
      const d = parseDateAny(naissance);
      return d ? Math.floor(daysBetween(now, d) / 365.25) : null;
    };

    /** Champs de fatigue d'un joueur agrege : seances (mon effectif) + matchs. */
    const fatigueDe = (a: Agg, found: Joueur | null, isMine: boolean) => {
      const pid = found?.id;
      const efforts: Effort[] = [
        ...a.efforts.map((e): Effort => ({ date: e.date, ua: e.minutes * RPE_MATCH, source: "match", minutes: e.minutes })),
        ...(isMine && pid ? seancesParJoueur.get(pid) ?? [] : []),
      ];
      return champsFatigue({
        aujourdhui: now,
        efforts,
        indisponible: pid ? indisponibles.has(pid) : false,
        enReprise: pid ? enReprise.has(pid) : false,
        blessuresAnt: pid ? blessuresParJoueur.get(pid) ?? 0 : blessuresParNom.get(norm(a.nom)) ?? 0,
        finDerniereBlessure: pid ? finBlessure.get(pid) ?? null : null,
        age: ageDe(found?.dateNaissance),
        // Les seances ne sont connues que pour mon effectif : ailleurs la fatigue est une estimation sur les matchs.
        sources: isMine ? "complet" : "matchs",
      });
    };


    // -- Profil de discipline derive des motifs de cartons --
    // On agrege les motifs par joueur en parcourant les evenements bruts.
    // On garde aussi l'equipe principale de chaque joueur (= celle ou il
    // a recu le plus de cartons) pour pouvoir comparer son profil a la
    // moyenne de son championnat (saison + competition + poule).
    type Disc = {
      contest: number; faute: number; antisport: number; brutal: number;
      jaunes: number; rouges: number;
      // Equipe principale (oue tous les cartons combines sont les plus
      // nombreux). Utilise pour rattacher le joueur a un championnat.
      equipesCount: Map<string, number>;
    };
    const discParJoueur = new Map<string, Disc>();
    const ensureDisc = (k: string): Disc => {
      if (!discParJoueur.has(k))
        discParJoueur.set(k, {
          contest: 0, faute: 0, antisport: 0, brutal: 0,
          jaunes: 0, rouges: 0, equipesCount: new Map(),
        });
      return discParJoueur.get(k)!;
    };
    for (const m of matchs) {
      const comps = m.compositions ?? [];
      for (const e of (m.evenements ?? [])) {
        if (e.type !== "carton") continue;
        const comp = comps.find(
          (c) => (c as any).cote === e.equipe && nameMatches(e.joueur, c.nom),
        );
        if (!comp) continue;
        const clubId = (comp as any).cote === "dom" ? m.clubDom : m.clubExt;
        const equipeId = (comp as any).cote === "dom" ? m.equipeDomId : m.equipeExtId;
        const key = keyOf(comp.licence, comp.nom, comp.prenom, clubId);
        const d = ensureDisc(key);
        const motif = (e.motif ?? "").toLowerCase();
        if (e.sousType === "rouge") d.rouges++;
        else d.jaunes++;
        if (/contest|reclam|protest/.test(motif)) d.contest++;
        else if (/brutal|violence|coup/.test(motif)) d.brutal++;
        else if (/anti.?sport|comportement|insult/.test(motif)) d.antisport++;
        else if (motif) d.faute++;
        if (equipeId) {
          d.equipesCount.set(equipeId, (d.equipesCount.get(equipeId) ?? 0) + 1);
        }
      }
    }

    // Equipe principale du joueur (cle d'agreg = max cartons par equipe).
    const equipePrincipaleParJoueur = new Map<string, string | null>();
    for (const [key, d] of discParJoueur) {
      let bestEq: string | null = null;
      let bestN = -1;
      for (const [eqId, n] of d.equipesCount) {
        if (n > bestN) { bestN = n; bestEq = eqId; }
      }
      equipePrincipaleParJoueur.set(key, bestEq);
    }

    // Charge la table des equipes pour pouvoir rattacher chaque joueur a
    // un championnat (saison + competition + poule).
    const equipesAll = await this.equipesRepo.find();
    const equipeById = new Map<string, Equipe>(equipesAll.map((e) => [e.id, e]));
    const championKey = (eqId: string | null): string | null => {
      if (!eqId) return null;
      const e = equipeById.get(eqId);
      if (!e) return null;
      return `${e.saisonId ?? "_"}|${e.competitionLibelle ?? "_"}|${e.poule ?? "_"}`;
    };

    // Moyennes par championnat (= moyenne PAR JOUEUR de chaque motif).
    // Cle = championKey -> agrege global + nombre de joueurs concernes.
    type Moy = {
      contest: number; faute: number; antisport: number; brutal: number;
      jaunes: number; rouges: number; joueurs: number;
    };
    const moyennesParChamp = new Map<string, Moy>();
    for (const [key, d] of discParJoueur) {
      const eqId = equipePrincipaleParJoueur.get(key);
      const champ = championKey(eqId ?? null);
      if (!champ) continue;
      let m = moyennesParChamp.get(champ);
      if (!m) {
        m = { contest: 0, faute: 0, antisport: 0, brutal: 0, jaunes: 0, rouges: 0, joueurs: 0 };
        moyennesParChamp.set(champ, m);
      }
      m.contest += d.contest;
      m.faute += d.faute;
      m.antisport += d.antisport;
      m.brutal += d.brutal;
      m.jaunes += d.jaunes;
      m.rouges += d.rouges;
      m.joueurs++;
    }
    // On divise pour obtenir la moyenne par joueur.
    const moyennePerJoueur = (champ: string | null) => {
      if (!champ) return null;
      const m = moyennesParChamp.get(champ);
      if (!m || m.joueurs === 0) return null;
      return {
        contest: m.contest / m.joueurs,
        faute: m.faute / m.joueurs,
        antisport: m.antisport / m.joueurs,
        brutal: m.brutal / m.joueurs,
        jaunes: m.jaunes / m.joueurs,
        rouges: m.rouges / m.joueurs,
      };
    };

    /**
     * Score de discipline 0-100 (100 = irréprochable, 0 = très indiscipliné).
     * Ponderations :
     *   - rouge = 3 jaunes (suspension)
     *   - motif "brutal" = 2 points additionnels (geste violent)
     *   - motif "antisport" = 1.5 (comportement)
     *   - motif "contestation" = 1.2 (argumentation arbitre)
     *   - motif "faute" technique = 1 (jeu, geste defensif)
     */
    const scoreDisciplineFor = (key: string): number | null => {
      const d = discParJoueur.get(key);
      if (!d) return 100;
      const poids =
        d.contest * 1.2
        + d.faute * 1.0
        + d.antisport * 1.5
        + d.brutal * 2.0
        + d.rouges * 3.0;
      // Bareme : 100 = vierge, -8 pts par unite de poids.
      return Math.max(0, Math.round(100 - poids * 8));
    };

    /**
     * Etiquette derivee de la COMPARAISON a la moyenne du championnat.
     * Si pour un motif, le joueur depasse 1.5x la moyenne du championnat
     * (et au moins 2 occurrences en absolu pour eviter le bruit), il
     * gagne l'etiquette correspondante. Le motif le plus au-dessus
     * gagne.
     */
    const typeDisciplineFor = (key: string): string | null => {
      const d = discParJoueur.get(key);
      if (!d) return null;
      if (d.rouges >= 2) return "Exclusions repetees";
      const eqId = equipePrincipaleParJoueur.get(key);
      const moy = moyennePerJoueur(championKey(eqId ?? null));
      // Si pas assez de joueurs dans le championnat pour faire une
      // moyenne (< 5), on retombe sur les seuils absolus.
      if (!moy) {
        if (d.brutal >= 1) return "Joueur a risque";
        const total = d.contest + d.faute + d.antisport + d.brutal;
        if (total < 2) return null;
        const ranked = ([
          ["Contestataire", d.contest],
          ["Trop de fautes", d.faute],
          ["Antisportif", d.antisport],
        ] as [string, number][]).sort((x, y) => y[1] - x[1]);
        const [top, count] = ranked[0];
        return count >= 2 ? top : null;
      }
      // Comparaison ratio personnel / moyenne (>= 1.5x ET >= 2 unites)
      type Cand = { label: string; ratio: number; absolu: number };
      const seuilRatio = 1.5;
      const seuilAbsolu = 2;
      const c: Cand[] = [
        { label: "Contestataire",  ratio: moy.contest   ? d.contest   / moy.contest   : 0, absolu: d.contest },
        { label: "Trop de fautes", ratio: moy.faute     ? d.faute     / moy.faute     : 0, absolu: d.faute },
        { label: "Antisportif",    ratio: moy.antisport ? d.antisport / moy.antisport : 0, absolu: d.antisport },
        { label: "Joueur a risque",ratio: moy.brutal    ? d.brutal    / moy.brutal    : 0, absolu: d.brutal },
      ];
      const eligibles = c
        .filter((x) => x.absolu >= seuilAbsolu && x.ratio >= seuilRatio)
        .sort((a, b) => b.ratio - a.ratio);
      return eligibles[0]?.label ?? null;
    };

    const toSave: any[] = [];
    for (const a of agg.values()) {
      const numeros = Object.entries(a.numeroCounts).sort((x, y) => y[1] - x[1]);
      const numeroFavori = numeros.length ? +numeros[0][0] : null;
      const postes = numeros.map(([n, c]) => `${n} (${c})`).join(" / ");
      const posteInfere = numeroFavori != null ? POSTE_BY_NUM[numeroFavori] ?? "MIL" : "MIL";
      const noteMoyenne = noteIndicative(a.matchs, a.cr);

      const found =
        (a.licence && idxLic.get(`lic:${a.licence}`)) ||
        idxName.get(nameKey(a.nom, a.prenom, a.clubId));

      const isMine = ownClubIds.has(a.clubId);
      const fatigue = fatigueDe(a, found ?? null, isMine);

      const discKey = keyOf(a.licence, a.nom, a.prenom, a.clubId);
      const typeDiscipline = typeDisciplineFor(discKey);
      const scoreDiscipline = scoreDisciplineFor(discKey);

      // Statut mutation : si on n'a rien de saisi, mon club passe en
      // "Pas mutation" par defaut, les adversaires en "Non connu".
      const statutMutation =
        (found as any)?.statutMutation
        ?? (isMine ? "Pas mutation" : "Non connu");

      toSave.push({
        ...(found ?? {}),
        nom: a.nom,
        prenom: a.prenom,
        clubId: a.clubId,
        licence: a.licence ?? (found as any)?.licence ?? null,
        poste: (found as any)?.poste ?? posteInfere,
        numeroFavori,
        statutMutation,
        matchs: a.matchs,
        titularisations: a.titularisations,
        minutes: a.minutes,
        cartonsJaunes: a.cj,
        cartonsRouges: a.cr,
        // buts / passes : on conserve les valeurs saisies manuellement.
        buts: (found as any)?.buts ?? 0,
        passesDecisives: (found as any)?.passesDecisives ?? 0,
        blessuresAnt: found?.id ? blessuresParJoueur.get(found.id) ?? 0 : blessuresParNom.get(norm(a.nom)) ?? 0,
        noteMoyenne,
        ...fatigue,
        postes,
        typeDiscipline,
        scoreDiscipline,
      });
    }

    await this.joueurs.save(toSave);
    return { joueurs: toSave.length, ownClubs: ownClubIds.size };
  }

  /** Recalcule le classement a partir de tous les matchs joues. */
  async rebuildClassement() {
    const matchs = await this.matchs.find();

    type S = { v: number; n: number; d: number; bp: number; bc: number;
      results: { jn: number; issue: string }[];
      clubId: string; equipeId: string | null; saisonId: string | null };
    const stat = new Map<string, S>();
    // Clef = saison|equipeId si equipeId existe, sinon saison|club pour
    // compat. Permet a une meme saison de generer 1 ligne par equipe
    // distincte (Seniors D2, Seniors R2, U20 R2...) du meme club.
    const ensure = (clubId: string, equipeId: string | null, saisonId: string | null): S => {
      const key = `${saisonId ?? ""}|${equipeId ?? clubId}`;
      let s = stat.get(key);
      if (!s) {
        s = { v: 0, n: 0, d: 0, bp: 0, bc: 0, results: [],
              clubId, equipeId, saisonId };
        stat.set(key, s);
      }
      return s;
    };

    for (const m of matchs) {
      if (m.statut && m.statut !== "joue") continue;
      const jn = parseInt((m.journee ?? "").replace(/[^0-9]/g, ""), 10) || 0;
      const dom = ensure(m.clubDom, m.equipeDomId ?? null, m.saisonId ?? null);
      const ext = ensure(m.clubExt, m.equipeExtId ?? null, m.saisonId ?? null);
      dom.bp += m.scoreDom; dom.bc += m.scoreExt;
      ext.bp += m.scoreExt; ext.bc += m.scoreDom;
      let di: string, ei: string;
      if (m.scoreDom > m.scoreExt) { dom.v++; ext.d++; di = "V"; ei = "D"; }
      else if (m.scoreDom < m.scoreExt) { dom.d++; ext.v++; di = "D"; ei = "V"; }
      else { dom.n++; ext.n++; di = "N"; ei = "N"; }
      dom.results.push({ jn, issue: di });
      ext.results.push({ jn, issue: ei });
    }

    const rowsBrutes = [...stat.values()].map((s) => ({
      clubId: s.clubId, equipeId: s.equipeId, saisonId: s.saisonId,
      joues: s.v + s.n + s.d,
      v: s.v, n: s.n, d: s.d, bp: s.bp, bc: s.bc,
      pts: s.v * 3 + s.n,
      forme: s.results.sort((a, b) => a.jn - b.jn).slice(-5).map((r) => r.issue),
    }));

    // Tri et rang : par (saison, equipe) puis pts/diff/bp DESCENDANT.
    // Le rang est calcule a l'interieur d'un meme regroupement (saisonId,
    // equipeId differents => classements differents qui ne se melangent
    // pas — c'est ce qu'on veut pour D2, R2, U20 etc.).
    // Regroupement par cle de competition : saisonId + (poule via une
    // recherche dans les matchs originaux).
    // Pour simplifier, on groupe par (saisonId, division+poule) via les
    // equipes : 2 equipes sont dans le meme championnat si elles ont
    // (meme competitionLibelle, meme poule, meme saison) — donc on
    // re-cherche ca.
    const equipes = await this.equipesRepo.find();
    const equipeById = new Map(equipes.map((e) => [e.id, e]));
    const groupes = new Map<string, typeof rowsBrutes>();
    for (const r of rowsBrutes) {
      const eq = r.equipeId ? equipeById.get(r.equipeId) : null;
      const groupKey = `${r.saisonId ?? ""}|${eq?.competitionLibelle ?? ""}|${eq?.poule ?? ""}`;
      if (!groupes.has(groupKey)) groupes.set(groupKey, []);
      groupes.get(groupKey)!.push(r);
    }
    const rows: any[] = [];
    for (const [, group] of groupes) {
      group.sort(
        (a, b) => b.pts - a.pts || (b.bp - b.bc) - (a.bp - a.bc) || b.bp - a.bp,
      );
      group.forEach((r, i) => ((r as any).rang = i + 1));
      rows.push(...group);
    }

    await this.classement.clear();
    if (rows.length) await this.classement.save(rows as any);
    return rows;
  }

  /** Recalcule classement + cumuls arbitres a partir des matchs. */
  async recomputeArbitres() {
    const [matchs, arbMatchs, joueursAll, equipesAll, saisonsAll] = await Promise.all([
      this.matchs.find({ relations: ["evenements"] }),
      this.arbMatchsRepo.find(),
      this.joueurs.find(),
      this.equipesRepo.find(),
      this.saisonsRepo.find(),
    ]);
    const equipeById = new Map(equipesAll.map((e) => [e.id, e]));
    const saisonById = new Map(saisonsAll.map((s) => [s.id, s]));

    // Determiner les clubs "miens" (= ceux qui ont au moins un joueur
    // ayant fourni une presence d'entrainement) pour conditionner la note.
    const trainings = await this.entrainements.find();
    const playerIdsWithPresence = new Set<string>();
    for (const t of trainings) for (const p of t.joueursPresents ?? []) playerIdsWithPresence.add(p);
    const ownClubIds = new Set<string>();
    for (const j of joueursAll) if (playerIdsWithPresence.has(j.id)) ownClubIds.add(j.clubId);

    // Helper : derive la cle de championnat d'un match (a partir de
    // l'equipe domicile ou visiteur).
    const cleChampionnat = (m: any): { saisonId: string | null; competitionLibelle: string | null; poule: string | null } => {
      const eq = equipeById.get(m.equipeDomId) ?? equipeById.get(m.equipeExtId);
      return {
        saisonId: m.saisonId ?? null,
        competitionLibelle: eq?.competitionLibelle ?? m.competition ?? null,
        poule: eq?.poule ?? m.poule ?? null,
      };
    };
    const champKey = (c: { saisonId: string | null; competitionLibelle: string | null; poule: string | null }) =>
      `${c.saisonId ?? ""}|${c.competitionLibelle ?? ""}|${c.poule ?? ""}`;

    // Stats par (arbitre, championnat).
    type ChampStats = {
      saisonId: string | null;
      saisonNom: string | null;
      anneeDebut: number;
      competitionLibelle: string | null;
      poule: string | null;
      matchsOfficies: number;
      matchsPrincipal: number;
      matchsAssistant: number;
      matchsAutre: number;
      cartonsJaunesDonnes: number;
      cartonsRougesDonnes: number;
      /** Un motif brut par carton (vide compris) : le decompte se fait ensuite, jamais en cours de route. */
      motifsBruts: string[];
      notes: number[];
    };
    const accChamp = new Map<string, ChampStats>(); // cle = arbitreId|champKey
    const accGlobal = new Map<string, {
      matchsOfficies: number;
      cartonsJaunesDonnes: number;
      cartonsRougesDonnes: number;
      motifsBruts: string[];
      notes: number[];
      roles: Set<string>;
      matchsPrincipal: number;
      matchsAssistant: number;
      matchsAutre: number;
    }>();
    const ensureG = (id: string) => {
      if (!accGlobal.has(id)) accGlobal.set(id, {
        matchsOfficies: 0, cartonsJaunesDonnes: 0, cartonsRougesDonnes: 0,
        motifsBruts: [], notes: [], roles: new Set(),
        matchsPrincipal: 0, matchsAssistant: 0, matchsAutre: 0,
      });
      return accGlobal.get(id)!;
    };

    const matchsById = new Map(matchs.map((m) => [m.id, m]));
    for (const am of arbMatchs) {
      const m = matchsById.get(am.matchId);
      if (!m) continue;
      const g = ensureG(am.arbitreId);
      g.matchsOfficies++;

      // Classification du role.
      const r = (am.role ?? "").toLowerCase();
      let roleNorm: "principal" | "assistant" | "autre" = "autre";
      if (r.includes("principal")) { roleNorm = "principal"; g.matchsPrincipal++; }
      else if (r.includes("assistant")) { roleNorm = "assistant"; g.matchsAssistant++; }
      else { g.matchsAutre++; }
      g.roles.add(roleNorm);

      const champ = cleChampionnat(m as any);
      const k = `${am.arbitreId}|${champKey(champ)}`;
      let c = accChamp.get(k);
      if (!c) {
        const s = champ.saisonId ? saisonById.get(champ.saisonId) : null;
        c = {
          saisonId: champ.saisonId,
          saisonNom: (s as any)?.nom ?? null,
          anneeDebut: (s as any)?.anneeDebut ?? 0,
          competitionLibelle: champ.competitionLibelle,
          poule: champ.poule,
          matchsOfficies: 0,
          matchsPrincipal: 0, matchsAssistant: 0, matchsAutre: 0,
          cartonsJaunesDonnes: 0, cartonsRougesDonnes: 0,
          motifsBruts: [], notes: [],
        };
        accChamp.set(k, c);
      }
      c.matchsOfficies++;
      if (roleNorm === "principal") c.matchsPrincipal++;
      else if (roleNorm === "assistant") c.matchsAssistant++;
      else c.matchsAutre++;

      // Cartons : seul le principal en distribue. Cumul global + par champ.
      if (roleNorm === "principal") {
        for (const e of (m as any).evenements ?? []) {
          if (e.type !== "carton") continue;
          if (e.sousType === "rouge") {
            g.cartonsRougesDonnes++; c.cartonsRougesDonnes++;
          } else {
            g.cartonsJaunesDonnes++; c.cartonsJaunesDonnes++;
          }
          // Un motif par carton, meme vide : le total des motifs doit retomber sur le total des cartons.
          g.motifsBruts.push(e.motif ?? "");
          c.motifsBruts.push(e.motif ?? "");
        }
      }
      if (am.note != null && (ownClubIds.has((m as any).clubDom) || ownClubIds.has((m as any).clubExt))) {
        g.notes.push(am.note);
        c.notes.push(am.note);
      }
    }

    // Helper : calcule profil + motifsTop + noteMoyenne a partir des stats.
    const deriveProfil = (matchsPrincipal: number, cj: number, cr: number) => {
      if (matchsPrincipal === 0) return null;
      const ratio = (cj + cr * 2) / matchsPrincipal;
      return ratio < 2 ? "Permissif" : ratio > 5 ? "Strict" : "Standard";
    };
    // Decompte complet des motifs (regroupes, cartons sans motif compris) + resume court pour les listes.
    const motifsDe = (bruts: string[]) => {
      const d = compterMotifs(bruts);
      return { motifs: d.motifs, cartonsSansMotif: d.sansMotif, motifsTop: resumeMotifs(d) };
    };
    const avgNote = (notes: number[]) => notes.length
      ? +(notes.reduce((s, x) => s + x, 0) / notes.length).toFixed(1)
      : null;

    // Construire la liste des participations par arbitre (groupees par champ).
    const partsByArbitre = new Map<string, any[]>();
    for (const [k, c] of accChamp) {
      const arbId = k.split("|", 1)[0];
      const arr = partsByArbitre.get(arbId) ?? [];
      arr.push({
        saisonId: c.saisonId,
        saisonNom: c.saisonNom,
        anneeDebut: c.anneeDebut,
        competitionLibelle: c.competitionLibelle,
        poule: c.poule,
        matchsOfficies: c.matchsOfficies,
        matchsPrincipal: c.matchsPrincipal,
        matchsAssistant: c.matchsAssistant,
        matchsAutre: c.matchsAutre,
        cartonsJaunesDonnes: c.cartonsJaunesDonnes,
        cartonsRougesDonnes: c.cartonsRougesDonnes,
        profil: deriveProfil(c.matchsPrincipal, c.cartonsJaunesDonnes, c.cartonsRougesDonnes),
        ...motifsDe(c.motifsBruts),
        noteMoyenne: avgNote(c.notes),
      });
      partsByArbitre.set(arbId, arr);
    }
    // Trier par saison decroissante puis competition.
    for (const arr of partsByArbitre.values()) {
      arr.sort((a, b) =>
        (b.anneeDebut ?? 0) - (a.anneeDebut ?? 0)
        || (a.competitionLibelle ?? "").localeCompare(b.competitionLibelle ?? "")
        || (a.poule ?? "").localeCompare(b.poule ?? ""),
      );
    }

    // Ecrire dans la table arbitres.
    const arbitres = await this.arbitresRepo.find();
    const toSave: any[] = [];
    for (const a of arbitres) {
      const g = accGlobal.get(a.id);
      if (!g) {
        toSave.push({
          ...a, matchsOfficies: 0,
          matchsPrincipal: 0, matchsAssistant: 0, matchsAutre: 0,
          roles: null,
          cartonsJaunesDonnes: 0, cartonsRougesDonnes: 0,
          profil: null, motifsTop: null, noteMoyenne: null,
          participations: null,
        });
        continue;
      }
      const ROLE_ORDER = ["principal", "assistant", "autre"];
      const roles = [...g.roles].sort((x, y) =>
        ROLE_ORDER.indexOf(x) - ROLE_ORDER.indexOf(y),
      ).join(",") || null;

      const participations = partsByArbitre.get(a.id) ?? [];
      toSave.push({
        ...a,
        matchsOfficies: g.matchsOfficies,
        matchsPrincipal: g.matchsPrincipal,
        matchsAssistant: g.matchsAssistant,
        matchsAutre: g.matchsAutre,
        roles,
        cartonsJaunesDonnes: g.cartonsJaunesDonnes,
        cartonsRougesDonnes: g.cartonsRougesDonnes,
        profil: deriveProfil(g.matchsPrincipal, g.cartonsJaunesDonnes, g.cartonsRougesDonnes),
        motifsTop: motifsDe(g.motifsBruts).motifsTop,
        noteMoyenne: avgNote(g.notes),
        participations: participations.length ? JSON.stringify(participations) : null,
      });
    }
    if (toSave.length) await this.arbitresRepo.save(toSave);
    return { arbitres: toSave.length };
  }

  /**
   * Recalcule les cumuls par coach (matchs presents, V/N/D, categorie,
   * cartons recus, motifs frequents).
   *
   * Detecte aussi les **changements de coach principal** pour chaque
   * club : ils sont remontes dans la structure retournee, pour
   * affichage cote front (rapport d'equipe).
   */
  async recomputeCoachs() {
    const [matchs, staffMatchs, coachs] = await Promise.all([
      this.matchs.find({ relations: ["evenements"] }),
      this.staffMatchsRepo.find(),
      this.coachsRepo.find(),
    ]);
    const matchById = new Map(matchs.map((m) => [m.id, m]));

    type Acc = {
      matchsPresent: number; v: number; n: number; d: number;
      fonctionsCounts: Record<string, number>; clubsCounts: Record<string, number>;
      cartonsJaunes: number; cartonsRouges: number;
      motifsBruts: string[];
    };
    const acc = new Map<string, Acc>();
    const ensure = (id: string): Acc => {
      if (!acc.has(id)) acc.set(id, {
        matchsPresent: 0, v: 0, n: 0, d: 0,
        fonctionsCounts: {}, clubsCounts: {},
        cartonsJaunes: 0, cartonsRouges: 0, motifsBruts: [],
      });
      return acc.get(id)!;
    };

    // Index des noms de coach par nom de famille normalise, pour rattacher
    // les cartons banc dont la cible est nommee dans le motif.
    const coachByNom = new Map<string, Coach[]>();
    for (const c of coachs) {
      const k = norm(c.nom);
      if (!coachByNom.has(k)) coachByNom.set(k, []);
      coachByNom.get(k)!.push(c);
    }

    for (const sm of staffMatchs) {
      const m = matchById.get(sm.matchId);
      if (!m) continue;
      const fonctions = (sm.fonctions ?? "").split("/").map((s) => s.trim().toUpperCase());
      // DR = delegue de rencontre, on l'ignore pour les cumuls coach.
      const fctValides = fonctions.filter((f) => f && f !== "DR");
      if (fctValides.length === 0) continue;

      const a = ensure(sm.coachId);
      a.matchsPresent++;
      a.clubsCounts[sm.cote === "dom" ? m.clubDom : m.clubExt] =
        (a.clubsCounts[sm.cote === "dom" ? m.clubDom : m.clubExt] ?? 0) + 1;
      for (const f of fctValides) {
        a.fonctionsCounts[f] = (a.fonctionsCounts[f] ?? 0) + 1;
      }
      // Resultat de l'equipe pour ce match.
      const bp = sm.cote === "dom" ? m.scoreDom : m.scoreExt;
      const bc = sm.cote === "dom" ? m.scoreExt : m.scoreDom;
      if (bp > bc) a.v++;
      else if (bp < bc) a.d++;
      else a.n++;
    }

    // Cartons recus par les coachs : on parcourt les evenements de type
    // "carton" dont le motif evoque le banc / l'entraineur, et on essaie
    // de rattacher au coach via son nom dans le motif.
    for (const m of matchs) {
      for (const e of m.evenements ?? []) {
        if (e.type !== "carton") continue;
        const motif = (e.motif ?? "").toLowerCase();
        if (!/banc|coach|educateur|éducateur|entraineur|entraîneur|dirigeant/i.test(motif)
            && !/banc|coach/i.test(e.joueur ?? "")) {
          continue;
        }
        // Cherche le coach : nom mentionne dans le joueur ou motif.
        const recherche = `${e.joueur ?? ""} ${e.motif ?? ""}`.toLowerCase();
        let match: Coach | null = null;
        for (const [nomKey, coachs] of coachByNom.entries()) {
          if (nomKey.length >= 3 && recherche.includes(nomKey)) {
            match = coachs[0];
            break;
          }
        }
        if (!match) continue;
        const a = ensure(match.id);
        if (e.sousType === "rouge") a.cartonsRouges++;
        else a.cartonsJaunes++;
        a.motifsBruts.push(e.motif ?? "");
      }
    }

    // Ecrire les cumuls.
    const toSave: any[] = [];
    for (const c of coachs) {
      const d = acc.get(c.id);
      if (!d) {
        toSave.push({ ...c, matchsPresent: 0, v: 0, n: 0, d: 0,
          cartonsJaunes: 0, cartonsRouges: 0,
          motifsTop: null, categorie: null });
        continue;
      }
      // Categorie : E majoritaire = "principal", A = "assistant",
      // M = "medecin", D = "dirigeant", sinon "autre".
      const topFct = Object.entries(d.fonctionsCounts)
        .sort((x, y) => y[1] - x[1])[0]?.[0] ?? "";
      const categorie =
        topFct === "E" ? "principal"
        : topFct === "A" ? "assistant"
        : topFct === "M" ? "medecin"
        : topFct === "D" ? "dirigeant"
        : "autre";
      // Club courant = celui ou il a accompagne le plus.
      const topClub = Object.entries(d.clubsCounts)
        .sort((x, y) => y[1] - x[1])[0]?.[0] ?? c.clubId ?? null;
      const motifsTop = resumeMotifs(compterMotifs(d.motifsBruts));
      toSave.push({
        ...c,
        matchsPresent: d.matchsPresent, v: d.v, n: d.n, d: d.d,
        cartonsJaunes: d.cartonsJaunes, cartonsRouges: d.cartonsRouges,
        categorie, clubId: topClub, motifsTop,
      });
    }
    if (toSave.length) await this.coachsRepo.save(toSave);

    // Detection des changements de coach principal par club :
    // pour chaque club, on liste ses matchs par ordre chronologique et on
    // regarde le coach E majoritaire de chaque match. Si different du
    // precedent, on signale un changement.
    type Changement = { clubId: string; date: string; avant: string; apres: string };
    const changements: Changement[] = [];
    // Index staff par match.
    const staffByMatch = new Map<string, StaffMatch[]>();
    for (const sm of staffMatchs) {
      if (!staffByMatch.has(sm.matchId)) staffByMatch.set(sm.matchId, []);
      staffByMatch.get(sm.matchId)!.push(sm);
    }
    const coachsById = new Map(coachs.map((c) => [c.id, c]));
    const matchsParClub = new Map<string, Match[]>();
    for (const m of matchs) {
      for (const cid of [m.clubDom, m.clubExt]) {
        if (!matchsParClub.has(cid)) matchsParClub.set(cid, []);
        matchsParClub.get(cid)!.push(m);
      }
    }
    for (const [clubId, ms] of matchsParClub.entries()) {
      ms.sort((a, b) => (a.date ?? "").localeCompare(b.date ?? ""));
      // Liste des coachs E identifies par match.
      const coachsEParMatch = ms.map((m) => {
        const cote: "dom" | "ext" = m.clubDom === clubId ? "dom" : "ext";
        const staff = (staffByMatch.get(m.id) ?? []).filter((sm) => sm.cote === cote);
        const principal = staff.find((sm) =>
          (sm.fonctions ?? "").split("/").map((s) => s.trim().toUpperCase()).includes("E"),
        );
        const id = principal?.coachId;
        const nom = id
          ? `${coachsById.get(id)?.prenom ?? ""} ${coachsById.get(id)?.nom ?? ""}`.trim()
          : null;
        return { match: m, coach: nom };
      });
      // Un changement n'est valide que si le nouveau coach reste au moins
      // 2 matchs consecutifs (sinon : absence ponctuelle).
      let prevCoach: string | null = null;
      for (let i = 0; i < coachsEParMatch.length; i++) {
        const { match: m, coach: nom } = coachsEParMatch[i];
        if (!nom) continue;
        if (prevCoach && nom !== prevCoach) {
          let consecutifs = 1;
          for (let j = i + 1; j < coachsEParMatch.length; j++) {
            const next = coachsEParMatch[j].coach;
            if (next == null) continue;
            if (next === nom) consecutifs++;
            break;
          }
          if (consecutifs >= 2) {
            changements.push({ clubId, date: m.date ?? "", avant: prevCoach, apres: nom });
            prevCoach = nom;
          }
        } else if (!prevCoach) {
          prevCoach = nom;
        }
      }
    }

    return { coachs: toSave.length, changements };
  }

  /**
   * Determine la journee de chaque match en fonction de sa date.
   *
   * Principe : la FMI ne contient pas la journee. On la deduit a partir
   * du calendrier observe par poule+competition :
   *
   * 1. On groupe les matchs par (competition, poule).
   * 2. Dans chaque groupe, on compte les equipes distinctes -> nbJournees
   *    = (n-1) * 2 pour un championnat aller-retour classique.
   * 3. On trie les dates uniques. Chaque "vague" temporelle = 1 journee.
   *    On considere que deux matchs dans une fenetre de 7 jours
   *    appartiennent a la meme journee (matchs reportes a la semaine
   *    suivante restent rattaches a leur journee d'origine).
   * 4. Si on a plus de "vagues" que de journees theoriques (a cause des
   *    reports), on reaffecte les vagues isolees a la journee la plus
   *    proche au-dessus en utilisant la moyenne des dates de chaque
   *    journee comme reference.
   */
  async recomputeJournees() {
    const matchs = await this.matchs.find();

    // Helper : parser DD/MM/YYYY ou YYYY-MM-DD en timestamp ms.
    const parseDate = (s: string | null | undefined): number | null => {
      if (!s) return null;
      let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) return new Date(+m[1], +m[2] - 1, +m[3]).getTime();
      m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
      if (m) return new Date(+m[3], +m[2] - 1, +m[1]).getTime();
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d.getTime();
    };

    // Groupe (saison, competition, poule) -> liste de matchs.
    // Inclure la saison evite que les matchs des memes poules sur deux
    // saisons differentes soient confondus dans le calcul des journees.
    const groupes = new Map<string, Match[]>();
    for (const m of matchs) {
      const key = `${m.saisonId ?? ""}::${m.competition ?? ""}::${m.poule ?? ""}`;
      if (!groupes.has(key)) groupes.set(key, []);
      groupes.get(key)!.push(m);
    }

    const toUpdate: Match[] = [];
    let totalAffectees = 0;

    for (const [key, ms] of groupes.entries()) {
      // Combien d'equipes distinctes ?
      const equipes = new Set<string>();
      for (const m of ms) {
        equipes.add(m.clubDom);
        equipes.add(m.clubExt);
      }
      const nbEquipes = equipes.size;
      // Bornes : aller-retour classique = (n-1)*2 journees max.
      const nbJourneesMax = Math.max(1, (nbEquipes - 1) * 2);

      // Trie les matchs par date croissante.
      const datedMatchs = ms
        .map((m) => ({ m, ts: parseDate(m.date) }))
        .filter((x): x is { m: Match; ts: number } => x.ts != null)
        .sort((a, b) => a.ts - b.ts);
      if (datedMatchs.length === 0) continue;

      // Regroupe les matchs en "vagues" : on demarre une nouvelle vague
      // des qu'un ecart > 4 jours separe deux matchs consecutifs (la
      // plupart des championnats amateur jouent en bloc le meme weekend).
      // Cela tolere les reports d'un dimanche au suivant dans la meme
      // journee.
      type Vague = { matchs: Match[]; debut: number; fin: number };
      const vagues: Vague[] = [];
      const ECART_VAGUE = 4 * 24 * 3600 * 1000;
      for (const { m, ts } of datedMatchs) {
        const derniereVague = vagues[vagues.length - 1];
        if (derniereVague && ts - derniereVague.fin <= ECART_VAGUE) {
          derniereVague.matchs.push(m);
          derniereVague.fin = ts;
        } else {
          vagues.push({ matchs: [m], debut: ts, fin: ts });
        }
      }

      // Cadence theorique : nb matchs par journee si toutes les equipes
      // jouent simultanement (= nbEquipes / 2). On en deduit le nombre
      // de journees REELLEMENT presentes en base.
      const matchsParJourneeTheorique = Math.max(1, Math.floor(nbEquipes / 2));
      const journeesEstimees = Math.max(1, Math.ceil(
        datedMatchs.length / matchsParJourneeTheorique,
      ));

      // Si on a exactement le bon nombre de vagues -> 1 vague = 1 journee.
      // C'est le cas dominant : tout le championnat sans report.
      if (vagues.length === journeesEstimees) {
        vagues.forEach((v, i) => {
          for (const m of v.matchs) {
            if (m.journee !== String(i + 1)) {
              m.journee = String(i + 1);
              toUpdate.push(m);
              totalAffectees++;
            }
          }
        });
        continue;
      }

      // Sinon : on a trop ou pas assez de vagues. On garde les
      // `journeesEstimees` plus grosses vagues comme principales, et
      // on rattache le reste a la journee la plus proche.
      const taillesTriees = [...vagues].sort(
        (a, b) => b.matchs.length - a.matchs.length
          || a.debut - b.debut,  // tiebreaker: plus ancienne d'abord
      );
      const vaguesPrincipales = taillesTriees
        .slice(0, journeesEstimees)
        .sort((a, b) => a.debut - b.debut);
      const vaguesReports = vagues.filter((v) => !vaguesPrincipales.includes(v));

      const journeeDeVague = new Map<typeof vagues[number], number>();
      vaguesPrincipales.forEach((v, i) => journeeDeVague.set(v, i + 1));

      for (const va of vaguesReports) {
        const milieuVa = (va.debut + va.fin) / 2;
        let bestJ = 1;
        let bestEcart = Infinity;
        for (const p of vaguesPrincipales) {
          const milieuP = (p.debut + p.fin) / 2;
          const delta = milieuVa - milieuP;
          // Favorise le passe (report apres la date prevue).
          const ec = delta >= 0 ? delta : -delta * 1.3;
          if (ec < bestEcart) {
            bestEcart = ec;
            bestJ = journeeDeVague.get(p)!;
          }
        }
        journeeDeVague.set(va, bestJ);
      }

      for (const v of vagues) {
        const j = String(journeeDeVague.get(v) ?? 1);
        for (const m of v.matchs) {
          if (m.journee !== j) {
            m.journee = j;
            toUpdate.push(m);
            totalAffectees++;
          }
        }
      }
    }

    if (toUpdate.length) {
      await this.matchs.save(toUpdate);
    }
    return { journees: totalAffectees, poules: groupes.size };
  }

  /** Reconstruit journees + effectifs + classement + arbitres + coachs. */
  /**
   * Backfill : pour chaque match sans saisonId ou equipeDomId/equipeExtId,
   * on les retrouve / cree depuis (date, competition, poule, clubs).
   * Utile pour les matchs anciens importes avant l'ajout des saisons.
   */
  async backfillSaisonEtEquipes() {
    const matchs = await this.matchs.find();
    if (matchs.length === 0) return { backfill: 0 };

    // Map saison par nom pour eviter les findOne repetes.
    const saisons = await this.saisonsRepo.find();
    const saisonByNom = new Map(saisons.map((s) => [s.nom, s]));
    const ensureSaisonForDate = async (dateStr: string | null) => {
      const debut = anneeDebutPourDate(dateStr);
      if (debut == null) return null;
      const nom = nomSaison(debut);
      let s = saisonByNom.get(nom);
      if (!s) {
        s = await this.saisonsRepo.save(this.saisonsRepo.create({
          nom, anneeDebut: debut, actif: false, statut: "en_cours",
        }));
        saisonByNom.set(nom, s);
      }
      return s;
    };

    // Cache des equipes par (clubId, competition, poule, saisonId).
    const equipes = await this.equipesRepo.find();
    const equipeKey = (clubId: string, comp: string | null, poule: string | null, sid: string | null) =>
      `${clubId}|${comp ?? ""}|${poule ?? ""}|${sid ?? ""}`;
    const equipeByKey = new Map<string, Equipe>();
    for (const e of equipes) {
      equipeByKey.set(
        equipeKey(e.clubId, e.competitionLibelle ?? null, e.poule ?? null, e.saisonId ?? null),
        e,
      );
    }
    const ensureEquipe = async (clubId: string, comp: string | null, poule: string | null, sid: string | null) => {
      const k = equipeKey(clubId, comp, poule, sid);
      let eq = equipeByKey.get(k);
      if (eq) return eq;
      const lib = comp ?? "";
      let categorie: string | null = null;
      let division: string | null = null;
      const mCat = lib.match(/(Seniors?|U\d{1,2}|Veterans?|Feminines?)/i);
      if (mCat) categorie = mCat[1];
      const mDivRegional = lib.match(/Regional\s*(\d)/i);
      const mDivDepart = lib.match(/Departemental\s*(\d)/i);
      const mDivCourt = lib.match(/\b(D\d|R\d|N\d|National\s*\d?|PHR|PH|DSR|DH)\b/i);
      if (mDivRegional) division = `R${mDivRegional[1]}`;
      else if (mDivDepart) division = `D${mDivDepart[1]}`;
      else if (mDivCourt) division = mDivCourt[1];
      const nomParts = [categorie, division, poule ? `Poule ${poule}` : ""].filter(Boolean);
      const nom = nomParts.length ? nomParts.join(" ") : (comp ?? "Equipe");
      eq = await this.equipesRepo.save(this.equipesRepo.create({
        clubId, nom,
        categorie: categorie ?? undefined, division: division ?? undefined,
        poule: poule ?? undefined, competitionLibelle: comp ?? undefined,
        saisonId: sid ?? undefined,
      }));
      equipeByKey.set(k, eq);
      return eq;
    };

    const toUpdate: Match[] = [];
    for (const m of matchs) {
      let changed = false;
      // Saison
      if (!m.saisonId) {
        const s = await ensureSaisonForDate(m.date);
        if (s) { m.saisonId = s.id; changed = true; }
      }
      // Equipes
      if (!m.equipeDomId) {
        const eq = await ensureEquipe(m.clubDom, m.competition ?? null, m.poule ?? null, m.saisonId ?? null);
        if (eq) { m.equipeDomId = eq.id; changed = true; }
      }
      if (!m.equipeExtId) {
        const eq = await ensureEquipe(m.clubExt, m.competition ?? null, m.poule ?? null, m.saisonId ?? null);
        if (eq) { m.equipeExtId = eq.id; changed = true; }
      }
      if (changed) toUpdate.push(m);
    }
    if (toUpdate.length) await this.matchs.save(toUpdate);
    return { backfill: toUpdate.length };
  }

  /**
   * Maintenance : les FMI importees AVANT la separation du tableau CARTON VERT (fair-play) ont range
   * ces cartons verts parmi les cartons JAUNES, sans motif. Ils gonflaient les jaunes des joueurs et des
   * arbitres, et donnaient "4 cartons annonces pour 2 motifs affiches". Toute sanction de la FMI porte un
   * motif : un carton jaune SANS motif est donc un carton vert mal range.
   *
   * SIMULATION par defaut (appliquer = false) : ne modifie rien. Apres application, les statistiques
   * (joueurs, arbitres, entraineurs) sont recalculees.
   */
  async reclasserCartonsVerts(appliquer = false) {
    const candidats = (await this.evenementsRepo.find({ where: { type: "carton" } }))
      .filter((e) => (e.sousType ?? "jaune") !== "rouge" && !(e.motif ?? "").trim());
    const total = await this.evenementsRepo.count({ where: { type: "carton" } });
    const rapport = {
      appliquer,
      cartonsAvantCorrection: total,
      cartonsVertsDetectes: candidats.length,
      matchsConcernes: new Set(candidats.map((e) => e.matchId)).size,
      exemples: candidats.slice(0, 8).map((e) => ({ matchId: e.matchId, joueur: e.joueur, minute: e.minute })),
      suite: appliquer
        ? "Statistiques recalculees."
        : "Simulation : rien n'a ete modifie. Relance avec ?appliquer=true pour reclasser ces cartons en cartons verts.",
    } as { [k: string]: any };
    if (!appliquer || candidats.length === 0) return rapport;

    await this.evenementsRepo.save(candidats.map((e) => ({ ...e, type: "carton_vert", sousType: "vert" })));
    rapport.recalcul = await this.rebuildAll();
    return rapport;
  }

  async rebuildAll() {
    const backfill = await this.backfillSaisonEtEquipes();
    const journees = await this.recomputeJournees();
    const joueurs = await this.recomputeJoueurs();
    const classement = await this.rebuildClassement();
    const arbitres = await this.recomputeArbitres();
    const coachs = await this.recomputeCoachs();
    return {
      ok: true,
      ...joueurs,
      classement: classement.length,
      arbitres: arbitres.arbitres,
      coachs: coachs.coachs,
      changementsCoachs: coachs.changements.length,
      journees: journees.journees,
      poules: journees.poules,
      backfill: backfill.backfill,
    };
  }
}

@Controller("derivation")
class DerivationController {
  constructor(private svc: DerivationService) {}

  // Reconstruit effectifs (tous clubs) + classement depuis les matchs.
  @Post("rebuild")
  rebuild() {
    return this.svc.rebuildAll();
  }

  @Post("joueurs")
  joueurs() {
    return this.svc.recomputeJoueurs();
  }

  @Post("classement")
  classement() {
    return this.svc.rebuildClassement();
  }

  // Maintenance (admin) : simulation par defaut, ?appliquer=true pour reclasser les cartons verts.
  @Post("maintenance/cartons-verts") @UseGuards(AdminGuard)
  cartonsVerts(@Query("appliquer") appliquer?: string) {
    return this.svc.reclasserCartonsVerts(appliquer === "true");
  }
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Joueur, Match, Composition, EvenementMatch, LigneClassement, Club,
      Entrainement, Blessure, Arbitre, ArbitreMatch, Coach, StaffMatch,
      Equipe, Saison,
    ]),
    AuthModule,
  ],
  controllers: [DerivationController],
  providers: [DerivationService],
  exports: [DerivationService],
})
export class DerivationModule {}
