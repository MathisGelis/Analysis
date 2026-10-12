// src/features/analyse/pptx-formes.ts
//
// FORMES AU STYLE DU MODELE du staff (cartes arrondies, pastilles, tableaux, textes Arial) : ce qu'il faut pour ajouter a
// la presentation des pages qui n'existent pas dans le modele, sans en changer l'allure. Les couleurs, les tailles et les
// proportions sont celles du modele (voir `COULEUR`). Chaque fonction rend le XML d'une forme PowerPoint native, donc
// modifiable a la main (un tableau est un vrai tableau, un texte un vrai texte). Fonctions pures.

import { echapper } from "./pptx-xml";

/** La palette du modele (hex, sans #). */
export const COULEUR = {
  vertFonce: "0F3D2E", vert: "1F6B4A", carte: "E8F2EC", rouge: "C8412F", rougePale: "FBEAE7",
  jaune: "F2B705", gris: "6B7570", encre: "1B1F1D", vertClair: "A9C9B8", blanc: "FFFFFF", bordure: "D6DED9",
} as const;

/** Marges de la page (EMU, 914400 = 1 pouce) : celles du modele. */
export const PAGE = { gauche: 457200, droite: 8686800, largeur: 8229600, haut: 1188720, bas: 4700000 } as const;

/** Un morceau de texte d'un seul style. `taille` en points. */
export interface Segment { t: string; taille?: number; gras?: boolean; italique?: boolean; couleur?: string }

export interface Paragraphe {
  segments: Segment[];
  align?: "l" | "ctr" | "r";
  /** Espace avant, en points. */
  avant?: number;
  /** Puce ronde (le retrait est celui du modele). */
  puce?: boolean;
}

/** Raccourci : un paragraphe d'un seul style. */
export function para(t: string, style: Omit<Segment, "t"> & Omit<Paragraphe, "segments"> = {}): Paragraphe {
  const { align, avant, puce, ...segment } = style;
  return { segments: [{ t, ...segment }], align, avant, puce };
}

const POLICE = '<a:latin typeface="Arial"/><a:ea typeface="Arial"/><a:cs typeface="Arial"/><a:sym typeface="Arial"/>';

function xmlSegment(s: Segment, defaut: { taille: number; couleur: string }): string {
  const taille = Math.round((s.taille ?? defaut.taille) * 100);
  return `<a:r><a:rPr b="${s.gras ? 1 : 0}" i="${s.italique ? 1 : 0}" lang="fr-FR" sz="${taille}" u="none" cap="none" strike="noStrike">`
    + `<a:solidFill><a:srgbClr val="${s.couleur ?? defaut.couleur}"/></a:solidFill>${POLICE}</a:rPr><a:t>${echapper(s.t)}</a:t></a:r>`;
}

function xmlParagraphe(p: Paragraphe, defaut: { taille: number; couleur: string }): string {
  const puce = p.puce
    ? `<a:buClr><a:srgbClr val="${p.segments[0]?.couleur ?? defaut.couleur}"/></a:buClr><a:buFont typeface="Arial"/><a:buChar char="•"/>`
    : "<a:buNone/>";
  const retrait = p.puce ? 'indent="-171450" marL="171450"' : 'indent="0" marL="0"';
  return `<a:p><a:pPr ${retrait} lvl="0" marR="0" rtl="0" algn="${p.align ?? "l"}"><a:spcBef><a:spcPts val="${Math.round((p.avant ?? 0) * 100)}"/></a:spcBef>`
    + `<a:spcAft><a:spcPts val="0"/></a:spcAft>${puce}</a:pPr>${p.segments.map((s) => xmlSegment(s, defaut)).join("")}</a:p>`;
}

const ENTETE_CORPS = (ancre: string, marge = 0) =>
  `<a:bodyPr anchorCtr="0" anchor="${ancre}" bIns="${marge}" lIns="${marge}" spcFirstLastPara="1" rIns="${marge}" wrap="square" tIns="${marge}"><a:noAutofit/></a:bodyPr><a:lstStyle/>`;

const xfrm = (x: number, y: number, cx: number, cy: number) =>
  `<a:xfrm><a:off x="${Math.round(x)}" y="${Math.round(y)}"/><a:ext cx="${Math.round(cx)}" cy="${Math.round(cy)}"/></a:xfrm>`;

/** Contour comme le modele : meme couleur que le fond, 1 pt. */
const contour = (hex: string | null) => hex
  ? `<a:ln cap="flat" cmpd="sng" w="12700"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd len="sm" w="sm" type="none"/><a:tailEnd len="sm" w="sm" type="none"/></a:ln>`
  : "<a:ln><a:noFill/></a:ln>";

/** Compteur d'identifiants d'une diapositive : le 1 est celui du groupe racine. */
export function compteurIds(): () => number {
  let n = 1;
  return () => ++n;
}

export interface Zone { x: number; y: number; cx: number; cy: number }

/** Carte arrondie (ou rond) pleine, sans texte. Le rayon des coins est celui du modele (0,08 pouce). */
export function carte(id: number, nom: string, z: Zone, fond: string, forme: "roundRect" | "ellipse" | "rect" = "roundRect"): string {
  const adj = forme === "roundRect" ? `<a:avLst><a:gd fmla="val ${Math.min(50000, Math.round((73152 / Math.min(z.cx, z.cy)) * 100000))}" name="adj"/></a:avLst>` : "<a:avLst/>";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${echapper(nom)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(z.x, z.y, z.cx, z.cy)}`
    + `<a:prstGeom prst="${forme}">${adj}</a:prstGeom><a:solidFill><a:srgbClr val="${fond}"/></a:solidFill>${contour(fond)}</p:spPr>`
    + `<p:txBody>${ENTETE_CORPS("ctr", 91425)}<a:p><a:endParaRPr/></a:p></p:txBody></p:sp>`;
}

/** Zone de texte sans fond. `defaut` : taille (pt) et couleur des segments qui n'en donnent pas. */
export function texte(
  id: number, nom: string, z: Zone, paragraphes: Paragraphe[],
  options: { ancre?: "t" | "ctr" | "b"; taille?: number; couleur?: string } = {},
): string {
  const defaut = { taille: options.taille ?? 11, couleur: options.couleur ?? COULEUR.encre };
  const corps = (paragraphes.length ? paragraphes : [para("")]).map((p) => xmlParagraphe(p, defaut)).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${echapper(nom)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(z.x, z.y, z.cx, z.cy)}`
    + `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody>${ENTETE_CORPS(options.ancre ?? "t")}${corps}</p:txBody></p:sp>`;
}

/** Carte pleine qui porte elle-meme son texte (un libelle sur fond colore, une pastille avec sa lettre). */
export function carteTexte(
  id: number, nom: string, z: Zone, fond: string, paragraphes: Paragraphe[],
  options: { forme?: "roundRect" | "ellipse" | "rect"; ancre?: "t" | "ctr" | "b"; taille?: number; couleur?: string; marge?: number } = {},
): string {
  const defaut = { taille: options.taille ?? 11, couleur: options.couleur ?? COULEUR.blanc };
  const forme = options.forme ?? "roundRect";
  const adj = forme === "roundRect" ? `<a:avLst><a:gd fmla="val ${Math.min(50000, Math.round((73152 / Math.min(z.cx, z.cy)) * 100000))}" name="adj"/></a:avLst>` : "<a:avLst/>";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${echapper(nom)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr>${xfrm(z.x, z.y, z.cx, z.cy)}`
    + `<a:prstGeom prst="${forme}">${adj}</a:prstGeom><a:solidFill><a:srgbClr val="${fond}"/></a:solidFill>${contour(fond)}</p:spPr>`
    + `<p:txBody>${ENTETE_CORPS(options.ancre ?? "ctr", options.marge ?? 0)}${paragraphes.map((p) => xmlParagraphe(p, defaut)).join("")}</p:txBody></p:sp>`;
}

/** Image du dossier media, citee par `rId` dans les relations de la diapositive. */
export function image(id: number, nom: string, rId: string, z: Zone): string {
  return `<p:pic><p:nvPicPr><p:cNvPr descr="${echapper(nom)}" id="${id}" name="${echapper(nom)}"/><p:cNvPicPr preferRelativeResize="0"/><p:nvPr/></p:nvPicPr>`
    + `<p:blipFill rotWithShape="1"><a:blip r:embed="${rId}"><a:alphaModFix/></a:blip><a:srcRect b="0" l="0" r="0" t="0"/><a:stretch/></p:blipFill>`
    + `<p:spPr>${xfrm(z.x, z.y, z.cx, z.cy)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr></p:pic>`;
}

/** Trait horizontal fin (separateur de lignes). */
export function trait(id: number, nom: string, x: number, y: number, cx: number, couleur: string = COULEUR.bordure): string {
  return `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="${id}" name="${echapper(nom)}"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr>${xfrm(x, y, cx, 0)}`
    + `<a:prstGeom prst="straightConnector1"><a:avLst/></a:prstGeom><a:noFill/>${contour(couleur).replace('w="12700"', 'w="9525"')}</p:spPr></p:cxnSp>`;
}

/* ---------------------------------------- tableaux ---------------------------------------- */

export interface Cellule {
  paragraphes: Paragraphe[];
  fond?: string;
  /** Fusion sur plusieurs colonnes. */
  colonnes?: number;
}

export interface LigneTableau { hauteur: number; cellules: Cellule[] }

/** Cellule d'un seul texte. */
export function cell(t: string, style: Omit<Segment, "t"> & { align?: "l" | "ctr" | "r"; fond?: string } = {}): Cellule {
  const { align, fond, ...segment } = style;
  return { paragraphes: [para(t, { ...segment, align })], fond };
}

const bordure = (cote: string, hex: string | null) => hex
  ? `<a:${cote} cap="flat" cmpd="sng" w="9525"><a:solidFill><a:srgbClr val="${hex}"/></a:solidFill><a:prstDash val="solid"/><a:round/><a:headEnd len="sm" w="sm" type="none"/><a:tailEnd len="sm" w="sm" type="none"/></a:${cote}>`
  : `<a:${cote} w="0"><a:noFill/></a:${cote}>`;

/**
 * Tableau natif au style du tableau du modele (texte 10 pt, filets gris-vert). `filets` : "complet" comme le modele, ou
 * "horizontal" (seulement sous chaque ligne), plus leger pour les longues listes.
 */
export function tableau(
  id: number, nom: string, origine: { x: number; y: number }, colonnes: number[], lignes: LigneTableau[],
  options: { filets?: "complet" | "horizontal"; taille?: number } = {},
): string {
  const taille = options.taille ?? 10;
  const complet = (options.filets ?? "complet") === "complet";
  const largeur = colonnes.reduce((s, c) => s + c, 0);
  const hauteur = lignes.reduce((s, l) => s + l.hauteur, 0);
  const defaut = { taille, couleur: COULEUR.encre };
  const rangees = lignes.map((l) => {
    let col = 0;
    const cellules = l.cellules.map((c) => {
      const span = c.colonnes ?? 1;
      col += span;
      const attr = span > 1 ? ` gridSpan="${span}"` : "";
      const tc = `<a:tc${attr}><a:txBody><a:bodyPr/><a:lstStyle/>${(c.paragraphes.length ? c.paragraphes : [para("")]).map((p) => xmlParagraphe(p, defaut)).join("")}</a:txBody>`
        + `<a:tcPr marT="45725" marB="45725" marR="91450" marL="91450" anchor="ctr">${bordure("lnL", complet ? COULEUR.bordure : null)}${bordure("lnR", complet ? COULEUR.bordure : null)}`
        + `${bordure("lnT", complet ? COULEUR.bordure : null)}${bordure("lnB", COULEUR.bordure)}`
        + `${c.fond ? `<a:solidFill><a:srgbClr val="${c.fond}"/></a:solidFill>` : "<a:noFill/>"}</a:tcPr></a:tc>`;
      // Les cellules absorbees par une fusion restent dans le XML, vides, comme PowerPoint l'ecrit.
      return tc + '<a:tc hMerge="1"><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:endParaRPr/></a:p></a:txBody><a:tcPr/></a:tc>'.repeat(span - 1);
    }).join("");
    if (col !== colonnes.length) throw new Error(`Tableau ${nom} : une ligne couvre ${col} colonnes sur ${colonnes.length}`);
    return `<a:tr h="${Math.round(l.hauteur)}">${cellules}</a:tr>`;
  }).join("");
  return `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="${id}" name="${echapper(nom)}"/><p:cNvGraphicFramePr/><p:nvPr/></p:nvGraphicFramePr>`
    + `<p:xfrm><a:off x="${Math.round(origine.x)}" y="${Math.round(origine.y)}"/><a:ext cx="${largeur}" cy="${Math.round(hauteur)}"/></p:xfrm>`
    + `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/table"><a:tbl><a:tblPr><a:noFill/><a:tableStyleId>{165A1118-70DA-484F-B31E-DD051B7CF5F0}</a:tableStyleId></a:tblPr>`
    + `<a:tblGrid>${colonnes.map((c) => `<a:gridCol w="${Math.round(c)}"/>`).join("")}</a:tblGrid>${rangees}</a:tbl></a:graphicData></a:graphic></p:graphicFrame>`;
}

/* ------------------------------------ en-tete et pied de page ------------------------------------ */

/**
 * L'en-tete des pages du modele : le rond sombre et son icone, le petit libelle vert, le grand titre. `rIdIcone` : la
 * relation de l'icone (blanche) dans la diapositive.
 */
export function enTete(ids: () => number, rIdIcone: string, libelle: string, titre: string): string {
  return carte(ids(), "Rond d'en-tete", { x: 457200, y: 365760, cx: 548640, cy: 548640 }, COULEUR.vertFonce, "ellipse")
    + image(ids(), "Icone", rIdIcone, { x: 599846, y: 508406, cx: 263347, cy: 263347 })
    + texte(ids(), "Libelle", { x: 1143000, y: 347472, cx: 5486400, cy: 201168 }, [para(libelle, { taille: 10, gras: true, couleur: COULEUR.vert })], { ancre: "ctr" })
    + texte(ids(), "Titre", { x: 1143000, y: 548640, cx: 7315200, cy: 411480 }, [para(titre, { taille: 26, gras: true })], { ancre: "ctr" });
}

/** Le pied de page des pages du modele : l'equipe a gauche, le numero de page a droite. */
export function piedDePage(ids: () => number, equipe: string, numero: number): string {
  return texte(ids(), "Pied de page", { x: 457200, y: 4828032, cx: 5486400, cy: 182880 }, [para(`${equipe}  ·  PRÉSENTATION ADVERSAIRE`, { taille: 8, couleur: COULEUR.gris })], { ancre: "ctr" })
    + texte(ids(), "Numero de page", { x: 8229600, y: 4828032, cx: 457200, cy: 182880 }, [para(String(numero), { taille: 8, couleur: COULEUR.gris, align: "r" })], { ancre: "ctr" });
}

/** Un titre de section : petit, vert, en capitales (comme "3 DERNIERS MATCHS" du modele). */
export function titreSection(id: number, t: string, x: number, y: number, cx: number): string {
  return texte(id, `Section ${t}`, { x, y, cx, cy: 228600 }, [para(t.toUpperCase(), { taille: 10, gras: true, couleur: COULEUR.vert })], { ancre: "ctr" });
}
