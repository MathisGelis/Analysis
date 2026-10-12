// src/features/analyse/rapport-pptx-pages.ts
//
// LES PAGES D'ANALYSE du rapport d'avant-match en PowerPoint : huit pages qui n'existent pas dans le modele du staff et
// que l'on ajoute dans son style (rond d'en-tete, petit libelle vert, grand titre, cartes arrondies, pied de page). Elles
// portent tout ce que le rapport sait et que les sept pages du modele ne peuvent pas contenir : rien n'est coupe.
// Chaque page rend le XML d'une diapositive ; ses formes sont natives (textes, tableaux), donc modifiables dans PowerPoint.

import { ContenuRapport, PageAnalyse } from "./rapport-pptx-contenu";
import {
  carte, carteTexte, cell, compteurIds, COULEUR, enTete, LigneTableau, PAGE, para, Paragraphe, piedDePage, tableau, texte, titreSection, trait, Zone,
} from "./pptx-formes";
import { squeletteDiapositive } from "./pptx-xml";

/** Icones (blanches) du modele reutilisees dans le rond d'en-tete : fichier de `ppt/media/`. */
const ICONE: Record<PageAnalyse, string> = {
  comparatif: "image2.png", forme: "image6.png", pistes: "image5.png", systeme: "image7.png",
  onze: "image7.png", polyvalence: "image7.png", joueurs: "image5.png", face: "image1.png",
};

export interface PageConstruite { xml: string; images: string[] }

type Ids = () => number;
const RID_ICONE = "rId2";

const COULEUR_ISSUE = { V: COULEUR.vert, N: COULEUR.gris, D: COULEUR.rouge } as const;
const COULEUR_TON = { atout: COULEUR.vert, vigilance: COULEUR.rouge, info: COULEUR.gris, positif: COULEUR.vert, negatif: COULEUR.rouge, neutre: COULEUR.gris } as const;

/** "BOURGEOIS BIDDI" -> "BOURGEOIS B." pour tenir dans `max` caracteres. */
function abreger(nom: string, max: number): string {
  if (nom.length <= max) return nom;
  const mots = nom.split(" ");
  if (mots.length > 1) {
    const court = `${mots[0]} ${mots.slice(1).map((m) => `${m[0]}.`).join(" ")}`;
    if (court.length <= max) return court;
  }
  return `${nom.slice(0, Math.max(1, max - 1))}.`;
}

const pastille = (ids: Ids, issue: "V" | "N" | "D", x: number, y: number, d: number, taille = 11) =>
  carteTexte(ids(), `Resultat ${issue}`, { x, y, cx: d, cy: d }, COULEUR_ISSUE[issue], [para(issue, { taille, gras: true, couleur: COULEUR.blanc, align: "ctr" })], { forme: "ellipse" });

const vide = (ids: Ids, message: string, z: Zone = { x: PAGE.gauche, y: PAGE.haut, cx: PAGE.largeur, cy: 900000 }) =>
  carte(ids(), "Carte", z, COULEUR.carte)
  + texte(ids(), "Message", { x: z.x + 182880, y: z.y + 91440, cx: z.cx - 365760, cy: z.cy - 182880 }, [para(message, { taille: 12, couleur: COULEUR.encre })], { ancre: "ctr" });

/* ------------------------------------------ pages ------------------------------------------ */

// Les lignes du tableau peuvent passer sur deux lignes (serie en cours) : la legende reste au bas de la page.
const HAUTEUR_LIGNE = 280000;

function comparatif(ids: Ids, c: ContenuRapport["comparatif"]): { libelle: string; titre: string; corps: string } {
  const colonnes = [2331720, 1394460, 1394460];
  const entete: LigneTableau = {
    hauteur: HAUTEUR_LIGNE,
    cellules: [
      cell("Indicateur", { gras: true, couleur: COULEUR.gris, fond: COULEUR.carte }),
      cell(abreger(c.nous, 16), { gras: true, couleur: COULEUR.vertFonce, align: "ctr", fond: COULEUR.carte }),
      cell(abreger(c.eux, 16), { gras: true, couleur: COULEUR.vertFonce, align: "ctr", fond: COULEUR.carte }),
    ],
  };
  const lignes: LigneTableau[] = c.lignes.map((l) => ({
    hauteur: HAUTEUR_LIGNE,
    cellules: [
      cell(l.libelle, { gras: true }),
      cell(l.nous, { align: "ctr", gras: l.meilleur === "nous", couleur: l.meilleur === "nous" ? COULEUR.vert : COULEUR.encre }),
      cell(l.eux, { align: "ctr", gras: l.meilleur === "eux", couleur: l.meilleur === "eux" ? COULEUR.vert : COULEUR.encre }),
    ],
  }));
  const haut = PAGE.haut;
  const hTable = HAUTEUR_LIGNE * (1 + c.lignes.length);
  let corps = tableau(ids(), "Comparatif des deux equipes", { x: PAGE.gauche, y: haut }, colonnes, [entete, ...lignes], { filets: "horizontal" });
  corps += texte(ids(), "Legende", { x: PAGE.gauche, y: PAGE.bas - 182880, cx: 5120640, cy: 182880 },
    [para("En vert : la meilleure valeur de chaque ligne.", { taille: 8, couleur: COULEUR.gris, italique: true })], { ancre: "ctr" });

  // Projection : la carte sombre du modele ("Le terrain").
  const x = PAGE.gauche + 5120640 + 228600, cx = PAGE.droite - x, cy = Math.max(hTable + 228600, 3500000);
  corps += carte(ids(), "Carte projection", { x, y: haut, cx, cy }, COULEUR.vertFonce);
  corps += texte(ids(), "Titre projection", { x: x + 182880, y: haut + 137160, cx: cx - 365760, cy: 228600 },
    [para("PROJECTION DU MATCH", { taille: 10, gras: true, couleur: COULEUR.jaune })], { ancre: "ctr" });
  const p = c.projection;
  if (!p) {
    corps += texte(ids(), "Projection indisponible", { x: x + 182880, y: haut + 500000, cx: cx - 365760, cy: cy - 700000 },
      [para(c.noteProjection, { taille: 11, couleur: COULEUR.blanc })], { ancre: "t" });
    return { libelle: "COMPARATIF", titre: "Nous contre eux", corps };
  }
  const barres: [string, number, string][] = [["Victoire", p.victoire, COULEUR.jaune], ["Match nul", p.nul, COULEUR.vertClair], ["Défaite", p.defaite, COULEUR.rouge]];
  const largeurPiste = cx - 365760;
  barres.forEach(([libelle, pct, couleur], i) => {
    const y = haut + 480000 + i * 400000;
    corps += texte(ids(), `Libelle ${libelle}`, { x: x + 182880, y, cx: 1300000, cy: 200000 }, [para(libelle, { taille: 10, couleur: COULEUR.vertClair })], { ancre: "ctr" });
    corps += texte(ids(), `Valeur ${libelle}`, { x: x + cx - 182880 - 700000, y, cx: 700000, cy: 200000 }, [para(`${pct} %`, { taille: 12, gras: true, couleur: COULEUR.blanc, align: "r" })], { ancre: "ctr" });
    corps += carte(ids(), `Piste ${libelle}`, { x: x + 182880, y: y + 215000, cx: largeurPiste, cy: 91440 }, COULEUR.vert);
    if (pct > 0) corps += carte(ids(), `Barre ${libelle}`, { x: x + 182880, y: y + 215000, cx: Math.max(91440, (largeurPiste * pct) / 100), cy: 91440 }, couleur);
  });
  corps += texte(ids(), "Libelle score", { x: x + 182880, y: haut + 1780000, cx: cx - 365760, cy: 180000 }, [para("SCORE LE PLUS PROBABLE", { taille: 8, gras: true, couleur: COULEUR.vertClair })], { ancre: "ctr" });
  corps += texte(ids(), "Score probable", { x: x + 182880, y: haut + 1960000, cx: cx - 365760, cy: 480000 }, [para(p.score, { taille: 30, gras: true, couleur: COULEUR.blanc })], { ancre: "ctr" });
  corps += texte(ids(), "Chances du score", { x: x + 182880, y: haut + 2440000, cx: cx - 365760, cy: 180000 }, [para(`${p.probaScore} % de chances`, { taille: 9, couleur: COULEUR.vertClair })], { ancre: "ctr" });
  corps += texte(ids(), "Buts attendus", { x: x + 182880, y: haut + 2700000, cx: cx - 365760, cy: 220000 },
    [{ segments: [{ t: "Buts attendus : ", gras: true, taille: 10, couleur: COULEUR.blanc }, { t: `${p.butsNous} pour nous, ${p.butsEux} pour eux`, taille: 10, couleur: COULEUR.blanc }] }], { ancre: "ctr" });
  corps += texte(ids(), "Note projection", { x: x + 182880, y: haut + 2960000, cx: cx - 365760, cy: 400000 },
    [para(`Modèle de Poisson sur les moyennes de buts (au moins ${p.matchs} matchs de chaque équipe)${p.lieu ? `, ${p.lieu} compris` : ""}.`, { taille: 8, couleur: COULEUR.vertClair, italique: true })], { ancre: "t" });
  return { libelle: "COMPARATIF", titre: "Nous contre eux", corps };
}

function forme(ids: Ids, c: ContenuRapport["forme"]): { libelle: string; titre: string; corps: string } {
  let corps = "";
  // Rangee A : la forme des deux equipes.
  const hA = 1200000, w = 4023360;
  [[c.nous, PAGE.gauche, "Nous"], [c.eux, PAGE.droite - w, "Eux"]].forEach(([f, x, qui]) => {
    const r = f as ContenuRapport["forme"]["nous"];
    const x0 = x as number;
    corps += carte(ids(), `Carte forme ${qui}`, { x: x0, y: PAGE.haut, cx: w, cy: hA }, COULEUR.carte);
    corps += texte(ids(), `Club ${qui}`, { x: x0 + 182880, y: PAGE.haut + 80000, cx: w - 365760, cy: 230000 }, [para(abreger(r.club, 34), { taille: 12, gras: true, couleur: COULEUR.vertFonce })], { ancre: "ctr" });
    if (r.pastilles.length === 0) {
      corps += texte(ids(), `Aucun match ${qui}`, { x: x0 + 182880, y: PAGE.haut + 400000, cx: w - 365760, cy: 300000 }, [para("Aucun match joué", { taille: 11, couleur: COULEUR.gris })], { ancre: "ctr" });
    }
    r.pastilles.forEach((issue, i) => { corps += pastille(ids, issue, x0 + 182880 + i * 380000, PAGE.haut + 340000, 280000, 11); });
    corps += texte(ids(), `Tendance ${qui}`, { x: x0 + 182880, y: PAGE.haut + 650000, cx: w - 365760, cy: 520000 }, [
      { segments: [{ t: "Série : ", gras: true, taille: 10 }, { t: r.serie, taille: 10 }] },
      { segments: [{ t: "Dynamique : ", gras: true, taille: 10 }, { t: r.dynamique, taille: 10 }] },
      { segments: [{ t: "Attaque : ", gras: true, taille: 10 }, { t: `${r.attaque}  ·  `, taille: 10 }, { t: "Défense : ", gras: true, taille: 10 }, { t: r.defense, taille: 10 }] },
    ], { ancre: "t" });
  });

  // Rangee B : leurs cinq derniers matchs.
  const yB = PAGE.haut + hA + 80000;
  corps += titreSection(ids(), "Leurs 5 derniers matchs", PAGE.gauche, yB, PAGE.largeur);
  if (c.derniersEux.length === 0) {
    corps += texte(ids(), "Aucun match", { x: PAGE.gauche, y: yB + 250000, cx: PAGE.largeur, cy: 250000 }, [para("Aucun match joué sur la saison.", { taille: 11, couleur: COULEUR.gris })], { ancre: "ctr" });
  }
  const wm = (PAGE.largeur - 4 * 91440) / 5, hm = 500000, yM = yB + 250000;
  c.derniersEux.slice(0, 5).forEach((m, i) => {
    const x = PAGE.gauche + i * (wm + 91440);
    corps += carte(ids(), `Match ${i + 1}`, { x, y: yM, cx: wm, cy: hm }, COULEUR.carte);
    corps += pastille(ids, m.issue, x + 91440, yM + 50000, 220000, 10);
    corps += texte(ids(), `Adversaire ${i + 1}`, { x: x + 380000, y: yM + 25000, cx: wm - 440000, cy: 270000 }, [para(abreger(m.libelle, 20), { taille: 9, gras: true })], { ancre: "ctr" });
    corps += texte(ids(), `Score ${i + 1}`, { x: x + 91440, y: yM + 295000, cx: wm - 182880, cy: 180000 }, [para(m.score, { taille: 11, gras: true, couleur: COULEUR.vertFonce })], { ancre: "ctr" });
  });

  // Rangee C : les constats chiffres des matchs.
  const yC = yM + hm + 80000;
  corps += titreSection(ids(), "Ce que disent les matchs", PAGE.gauche, yC, PAGE.largeur);
  if (c.constats.length === 0) {
    corps += texte(ids(), "Aucun constat", { x: PAGE.gauche, y: yC + 250000, cx: PAGE.largeur, cy: 250000 }, [para("Pas encore assez de matchs analysés pour dégager des constats chiffrés.", { taille: 11, couleur: COULEUR.gris })], { ancre: "ctr" });
  }
  const hc = 380000, wc = (PAGE.largeur - 182880) / 2;
  c.constats.slice(0, 6).forEach((k, i) => {
    const col = Math.floor(i / 3), lig = i % 3;
    const x = PAGE.gauche + col * (wc + 182880), y = yC + 250000 + lig * hc;
    corps += carte(ids(), `Repere ${i + 1}`, { x, y: y + 40000, cx: 54864, cy: hc - 80000 }, COULEUR_TON[k.ton], "rect");
    corps += texte(ids(), `Constat ${i + 1}`, { x: x + 140000, y, cx: wc - 140000, cy: hc }, [
      { segments: [{ t: `${k.titre} : `, gras: true, taille: 9 }, { t: k.detail, taille: 9, couleur: COULEUR.encre }] },
    ], { ancre: "ctr" });
  });
  return { libelle: "TENDANCES", titre: "Forme & dynamique", corps };
}

function pistes(ids: Ids, c: ContenuRapport["pistes"]): { libelle: string; titre: string; corps: string } {
  if (c.length === 0) {
    return { libelle: "SYNTHÈSE", titre: "Pistes pour le match", corps: vide(ids, "Pas encore assez de matchs joués pour dégager des pistes fiables : les chiffres sous le seuil d'échantillon ne donnent lieu à aucune piste.") };
  }
  let corps = "";
  const w = (PAGE.largeur - 137160) / 2, h = 640000, ecart = 64008;
  const TAG = { atout: "ATOUT", vigilance: "VIGILANCE", info: "INFO" } as const;
  c.slice(0, 10).forEach((p, i) => {
    const col = i % 2, lig = Math.floor(i / 2);
    const x = PAGE.gauche + col * (w + 137160), y = PAGE.haut + lig * (h + ecart);
    corps += carte(ids(), `Piste ${i + 1}`, { x, y, cx: w, cy: h }, COULEUR.carte);
    corps += carte(ids(), `Repere piste ${i + 1}`, { x: x + 91440, y: y + 91440, cx: 45720, cy: h - 182880 }, COULEUR_TON[p.ton], "rect");
    corps += texte(ids(), `Titre piste ${i + 1}`, { x: x + 210000, y: y + 45720, cx: w - 1400000, cy: 210000 }, [para(p.titre, { taille: 10.5, gras: true, couleur: COULEUR.vertFonce })], { ancre: "ctr" });
    const niveau = Math.max(0, Math.min(3, Math.round(p.importance)));
    corps += texte(ids(), `Etiquette piste ${i + 1}`, { x: x + w - 1180000, y: y + 45720, cx: 1090000, cy: 210000 },
      [para(`${TAG[p.ton]}  ${"●".repeat(niveau)}${"○".repeat(3 - niveau)}`, { taille: 7, gras: true, couleur: COULEUR_TON[p.ton], align: "r" })], { ancre: "ctr" });
    corps += texte(ids(), `Detail piste ${i + 1}`, { x: x + 210000, y: y + 255000, cx: w - 300000, cy: h - 290000 }, [para(p.detail, { taille: 9, couleur: COULEUR.encre })], { ancre: "t" });
  });
  return { libelle: "SYNTHÈSE  ·  ATOUT = OUVERTURE POUR NOUS  ·  VIGILANCE = MENACE", titre: "Pistes pour le match", corps };
}

function systeme(ids: Ids, c: ContenuRapport["systeme"]): { libelle: string; titre: string; corps: string } {
  let corps = "";
  const cx = 3017520, cy = 3400000;
  corps += carte(ids(), "Carte systeme", { x: PAGE.gauche, y: PAGE.haut, cx, cy }, COULEUR.vertFonce);
  const xi = PAGE.gauche + 182880, wi = cx - 365760;
  corps += texte(ids(), "Titre systeme", { x: xi, y: PAGE.haut + 137160, cx: wi, cy: 228600 }, [para("SYSTÈME PROBABLE", { taille: 10, gras: true, couleur: COULEUR.jaune })], { ancre: "ctr" });
  corps += texte(ids(), "Systeme", { x: xi, y: PAGE.haut + 400000, cx: wi, cy: 640000 }, [para(c.systeme ?? "Non déterminé", { taille: c.systeme ? 38 : 22, gras: true, couleur: COULEUR.blanc })], { ancre: "ctr" });
  corps += texte(ids(), "Source", { x: xi, y: PAGE.haut + 1080000, cx: wi, cy: 340000 }, [para(c.source, { taille: 10, couleur: COULEUR.vertClair })], { ancre: "t" });
  if (c.systeme) {
    corps += texte(ids(), "Confiance", { x: xi, y: PAGE.haut + 1450000, cx: wi, cy: 200000 }, [para(`Confiance ${c.confiance} %  ·  ${c.fiabilite}`, { taille: 10, gras: true, couleur: COULEUR.blanc })], { ancre: "ctr" });
  }
  if (c.structure) {
    corps += texte(ids(), "Structure", { x: xi, y: PAGE.haut + 1700000, cx: wi, cy: 340000 },
      [{ segments: [{ t: "Les numéros disent : ", gras: true, taille: 10, couleur: COULEUR.blanc }, { t: c.structure, taille: 10, couleur: COULEUR.blanc }] }], { ancre: "t" });
  }
  if (c.alternatives.length > 0) {
    corps += texte(ids(), "Titre alternatives", { x: xi, y: PAGE.haut + 2120000, cx: wi, cy: 180000 }, [para("SINON", { taille: 8, gras: true, couleur: COULEUR.vertClair })], { ancre: "ctr" });
    c.alternatives.slice(0, 4).forEach((a, i) => {
      const y = PAGE.haut + 2340000 + i * 260000;
      corps += texte(ids(), `Alternative ${i + 1}`, { x: xi, y, cx: 800000, cy: 200000 }, [para(a.systeme, { taille: 10, gras: true, couleur: COULEUR.blanc })], { ancre: "ctr" });
      corps += carte(ids(), `Piste alternative ${i + 1}`, { x: xi + 850000, y: y + 55000, cx: 1000000, cy: 91440 }, COULEUR.vert);
      corps += carte(ids(), `Barre alternative ${i + 1}`, { x: xi + 850000, y: y + 55000, cx: Math.max(45720, (1000000 * a.poids) / 100), cy: 91440 }, COULEUR.jaune);
      corps += texte(ids(), `Poids alternative ${i + 1}`, { x: xi + cx - 365760 - 450000, y, cx: 450000, cy: 200000 }, [para(`${a.poids} %`, { taille: 9, couleur: COULEUR.blanc, align: "r" })], { ancre: "ctr" });
    });
  }

  // Les indices : les changements de numero qui ont mene la.
  const xd = PAGE.gauche + cx + 182880, wd = PAGE.droite - xd;
  corps += titreSection(ids(), "Indices dans les numéros de maillot", xd, PAGE.haut, wd);
  if (c.indices.length === 0) {
    corps += vide(ids, c.exploitable
      ? "Aucun changement de numéro n'a pu être observé chez les titulaires : les numéros donnent les postes, pas le système. Un dispositif saisi sur la fiche d'un match comble ce manque."
      : "Les numéros de maillot de cette équipe ne suivent pas la convention des postes (numéros de saison) : rien n'est déduit des numéros.", { x: xd, y: PAGE.haut + 270000, cx: wd, cy: 1100000 });
  }
  const hi = 430000;
  c.indices.slice(0, 6).forEach((t, i) => {
    const y = PAGE.haut + 270000 + i * (hi + 55000);
    corps += carte(ids(), `Indice ${i + 1}`, { x: xd, y, cx: wd, cy: hi }, COULEUR.carte);
    corps += texte(ids(), `Texte indice ${i + 1}`, { x: xd + 137160, y, cx: wd - 274320, cy: hi }, [para(t, { taille: 10 })], { ancre: "ctr" });
  });
  const notes: Paragraphe[] = [
    ...c.notes.map((n) => para(n, { taille: 8, couleur: COULEUR.gris })),
    para("Convention : 1 gardien · 2 DD · 3 DG · 4 DCD · 5 DCG · 6 MDC · 7 AG · 8 MC · 9 BU · 10 MO · 11 AD.", { taille: 8, couleur: COULEUR.gris, italique: true }),
  ];
  corps += texte(ids(), "Notes", { x: xd, y: PAGE.haut + 270000 + 6 * (hi + 55000) + 20000, cx: wd, cy: 420000 }, notes, { ancre: "t" });
  return { libelle: "TACTIQUE", titre: "Pourquoi ce système ?", corps };
}

function onze(ids: Ids, c: ContenuRapport["onze"]): { libelle: string; titre: string; corps: string } {
  if (!c.exploitable || c.lignes.length === 0) {
    return {
      libelle: "COMPOSITION", titre: "Onze probable par poste",
      corps: vide(ids, c.feuilles === 0
        ? "Aucune feuille de match avec onze n'a été analysée pour cette équipe : pas de onze probable."
        : "Les numéros de maillot de cette équipe ne suivent pas la convention des postes (numéros de saison) : pas de lecture par poste."),
    };
  }
  const colonnes = [480000, 2050000, 2300000, 1350000, 2049600];
  const entete: LigneTableau = {
    hauteur: 280000,
    cellules: ["N°", "Poste", "Joueur probable", "Titularisations", "Autres joueurs à ce numéro"].map((t, i) =>
      cell(t, { gras: true, couleur: COULEUR.vertFonce, fond: COULEUR.carte, align: i === 0 ? "ctr" : "l" })),
  };
  const lignes: LigneTableau[] = c.lignes.map((l) => ({
    hauteur: 268000,
    cellules: [
      cell(String(l.numero), { gras: true, align: "ctr", couleur: COULEUR.vert }),
      { paragraphes: [{ segments: [{ t: l.code, gras: true }, { t: `  ${l.libelle}`, couleur: COULEUR.gris, taille: 9 }] }] },
      l.joueur
        ? { paragraphes: [{ segments: [{ t: l.joueur, gras: l.origine === "numero", italique: l.origine === "ligne", couleur: l.origine === "ligne" ? COULEUR.gris : COULEUR.encre }, ...(l.origine === "ligne" ? [{ t: "  (à défaut)", taille: 8, couleur: COULEUR.gris }] : [])] }] }
        : cell("—", { couleur: COULEUR.gris }),
      cell(l.titularisations || "—", { couleur: l.titularisations ? COULEUR.encre : COULEUR.gris }),
      cell(l.autres || "—", { couleur: l.autres ? COULEUR.encre : COULEUR.gris, taille: 9 }),
    ],
  }));
  let corps = tableau(ids(), "Onze probable par poste", { x: PAGE.gauche, y: PAGE.haut }, colonnes, [entete, ...lignes], { filets: "horizontal" });
  corps += texte(ids(), "Note onze", { x: PAGE.gauche, y: PAGE.haut + 280000 + 11 * 268000 + 60000, cx: PAGE.largeur, cy: 300000 }, [
    para(`Un joueur par numéro de maillot, d'après les ${c.feuilles} dernières feuilles (les plus récentes pèsent plus). « À défaut » : un titulaire de la même ligne, pas encore placé à son numéro.`, { taille: 8, couleur: COULEUR.gris, italique: true }),
  ], { ancre: "t" });
  return { libelle: "COMPOSITION", titre: "Onze probable par poste", corps };
}

function polyvalence(ids: Ids, c: ContenuRapport["polyvalence"]): { libelle: string; titre: string; corps: string } {
  const titre = "Changements de numéro";
  if (!c.exploitable) {
    return { libelle: "POSTES", titre, corps: vide(ids, "Les numéros de maillot de cette équipe ne suivent pas la convention des postes (numéros de saison) : pas de lecture des changements de poste.") };
  }
  if (c.joueurs.length === 0) {
    return { libelle: "POSTES", titre, corps: vide(ids, `Aucun joueur n'a changé de numéro sur les ${c.feuilles} dernières feuilles : chacun garde son poste, et les numéros ne disent rien du système.`) };
  }
  const colonnes = [2700000, 1300000, 2750000, 1479600];
  const entete: LigneTableau = {
    hauteur: 280000,
    cellules: ["Joueur", "Titularisations", "Numéros portés (fois)", "Postes"].map((t, i) =>
      cell(t, { gras: true, couleur: COULEUR.vertFonce, fond: COULEUR.carte, align: i === 1 ? "ctr" : "l" })),
  };
  // Dix joueurs au plus : les lignes se resserrent pour laisser la place de la note sous le tableau.
  const hl = Math.min(300000, Math.floor((PAGE.bas - PAGE.haut - 280000 - 640000) / c.joueurs.length));
  const lignes: LigneTableau[] = c.joueurs.map((j) => ({
    hauteur: hl,
    cellules: [cell(j.nom, { gras: true }), cell(String(j.titularisations), { align: "ctr" }), cell(j.numeros), cell(j.postes, { couleur: COULEUR.vert, gras: true, taille: 9 })],
  }));
  let corps = tableau(ids(), "Joueurs qui changent de numero", { x: PAGE.gauche, y: PAGE.haut }, colonnes, [entete, ...lignes], { filets: "horizontal" });
  corps += texte(ids(), "Note polyvalence", { x: PAGE.gauche, y: PAGE.haut + 280000 + c.joueurs.length * hl + 100000, cx: PAGE.largeur, cy: 520000 }, [
    para("Un joueur qui change de numéro change de poste : c'est ce qui permet de lire le système (un 2 qui devient 4 dit une défense à 4, un 9 qui devient 10 deux attaquants…).", { taille: 9, couleur: COULEUR.encre }),
    para(`${c.autres > 0 ? `${c.autres} autre${c.autres > 1 ? "s" : ""} joueur${c.autres > 1 ? "s ont" : " a"} gardé le même numéro. ` : ""}Les changements isolés (remplacement d'urgence) pèsent moitié moins que ceux qui se répètent.`, { taille: 8, couleur: COULEUR.gris, italique: true, avant: 3 }),
  ], { ancre: "t" });
  return { libelle: "POSTES", titre, corps };
}

function joueurs(ids: Ids, c: ContenuRapport["joueurs"]): { libelle: string; titre: string; corps: string } {
  const libelle = c.entraineur ? `ÉQUIPE ADVERSE  ·  ENTRAÎNEUR : ${c.entraineur.toUpperCase()}` : "ÉQUIPE ADVERSE";
  const titre = "Joueurs clés & discipline";
  if (!c.kpi) {
    return { libelle, titre, corps: vide(ids, "Aucune feuille de match de cette équipe n'a été analysée sur la saison : pas de joueur clé ni de discipline. Importez ses feuilles FMI pour enrichir ce rapport.") };
  }
  let corps = "";
  // Bandeau de chiffres, comme les cartes de "Leur saison".
  const w = 1965960, ecart = 121920;
  const kpi: [string, string, string][] = [
    [c.kpi.danger, "Danger / 100", "menace offensive"], [c.kpi.stabilite, "Stabilité du onze / 100", c.kpi.stabiliteNote],
    [c.kpi.fatigue, "Fatigue / 100", c.kpi.fatigueNote], [c.kpi.changements, "Changements / match", "moyenne"],
  ];
  kpi.forEach(([valeur, nom, note], i) => {
    const x = PAGE.gauche + i * (w + ecart);
    corps += carte(ids(), `Chiffre ${nom}`, { x, y: PAGE.haut, cx: w, cy: 820000 }, COULEUR.carte);
    corps += texte(ids(), `Valeur ${nom}`, { x, y: PAGE.haut + 40000, cx: w, cy: 450000 }, [para(valeur, { taille: 26, gras: true, couleur: COULEUR.vertFonce, align: "ctr" })], { ancre: "ctr" });
    corps += texte(ids(), `Libelle ${nom}`, { x, y: PAGE.haut + 490000, cx: w, cy: 150000 }, [para(nom, { taille: 9, couleur: COULEUR.gris, align: "ctr" })], { ancre: "ctr" });
    corps += texte(ids(), `Note ${nom}`, { x, y: PAGE.haut + 640000, cx: w, cy: 150000 }, [para(note, { taille: 8, couleur: COULEUR.gris, italique: true, align: "ctr" })], { ancre: "ctr" });
  });

  // Joueurs cles (impact sur les points) et sanctions.
  const yS = PAGE.haut + 820000 + 140000;
  const wl = 4572000;
  corps += titreSection(ids(), "Joueurs clés (points par match avec eux, en plus)", PAGE.gauche, yS, wl);
  if (c.cles.length === 0) {
    corps += texte(ids(), "Aucun joueur cle", { x: PAGE.gauche, y: yS + 260000, cx: wl, cy: 400000 }, [para("Pas assez de matchs pour isoler des joueurs clés.", { taille: 10, couleur: COULEUR.gris })], { ancre: "t" });
  } else {
    const entete: LigneTableau = { hauteur: 260000, cellules: ["Joueur", "Poste", "Titu. / présent", "Impact"].map((t, i) => cell(t, { gras: true, couleur: COULEUR.vertFonce, fond: COULEUR.carte, taille: 9, align: i > 0 ? "ctr" : "l" })) };
    const lignes: LigneTableau[] = c.cles.slice(0, 5).map((j) => ({
      hauteur: 280000,
      cellules: [cell(abreger(j.nom, 24), { gras: true, taille: 9 }), cell(j.poste, { align: "ctr", taille: 9 }), cell(j.titularisations, { align: "ctr", taille: 9 }), cell(j.impact, { align: "ctr", gras: true, couleur: COULEUR.vert, taille: 9 })],
    }));
    corps += tableau(ids(), "Joueurs cles", { x: PAGE.gauche, y: yS + 260000 }, [1800000, 650000, 1000000, 1122000], [entete, ...lignes], { filets: "horizontal", taille: 9 });
  }
  const ySanc = yS + 260000 + (c.cles.length ? 260000 + Math.min(5, c.cles.length) * 280000 : 300000) + 100000;
  corps += titreSection(ids(), "Les plus sanctionnés", PAGE.gauche, ySanc, wl);
  corps += texte(ids(), "Sanctionnes", { x: PAGE.gauche, y: ySanc + 240000, cx: wl, cy: 330000 }, [
    para(c.avertis.length ? c.avertis.slice(0, 5).map((j) => `${abreger(j.nom, 22)} (${j.jaunes} J${j.rouges ? `, ${j.rouges} R` : ""})`).join("  ·  ") : "Aucun carton enregistré.", { taille: 9 }),
  ], { ancre: "t" });

  // Buteurs et discipline.
  const xr = PAGE.gauche + wl + 182880, wr = PAGE.droite - xr;
  corps += titreSection(ids(), "Meilleurs buteurs", xr, yS, wr);
  const maxButs = Math.max(1, ...c.buteurs.map((b) => b.buts));
  if (c.buteurs.length === 0) {
    corps += texte(ids(), "Aucun buteur", { x: xr, y: yS + 260000, cx: wr, cy: 300000 }, [para("Aucun but enregistré.", { taille: 10, couleur: COULEUR.gris })], { ancre: "t" });
  }
  c.buteurs.slice(0, 5).forEach((b, i) => {
    const y = yS + 270000 + i * 270000;
    corps += texte(ids(), `Buteur ${i + 1}`, { x: xr, y, cx: 1500000, cy: 220000 }, [para(abreger(b.nom, 20), { taille: 9, gras: i === 0 })], { ancre: "ctr" });
    corps += carte(ids(), `Barre buteur ${i + 1}`, { x: xr + 1550000, y: y + 55000, cx: Math.max(54864, ((wr - 1550000 - 420000) * b.buts) / maxButs), cy: 110000 }, i === 0 ? COULEUR.jaune : COULEUR.vert);
    corps += texte(ids(), `Buts ${i + 1}`, { x: xr + wr - 380000, y, cx: 380000, cy: 220000 }, [para(String(b.buts), { taille: 11, gras: true, couleur: COULEUR.vertFonce, align: "r" })], { ancre: "ctr" });
  });
  const yDisc = yS + 270000 + Math.max(1, Math.min(5, c.buteurs.length)) * 270000 + 100000;
  const hDisc = Math.min(900000, Math.max(500000, PAGE.bas - yDisc));
  corps += carte(ids(), "Carte discipline", { x: xr, y: yDisc, cx: wr, cy: hDisc }, COULEUR.carte);
  corps += texte(ids(), "Discipline", { x: xr + 137160, y: yDisc + 45720, cx: wr - 274320, cy: hDisc - 91440 }, [
    para("DISCIPLINE", { taille: 8, gras: true, couleur: COULEUR.vert }),
    para(c.discipline || "Pas de donnée.", { taille: 9, avant: 2 }),
  ], { ancre: "t" });
  return { libelle, titre, corps };
}

function face(ids: Ids, c: ContenuRapport["face"]): { libelle: string; titre: string; corps: string } {
  let corps = "";
  const wl = 4023360;
  corps += carte(ids(), "Carte bilan", { x: PAGE.gauche, y: PAGE.haut, cx: wl, cy: 900000 }, COULEUR.carte);
  if (c.joues === 0) {
    corps += texte(ids(), "Aucune rencontre", { x: PAGE.gauche + 182880, y: PAGE.haut, cx: wl - 365760, cy: 900000 }, [para("Aucune rencontre passée enregistrée entre ces deux clubs.", { taille: 12 })], { ancre: "ctr" });
  } else {
    corps += texte(ids(), "Bilan", { x: PAGE.gauche + 182880, y: PAGE.haut + 80000, cx: 2000000, cy: 740000 }, [para(c.bilan, { taille: 36, gras: true, couleur: COULEUR.vertFonce })], { ancre: "ctr" });
    corps += texte(ids(), "Detail bilan", { x: PAGE.gauche + 2200000, y: PAGE.haut + 80000, cx: wl - 2380000, cy: 740000 }, [
      para(`V-N-D sur ${c.joues} match${c.joues > 1 ? "s" : ""}`, { taille: 10, couleur: COULEUR.gris }),
      para(`Buts : ${c.buts}`, { taille: 10, couleur: COULEUR.gris, avant: 3 }),
    ], { ancre: "ctr" });
  }
  corps += titreSection(ids(), "Les rencontres", PAGE.gauche, PAGE.haut + 1000000, wl);
  c.rencontres.forEach((r, i) => {
    const y = PAGE.haut + 1290000 + i * 330000;
    corps += pastille(ids, r.issue, PAGE.gauche, y, 260000, 10);
    corps += texte(ids(), `Score ${i + 1}`, { x: PAGE.gauche + 340000, y, cx: 900000, cy: 260000 }, [para(r.score, { taille: 13, gras: true })], { ancre: "ctr" });
    corps += texte(ids(), `Lieu ${i + 1}`, { x: PAGE.gauche + 1300000, y, cx: 1400000, cy: 260000 }, [para(r.lieu, { taille: 10, couleur: COULEUR.gris })], { ancre: "ctr" });
    corps += texte(ids(), `Date ${i + 1}`, { x: PAGE.gauche + wl - 1300000, y, cx: 1300000, cy: 260000 }, [para(r.date, { taille: 10, couleur: COULEUR.gris, align: "r" })], { ancre: "ctr" });
    corps += trait(ids(), `Filet ${i + 1}`, PAGE.gauche, y + 295000, wl);
  });

  // L'arbitre : la carte sombre du modele.
  const xa = PAGE.droite - wl;
  corps += carte(ids(), "Carte arbitre", { x: xa, y: PAGE.haut, cx: wl, cy: 3340000 }, COULEUR.vertFonce);
  corps += texte(ids(), "Titre arbitre", { x: xa + 182880, y: PAGE.haut + 137160, cx: wl - 365760, cy: 228600 }, [para("ARBITRE", { taille: 10, gras: true, couleur: COULEUR.jaune })], { ancre: "ctr" });
  const a = c.arbitre;
  if (!a) {
    corps += texte(ids(), "Arbitre inconnu", { x: xa + 182880, y: PAGE.haut + 450000, cx: wl - 365760, cy: 1200000 }, [
      para(c.arbitreSaisi ? c.arbitreSaisi : "Aucun arbitre désigné", { taille: 18, gras: true, couleur: COULEUR.blanc }),
      para(c.arbitreSaisi ? "Pas encore d'historique de cet arbitre dans la base." : "Il apparaît ici dès que le match programmé porte son arbitre.", { taille: 10, couleur: COULEUR.vertClair, avant: 4 }),
    ], { ancre: "t" });
    return { libelle: "AVANT LE COUP D'ENVOI", titre: "Face-à-face & arbitre", corps };
  }
  corps += texte(ids(), "Nom arbitre", { x: xa + 182880, y: PAGE.haut + 430000, cx: wl - 365760, cy: 600000 }, [
    para(a.nom, { taille: 18, gras: true, couleur: COULEUR.blanc }),
    para(a.profil, { taille: 11, couleur: COULEUR.vertClair, avant: 2 }),
  ], { ancre: "t" });
  const stats: [string, string][] = [["Matchs au sifflet", a.matchs], ["Cartons par match", a.cartonsParMatch], ["Cartons donnés", a.cartons]];
  stats.forEach(([nom, valeur], i) => {
    const y = PAGE.haut + 1200000 + i * 380000;
    corps += texte(ids(), `Stat ${nom}`, { x: xa + 182880, y, cx: 1700000, cy: 300000 }, [para(nom, { taille: 10, couleur: COULEUR.vertClair })], { ancre: "ctr" });
    corps += texte(ids(), `Valeur ${nom}`, { x: xa + 1900000, y, cx: wl - 2082880, cy: 300000 }, [para(valeur, { taille: 13, gras: true, couleur: COULEUR.blanc, align: "r" })], { ancre: "ctr" });
  });
  corps += texte(ids(), "Titre sanctions", { x: xa + 182880, y: PAGE.haut + 2400000, cx: wl - 365760, cy: 180000 }, [para("SANCTIONS LES PLUS DONNÉES", { taille: 8, gras: true, couleur: COULEUR.vertClair })], { ancre: "ctr" });
  corps += texte(ids(), "Sanctions", { x: xa + 182880, y: PAGE.haut + 2620000, cx: wl - 365760, cy: 640000 },
    a.motifs.length ? a.motifs.slice(0, 3).map((m, i) => para(m, { taille: 10, couleur: COULEUR.blanc, puce: true, avant: i ? 3 : 0 })) : [para("Aucun motif connu.", { taille: 10, couleur: COULEUR.vertClair })], { ancre: "t" });
  return { libelle: "AVANT LE COUP D'ENVOI", titre: "Face-à-face & arbitre", corps };
}

const PAGES: Record<PageAnalyse, (ids: Ids, c: ContenuRapport) => { libelle: string; titre: string; corps: string }> = {
  comparatif: (ids, c) => comparatif(ids, c.comparatif),
  forme: (ids, c) => forme(ids, c.forme),
  pistes: (ids, c) => pistes(ids, c.pistes),
  systeme: (ids, c) => systeme(ids, c.systeme),
  onze: (ids, c) => onze(ids, c.onze),
  polyvalence: (ids, c) => polyvalence(ids, c.polyvalence),
  joueurs: (ids, c) => joueurs(ids, c.joueurs),
  face: (ids, c) => face(ids, c.face),
};

/** Le XML complet d'une page d'analyse (`modele` : une diapositive du modele, dont on reprend l'enveloppe) et ses images. */
export function construirePageAnalyse(page: PageAnalyse, contenu: ContenuRapport, numeroPage: number, modele: string): PageConstruite {
  const ids = compteurIds();
  const { debut, fin } = squeletteDiapositive(modele);
  const { libelle, titre, corps } = PAGES[page](ids, contenu);
  const xml = debut + enTete(ids, RID_ICONE, libelle, titre) + corps + piedDePage(ids, contenu.libelleEquipe, numeroPage) + fin;
  return { xml, images: [ICONE[page]] };
}
