// src/features/analyse/rapport-pptx-analyse.ts
//
// CONTENU DES PAGES D'ANALYSE du rapport d'avant-match en PowerPoint : tout ce que le rapport pre-match sait et que les
// sept pages du modele ne portent pas (comparatif et projection, forme, pistes completes, systeme et ses indices, onze par
// poste, polyvalence, joueurs cles et discipline, face-a-face et arbitre). Aucune coupe : chaque page a la place pour
// l'information entiere, et ce qui n'est pas connu est vide. Fonctions pures, sans XML.

import { LIBELLE_POSTE, CodePoste } from "@/features/matchs/numeros-postes";

import { LIBELLE_SERIE, Piste, ProfilEquipe } from "./prematch";
import { RapportPrematch } from "./prematch.service";
import { Issue, SensTendance } from "./tendances";

const dec = (x: number, d = 1) => x.toFixed(d).replace(".", ",");
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;
const rang = (n: number | null | undefined) => (typeof n !== "number" ? "—" : n === 1 ? "1er" : `${n}e`);

const LIBELLE_SENS: Record<SensTendance, string> = { hausse: "en hausse", baisse: "en baisse", stable: "stable", insuffisant: "trop peu de matchs" };

/* --------------------------------------- types --------------------------------------- */

export interface LigneComparatif { libelle: string; nous: string; eux: string; meilleur: "nous" | "eux" | null }

export interface ResumeForme {
  club: string;
  /** Les cinq derniers resultats, du plus ancien au plus recent. */
  pastilles: Issue[];
  serie: string;
  dynamique: string;
  attaque: string;
  defense: string;
}

export interface MatchAffiche { issue: Issue; libelle: string; score: string }

export interface ContenuAnalyse {
  comparatif: {
    nous: string; eux: string;
    lignes: LigneComparatif[];
    projection: null | {
      victoire: number; nul: number; defaite: number; score: string; probaScore: number; butsNous: string; butsEux: string; matchs: number; lieu: string;
    };
    noteProjection: string;
  };
  forme: {
    nous: ResumeForme; eux: ResumeForme;
    derniersEux: MatchAffiche[];
    constats: { ton: "positif" | "negatif" | "neutre"; titre: string; detail: string }[];
  };
  pistes: { ton: Piste["ton"]; importance: number; titre: string; detail: string }[];
  systeme: {
    systeme: string | null;
    confiance: number;
    fiabilite: string;
    source: string;
    structure: string;
    alternatives: { systeme: string; poids: number }[];
    indices: string[];
    notes: string[];
    feuilles: number;
    exploitable: boolean;
  };
  onze: {
    lignes: { numero: number; code: string; libelle: string; joueur: string; origine: "numero" | "ligne" | null; titularisations: string; autres: string }[];
    feuilles: number;
    exploitable: boolean;
  };
  polyvalence: {
    joueurs: { nom: string; titularisations: number; numeros: string; postes: string }[];
    autres: number;
    feuilles: number;
    exploitable: boolean;
  };
  joueurs: {
    kpi: { danger: string; stabilite: string; stabiliteNote: string; fatigue: string; fatigueNote: string; changements: string } | null;
    cles: { nom: string; poste: string; titularisations: string; impact: string }[];
    buteurs: { nom: string; buts: number }[];
    avertis: { nom: string; jaunes: number; rouges: number }[];
    discipline: string;
    entraineur: string;
  };
  face: {
    bilan: string;
    joues: number;
    buts: string;
    rencontres: { issue: Issue; score: string; lieu: string; date: string }[];
    arbitre: null | { nom: string; profil: string; matchs: string; cartonsParMatch: string; cartons: string; motifs: string[] };
    arbitreSaisi: string;
  };
}

/* ------------------------------------- calcul ------------------------------------- */

function lignesComparatif(moi: ProfilEquipe, adv: ProfilEquipe): LigneComparatif[] {
  const compare = (a: number | null, b: number | null, mieux: "haut" | "bas", libre = false): LigneComparatif["meilleur"] =>
    a === null || b === null || libre || a === b ? null : (mieux === "haut" ? a > b : a < b) ? "nous" : "eux";
  const avecMatchs = moi.matchs > 0 && adv.matchs > 0;
  const lieu = (p: ProfilEquipe, l: "domicile" | "exterieur") => (p[l].joues > 0 ? `${dec(p[l].ppm, 2)} (${p[l].joues} m.)` : "—");
  const serie = (p: ProfilEquipe) => (p.serie ? `${p.serie.longueur} ${LIBELLE_SERIE[p.serie.type]}` : "—");
  return [
    { libelle: "Classement", nous: rang(moi.rang), eux: rang(adv.rang), meilleur: compare(moi.rang, adv.rang, "bas") },
    { libelle: "Points", nous: moi.pts === null ? "—" : String(moi.pts), eux: adv.pts === null ? "—" : String(adv.pts), meilleur: compare(moi.pts, adv.pts, "haut") },
    { libelle: "Matchs joués", nous: String(moi.matchs), eux: String(adv.matchs), meilleur: null },
    { libelle: "Points par match", nous: moi.matchs ? dec(moi.ppm, 2) : "—", eux: adv.matchs ? dec(adv.ppm, 2) : "—", meilleur: compare(moi.ppm, adv.ppm, "haut", !avecMatchs) },
    { libelle: "Buts marqués / match", nous: moi.matchs ? dec(moi.bpm, 2) : "—", eux: adv.matchs ? dec(adv.bpm, 2) : "—", meilleur: compare(moi.bpm, adv.bpm, "haut", !avecMatchs) },
    { libelle: "Buts encaissés / match", nous: moi.matchs ? dec(moi.bcm, 2) : "—", eux: adv.matchs ? dec(adv.bcm, 2) : "—", meilleur: compare(moi.bcm, adv.bcm, "bas", !avecMatchs) },
    { libelle: "Points / match à domicile", nous: lieu(moi, "domicile"), eux: lieu(adv, "domicile"),
      meilleur: compare(moi.domicile.joues ? moi.domicile.ppm : null, adv.domicile.joues ? adv.domicile.ppm : null, "haut") },
    { libelle: "Points / match à l'extérieur", nous: lieu(moi, "exterieur"), eux: lieu(adv, "exterieur"),
      meilleur: compare(moi.exterieur.joues ? moi.exterieur.ppm : null, adv.exterieur.joues ? adv.exterieur.ppm : null, "haut") },
    { libelle: "Dynamique récente", nous: moi.libelle || "—", eux: adv.libelle || "—", meilleur: null },
    { libelle: "Série en cours", nous: serie(moi), eux: serie(adv), meilleur: null },
  ];
}

function resumeForme(p: ProfilEquipe): ResumeForme {
  return {
    club: p.nom, pastilles: p.formeRecente,
    serie: p.serie ? `${p.serie.longueur} ${LIBELLE_SERIE[p.serie.type]}` : "aucune série en cours",
    dynamique: p.libelle || "—",
    attaque: LIBELLE_SENS[p.attaque], defense: LIBELLE_SENS[p.defense],
  };
}

const libelleMatch = (m: { journee: string | null; date: string | null; adversaire: string }) => {
  const j = /^\d+$/.test(m.journee ?? "") ? `J${m.journee}` : m.journee || (m.date ?? "");
  return `${j}  ${m.adversaire}`.trim();
};

export function contenuAnalyse(r: RapportPrematch): ContenuAnalyse {
  const moi = r.monEquipe, adv = r.adversaire, a = r.analyse, num = r.numeros, probable = r.systemeAdverse.probable;

  // --- comparatif et projection
  const p = r.projection;
  const projection = p ? {
    victoire: p.pV, nul: p.pN, defaite: p.pD, score: `${p.scoreProbable.moi} – ${p.scoreProbable.adv}`, probaScore: p.scoreProbable.proba,
    butsNous: dec(p.buts.moi), butsEux: dec(p.buts.adv), matchs: p.matchs,
    lieu: r.match ? (r.match.domicile ? "à domicile" : "à l'extérieur") : "",
  } : null;

  // --- systeme
  const structure = num ? [
    (probable?.structure ?? num.structure).defense ? `défense à ${(probable?.structure ?? num.structure).defense!.lignes}` : null,
    (probable?.structure ?? num.structure).attaque ? pluriel((probable?.structure ?? num.structure).attaque!.attaquants, "attaquant") : null,
  ].filter(Boolean).join(" · ") : "";
  const libelleSource = !probable ? "Aucun système déterminable"
    : probable.source === "renseigne" ? `Dispositifs renseignés (${pluriel(probable.observations, "match")})`
      : probable.source === "numeros" ? `Déduit des numéros de maillot (${pluriel(probable.matchsNumeros, "feuille")})`
        : `Dispositifs renseignés + numéros de maillot`;

  // --- onze par poste
  const onze = (num?.onze ?? []).map((s) => {
    const profil = num?.profils.find((x) => x.joueur === s.joueur);
    const autres = s.autres.slice(0, 2).map((x) => `${x.nom} (${x.fois})`).join(" · ");
    return {
      numero: s.numero, code: s.poste, libelle: LIBELLE_POSTE[s.poste as CodePoste] ?? "", joueur: s.nom ?? "", origine: s.origine,
      titularisations: s.nom ? (s.origine === "numero" ? `${s.fois} au n°${s.numero}` : profil ? `${profil.titularisations} (autre n°)` : "") : "",
      autres,
    };
  });

  // --- polyvalence : les joueurs qui portent plusieurs numeros de poste
  const polyvalents = (num?.profils ?? []).filter((x) => x.polyvalent).slice(0, 10).map((x) => ({
    nom: x.nom, titularisations: x.titularisations,
    numeros: x.numeros.map((n) => `${n.numero} (${n.fois})`).join(" · "),
    postes: x.numeros.map((n) => n.poste).join(" / "),
  }));

  // --- joueurs cles et discipline
  const d = a?.discipline;
  const rencontres = r.faceAFace.rencontres.slice(0, 6).map((x) => ({
    issue: x.issue, score: `${x.bp} - ${x.bc}`, lieu: x.domicile ? "chez nous" : "chez eux", date: x.date ?? "",
  }));
  const ar = r.arbitre;

  return {
    comparatif: {
      nous: moi.clubNom, eux: adv.clubNom, lignes: lignesComparatif(moi, adv), projection,
      noteProjection: projection ? "" : `Pas assez de matchs joués pour projeter un résultat : il en faut au moins 5 de chaque côté (${moi.matchs} pour nous, ${adv.matchs} pour eux).`,
    },
    forme: {
      nous: resumeForme(moi), eux: resumeForme(adv),
      derniersEux: adv.derniersMatchs.map((m) => ({ issue: m.issue, libelle: libelleMatch(m), score: `${m.bp} - ${m.bc} · ${m.domicile ? "Dom" : "Ext"}` })),
      constats: (a?.insights ?? []).slice(0, 6).map((i) => ({ ton: i.ton, titre: i.titre, detail: i.detail })),
    },
    pistes: r.pistes.map((x) => ({ ton: x.ton, importance: x.importance, titre: x.titre, detail: x.detail })),
    systeme: {
      systeme: probable?.systeme ?? null, confiance: probable?.confiance ?? 0,
      fiabilite: probable ? { faible: "fiabilité faible", moyenne: "fiabilité moyenne", bonne: "bonne fiabilité" }[probable.fiabilite] : "",
      source: libelleSource, structure,
      alternatives: probable?.alternatives ?? [],
      indices: probable ? probable.indices : (num?.indices.slice(0, 6).map((i) => i.texte) ?? []),
      notes: num?.notes ?? [], feuilles: num?.matchs ?? 0, exploitable: !!num?.fiabilite.exploitable,
    },
    onze: { lignes: onze, feuilles: num?.matchs ?? 0, exploitable: !!num?.fiabilite.exploitable },
    polyvalence: {
      joueurs: polyvalents, autres: Math.max(0, (num?.profils.length ?? 0) - (num?.profils.filter((x) => x.polyvalent).length ?? 0)),
      feuilles: num?.matchs ?? 0, exploitable: !!num?.fiabilite.exploitable,
    },
    joueurs: {
      kpi: a ? {
        danger: `${Math.round(a.scoreDanger)}`, stabilite: `${Math.round(100 - a.scoreChaos)}`, stabiliteNote: a.scoreChaos >= 50 ? "onze très changé" : "onze stable",
        fatigue: a.fatigueMoy === null ? "—" : `${Math.round(a.fatigueMoy)}`, fatigueNote: a.fatigueMoy === null ? "non mesurable" : "titulaires types",
        changements: dec(a.changementsMoyenne, 1),
      } : null,
      cles: (a?.joueursCles ?? []).map((j) => ({
        nom: [j.prenom, j.nom].filter(Boolean).join(" "), poste: j.poste ?? "—",
        titularisations: `${j.titularisations} / ${j.matchsAvec}`, impact: `${j.delta >= 0 ? "+" : ""}${dec(j.delta, 2)} pt/match`,
      })),
      buteurs: a?.buteurs ?? [], avertis: a?.avertis ?? [],
      discipline: d
        ? `${pluriel(d.jaunes, "jaune")} · ${pluriel(d.rouges, "rouge")} · ${dec(d.jaunesParMatch, 1)} jaune par match${d.partFinDeMatch !== null ? ` · ${Math.round(d.partFinDeMatch * 100)} % des cartons après la 75e` : ""}`
        : "",
      entraineur: a?.entraineur ?? "",
    },
    face: {
      bilan: r.faceAFace.bilan.joues > 0 ? `${r.faceAFace.bilan.v}-${r.faceAFace.bilan.n}-${r.faceAFace.bilan.d}` : "",
      joues: r.faceAFace.bilan.joues,
      buts: r.faceAFace.bilan.joues > 0 ? `${r.faceAFace.bilan.bp} marqués, ${r.faceAFace.bilan.bc} encaissés` : "",
      rencontres,
      arbitre: ar ? {
        nom: ar.nom, profil: ar.profil ? ar.profil.toLowerCase() : "profil non déterminé", matchs: pluriel(ar.matchsPrincipal, "match"),
        cartonsParMatch: dec(ar.cartonsParMatch, 1), cartons: `${ar.cartonsJaunes} jaunes · ${ar.cartonsRouges} rouges`,
        motifs: ar.motifsTop ? ar.motifsTop.split(" · ") : [],
      } : null,
      arbitreSaisi: r.match?.arbitre ?? "",
    },
  };
}
