// src/features/analyse/rapport-pptx-contenu.ts
//
// CONTENU DU RAPPORT D'AVANT-MATCH en presentation : pour chacune des 15 pages (les 7 du modele du staff et 8 pages
// d'analyse ajoutees dans son style), les textes a ecrire a partir du rapport pre-match. Rien n'est invente : une
// information inconnue (heure de convocation, surface du terrain, style de jeu, ambiance...) donne un champ VIDE, que le
// staff complete dans PowerPoint. Les chiffres et les constats viennent tous du rapport ; rien n'est coupe quand la page
// peut le contenir. Fonctions pures, sans XML : l'ecriture dans le modele est dans rapport-pptx.ts.

import { parseDateFlexible } from "@/common/dates";
import { ligneDuNumero, posteDuNumero } from "@/features/matchs/numeros-postes";

import { Piste } from "./prematch";
import { RapportPrematch } from "./prematch.service";
import { ContenuAnalyse, contenuAnalyse } from "./rapport-pptx-analyse";

/* ----------------------------------------- pages ----------------------------------------- */

/** Toutes les pages, dans l'ordre de la presentation. */
export const PAGES_RAPPORT = [
  "couverture", "match", "saison", "comparatif", "forme", "forces", "pistes", "dispositif", "systeme", "onze", "polyvalence", "joueurs",
  "face", "ambiance", "cles",
] as const;
export type PageRapport = (typeof PAGES_RAPPORT)[number];

/** Les sept pages du modele du staff. */
export const PAGES_MODELE = ["couverture", "match", "saison", "forces", "dispositif", "ambiance", "cles"] as const;
export type PageModele = (typeof PAGES_MODELE)[number];
export const estPageModele = (p: PageRapport): p is PageModele => (PAGES_MODELE as readonly string[]).includes(p);

/** Les pages d'analyse ajoutees, dans le style du modele. */
export type PageAnalyse = Exclude<PageRapport, PageModele>;
export const PAGES_ANALYSE = PAGES_RAPPORT.filter((p): p is PageAnalyse => !estPageModele(p));

/** Les pages au choix : de quoi construire le selecteur (titre, contenu et groupe de chacune). */
export const DESCRIPTION_PAGES: Readonly<Record<PageRapport, { titre: string; contenu: string; groupe: "modele" | "analyse" }>> = {
  couverture: { titre: "Couverture", contenu: "Adversaire, journee, date, lieu et classement", groupe: "modele" },
  match: { titre: "Le match", contenu: "Coup d'envoi, convocation, adresse, enjeu et terrain", groupe: "modele" },
  saison: { titre: "Leur saison", contenu: "Classement, bilan, derniers matchs, domicile / exterieur, cartons, buteur", groupe: "modele" },
  comparatif: { titre: "Nous contre eux", contenu: "Comparatif chiffre des deux equipes et projection du resultat", groupe: "analyse" },
  forme: { titre: "Forme & dynamique", contenu: "Forme recente, series, leurs 5 derniers matchs et constats chiffres", groupe: "analyse" },
  forces: { titre: "Forces & faiblesses", contenu: "Leurs forces, leurs faiblesses et ce qu'il faut exploiter", groupe: "modele" },
  pistes: { titre: "Pistes pour le match", contenu: "Toutes les pistes chiffrees, atouts, vigilances et contexte", groupe: "analyse" },
  dispositif: { titre: "Dispositif attendu", contenu: "Systeme probable, onze sur le terrain, joueurs a surveiller", groupe: "modele" },
  systeme: { titre: "Pourquoi ce systeme ?", contenu: "Confiance, source, alternatives et indices tires des numeros de maillot", groupe: "analyse" },
  onze: { titre: "Onze probable par poste", contenu: "Un joueur par numero (1 a 11), titularisations et autres candidats", groupe: "analyse" },
  polyvalence: { titre: "Changements de numero", contenu: "Joueurs qui changent de numero (donc de poste) et numeros portes", groupe: "analyse" },
  joueurs: { titre: "Joueurs cles & discipline", contenu: "Danger, stabilite, fatigue, joueurs cles, buteurs et cartons", groupe: "analyse" },
  face: { titre: "Face-a-face & arbitre", contenu: "Toutes les rencontres passees et le profil de l'arbitre", groupe: "analyse" },
  ambiance: { titre: "Ambiance & infos", contenu: "Public, dernieres confrontations, arbitrage, infos pratiques", groupe: "modele" },
  cles: { titre: "Nos 3 cles du match", contenu: "Trois consignes et le message du coach", groupe: "modele" },
};

/**
 * Pages demandees (liste separee par des virgules), dans l'ordre de la presentation. Absent : toutes. Une page inconnue,
 * ou aucune page : `{ erreur }`.
 */
export function lirePages(valeur: string | string[] | undefined | null): PageRapport[] | { erreur: string } {
  if (valeur === undefined || valeur === null) return [...PAGES_RAPPORT];
  const demandees = (Array.isArray(valeur) ? valeur : valeur.split(",")).map((p) => p.trim()).filter((p) => p !== "");
  const inconnues = demandees.filter((p) => !(PAGES_RAPPORT as readonly string[]).includes(p));
  if (inconnues.length > 0) return { erreur: `Page inconnue : ${inconnues.join(", ")} (pages : ${PAGES_RAPPORT.join(", ")})` };
  if (demandees.length === 0) return { erreur: "Choisissez au moins une page." };
  return PAGES_RAPPORT.filter((p) => demandees.includes(p));
}

/* ---------------------------------------- contenu ---------------------------------------- */

export interface ContenuRapport extends ContenuAnalyse {
  /** Pied de page : "CLUB EQUIPE". */
  libelleEquipe: string;
  couverture: { entete: string; club: string; affiche: string; date: string; lieu: string; classement: string };
  match: { jour: string; convocation: string; adresse: string; enjeu: string; surface: string; dimensions: string; etat: string; aSavoir: string };
  saison: {
    classement: string; points: string; vnd: string; bp: string; bc: string;
    derniers: { issue: "V" | "N" | "D"; libelle: string; score: string }[];
    domicile: [string, string, string]; exterieur: [string, string, string];
    jaunes: string; rouges: string; buteur: string;
  };
  /** `taille` : police des puces en centiemes de point (plus il y a de puces, plus elle est petite pour tenir dans la carte). */
  forces: { forces: string[]; faiblesses: string[]; exploiter: string; taille: number; espaceAvant: number };
  dispositif: {
    systeme: string | null; titre: string; source: string;
    /** Nom a ecrire sous chaque numero du terrain (vide : numero sans joueur probable). */
    noms: Record<number, string>;
    surveiller: { numero: string; titre: string; detail: string }[];
  };
  ambiance: { publicAmbiance: string; confrontations: string[]; arbitrage: string; infos: string };
  /** `taille` : police des trois cles, en centiemes de point (plus le texte est long, plus elle est petite). */
  cles: { cles: [string, string, string]; message: string; taille: number };
}

const JOURS_COURTS = ["Dim.", "Lun.", "Mar.", "Mer.", "Jeu.", "Ven.", "Sam."];
const JOURS = ["Dimanche", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi"];

const rang = (n: number | null | undefined): string => (typeof n !== "number" ? "" : n === 1 ? "1er" : `${n}e`);
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

/** "03/10" d'une date jj/mm/aaaa ou ISO ; vide si illisible. */
function jourMois(date: string | null | undefined): string {
  const t = parseDateFlexible(date);
  if (t === null) return "";
  const d = new Date(t);
  return `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "20:00" -> "20h00" (ou "20h" pour la couverture) ; vide si illisible. */
function heure(h: string | null | undefined, court = false): string {
  const m = (h ?? "").trim().match(/^(\d{1,2})\s*[:hH]\s*(\d{2})?$/);
  if (!m) return "";
  const mm = m[2] ?? "00";
  return court && mm === "00" ? `${+m[1]}h` : `${+m[1]}h${mm}`;
}

function jourDate(date: string | null | undefined, longs: boolean): string {
  const t = parseDateFlexible(date);
  if (t === null) return "";
  return `${(longs ? JOURS : JOURS_COURTS)[new Date(t).getUTCDay()]} ${jourMois(date)}`;
}

/** Coupe a la limite sur une fin de mot ("..." ajoute) : jamais un mot tronque. */
export function couper(texte: string, max: number): string {
  const t = texte.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const coupe = t.slice(0, max - 3);
  const espace = coupe.lastIndexOf(" ");
  // Un mot unique plus long que la limite est coupe franchement.
  return `${coupe.slice(0, espace >= Math.floor(max / 2) ? espace : coupe.length).replace(/[\s,;:.-]+$/, "")}...`;
}

/** Nom de famille tel que la feuille l'ecrit (en majuscules) ; a defaut le nom entier. */
function nomDeFamille(nom: string): string {
  return nom.split(" ").filter((m) => m.length > 1 && m === m.toUpperCase()).join(" ") || nom;
}

const cle = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();

/**
 * Les puces d'une carte de la page "Forces & faiblesses" (hauteur utile 125 pt, largeur 257 pt) : la plus grande police
 * dans laquelle tout le texte tient, sans rien couper. Si meme la plus petite ne suffit pas, les textes sont coupes.
 */
export function ajusterPuces(colonnes: string[][]): { colonnes: string[][]; taille: number; espaceAvant: number } {
  const hauteur = (textes: string[], taille: number, espace: number) => {
    const caracteresParLigne = Math.floor(257 / (0.52 * (taille / 100)));
    const lignes = textes.reduce((s, t) => s + Math.max(1, Math.ceil(t.length / caracteresParLigne)), 0);
    return lignes * (taille / 100) * 1.2 + Math.max(0, textes.length - 1) * (espace / 100);
  };
  for (const [taille, espace] of [[1300, 1000], [1200, 800], [1100, 600], [1000, 500], [900, 400]] as const) {
    if (colonnes.every((c) => hauteur(c, taille, espace) <= 125)) return { colonnes, taille, espaceAvant: espace };
  }
  // Rien ne tient : on coupe, la page "Pistes pour le match" porte le texte entier.
  return { colonnes: colonnes.map((c) => c.map((t) => couper(t, 130))), taille: 900, espaceAvant: 400 };
}

/** Police des trois cles du dernier ecran (cartes de 165 pt de large) : plus le texte est long, plus elle est petite. */
export function tailleCles(textes: string[]): number {
  const max = Math.max(0, ...textes.map((t) => t.length));
  return max <= 80 ? 1400 : max <= 110 ? 1200 : max <= 150 ? 1100 : 1000;
}

export function contenuRapport(r: RapportPrematch): ContenuRapport {
  const moi = r.monEquipe, adv = r.adversaire, m = r.match;
  const lieu = m ? (m.domicile ? "Domicile" : "Extérieur") : "";
  const journee = (m?.journee ?? "").trim();
  const journeeCourte = /^\d+$/.test(journee) ? `J${journee}` : journee;

  const parties = [journeeCourte, r.championnat.competition ?? "", r.championnat.poule ? `Poule ${r.championnat.poule}` : ""].filter((x) => x !== "");
  const classementAdv = adv.bilan.rang !== null ? `${rang(adv.bilan.rang)}${adv.bilan.pts !== null ? ` · ${adv.bilan.pts} pts` : ""}` : "";

  const heureCourte = heure(m?.heure, true);
  const dateCourte = jourDate(m?.date, false);

  const enjeuMoi = moi.rang !== null ? `${rang(moi.rang)}${moi.pts !== null ? ` (${moi.pts} pts)` : ""}` : "";
  const enjeuAdv = adv.rang !== null ? `${rang(adv.rang)}${adv.pts !== null ? ` (${adv.pts} pts)` : ""}` : "";
  const enjeu = enjeuMoi && enjeuAdv ? `Nous : ${enjeuMoi}  ·  Eux : ${enjeuAdv}` : "";

  // --- leur saison
  const b = adv.bilan;
  const connu = b.joues > 0;
  const lignesLieu = (l: { joues: number; v: number; n: number; d: number; bp: number; bc: number }): [string, string, string] =>
    l.joues > 0 ? [`${l.v}-${l.n}-${l.d}`, String(l.bp), String(l.bc)] : ["", "", ""];
  const a = r.analyse;
  const buteur = a?.buteurs[0];

  // --- forces et faiblesses : les pistes en entier ("titre : detail"), la taille de police s'adapte
  const vigilances = r.pistes.filter((p) => p.ton === "vigilance");
  const atouts = r.pistes.filter((p) => p.ton === "atout");
  const phrase = (p: Piste) => `${p.titre} : ${p.detail}`;
  const puces = ajusterPuces([vigilances.slice(0, 4).map(phrase), atouts.slice(0, 4).map(phrase)]);

  // --- dispositif et joueurs a surveiller
  const probable = r.systemeAdverse.probable;
  const onze = r.numeros?.onze ?? [];
  const noms: Record<number, string> = {};
  for (const p of onze) if (p.nom) noms[p.numero] = nomDeFamille(p.nom);
  const source = probable
    ? probable.source === "renseigne"
      ? `D'après ${pluriel(probable.observations, "match")} renseigné${probable.observations > 1 ? "s" : ""} (${probable.confiance} %)`
      : probable.source === "numeros"
        ? `Déduit des numéros, ${pluriel(probable.matchsNumeros, "feuille")} (${probable.confiance} %) : à confirmer`
        : `Dispositifs saisis + numéros (${probable.confiance} %)`
    : Object.keys(noms).length > 0 ? "Système inconnu : onze lu dans les numéros de maillot" : "";

  const joueurs = a ? joueursASurveiller(r) : [];

  // --- ambiance et infos
  const f = r.faceAFace;
  const confrontations = f.bilan.joues > 0
    ? [
      `Bilan : ${f.bilan.v} V, ${f.bilan.n} N, ${f.bilan.d} D en ${pluriel(f.bilan.joues, "match")}`,
      ...f.rencontres.slice(0, 2).map((x) => `${x.date ?? ""}${x.date ? " : " : ""}${x.bp}-${x.bc} ${x.domicile ? "chez nous" : "chez eux"}`.trim()),
    ]
    : [""];
  const arbitre = r.arbitre
    ? `${r.arbitre.nom}${r.arbitre.profil ? ` (${r.arbitre.profil.toLowerCase()})` : ""} : ${String(r.arbitre.cartonsParMatch).replace(".", ",")} cartons par match sur ${pluriel(r.arbitre.matchsPrincipal, "match")}`
    : m?.arbitre ? `${m.arbitre} : pas encore d'historique` : "";
  const avertis = (a?.avertis ?? []).slice(0, 5)
    .map((x) => `${nomDeFamille(x.nom)} (${x.jaunes} J${x.rouges > 0 ? `, ${x.rouges} R` : ""})`);

  // --- les 3 cles : d'abord ce qu'on peut exploiter, puis ce dont il faut se mefier
  const cles = [...atouts, ...vigilances].slice(0, 3).map((p) => couper(phrase(p), 190));

  return {
    libelleEquipe: `${moi.clubNom} ${moi.equipeNom}`.toUpperCase(),
    couverture: {
      entete: parties.join("  ·  ").toUpperCase(),
      club: adv.clubNom.toUpperCase(),
      affiche: `${moi.clubNom}  vs  ${adv.clubNom}${lieu ? `   —   ${lieu}` : ""}`,
      date: [dateCourte, heureCourte].filter((x) => x !== "").join(" · "),
      lieu: m?.terrain?.trim() ?? "",
      classement: classementAdv,
    },
    match: {
      jour: [dateCourte && jourDate(m?.date, true), heure(m?.heure)].filter((x) => x).join(" — "),
      convocation: "",
      adresse: m?.terrain?.trim() ?? "",
      enjeu,
      surface: "", dimensions: "", etat: "", aSavoir: "",
    },
    saison: {
      classement: rang(b.rang), points: b.pts !== null ? String(b.pts) : "",
      vnd: connu ? `${b.v}-${b.n}-${b.d}` : "", bp: connu ? String(b.bp) : "", bc: connu ? String(b.bc) : "",
      derniers: adv.derniersMatchs.slice(0, 3).map((x) => ({
        issue: x.issue,
        libelle: `${/^\d+$/.test(x.journee ?? "") ? `J${x.journee}` : x.journee || jourMois(x.date)}  ${x.adversaire}`.trim(),
        score: `${x.bp} - ${x.bc} · ${x.domicile ? "Dom" : "Ext"}`,
      })),
      domicile: lignesLieu(adv.lieux.domicile), exterieur: lignesLieu(adv.lieux.exterieur),
      jaunes: a ? pluriel(a.discipline.jaunes, "jaune") : "", rouges: a ? pluriel(a.discipline.rouges, "rouge") : "",
      buteur: buteur ? `${buteur.nom} — ${pluriel(buteur.buts, "but")}` : "",
    },
    forces: { forces: puces.colonnes[0], faiblesses: puces.colonnes[1], exploiter: atouts[0] ? couper(atouts[0].detail, 220) : "", taille: puces.taille, espaceAvant: puces.espaceAvant },
    dispositif: {
      systeme: probable?.systeme ?? null, titre: probable ? `Dispositif attendu : ${probable.systeme}` : "Dispositif attendu : ",
      source, noms, surveiller: joueurs,
    },
    ambiance: { publicAmbiance: "", confrontations, arbitrage: arbitre, infos: avertis.length ? `Les plus avertis : ${avertis.join(", ")}` : "" },
    cles: { cles: [cles[0] ?? "", cles[1] ?? "", cles[2] ?? ""], message: "", taille: tailleCles(cles) },
    ...contenuAnalyse(r),
  };
}

/** Jusqu'a trois joueurs : le meilleur buteur, puis les joueurs cles (ceux dont l'equipe depend), chacun avec son numero et son poste. */
function joueursASurveiller(r: RapportPrematch): ContenuRapport["dispositif"]["surveiller"] {
  const a = r.analyse!;
  const profils = r.numeros?.profils ?? [];
  const onze = r.numeros?.onze ?? [];
  type Cand = { cle: string; nom: string; faits: string[] };
  const cands = new Map<string, Cand>();
  const ajouter = (nom: string, fait: string) => {
    const k = cle(nom);
    const cur = cands.get(k) ?? { cle: k, nom, faits: [] };
    cur.faits.push(fait);
    cands.set(k, cur);
  };
  for (const b of a.buteurs.slice(0, 2)) ajouter(b.nom, pluriel(b.buts, "but"));
  for (const j of a.joueursCles) {
    if (j.delta > 0) ajouter(`${j.prenom ?? ""} ${j.nom}`.trim(), `+${String(j.delta).replace(".", ",")} pt/match avec lui`);
  }
  return [...cands.values()].slice(0, 3).map((c) => {
    const place = onze.find((p) => p.nom && cle(p.nom) === c.cle);
    const profil = profils.find((p) => cle(p.nom) === c.cle);
    const numero = place?.numero ?? profil?.numeros[0]?.numero ?? null;
    const ligneNum = ligneDuNumero(numero);
    const poste = ligneNum === "GB" ? "Gardien" : ligneNum === "DEF" ? "Défenseur" : ligneNum === "MIL" ? "Milieu" : ligneNum === "ATT" ? "Attaquant" : "";
    return {
      numero: numero !== null && posteDuNumero(numero) ? String(numero) : "",
      titre: `${nomDeFamille(c.nom)}${poste ? ` — ${poste}` : ""}`,
      detail: c.faits.join(" · "),
    };
  });
}
