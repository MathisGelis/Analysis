// src/features/ia/ia-entrainement.ts
//
// L'ENTRAINEMENT : une marche avant dans le temps, sans jamais regarder l'avenir.
//
//   etape 1 (la premiere semaine de matchs) : on la decouvre ; rien a predire, personne n'a d'historique ;
//   etape 2 : on PREDIT les compos de toutes les rencontres de la semaine avec ce que l'on sait, on les compare a la
//             realite (les erreurs sont notees), puis on decouvre la semaine et on REAJUSTE le modele ;
//   etape 3 : meme chose, avec un modele qui a deja appris des etapes precedentes ;  et ainsi de suite.
//
// Aucune fuite : la prediction d'un match n'utilise que les feuilles STRICTEMENT anterieures de la meme equipe, et des
// poids appris sur les semaines STRICTEMENT anterieures. Le score final est donc celui qu'aurait obtenu le modele s'il avait
// ete utilise en direct pendant toute la periode.
//
// Plusieurs jeux d'hyperparametres (taille de fenetre, regularisation, oubli) sont essayes ; on garde celui dont la perte
// logarithmique est la plus basse. Fonctions pures (l'acces a la base est dans ia.service.ts).

import { fusionnerSystemes } from "@/features/analyse/systeme-probable";
import { predireSysteme as predireSystemeSaisi } from "@/features/matchs/systeme";

import type { FeuilleEquipe, JeuDonnees, ResumeDonnees } from "./ia-donnees";
import {
  Agregat, Agregats, agregatsVides, arrondi, Methode, METHODES, noter, PrevisionPlate, previsionsDeReference, ResumeNote, resumerTous,
} from "./ia-evaluation";
import {
  compterSysteme, exemplesNumeros, exemplesTitularisation, FrequencesSysteme, frequencesVides, Hyper, HYPER_PAR_DEFAUT,
  numerosDeFeuilleExploitables, poidsInitiaux, PoidsIa, predireOnze, predireSysteme, preparerCandidats, preparerSysteme, Preparation,
  PreparationSysteme, structureDuSysteme,
} from "./ia-modele";
import { ajusterChoix, ajusterLogistique, ExempleBinaire, ExempleChoix } from "./ia-maths";

/** Les jeux d'hyperparametres essayes par un entrainement complet. */
export const GRILLE_COMPLETE: readonly Hyper[] = [
  { fenetre: 6, l2: 0.3, demiVie: null }, { fenetre: 6, l2: 3, demiVie: null },
  { fenetre: 10, l2: 0.3, demiVie: null }, { fenetre: 10, l2: 3, demiVie: null },
  { fenetre: 14, l2: 0.3, demiVie: null }, { fenetre: 14, l2: 3, demiVie: null },
  { fenetre: 10, l2: 0.3, demiVie: 12 }, { fenetre: 10, l2: 3, demiVie: 12 },
];

/** Sous ce nombre de dispositifs saisis, le modele de dispositif reste a ses poids de depart. */
export const MIN_DISPOSITIFS_APPRIS = 8;
const MAX_EXEMPLES_TITULAIRES = 30_000;
const MAX_EXEMPLES_NUMEROS = 4_000;
const MAX_EXEMPLES_SYSTEME = 5_000;
/** Pour chaque feuille, au plus ce nombre de feuilles precedentes de l'equipe sont relues. */
export const HISTORIQUE_MAX = 30;
const REFERENCE_FENETRE = 10;

export class DonneesInsuffisantes extends Error {}

export interface Progression { pourcentage: number; message: string }

export interface OptionsEntrainement {
  /** Les essais ; `[HYPER_PAR_DEFAUT]` pour un seul passage. */
  grille?: readonly Hyper[];
  progression?: (p: Progression) => void;
  /** Rend la main a la boucle d'evenements entre deux etapes (le serveur reste reactif). */
  cooperer?: () => Promise<void>;
  /** Vrai : l'entrainement est interrompu (leve une erreur). */
  annule?: () => boolean;
  /**
   * Le modele actif, a mesurer face au nouveau sur les semaines que ni l'un ni l'autre n'a apprises avant de predire :
   * celles qui suivent la derniere semaine vue par le modele actif (`apres`, lundi en ms). Le nouveau les predit en marche
   * avant (poids appris sur le passe), l'actif les predit avec ses poids figes : meme matchs, meme historique, aucune fuite.
   */
  reference?: { id: string; nom: string; poids: PoidsIa; apres: number };
}

/* ----------------------------------------- resultats ----------------------------------------- */

export interface PointCourbe {
  etape: number;
  libelle: string;
  journees: string;
  /** Feuilles notees cette semaine-la. */
  n: number;
  modele: { onze: number | null; postes: number | null };
  dernier: { onze: number | null; postes: number | null };
  moteur: { onze: number | null; postes: number | null };
  frequence: { onze: number | null; postes: number | null };
  /** Perte logarithmique de la titularisation cette semaine-la (plus bas = mieux). */
  perte: number | null;
}

export interface ErreurFeuille {
  matchId: string;
  etape: number;
  date: string;
  journee: string | null;
  equipe: string;
  adversaire: string;
  domicile: boolean;
  /** Part des 11 titulaires reels predits. */
  onze: number;
  /** Titulaires reels que le modele n'avait pas retenus : sa probabilite, ou null si le joueur lui etait inconnu. */
  manques: { nom: string; proba: number | null }[];
  /** Joueurs predits titulaires qui ne l'etaient pas. */
  fauxPositifs: { nom: string; proba: number }[];
}

/** Un joueur que le modele lit mal : ses probabilites annoncees d'un match a l'autre et ce qui s'est passe. */
export interface JoueurDifficile {
  nom: string;
  equipe: string;
  /** Matchs de son equipe ou il etait candidat. */
  matchs: number;
  /** Probabilite moyenne de titularisation annoncee. */
  probaMoyenne: number;
  /** Fois ou il a vraiment commence. */
  titularisations: number;
  /** Perte logarithmique moyenne (0,69 = un pile ou face : on ne sait rien de lui). */
  perteMoyenne: number;
}

export interface ResumeSysteme {
  /** Matchs dont le dispositif saisi a servi de verite. */
  n: number;
  /** Part de bons dispositifs (premier choix), et dans les trois premiers. */
  modele: { top1: number | null; top3: number | null; defense: number | null };
  moteur: { top1: number | null; top3: number | null; defense: number | null };
  dernier: { top1: number | null; top3: number | null; defense: number | null };
  frequent: { top1: number | null; top3: number | null; defense: number | null };
}

export interface BandeCalibration { de: number; a: number; n: number; probaMoyenne: number | null; tauxObserve: number | null }

export interface ResultatEssai {
  hyper: Hyper;
  /** Perte logarithmique moyenne de la titularisation sur toutes les predictions (plus bas = mieux). */
  perte: number | null;
  poids: PoidsIa;
  /** Sur toute la periode, et sur le dernier tiers des semaines (le modele a alors beaucoup appris). */
  global: Record<Methode, ResumeNote>;
  recent: Record<Methode, ResumeNote>;
  courbe: PointCourbe[];
  parSaison: Record<string, Record<Methode, ResumeNote>>;
  /** Part des titulaires reels dont le joueur etait inconnu de l'equipe (nouveaux : imprevisibles). */
  nouveaux: number | null;
  /** Feuilles sans aucun historique : rien a predire. */
  sansHistorique: number;
  systeme: ResumeSysteme | null;
  /** Face au modele actif (absent : aucun modele actif a l'epoque, ou essai leger). */
  comparaison: ComparaisonActif | null;
  calibration: BandeCalibration[];
  pires: ErreurFeuille[];
  /** Les joueurs les plus difficiles a lire (au moins 6 matchs), du plus au moins difficile. */
  difficiles: JoueurDifficile[];
  /** Mises en garde en clair (peu de donnees, numeros peu fiables...). */
  alertes: string[];
}

/** Ce que vaut un modele sur les feuilles de la comparaison. */
export interface MesureComparaison { onze: number | null; postes: number | null; perte: number | null }

/** Le nouveau modele face au modele actif, sur les semaines posterieures a celles que l'actif avait vues. */
export interface ComparaisonActif {
  actif: { id: string; nom: string };
  /** Premiere semaine comparee. */
  depuis: string;
  semaines: number;
  /** Feuilles predites par les deux. */
  feuilles: number;
  nouveau: MesureComparaison;
  ancien: MesureComparaison;
}

export interface ResultatEntrainement extends ResultatEssai {
  donnees: ResumeDonnees;
  /** Nom de chaque saison citee (identifiant -> "2025-2026") ; ajoute par le service qui connait la base. */
  saisons?: Record<string, string>;
  /** Tous les essais, du meilleur au moins bon. */
  essais: { hyper: Hyper; perte: number | null; onze: number | null; postes: number | null }[];
  dureeMs: number;
}

/* --------------------------------------- preparation --------------------------------------- */

interface SystemePrepare {
  prep: PreparationSysteme;
  /** Indice du dispositif saisi parmi les candidats, -1 s'il n'en fait pas partie. */
  vrai: number;
  label: string;
  refs: { moteur: string | null; dernier: string | null; frequent: string | null };
}

interface Commun {
  refs: Record<Exclude<Methode, "modele">, PrevisionPlate | null>;
  systeme: SystemePrepare | null;
  /** Ce que le modele actif voit de l'equipe (sa propre fenetre d'historique), pour les semaines de la comparaison. */
  prepActif: Preparation | null;
}

interface FeuillePreparee {
  feuille: FeuilleEquipe;
  etape: number;
  prep: Preparation;
  commun: Commun;
}

/** Les `k` feuilles les plus recentes d'une equipe, la plus recente d'abord. */
const recentes = (liste: readonly FeuilleEquipe[], k: number) => liste.slice(-k).reverse();

/**
 * Passe chronologique du jeu de donnees pour un jeu d'hyperparametres : pour chaque feuille, ce que l'on savait de son
 * equipe juste avant le match. `communs` (references, dispositifs) ne depend pas des hyperparametres : calcule une fois.
 */
function preparer(
  jeu: JeuDonnees, fenetre: number, communsExistants: Commun[] | null, reference: OptionsEntrainement["reference"] = undefined,
): { prepares: FeuillePreparee[]; communs: Commun[] } {
  const historiques = new Map<string, FeuilleEquipe[]>();
  const frequences: FrequencesSysteme = frequencesVides();
  const prepares: FeuillePreparee[] = [];
  const communs: Commun[] = communsExistants ?? [];
  let i = 0;

  for (const etape of jeu.etapes) {
    for (const f of etape.feuilles) {
      const hist = historiques.get(f.equipe) ?? historiques.set(f.equipe, []).get(f.equipe)!;
      const passe = recentes(hist, HISTORIQUE_MAX);
      const prep = preparerCandidats(passe, f.saisonId, fenetre);
      if (!communsExistants) {
        const refs = previsionsDeReference(passe, REFERENCE_FENETRE);
        let systeme: SystemePrepare | null = null;
        if (f.formation) {
          const sp = preparerSysteme(passe, frequences);
          const observations = passe.filter((x) => x.formation).map((x) => ({ date: x.date, systeme: x.formation! }));
          const frequent = [...frequences.effectifs].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] ?? null;
          systeme = {
            prep: sp, label: f.formation, vrai: sp.candidats.indexOf(f.formation),
            refs: {
              moteur: fusionnerSystemes(predireSystemeSaisi(observations), sp.numeros)?.systeme ?? null,
              dernier: sp.dernierSaisi, frequent,
            },
          };
        }
        const prepActif = reference && etape.debut > reference.apres ? preparerCandidats(passe, f.saisonId, reference.poids.hyper.fenetre) : null;
        communs.push({ refs, systeme, prepActif });
      }
      prepares.push({ feuille: f, etape: etape.indice, prep, commun: communs[i] });
      hist.push(f);
      i++;
    }
    // Les frequences generales des dispositifs ne se mettent a jour qu'a la fin de la semaine (pas de fuite dans la semaine).
    for (const f of etape.feuilles) if (f.formation) compterSysteme(frequences, f.formation);
  }
  return { prepares, communs };
}

/* ------------------------------------------- un essai ------------------------------------------- */

const BANDES = 10;
const perteBinaire = (p: number, y: number) => -(y * Math.log(Math.max(p, 1e-9)) + (1 - y) * Math.log(Math.max(1 - p, 1e-9)));

interface Contexte {
  jeu: JeuDonnees;
  options: OptionsEntrainement;
  /** Position de l'essai dans la grille et nombre d'essais (pour la progression). */
  essai: number;
  essais: number;
  /** Fourchette de progression (en %) occupee par cette serie d'essais. */
  debut: number;
  fin: number;
  /**
   * Essai leger : seule la titularisation apprend. Les numeros et le dispositif n'influencent pas la perte sur laquelle
   * on choisit les hyperparametres (la titularisation ne depend d'eux en rien) : les apprendre pour chacun des essais
   * serait du temps perdu. Le gagnant est ensuite rejoue en entier.
   */
  leger: boolean;
}

async function essayer(hyper: Hyper, prepares: FeuillePreparee[], ctx: Contexte): Promise<ResultatEssai> {
  const depart = poidsInitiaux(hyper);
  const priorT = depart.titularisation.w;
  const priorN = depart.numeros.w;
  const priorS = depart.systeme!.w;
  let wT = [...priorT];
  let wN = [...priorN];
  let wS = [...priorS];
  const poidsCourants = (): PoidsIa => ({
    ...depart, titularisation: { noms: depart.titularisation.noms, w: wT }, numeros: { noms: depart.numeros.noms, w: wN },
    systeme: { noms: depart.systeme!.noms, w: wS },
  });
  // Les poids repartent de ceux de l'etape precedente : deux ou trois pas de Newton suffisent.
  const optionsAjust = { l2: hyper.l2, iterations: 3 };

  const poolT: { e: ExempleBinaire; etape: number }[] = [];
  const poolN: { e: ExempleChoix; etape: number }[] = [];
  const poolS: { e: ExempleChoix; etape: number }[] = [];

  const global = agregatsVides();
  const parEtape: Agregats[] = [];
  const parSaison = new Map<string, Agregats>();
  const courbe: PointCourbe[] = [];
  let sommePerte = 0;
  let nPerte = 0;
  let inconnus = 0;
  let evaluees = 0;
  let sansHistorique = 0;
  const calibrage = Array.from({ length: BANDES }, () => ({ n: 0, somme: 0, vrais: 0 }));
  const pires: ErreurFeuille[] = [];
  const lectures = new Map<string, { nom: string; equipe: string; n: number; proba: number; titu: number; perte: number }>();
  const compteSysteme = () => ({ top1: 0, top3: 0, defense: 0 });
  const stats = { n: 0, modele: compteSysteme(), moteur: compteSysteme(), dernier: compteSysteme(), frequent: compteSysteme() };
  const nDefense = (x: string | null, vrai: string) => (x && structureDuSysteme(x).defense === structureDuSysteme(vrai).defense ? 1 : 0);

  // Comparaison au modele actif : memes feuilles (semaines posterieures a celles qu'il avait vues), les deux sans fuite.
  const reference = ctx.leger ? undefined : ctx.options.reference;
  const cmp = {
    semaines: new Set<number>(), premiere: null as string | null,
    nouveau: new Agregat(), ancien: new Agregat(), perteNouveau: 0, perteAncien: 0, nPerteNouveau: 0, nPerteAncien: 0,
  };

  const parEtapeIndice = new Map<number, FeuillePreparee[]>();
  for (const p of prepares) (parEtapeIndice.get(p.etape) ?? parEtapeIndice.set(p.etape, []).get(p.etape)!).push(p);

  let faites = 0;
  for (const etape of ctx.jeu.etapes) {
    if (ctx.options.annule?.()) throw new Error("Entrainement annule");
    const feuilles = parEtapeIndice.get(etape.indice) ?? [];
    const agregats = agregatsVides();
    let perteEtape = 0;
    let nPerteEtape = 0;
    const poids = poidsCourants();
    const nouveauxT: { e: ExempleBinaire; etape: number }[] = [];
    const nouveauxN: { e: ExempleChoix; etape: number }[] = [];
    const nouveauxS: { e: ExempleChoix; etape: number }[] = [];

    for (const p of feuilles) {
      const f = p.feuille;
      const reels = f.lignes.filter((l) => l.titulaire);
      const reelsIds = new Set(reels.map((l) => l.joueur));
      const numerosOk = numerosDeFeuilleExploitables(reels);

      // 1) La prediction, avec les poids d'avant la semaine.
      const pred = p.prep.candidats.length > 0 ? predireOnze(poids, p.prep) : null;
      if (!pred) sansHistorique++;
      else {
        evaluees++;
        const prevision: PrevisionPlate = new Map(pred.titulaires.map((t) => [t.joueur, t.numero]));
        const notes = {
          modele: noter(prevision, f.lignes),
          dernier: p.commun.refs.dernier ? noter(p.commun.refs.dernier, f.lignes) : null,
          moteur: p.commun.refs.moteur ? noter(p.commun.refs.moteur, f.lignes) : null,
          frequence: p.commun.refs.frequence ? noter(p.commun.refs.frequence, f.lignes) : null,
        };
        const saison = parSaison.get(f.saisonId ?? "?") ?? parSaison.set(f.saisonId ?? "?", agregatsVides()).get(f.saisonId ?? "?")!;
        for (const m of METHODES) {
          const note = notes[m];
          if (!note) continue;
          agregats[m].ajouter(note); global[m].ajouter(note); saison[m].ajouter(note);
        }

        // Le meme match, predit par le modele actif avec ses poids figes (seulement les semaines qu'il n'avait pas vues).
        const predActif = reference && p.commun.prepActif && p.commun.prepActif.candidats.length > 0 ? predireOnze(reference.poids, p.commun.prepActif) : null;
        if (predActif) {
          cmp.semaines.add(etape.indice);
          cmp.premiere ??= etape.libelle;
          cmp.nouveau.ajouter(notes.modele);
          cmp.ancien.ajouter(noter(new Map(predActif.titulaires.map((t) => [t.joueur, t.numero])), f.lignes));
          for (const c of p.commun.prepActif!.candidats) {
            cmp.perteAncien += perteBinaire(predActif.probas.get(c.joueur)!, reelsIds.has(c.joueur) ? 1 : 0); cmp.nPerteAncien++;
          }
        }

        // Qualite des probabilites (perte logarithmique, calibration) sur tous les candidats.
        for (const c of p.prep.candidats) {
          const y = reelsIds.has(c.joueur) ? 1 : 0;
          const pr = pred.probas.get(c.joueur)!;
          const perte = perteBinaire(pr, y);
          sommePerte += perte; nPerte++; perteEtape += perte; nPerteEtape++;
          if (predActif) { cmp.perteNouveau += perte; cmp.nPerteNouveau++; }
          const cle = `${f.equipe}|${c.joueur}`;
          const l = lectures.get(cle) ?? lectures.set(cle, { nom: c.nom, equipe: f.libelleEquipe, n: 0, proba: 0, titu: 0, perte: 0 }).get(cle)!;
          l.n++; l.proba += pr; l.titu += y; l.perte += perte;
          const bande = calibrage[Math.min(BANDES - 1, Math.floor(pr * BANDES))];
          bande.n++; bande.somme += pr; bande.vrais += y;
        }

        // Les erreurs : qui n'etait pas prevu, qui l'etait a tort.
        const connus = new Set(p.prep.candidats.map((c) => c.joueur));
        const predits = new Set(pred.titulaires.map((t) => t.joueur));
        const manques = reels.filter((l) => !predits.has(l.joueur)).map((l) => ({ nom: l.nom, proba: connus.has(l.joueur) ? +pred.probas.get(l.joueur)!.toFixed(3) : null }));
        const fauxPositifs = pred.titulaires.filter((t) => !reelsIds.has(t.joueur)).map((t) => ({ nom: t.nom, proba: +t.proba.toFixed(3) }));
        inconnus += reels.filter((l) => !connus.has(l.joueur)).length;
        if (manques.length > 0) {
          pires.push({
            matchId: f.matchId, etape: etape.indice, date: f.date, journee: f.journee, equipe: f.libelleEquipe, adversaire: f.adversaire,
            domicile: f.domicile, onze: +notes.modele.onze.toFixed(3), manques, fauxPositifs,
          });
          if (pires.length > 200) { pires.sort((a, b) => a.onze - b.onze || a.date.localeCompare(b.date)); pires.length = 60; }
        }
      }

      // 2) Le dispositif, la ou le staff l'a saisi.
      const sys = p.commun.systeme;
      if (sys) {
        const prevS = predireSysteme(wS, sys.prep);
        if (prevS) {
          stats.n++;
          const top3 = prevS.classement.slice(0, 3).map((c) => c.systeme);
          stats.modele.top1 += prevS.systeme === sys.label ? 1 : 0;
          stats.modele.top3 += top3.includes(sys.label) ? 1 : 0;
          stats.modele.defense += nDefense(prevS.systeme, sys.label);
          for (const k of ["moteur", "dernier", "frequent"] as const) {
            const v = sys.refs[k];
            stats[k].top1 += v === sys.label ? 1 : 0;
            stats[k].defense += nDefense(v, sys.label);
          }
        }
        if (!ctx.leger && sys.vrai >= 0) nouveauxS.push({ e: { phi: sys.prep.phi, vrai: sys.vrai, s: 1 }, etape: etape.indice });
      }

      // 3) Ce que cette feuille apprendra au modele (utilise a la fin de la semaine, pas avant).
      if (p.prep.candidats.length > 0) {
        for (const e of exemplesTitularisation(p.prep, reelsIds)) nouveauxT.push({ e, etape: etape.indice });
        if (!ctx.leger && numerosOk && p.prep.numerosExploitables) {
          for (const e of exemplesNumeros(p.prep, reels)) nouveauxN.push({ e, etape: etape.indice });
        }
      }
    }

    // 4) La semaine est decouverte : on reajuste le modele sur tout ce qu'il a vu.
    poolT.push(...nouveauxT); poolN.push(...nouveauxN); poolS.push(...nouveauxS);
    if (poolT.length > MAX_EXEMPLES_TITULAIRES) poolT.splice(0, poolT.length - MAX_EXEMPLES_TITULAIRES);
    if (poolN.length > MAX_EXEMPLES_NUMEROS) poolN.splice(0, poolN.length - MAX_EXEMPLES_NUMEROS);
    if (poolS.length > MAX_EXEMPLES_SYSTEME) poolS.splice(0, poolS.length - MAX_EXEMPLES_SYSTEME);
    const oubli = (etapeExemple: number) => (hyper.demiVie ? 0.5 ** ((etape.indice - etapeExemple) / hyper.demiVie) : 1);
    if (nouveauxT.length > 0) {
      for (const x of poolT) x.e.s = oubli(x.etape);
      wT = ajusterLogistique(poolT.map((x) => x.e), wT, priorT, optionsAjust);
    }
    if (nouveauxN.length > 0) {
      for (const x of poolN) x.e.s = oubli(x.etape);
      wN = ajusterChoix(poolN.map((x) => x.e), wN, priorN, optionsAjust);
    }
    if (nouveauxS.length > 0 && poolS.length >= MIN_DISPOSITIFS_APPRIS) {
      for (const x of poolS) x.e.s = oubli(x.etape);
      wS = ajusterChoix(poolS.map((x) => x.e), wS, priorS, optionsAjust);
    }
    for (const f of feuilles) if (f.feuille.formation) compterFrequence(depart, f.feuille.formation);

    parEtape.push(agregats);
    courbe.push({
      etape: etape.indice, libelle: etape.libelle, journees: etape.journees, n: agregats.modele.n,
      modele: { onze: arrondi(agregats.modele.onze), postes: arrondi(agregats.modele.postes) },
      dernier: { onze: arrondi(agregats.dernier.onze), postes: arrondi(agregats.dernier.postes) },
      moteur: { onze: arrondi(agregats.moteur.onze), postes: arrondi(agregats.moteur.postes) },
      frequence: { onze: arrondi(agregats.frequence.onze), postes: arrondi(agregats.frequence.postes) },
      perte: nPerteEtape ? arrondi(perteEtape / nPerteEtape) : null,
    });
    faites++;
    ctx.options.progression?.({
      pourcentage: Math.round(ctx.debut + (ctx.fin - ctx.debut) * ((ctx.essai + faites / ctx.jeu.etapes.length) / ctx.essais)),
      message: `Essai ${ctx.essai + 1}/${ctx.essais} : ${etape.libelle} (${faites}/${ctx.jeu.etapes.length})`,
    });
    if (ctx.options.cooperer) await ctx.options.cooperer();
  }

  // Le dernier tiers des semaines notees : le modele a alors beaucoup appris.
  const avecPredictions = parEtape.map((a, i) => ({ a, i })).filter(({ a }) => a.modele.n > 0);
  const debutRecent = avecPredictions[Math.floor((avecPredictions.length * 2) / 3)]?.i ?? 0;
  const recent = agregatsVides();
  for (const { a, i } of avecPredictions) if (i >= debutRecent) for (const m of METHODES) recent[m].fusionner(a[m]);

  const frequencesFinales = depart.frequencesSysteme;
  const systemeAppris = poolS.length >= MIN_DISPOSITIFS_APPRIS;
  const poidsFinaux: PoidsIa = {
    ...poidsCourants(), frequencesSysteme: frequencesFinales,
    systeme: systemeAppris ? { noms: depart.systeme!.noms, w: wS } : null,
    // Le dispositif appris ne sert en direct que s'il a fait au moins aussi bien que le moteur a regles, sur les memes matchs.
    systemeRetenu: systemeAppris && stats.n > 0 && stats.modele.top1 >= stats.moteur.top1,
  };

  const mesure = (a: Agregat, perte: number, n: number): MesureComparaison => ({ onze: arrondi(a.onze), postes: arrondi(a.postes), perte: n ? arrondi(perte / n) : null });
  const comparaison: ComparaisonActif | null = reference && cmp.nouveau.n > 0 ? {
    actif: { id: reference.id, nom: reference.nom }, depuis: cmp.premiere!, semaines: cmp.semaines.size, feuilles: cmp.nouveau.n,
    nouveau: mesure(cmp.nouveau, cmp.perteNouveau, cmp.nPerteNouveau), ancien: mesure(cmp.ancien, cmp.perteAncien, cmp.nPerteAncien),
  } : null;

  // Une reference ne propose qu'un dispositif : pas de "dans les trois premiers".
  const rapport = (k: "modele" | "moteur" | "dernier" | "frequent") => ({
    top1: stats.n ? arrondi(stats[k].top1 / stats.n) : null,
    top3: stats.n && k === "modele" ? arrondi(stats[k].top3 / stats.n) : null,
    defense: stats.n ? arrondi(stats[k].defense / stats.n) : null,
  });

  const alertes: string[] = [];
  if (evaluees < 30) alertes.push(`Seulement ${evaluees} compositions predites : trop peu pour que les moyennes soient fiables.`);
  if (global.modele.nPostes < Math.max(10, evaluees / 4)) alertes.push("Peu de feuilles aux numeros lisibles (convention des postes) : la precision par poste est peu significative.");
  if (stats.n > 0 && stats.n < 20) alertes.push(`Seulement ${stats.n} dispositifs saisis : la lecture du systeme reste indicative.`);
  if (systemeAppris && !poidsFinaux.systemeRetenu) alertes.push("Le modele de dispositif a fait moins bien que le moteur a regles sur les memes matchs : il n'est pas utilise en direct.");

  return {
    hyper, perte: nPerte ? arrondi(sommePerte / nPerte) : null, poids: poidsFinaux,
    global: resumerTous(global), recent: resumerTous(recent), courbe,
    parSaison: Object.fromEntries([...parSaison].map(([id, a]) => [id, resumerTous(a)])),
    nouveaux: evaluees ? arrondi(inconnus / (evaluees * 11)) : null, sansHistorique,
    systeme: stats.n > 0 ? { n: stats.n, modele: rapport("modele"), moteur: rapport("moteur"), dernier: rapport("dernier"), frequent: rapport("frequent") } : null,
    comparaison,
    calibration: calibrage.map((b, i) => ({
      de: i / BANDES, a: (i + 1) / BANDES, n: b.n,
      probaMoyenne: b.n ? arrondi(b.somme / b.n) : null, tauxObserve: b.n ? arrondi(b.vrais / b.n) : null,
    })),
    pires: pires.sort((a, b) => a.onze - b.onze || a.date.localeCompare(b.date) || a.matchId.localeCompare(b.matchId)).slice(0, 30),
    difficiles: [...lectures.values()].filter((l) => l.n >= 6)
      .map((l) => ({ nom: l.nom, equipe: l.equipe, matchs: l.n, probaMoyenne: arrondi(l.proba / l.n)!, titularisations: l.titu, perteMoyenne: arrondi(l.perte / l.n)! }))
      .sort((a, b) => b.perteMoyenne - a.perteMoyenne || b.matchs - a.matchs || a.nom.localeCompare(b.nom) || a.equipe.localeCompare(b.equipe))
      .slice(0, 12),
    alertes,
  };
}

function compterFrequence(poids: PoidsIa, systeme: string): void {
  poids.frequencesSysteme[systeme] = (poids.frequencesSysteme[systeme] ?? 0) + 1;
}

/* --------------------------------------- l'entrainement --------------------------------------- */

/** Premier jeu d'hyperparametres comparable : meilleure perte, puis meilleure precision. */
const meilleur = (a: ResultatEssai, b: ResultatEssai) =>
  (a.perte ?? Infinity) - (b.perte ?? Infinity) || (b.global.modele.onze ?? 0) - (a.global.modele.onze ?? 0);

export async function entrainer(jeu: JeuDonnees, options: OptionsEntrainement = {}): Promise<ResultatEntrainement> {
  const debut = Date.now();
  if (jeu.etapes.length < 2) {
    throw new DonneesInsuffisantes(`Il faut au moins deux semaines de matchs datees pour apprendre en predisant la suivante (${jeu.etapes.length} trouvee${jeu.etapes.length > 1 ? "s" : ""}).`);
  }
  const grille = options.grille?.length ? options.grille : [HYPER_PAR_DEFAUT];
  options.progression?.({ pourcentage: 2, message: `Preparation de ${jeu.resume.feuilles} feuilles sur ${jeu.etapes.length} semaines` });

  let communs: Commun[] | null = null;
  const parFenetre = new Map<number, FeuillePreparee[]>();
  for (const h of grille) {
    if (parFenetre.has(h.fenetre)) continue;
    const { prepares, communs: c } = preparer(jeu, h.fenetre, communs, options.reference);
    communs = c;
    parFenetre.set(h.fenetre, prepares);
    if (options.cooperer) await options.cooperer();
  }
  options.progression?.({ pourcentage: 10, message: "Preparation terminee" });

  const commun = { jeu, options };
  let gagnant: ResultatEssai;
  let essais: ResultatEntrainement["essais"];
  if (grille.length > 1) {
    // Phase 1 : tous les jeux d'hyperparametres, en essai leger ; on garde celui de perte la plus basse.
    const legers: ResultatEssai[] = [];
    for (const [i, h] of grille.entries()) {
      legers.push(await essayer(h, parFenetre.get(h.fenetre)!, { ...commun, essai: i, essais: grille.length, debut: 10, fin: 60, leger: true }));
    }
    legers.sort(meilleur);
    // Phase 2 : le gagnant, entierement : les numeros et le dispositif apprennent aussi, toutes les mesures sont faites.
    gagnant = await essayer(legers[0].hyper, parFenetre.get(legers[0].hyper.fenetre)!, { ...commun, essai: 0, essais: 1, debut: 60, fin: 100, leger: false });
    essais = legers.map((r, i) => ({
      hyper: r.hyper, perte: r.perte, onze: r.global.modele.onze, postes: i === 0 ? gagnant.global.modele.postes : null,
    }));
  } else {
    gagnant = await essayer(grille[0], parFenetre.get(grille[0].fenetre)!, { ...commun, essai: 0, essais: 1, debut: 10, fin: 100, leger: false });
    essais = [{ hyper: gagnant.hyper, perte: gagnant.perte, onze: gagnant.global.modele.onze, postes: gagnant.global.modele.postes }];
  }
  if (gagnant.global.modele.n === 0) {
    throw new DonneesInsuffisantes("Aucune composition n'a pu etre predite : aucune equipe n'a d'historique avant l'un de ses matchs.");
  }
  options.progression?.({ pourcentage: 100, message: "Entrainement termine" });
  return { ...gagnant, donnees: jeu.resume, dureeMs: Date.now() - debut, essais };
}

/* ---------------------------------------- resume d'un modele ---------------------------------------- */

/** Ce que la liste des modeles affiche, sans charger tout le resultat de l'entrainement. */
export interface ResumeModele {
  hyper: Hyper;
  feuilles: number;
  semaines: number;
  /** Compositions predites (hors premiere apparition de chaque equipe). */
  predictions: number;
  onze: number | null;
  postes: number | null;
  /** La meilleure methode de reference sur le meme perimetre, et son nom. */
  referenceOnze: number | null;
  reference: Exclude<Methode, "modele"> | null;
  perte: number | null;
  systemeAppris: boolean;
  /** Le dispositif appris a fait au moins aussi bien que le moteur a regles : il sert en direct avec ce modele. */
  systemeRetenu: boolean;
  /** Lundi (ms UTC) de la derniere semaine de matchs que ce modele a vue : la limite de ce qu'il a appris. */
  derniereSemaine: number | null;
}

export function resumeDuResultat(r: ResultatEntrainement): ResumeModele {
  const refs = (["dernier", "moteur", "frequence"] as const).filter((m) => r.global[m].onze !== null);
  const meilleureRef = refs.sort((a, b) => (r.global[b].onze ?? 0) - (r.global[a].onze ?? 0))[0] ?? null;
  return {
    hyper: r.hyper, feuilles: r.donnees.feuilles, semaines: r.donnees.etapes, predictions: r.global.modele.n,
    onze: r.global.modele.onze, postes: r.global.modele.postes,
    referenceOnze: meilleureRef ? r.global[meilleureRef].onze : null, reference: meilleureRef,
    perte: r.perte, systemeAppris: r.poids.systeme !== null, systemeRetenu: r.poids.systemeRetenu === true,
    derniereSemaine: r.donnees.derniereSemaine,
  };
}
