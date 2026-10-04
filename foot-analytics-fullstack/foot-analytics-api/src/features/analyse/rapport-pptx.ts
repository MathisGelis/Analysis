// src/features/analyse/rapport-pptx.ts
//
// RAPPORT D'AVANT-MATCH EN POWERPOINT : remplit le modele du staff (modele/rapport-avant-match.pptx, 7 pages) avec le
// contenu du rapport pre-match (rapport-pptx-contenu.ts), ne garde que les pages demandees et renumerote les pieds de
// page. Le modele garde sa mise en forme ; les champs inconnus restent VIDES, a completer dans PowerPoint.
// Les formes sont reperees par leur identifiant dans le XML du modele (voir `pptx-xml.ts`).

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { placesDe } from "./disposition-onze";
import {
  ecrireCellule, ecrireTexte, couleurDe, colorer, dupliquer, ecrire, fermerPaquet, forme, lire, modifierForme, ouvrirPaquet,
  Paquet, positionner, purgerImages, retirerDiapositive, retirerForme, ajouterForme, echapper,
} from "./pptx-xml";
import { ContenuRapport, PAGES_RAPPORT, PageRapport } from "./rapport-pptx-contenu";

/** Le modele du staff ; copie dans dist avec le reste (assets de nest-cli.json). */
export const CHEMIN_MODELE = join(__dirname, "modele", "rapport-avant-match.pptx");

let modeleEnMemoire: Uint8Array | null = null;
export function lireModele(): Uint8Array {
  return (modeleEnMemoire ??= new Uint8Array(readFileSync(CHEMIN_MODELE)));
}

/** Numero de la diapositive du modele pour chaque page. */
const DIAPOSITIVE: Readonly<Record<PageRapport, number>> = {
  couverture: 1, match: 2, saison: 3, forces: 4, dispositif: 5, ambiance: 6, cles: 7,
};

/** Formes du pied de page (equipe, numero de page) des diapositives qui en ont un. */
const PIED: Readonly<Partial<Record<PageRapport, { libelle: number; numero: number }>>> = {
  match: { libelle: 71, numero: 72 }, saison: { libelle: 119, numero: 120 }, forces: { libelle: 142, numero: 143 },
  dispositif: { libelle: 197, numero: 198 }, ambiance: { libelle: 228, numero: 229 },
};

const chemin = (page: PageRapport) => `ppt/slides/slide${DIAPOSITIVE[page]}.xml`;

/* -------------------------------------- terrain (page 5) -------------------------------------- */

/** Rond et numero (deux formes) de chaque numero de maillot sur le terrain du modele. */
const CERCLES: Readonly<Record<number, [number, number]>> = {
  1: [159, 160], 2: [161, 162], 4: [163, 164], 5: [165, 166], 3: [167, 168], 7: [169, 170],
  6: [171, 172], 8: [173, 174], 11: [175, 176], 9: [177, 178], 10: [179, 180],
};

// Geometrie du terrain du modele (EMU) : le jeu va de gauche a droite, le gardien est a gauche.
const DIAMETRE = 384048;
const GARDIEN_X = 722376;          // bord gauche du rond du gardien
const LIGNE_X0 = 1591056;          // bord gauche du rond de la premiere ligne (la defense)
const LIGNE_X1 = 4059936;          // et de la derniere (l'attaque)
const CENTRE_Y = 2834640;          // axe horizontal du terrain
const ETENDUE_Y = 2377440;         // ecart entre les ronds extremes d'une ligne a quatre ou plus
const NOM_HAUTEUR = 140000;
const NOM_ID0 = 1001;              // identifiants des noms ajoutes (le modele s'arrete a 247)

/** Raccourcit un nom pour qu'il tienne sous son rond : "BOURGEOIS BIDDI" -> "BOURGEOIS B.". */
function abreger(nom: string, max: number): string {
  if (nom.length <= max) return nom;
  const mots = nom.split(" ");
  if (mots.length > 1) {
    const court = `${mots[0]} ${mots.slice(1).map((m) => `${m[0]}.`).join(" ")}`;
    if (court.length <= max) return court;
  }
  return `${nom.slice(0, Math.max(1, max - 1))}.`;
}

function formeNom(id: number, nom: string, x: number, y: number, cx: number): string {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Nom joueur ${id - NOM_ID0 + 1}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>`
    + `<p:spPr><a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(cx)}" cy="${NOM_HAUTEUR}"/></a:xfrm>`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr>`
    + `<p:txBody><a:bodyPr anchorCtr="0" anchor="t" bIns="0" lIns="0" spcFirstLastPara="1" rIns="0" wrap="square" tIns="0"><a:noAutofit/></a:bodyPr><a:lstStyle/>`
    + `<a:p><a:pPr indent="0" lvl="0" marL="0" marR="0" rtl="0" algn="ctr"><a:spcBef><a:spcPts val="0"/></a:spcBef><a:spcAft><a:spcPts val="0"/></a:spcAft><a:buNone/></a:pPr>`
    + `<a:r><a:rPr b="1" i="0" lang="fr-FR" sz="800" u="none" cap="none" strike="noStrike"><a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill>`
    + `<a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/><a:sym typeface="Arial"/></a:rPr><a:t>${echapper(nom)}</a:t></a:r></a:p></p:txBody></p:sp>`;
}

/** Place les onze ronds selon le dispositif, et ecrit le nom du joueur probable sous chaque numero. */
function placerOnze(xml: string, systeme: string, noms: Record<number, string>): string {
  const places = placesDe(systeme);
  const lignes = Math.max(...places.map((p) => p.ligne));
  const pasX = lignes > 1 ? (LIGNE_X1 - LIGNE_X0) / (lignes - 1) : 0;
  let r = xml;
  let suivant = NOM_ID0;
  for (const p of places) {
    const gauche = p.ligne === 0 ? GARDIEN_X : LIGNE_X0 + (p.ligne - 1) * pasX;
    const pasY = p.effectif <= 1 ? 0 : p.effectif === 2 ? 914400 : ETENDUE_Y / (p.effectif - 1);
    const haut = CENTRE_Y + (p.rang - (p.effectif - 1) / 2) * pasY - DIAMETRE / 2;
    for (const id of CERCLES[p.numero]) r = modifierForme(r, id, (b) => positionner(b, { x: gauche, y: haut }));
    const nom = noms[p.numero];
    if (nom) {
      const largeur = p.ligne === 0 || pasX === 0 ? 1000000 : Math.min(1000000, pasX - 40000);
      r = ajouterForme(r, formeNom(suivant++, abreger(nom, Math.floor(largeur / 12700 / 5.6)), gauche + DIAMETRE / 2 - largeur / 2, haut + DIAMETRE + 25000, largeur));
    }
  }
  return r;
}

/* ------------------------------------------ pages ------------------------------------------ */

function couverture(xml: string, c: ContenuRapport["couverture"]): string {
  let r = xml;
  r = ecrireTexte(r, 19, [c.entete]);
  r = ecrireTexte(r, 21, [c.club]);
  r = ecrireTexte(r, 22, [c.affiche]);
  r = ecrireTexte(r, 25, [c.date]);
  r = ecrireTexte(r, 28, [c.lieu]);
  r = ecrireTexte(r, 31, [c.classement]);
  return r;
}

function match(xml: string, c: ContenuRapport["match"]): string {
  let r = xml;
  for (const [id, texte] of [[45, c.jour], [50, c.convocation], [55, c.adresse], [60, c.enjeu], [64, c.surface], [66, c.dimensions], [68, c.etat], [70, c.aSavoir]] as const) {
    r = ecrireTexte(r, id, [texte]);
  }
  return r;
}

/** Les trois lignes "derniers matchs" du modele : rond, lettre, adversaire, score, et le trait qui les separe de la suivante. */
const LIGNES_MATCHS = [
  { rond: 98, lettre: 99, libelle: 100, score: 101, trait: 102 },
  { rond: 103, lettre: 104, libelle: 105, score: 106, trait: 107 },
  { rond: 108, lettre: 109, libelle: 110, score: 111, trait: null },
] as const;

function saison(xml: string, c: ContenuRapport["saison"]): string {
  // Les couleurs V / N / D sont celles des trois ronds du modele.
  const couleurs = { V: couleurDe(forme(xml, 98)), N: couleurDe(forme(xml, 103)), D: couleurDe(forme(xml, 108)) };
  let r = xml;
  for (const [id, texte] of [[83, c.classement], [86, c.points], [89, c.vnd], [92, c.bp], [95, c.bc]] as const) r = ecrireTexte(r, id, [texte]);

  LIGNES_MATCHS.forEach((l, i) => {
    const m = c.derniers[i];
    if (!m) {
      // Pas de match a cette ligne (equipe qui a joue moins de trois matchs) : on retire la ligne entiere, rond compris.
      for (const id of [l.rond, l.lettre, l.libelle, l.score]) r = retirerForme(r, id);
    } else {
      const couleur = couleurs[m.issue];
      if (couleur) r = modifierForme(r, l.rond, (b) => colorer(b, couleur));
      r = ecrireTexte(r, l.lettre, [m.issue]);
      r = ecrireTexte(r, l.libelle, [m.libelle]);
      r = ecrireTexte(r, l.score, [m.score]);
    }
    // Un trait separe une ligne de la suivante : il n'a de sens que s'il y a une ligne apres.
    if (l.trait !== null && !c.derniers[i + 1]) r = retirerForme(r, l.trait);
  });

  c.domicile.forEach((t, col) => { r = ecrireCellule(r, 113, 1, col + 1, t); });
  c.exterieur.forEach((t, col) => { r = ecrireCellule(r, 113, 2, col + 1, t); });
  r = ecrireTexte(r, 115, [c.jaunes]);
  r = ecrireTexte(r, 117, [c.rouges]);
  return ecrireTexte(r, 118, [["Meilleur buteur : ", c.buteur]]);
}

function forces(xml: string, c: ContenuRapport["forces"]): string {
  // Le modele a trois puces d'une ligne en 13 pt : plus il y a de puces, plus la police diminue pour que la liste tienne dans la carte.
  const options = { taille: c.taille };
  let r = ecrireTexte(xml, 134, c.forces, options);
  r = ecrireTexte(r, 139, c.faiblesses, options);
  return ecrireTexte(r, 141, [["À EXPLOITER   ", c.exploiter]]);
}

/** Les trois joueurs a surveiller du modele : rond + numero, "Nom — Poste", description. */
const SURVEILLER = [
  { numero: 184, titre: 185, detail: 186 }, { numero: 188, titre: 189, detail: 190 }, { numero: 192, titre: 193, detail: 194 },
] as const;

function dispositif(xml: string, c: ContenuRapport["dispositif"]): string {
  let r = ecrireTexte(xml, 152, [c.titre]);
  // Les noms se lisent dans les numeros, donc valent meme quand le systeme est inconnu : on les ecrit alors sur la
  // disposition du modele (un 4-4-2), a deplacer dans PowerPoint ; le titre reste vide.
  if (c.systeme || Object.keys(c.noms).length > 0) {
    r = placerOnze(r, c.systeme ?? "4-4-2", c.noms);
    // Comment lire le dispositif : d'ou il vient et avec quelle confiance (a gauche, en face de "Sens de leur attaque").
    if (c.source) {
      const legende = dupliquer(r, 181, NOM_ID0 + 20, "Origine du dispositif")
        .replace('algn="r"', 'algn="l"').replace('<a:t>Sens de leur attaque  →</a:t>', `<a:t>${echapper(c.source)}</a:t>`);
      r = ajouterForme(r, positionner(legende, { cx: 3300000 }));
    }
  }
  SURVEILLER.forEach((s, i) => {
    const j = c.surveiller[i];
    r = ecrireTexte(r, s.numero, [j?.numero ?? ""]);
    r = ecrireTexte(r, s.titre, [j?.titre ?? ""]);
    r = ecrireTexte(r, s.detail, [j?.detail ?? ""]);
  });
  return ecrireTexte(r, 196, [["Style : ", ""], ["Bloc : ", ""], ["Relance : ", ""]]);
}

function ambiance(xml: string, c: ContenuRapport["ambiance"]): string {
  let r = ecrireTexte(xml, 212, [c.publicAmbiance]);
  r = ecrireTexte(r, 217, c.confrontations);
  r = ecrireTexte(r, 222, [c.arbitrage]);
  return ecrireTexte(r, 227, [c.infos]);
}

function cles(xml: string, c: ContenuRapport["cles"]): string {
  let r = xml;
  c.cles.forEach((texte, i) => { r = ecrireTexte(r, [240, 243, 246][i], [texte]); });
  return ecrireTexte(r, 247, [c.message]);
}

const REMPLIR: Readonly<Record<PageRapport, (xml: string, c: ContenuRapport) => string>> = {
  couverture: (xml, c) => couverture(xml, c.couverture),
  match: (xml, c) => match(xml, c.match),
  saison: (xml, c) => saison(xml, c.saison),
  forces: (xml, c) => forces(xml, c.forces),
  dispositif: (xml, c) => dispositif(xml, c.dispositif),
  ambiance: (xml, c) => ambiance(xml, c.ambiance),
  cles: (xml, c) => cles(xml, c.cles),
};

/* ----------------------------------------- assemblage ----------------------------------------- */

/** Remplit le modele avec `contenu` et ne garde que `pages` (dans l'ordre du modele), pieds de page renumerotes. */
export function genererRapportPptx(modele: Uint8Array, contenu: ContenuRapport, pages: readonly PageRapport[]): Uint8Array {
  const gardees = PAGES_RAPPORT.filter((p) => pages.includes(p));
  if (gardees.length === 0) throw new Error("Aucune page a produire");
  const paquet: Paquet = ouvrirPaquet(modele);

  // D'abord la structure (retrait des pages), ensuite le contenu des pages qui restent.
  for (const p of PAGES_RAPPORT) if (!gardees.includes(p)) retirerDiapositive(paquet, DIAPOSITIVE[p]);
  purgerImages(paquet);

  gardees.forEach((page, i) => {
    let xml = REMPLIR[page](lire(paquet, chemin(page)), contenu);
    const pied = PIED[page];
    if (pied) {
      xml = ecrireTexte(xml, pied.libelle, [`${contenu.libelleEquipe}  ·  PRÉSENTATION ADVERSAIRE`]);
      xml = ecrireTexte(xml, pied.numero, [String(i + 1)]);
    }
    ecrire(paquet, chemin(page), xml);
  });
  return fermerPaquet(paquet);
}
