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

import { Controller, Injectable, Module, Post } from "@nestjs/common";
import { InjectRepository, TypeOrmModule } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import {
  Arbitre, ArbitreMatch, Blessure, Club, Coach, Composition, Entrainement,
  Equipe, EvenementMatch, Joueur, LigneClassement, Match, Saison, StaffMatch,
} from "@/entities";

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
            numeroCounts: {}, lastMatchDate: null, subIns: 0,
          };
          agg.set(k, a);
        }
        a.matchs++;
        if (c.titulaire) a.titularisations++;
        a.minutes += estimateMinutes(c, evts);
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

    // ---- Donnees additionnelles pour le calcul du score de forme ----
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

    // Pour le calcul ACWR (Acute:Chronic Workload Ratio) :
    //   - Acute  = somme des charges des 7 derniers jours
    //   - Chronic = somme des charges sur 28 jours / 4 (moyenne hebdo)
    // On inclut entrainements (charge calculee) ET matchs (charge
    // estimee par minutes_jouees x RPE_match avec RPE_match = 7.5 par
    // defaut, valeur litteraire).
    //
    // References :
    //   - Gabbett T.J. (2016), Br J Sports Med — sweet spot ACWR 0.8-1.3
    //   - Hulin B.T. et al. (2016), Br J Sports Med — danger > 1.5
    //   - Catapult / Buchheit M. (2017) — fenetres 7j / 28j
    const now = new Date();
    const FENETRE_AIGUE = 7;       // jours
    const FENETRE_CHRONIQUE = 28;  // jours
    const RPE_MATCH_DEFAUT = 7.5;  // ressenti match officiel moyen (Foster scale)

    const chargeAcuteParJoueur = new Map<string, number>();
    const chargeChroniqueParJoueur = new Map<string, number>();
    const dernierTrainingParJoueur = new Map<string, Date>();

    // Entrainements : utilise t.charge deja calcule par EntrainementsService.
    for (const t of trainings) {
      const d = parseDateAny(t.date);
      if (!d) continue;
      const age = daysBetween(now, d);
      if (age > FENETRE_CHRONIQUE) continue;
      for (const pid of (t.joueursPresents ?? [])) {
        if (age <= FENETRE_AIGUE) {
          chargeAcuteParJoueur.set(pid,
            (chargeAcuteParJoueur.get(pid) ?? 0) + (t.charge ?? 0));
        }
        chargeChroniqueParJoueur.set(pid,
          (chargeChroniqueParJoueur.get(pid) ?? 0) + (t.charge ?? 0));
        const prev = dernierTrainingParJoueur.get(pid);
        if (!prev || d > prev) dernierTrainingParJoueur.set(pid, d);
      }
    }

    // Matchs : charge approchee par minutes x RPE_MATCH_DEFAUT pour
    // chaque joueur ayant une composition dans le match. Cette charge
    // est cruciale : un joueur qui joue 90' apporte ~675 UA-RPE (= au
    // moins un gros entrainement), donc l'ignorer fausserait l'ACWR.
    const matchsForCharge = await this.matchs.find({ relations: ["compositions"] });
    for (const m of matchsForCharge) {
      const d = parseDateAny(m.date);
      if (!d) continue;
      const age = daysBetween(now, d);
      if (age > FENETRE_CHRONIQUE) continue;
      for (const c of m.compositions ?? []) {
        if (!c.licence) continue;
        // Match par licence via l'index deja construit.
        const j = idxLic.get(`lic:${c.licence}`);
        if (!j) continue;
        const minutes = c.minutes ?? 0;
        if (minutes <= 0) continue;
        const chargeMatch = minutes * RPE_MATCH_DEFAUT;
        if (age <= FENETRE_AIGUE) {
          chargeAcuteParJoueur.set(j.id,
            (chargeAcuteParJoueur.get(j.id) ?? 0) + chargeMatch);
        }
        chargeChroniqueParJoueur.set(j.id,
          (chargeChroniqueParJoueur.get(j.id) ?? 0) + chargeMatch);
      }
    }

    // Helpers ACWR.
    //   acute = somme 7j
    //   chronic = (somme 28j) / 4  (moyenne hebdomadaire)
    //   acwr = acute / chronic. Garde-fou : si chronic == 0 mais acute > 0,
    //   c'est un debut de saison -> acwr arbitraire haute (1.5).
    const acwrParJoueur = (pid: string): {
      acute: number; chronic: number; acwr: number | null;
    } => {
      const acute = chargeAcuteParJoueur.get(pid) ?? 0;
      const chronique28 = chargeChroniqueParJoueur.get(pid) ?? 0;
      const chronic = chronique28 / 4;
      let acwr: number | null;
      if (chronic <= 0) acwr = acute > 0 ? 1.5 : null;
      else acwr = +(acute / chronic).toFixed(2);
      return { acute, chronic, acwr };
    };

    // Score de fatigue 0-100 derive de l'ACWR. Courbe en S inversee :
    //   acwr < 0.5  -> 10-25  (sous-entraine, fatigue artificiellement basse)
    //   acwr 0.5-0.8-> 25-45  (sous-charge)
    //   acwr 0.8-1.3-> 45-65  (sweet spot, fatigue normale)
    //   acwr 1.3-1.5-> 65-80  (vigilance)
    //   acwr > 1.5  -> 80-95  (surcharge / risque blessure)
    const scoreFatigueFromAcwr = (acwr: number | null): number | null => {
      if (acwr == null) return null;
      if (acwr < 0.5) return Math.round(10 + (acwr / 0.5) * 15);
      if (acwr < 0.8) return Math.round(25 + ((acwr - 0.5) / 0.3) * 20);
      if (acwr < 1.3) return Math.round(45 + ((acwr - 0.8) / 0.5) * 20);
      if (acwr < 1.5) return Math.round(65 + ((acwr - 1.3) / 0.2) * 15);
      return Math.min(95, Math.round(80 + Math.min(15, (acwr - 1.5) * 30)));
    };

    // Blessures actuelles et historiques par joueur (id et nom).
    const blesseActif = new Set<string>(); // joueur id
    const blessuresParJoueur = new Map<string, number>();
    const blessuresParNom = new Map<string, number>();
    for (const b of blessuresAll) {
      blessuresParJoueur.set(b.joueurId, (blessuresParJoueur.get(b.joueurId) ?? 0) + 1);
      if (b.joueurNom) {
        const k = norm(b.joueurNom);
        blessuresParNom.set(k, (blessuresParNom.get(k) ?? 0) + 1);
      }
      const enCours = b.statut && /indisp|reprise|suspendu/i.test(b.statut);
      if (enCours) blesseActif.add(b.joueurId);
    }

    // Calcul score "mon effectif"
    // NOTE : on n'inclut PAS les cartons jaunes — c'est un score de forme
    // physique, pas de discipline. Seuls les rouges (suspension = inactivite
    // forcee) impactent. L'ecart titu / remplacant est marque.
    const scoreMine = (
      a: Agg,
      found: Joueur | null,
    ): number => {
      const pid = found?.id;
      const { acute, chronic, acwr } = pid ? acwrParJoueur(pid) : { acute: 0, chronic: 0, acwr: null };
      const dernAct: Date | null =
        (pid ? dernierTrainingParJoueur.get(pid) ?? null : null) ??
        a.lastMatchDate;
      const joursSansAct = dernAct ? daysBetween(now, dernAct) : 30;
      const blessuresAnt = pid ? blessuresParJoueur.get(pid) ?? 0
        : blessuresParNom.get(norm(a.nom)) ?? 0;
      const blessureEnCours = pid ? blesseActif.has(pid) : false;

      // Bonus charge : on prefere un joueur qui a un ACWR dans le sweet
      // spot (0.8-1.3). Bonus max +25 a acwr = 1.0, decroit symetriquement.
      let bonusCharge = 0;
      if (acwr != null) {
        const optimum = 1.0;
        const ecart = Math.abs(acwr - optimum) / optimum;
        bonusCharge = Math.max(0, 25 * (1 - ecart * ecart));
      }

      const score =
        45
        + bonusCharge                 // courbe en cloche autour de ACWR = 1.0
        + a.minutes * 0.03            // volume de jeu total
        + a.titularisations * 1.8     // ecart titu / remplacant explicite
        - Math.max(0, a.matchs - a.titularisations) * 0.6
        - joursSansAct * 1.4
        - (blessureEnCours ? 30 : 0)
        - blessuresAnt * 4
        - a.cr * 5;                   // rouge = suspension
      return Math.round(clamp(score, 0, 100));
    };

    // Calcul score "adversaire" (scouting) :
    // ecart titu/remplacant fortement marque ; jaunes ignores.
    const scoreOpponent = (a: Agg): number => {
      const score =
        30
        + a.titularisations * 5       // titu fortement valorise
        + a.subIns * 1.2
        - a.cr * 12;
      return Math.round(clamp(score, 0, 100));
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
      const noteMoyenne = Math.round((5.5 + a.matchs * 0.04 - a.cr * 0.5) * 10) / 10;

      const found =
        (a.licence && idxLic.get(`lic:${a.licence}`)) ||
        idxName.get(nameKey(a.nom, a.prenom, a.clubId));

      const isMine = ownClubIds.has(a.clubId);
      const scoreForme = isMine ? scoreMine(a, found ?? null) : scoreOpponent(a);
      // ACWR + score fatigue : calcules seulement pour les joueurs "miens"
      // (on n'a pas la charge entrainement des adversaires).
      const acwrData = (isMine && found?.id) ? acwrParJoueur(found.id) : null;
      const scoreFatigue = acwrData ? scoreFatigueFromAcwr(acwrData.acwr) : null;

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
        blessuresAnt: (() => {
          if (found?.id) return blessuresParJoueur.get(found.id) ?? 0;
          return blessuresParNom.get(norm(a.nom)) ?? 0;
        })(),
        noteMoyenne,
        scoreForme,
        scoreFatigue,
        acwr: acwrData?.acwr ?? null,
        chargeAcute7j: acwrData ? +acwrData.acute.toFixed(1) : null,
        chargeChronic28j: acwrData ? +acwrData.chronic.toFixed(1) : null,
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
      motifsCount: Record<string, number>;
      notes: number[];
    };
    const accChamp = new Map<string, ChampStats>(); // cle = arbitreId|champKey
    const accGlobal = new Map<string, {
      matchsOfficies: number;
      cartonsJaunesDonnes: number;
      cartonsRougesDonnes: number;
      motifsCount: Record<string, number>;
      notes: number[];
      roles: Set<string>;
      matchsPrincipal: number;
      matchsAssistant: number;
      matchsAutre: number;
    }>();
    const ensureG = (id: string) => {
      if (!accGlobal.has(id)) accGlobal.set(id, {
        matchsOfficies: 0, cartonsJaunesDonnes: 0, cartonsRougesDonnes: 0,
        motifsCount: {}, notes: [], roles: new Set(),
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
          motifsCount: {}, notes: [],
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
          const motif = (e.motif ?? "").trim();
          if (motif) {
            g.motifsCount[motif] = (g.motifsCount[motif] ?? 0) + 1;
            c.motifsCount[motif] = (c.motifsCount[motif] ?? 0) + 1;
          }
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
    const top3Motifs = (motifsCount: Record<string, number>) =>
      Object.entries(motifsCount)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 3)
        .map(([m, c]) => `${m} (${c})`)
        .join(" · ") || null;
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
        motifsTop: top3Motifs(c.motifsCount),
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
        motifsTop: top3Motifs(g.motifsCount),
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
      motifsCount: Record<string, number>;
    };
    const acc = new Map<string, Acc>();
    const ensure = (id: string): Acc => {
      if (!acc.has(id)) acc.set(id, {
        matchsPresent: 0, v: 0, n: 0, d: 0,
        fonctionsCounts: {}, clubsCounts: {},
        cartonsJaunes: 0, cartonsRouges: 0, motifsCount: {},
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
        const cleanMotif = (e.motif ?? "").trim();
        if (cleanMotif) a.motifsCount[cleanMotif] = (a.motifsCount[cleanMotif] ?? 0) + 1;
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
      const motifsTop = Object.entries(d.motifsCount)
        .sort((x, y) => y[1] - x[1]).slice(0, 3)
        .map(([m, n]) => `${m} (${n})`).join(" · ") || null;
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
      if (!dateStr) return null;
      let year: number | null = null;
      let month: number | null = null;
      let m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (m) { year = +m[1]; month = +m[2]; }
      else {
        m = dateStr.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
        if (m) { year = +m[3]; month = +m[2]; }
      }
      if (year == null || month == null) return null;
      const debut = month >= 7 ? year : year - 1;
      const nom = `${debut}-${debut + 1}`;
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
}

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Joueur, Match, Composition, EvenementMatch, LigneClassement, Club,
      Entrainement, Blessure, Arbitre, ArbitreMatch, Coach, StaffMatch,
      Equipe, Saison,
    ]),
  ],
  controllers: [DerivationController],
  providers: [DerivationService],
  exports: [DerivationService],
})
export class DerivationModule {}
