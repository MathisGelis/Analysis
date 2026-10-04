// src/features/analyse/prematch.ts
//
// Briques PURES du rapport pre-match : profil chiffre d'une equipe, face-a-face, et "pistes"
// (ce qu'il faut retenir pour le match). Chaque piste est adossee a un chiffre et protegee par un
// seuil d'echantillon : on ne conclut jamais sur 2 matchs. Fonctions pures : testables sans base.

import { trierChronologiquement } from "@/common/dates";

import {
  bilan, Bilan, dynamiqueForme, Issue, issueDe, lieux, MatchTendance, MIN_MATCHS_LIEU, MIN_MATCHS_TENDANCE, series, SensTendance, TypeSerie,
} from "./tendances";

const fr = (x: number, d = 1) => x.toFixed(d).replace(".", ",");

/* --------------------------------- profil d'equipe --------------------------------- */

export interface ProfilEquipe {
  nom: string;
  /** Matchs joues pris en compte. */
  matchs: number;
  rang: number | null;
  pts: number | null;
  ppm: number;
  bpm: number;
  bcm: number;
  sens: SensTendance;
  attaque: SensTendance;
  defense: SensTendance;
  /** 0-100 ; null sous le seuil d'echantillon. */
  score: number | null;
  libelle: string;
  domicile: { joues: number; ppm: number };
  exterieur: { joues: number; ppm: number };
  /** Cinq derniers resultats, du plus ancien au plus recent. */
  formeRecente: Issue[];
  serie: { type: TypeSerie; longueur: number } | null;
}

/** Profil d'une equipe a partir de ses resultats (scores seuls). */
export function profilEquipe(nom: string, matchs: MatchTendance[], ligne?: { rang: number | null; pts: number | null }): ProfilEquipe {
  const ordonnes = trierChronologiquement(matchs);
  const f = dynamiqueForme(ordonnes);
  const l = lieux(ordonnes);
  const s = series(ordonnes).enCours.find((x) => x.longueur >= 3);
  return {
    nom, matchs: ordonnes.length,
    rang: ligne?.rang ?? null, pts: ligne?.pts ?? null,
    ppm: f.saison.ppm, bpm: f.saison.bpm, bcm: f.saison.bcm,
    sens: f.sens, attaque: f.attaque, defense: f.defense, score: f.score, libelle: f.libelle,
    domicile: { joues: l.domicile.joues, ppm: l.domicile.ppm },
    exterieur: { joues: l.exterieur.joues, ppm: l.exterieur.ppm },
    formeRecente: ordonnes.slice(-5).map((m) => issueDe(m.bp, m.bc)),
    serie: s ? { type: s.type, longueur: s.longueur } : null,
  };
}

/* ------------------------------- bilan de saison (rapport) ------------------------------ */

export interface BilanLieu { joues: number; v: number; n: number; d: number; bp: number; bc: number }

const bilanVide = (): BilanLieu => ({ joues: 0, v: 0, n: 0, d: 0, bp: 0, bc: 0 });

function cumuler(b: BilanLieu, m: Pick<MatchTendance, "bp" | "bc">): void {
  b.joues++; b.bp += m.bp; b.bc += m.bc;
  if (m.bp > m.bc) b.v++; else if (m.bp === m.bc) b.n++; else b.d++;
}

/** Bilan complet, a domicile et a l'exterieur, a partir des scores des matchs joues. */
export function bilanParLieu(matchs: Pick<MatchTendance, "domicile" | "bp" | "bc">[]): { total: BilanLieu; domicile: BilanLieu; exterieur: BilanLieu } {
  const total = bilanVide(), domicile = bilanVide(), exterieur = bilanVide();
  for (const m of matchs) { cumuler(total, m); cumuler(m.domicile ? domicile : exterieur, m); }
  return { total, domicile, exterieur };
}

/** Un match recent vu d'une equipe, pour la page "3 derniers matchs" du rapport. */
export interface MatchRecent {
  matchId: string; date: string | null; journee: string | null;
  /** Nom du club affronte. */
  adversaire: string;
  domicile: boolean; bp: number; bc: number; issue: Issue;
}

/* ----------------------------------- face-a-face ----------------------------------- */

export interface Rencontre {
  matchId: string;
  date: string | null;
  journee: string | null;
  saisonId?: string | null;
  /** Du point de vue de MON equipe. */
  domicile: boolean;
  bp: number;
  bc: number;
  issue: Issue;
}

/** Rencontres passees entre deux equipes : la plus recente d'abord, et le bilan vu de mon equipe. */
export function faceAFace(rencontres: Omit<Rencontre, "issue">[]): { rencontres: Rencontre[]; bilan: Bilan } {
  const chrono = trierChronologiquement(rencontres.map((r) => ({ ...r, issue: issueDe(r.bp, r.bc) })));
  return { rencontres: [...chrono].reverse(), bilan: bilan(chrono) };
}

/* ------------------------------------- pistes -------------------------------------- */

export interface Piste {
  /** atout : une ouverture pour nous ; vigilance : une menace ; info : un contexte utile. */
  ton: "atout" | "vigilance" | "info";
  importance: 1 | 2 | 3;
  titre: string;
  detail: string;
}

export interface EntreePistes {
  moi: ProfilEquipe;
  adv: ProfilEquipe;
  /** Lieu du match pour l'adversaire ; null si le match n'est pas programme. */
  advJoue: "domicile" | "exterieur" | null;
  advRapport: {
    scoreChaos: number;
    fatigueMoy: number | null;
    cartonsAvecMinute: number;
    partFinDeMatch: number | null;
    matchsSerres: number;
    matchsAnalyses: number;
    faiblesses: { niveau: "info" | "alerte" | "critique"; titre: string; detail: string }[];
  } | null;
  arbitre: { nom: string; profil: string | null; matchsPrincipal: number; cartonsParMatch: number } | null;
  faceAFace: { joues: number; v: number; n: number; d: number; derniere?: { bp: number; bc: number; domicile: boolean; issue: Issue } | null };
  /** Systeme de jeu probable de l'adversaire (voir features/analyse/systeme-probable.ts) ; null sans dispositif ni indice. */
  systeme?: {
    systeme: string; confiance: number; observations: number; fiabilite: "faible" | "moyenne" | "bonne";
    /** Dispositifs saisis, changements de numero, ou les deux. Absent : dispositifs saisis. */
    source?: "renseigne" | "numeros" | "mixte"; matchsNumeros?: number;
  } | null;
}

const LIBELLE_SERIE: Record<TypeSerie, string> = {
  victoires: "victoires de suite", invaincu: "matchs sans defaite", defaites: "defaites de suite",
  sans_victoire: "matchs sans victoire", sans_encaisser: "matchs sans encaisser",
  sans_marquer: "matchs sans marquer", marque: "matchs avec un but marque",
};

export function pistesPrematch(e: EntreePistes): Piste[] {
  const p: Piste[] = [];
  const { moi, adv } = e;
  const assez = adv.matchs >= MIN_MATCHS_TENDANCE;
  const add = (ton: Piste["ton"], importance: Piste["importance"], titre: string, detail: string) =>
    p.push({ ton, importance, titre, detail });

  // -- Niveau general : notre rythme contre le leur --
  if (assez && moi.matchs >= MIN_MATCHS_TENDANCE) {
    const ecart = moi.ppm - adv.ppm;
    if (ecart >= 0.5) add("atout", 2, "Nous sommes sur un meilleur rythme", `${fr(moi.ppm, 2)} points par match pour nous, ${fr(adv.ppm, 2)} pour ${adv.nom}.`);
    else if (ecart <= -0.5) add("vigilance", 3, "Adversaire sur un meilleur rythme", `${adv.nom} prend ${fr(adv.ppm, 2)} points par match, nous ${fr(moi.ppm, 2)}.`);
  }

  // -- Defense et attaque de l'adversaire --
  if (assez) {
    if (adv.bcm >= 1.8) add("atout", 3, "Defense permeable", `${adv.nom} encaisse ${fr(adv.bcm)} buts par match : chercher les situations de but.`);
    else if (adv.bcm <= 0.8) add("vigilance", 2, "Defense tres solide", `${adv.nom} n'encaisse que ${fr(adv.bcm)} but par match : patience et coups de pied arretes.`);
    if (adv.bpm >= 2.2) add("vigilance", 3, "Attaque prolifique", `${adv.nom} marque ${fr(adv.bpm)} buts par match : resserrer l'axe, limiter les espaces.`);
    else if (adv.bpm < 1.0) add("atout", 2, "Attaque en panne", `${adv.nom} ne marque que ${fr(adv.bpm)} but par match.`);
  }

  // -- Systeme de jeu probable : ce que le staff a renseigne et/ou ce que disent les changements de numero --
  if (e.systeme) {
    const { systeme, confiance, observations, fiabilite, source = "renseigne", matchsNumeros = 0 } = e.systeme;
    const mince = fiabilite === "faible" ? ", echantillon mince" : "";
    add("info", 2, `Systeme probable : ${systeme}`, source === "numeros"
      ? `Deduit des changements de numero sur ${matchsNumeros} feuille${matchsNumeros > 1 ? "s" : ""} de ${adv.nom} (aucun dispositif renseigne, ${confiance} % de confiance) : a confirmer.`
      : observations === 1
        ? `Vu sur le seul match renseigne de ${adv.nom}${source === "mixte" ? ", recoupe par les numeros de maillot" : ""} : a confirmer.`
        : `Retenu sur ${observations} matchs renseignes de ${adv.nom} (${confiance} % du poids)${source === "mixte" ? ", recoupes par les numeros de maillot" : ""}${mince}.`);
  }

  // -- Le lieu du match --
  if (e.advJoue) {
    const ici = e.advJoue === "domicile" ? adv.domicile : adv.exterieur;
    const ailleurs = e.advJoue === "domicile" ? adv.exterieur : adv.domicile;
    if (ici.joues >= MIN_MATCHS_LIEU && ailleurs.joues >= MIN_MATCHS_LIEU) {
      const ecart = ici.ppm - ailleurs.ppm;
      const lieu = e.advJoue === "domicile" ? "a domicile" : "a l'exterieur";
      if (ecart >= 0.6) add("vigilance", 2, `Redoutable ${lieu}`, `${fr(ici.ppm, 2)} points par match ${lieu}, contre ${fr(ailleurs.ppm, 2)} ailleurs.`);
      else if (ecart <= -0.6) add("atout", 2, `Moins a l'aise ${lieu}`, `${fr(ici.ppm, 2)} points par match ${lieu}, contre ${fr(ailleurs.ppm, 2)} ailleurs.`);
    }
  }

  // -- Dynamique et serie en cours --
  if (adv.sens === "hausse") add("vigilance", 2, "En confiance", `${adv.nom} est en progression sur ses derniers matchs (${adv.libelle.toLowerCase()}).`);
  else if (adv.sens === "baisse") add("atout", 2, "En perte de vitesse", `${adv.nom} recule sur ses derniers matchs (${adv.libelle.toLowerCase()}).`);
  if (adv.serie) {
    const bonne = adv.serie.type === "victoires" || adv.serie.type === "invaincu";
    const mauvaise = adv.serie.type === "defaites" || adv.serie.type === "sans_victoire";
    if (bonne) add("vigilance", 2, "Belle serie en cours", `${adv.serie.longueur} ${LIBELLE_SERIE[adv.serie.type]}.`);
    else if (mauvaise) add("atout", 2, "Serie difficile en cours", `${adv.serie.longueur} ${LIBELLE_SERIE[adv.serie.type]}.`);
  }

  // -- Ce que dit le rapport detaille de l'adversaire --
  const r = e.advRapport;
  if (r) {
    for (const f of r.faiblesses) {
      if (f.niveau === "info") continue;
      // Deja traitees ci-dessus a partir des chiffres bruts.
      if (/Defense permeable|efficacite offensive|Performance a domicile|Difficultes a l'exterieur/i.test(f.titre)) continue;
      if (/dependance/i.test(f.titre)) add("atout", 3, f.titre.replace(/^Forte d/i, "D"), f.detail);
      else add("atout", 1, f.titre, f.detail);
    }
    if (r.scoreChaos >= 65) add("info", 1, "Onze difficile a prevoir", `Indice de chaos de ${r.scoreChaos} sur 100 : beaucoup de rotation d'un match a l'autre.`);
    if (r.partFinDeMatch !== null && r.partFinDeMatch >= 0.35 && r.cartonsAvecMinute >= 8) {
      add("atout", 1, "Se crispe en fin de match", `${Math.round(r.partFinDeMatch * 100)} % de ses cartons tombent apres la 75e minute.`);
    }
    if (r.fatigueMoy !== null && r.fatigueMoy >= 60) {
      add("atout", 1, "Titulaires tres sollicites", `Fatigue estimee a ${r.fatigueMoy} sur 100 chez ses titulaires types (minutes jouees recemment).`);
    }
    if (r.matchsAnalyses >= 8 && r.matchsSerres / r.matchsAnalyses >= 0.5) {
      add("info", 1, "Matchs tres fermes", `${r.matchsSerres} de ses ${r.matchsAnalyses} matchs se jouent a un but : rester concentres jusqu'au bout.`);
    }
  }

  // -- Arbitre --
  if (e.arbitre && e.arbitre.matchsPrincipal >= 3) {
    const a = e.arbitre;
    if (a.profil === "Strict") add("vigilance", 1, "Arbitre severe", `${a.nom} distribue ${fr(a.cartonsParMatch)} cartons par match : eviter la contestation.`);
    else if (a.profil === "Permissif") add("info", 1, "Arbitre permissif", `${a.nom} distribue ${fr(a.cartonsParMatch)} cartons par match : jeu plus physique possible.`);
  }

  // -- Face-a-face --
  const f = e.faceAFace;
  if (f.joues > 0) {
    const d = f.derniere;
    const dernier = d ? ` Derniere rencontre : ${d.issue === "V" ? "victoire" : d.issue === "N" ? "nul" : "defaite"} ${d.bp}-${d.bc} ${d.domicile ? "a domicile" : "a l'exterieur"}.` : "";
    add("info", 1, "Historique des confrontations", `${f.v} victoire${f.v > 1 ? "s" : ""}, ${f.n} nul${f.n > 1 ? "s" : ""}, ${f.d} defaite${f.d > 1 ? "s" : ""} en ${f.joues} rencontre${f.joues > 1 ? "s" : ""}.${dernier}`);
  }

  return p.sort((a, b) => b.importance - a.importance).slice(0, 10);
}
