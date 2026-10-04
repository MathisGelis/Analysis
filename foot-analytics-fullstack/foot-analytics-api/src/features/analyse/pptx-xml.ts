// src/features/analyse/pptx-xml.ts
//
// OUTILS BAS NIVEAU pour remplir un modele PowerPoint (.pptx = une archive zip de fichiers XML) : ouvrir / refermer
// l'archive, retrouver une forme par son identifiant (`<p:cNvPr id="N">`), reecrire son texte en gardant la mise en
// forme du modele, la deplacer, la recolorer, la supprimer ou la dupliquer, et retirer des diapositives avec tout ce
// qui s'y rattache. Du texte et des expressions regulieres plutot qu'un parseur XML : le modele (export Google Slides)
// est regulier, et un aller-retour par un parseur DOM reecrirait les prefixes d'espaces de noms.
// Fonctions pures (hors lecture / ecriture de l'archive en memoire).

import { strFromU8, strToU8, unzipSync, zipSync, Zippable } from "fflate";

/** Les fichiers de l'archive, dans l'ordre d'origine ([Content_Types].xml en tete, comme l'exige PowerPoint). */
export type Paquet = Map<string, Uint8Array>;

export function ouvrirPaquet(donnees: Uint8Array): Paquet {
  return new Map(Object.entries(unzipSync(donnees)));
}

export function fermerPaquet(paquet: Paquet): Uint8Array {
  const zip: Zippable = {};
  // Les images sont deja compressees : on les stocke telles quelles.
  for (const [nom, contenu] of paquet) zip[nom] = [contenu, { level: /\.(png|jpe?g|gif)$/i.test(nom) ? 0 : 6 }];
  return zipSync(zip);
}

export function lire(paquet: Paquet, chemin: string): string {
  const contenu = paquet.get(chemin);
  if (!contenu) throw new Error(`Le modele ne contient pas ${chemin}`);
  return strFromU8(contenu);
}

export function ecrire(paquet: Paquet, chemin: string, texte: string): void {
  paquet.set(chemin, strToU8(texte));
}

export function echapper(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/* ----------------------------------------- formes ----------------------------------------- */

const CONTENEURS = ["p:sp", "p:graphicFrame", "p:pic", "p:cxnSp"] as const;

/** Debut et fin de la forme d'identifiant `id` (`<p:sp>`, `<p:graphicFrame>`, `<p:pic>` ou `<p:cxnSp>` complets), ou null. */
export function trouverForme(xml: string, id: number): { debut: number; fin: number } | null {
  const repere = xml.indexOf(`<p:cNvPr id="${id}" `);
  if (repere < 0) return null;
  let debut = -1;
  let balise = "";
  for (const b of CONTENEURS) {
    const i = xml.lastIndexOf(`<${b}>`, repere);
    if (i > debut) { debut = i; balise = b; }
  }
  const fermeture = `</${balise}>`;
  const fin = xml.indexOf(fermeture, repere);
  if (debut < 0 || fin < 0) return null;
  return { debut, fin: fin + fermeture.length };
}

/** Le XML de la forme `id` ; erreur si le modele ne l'a pas (le modele a change : mieux vaut echouer que produire un rapport faux). */
export function forme(xml: string, id: number): string {
  const f = trouverForme(xml, id);
  if (!f) throw new Error(`Forme ${id} introuvable dans le modele`);
  return xml.slice(f.debut, f.fin);
}

/** Remplace la forme `id` par le resultat de `modifier` ; erreur si elle n'existe pas. */
export function modifierForme(xml: string, id: number, modifier: (bloc: string) => string): string {
  const f = trouverForme(xml, id);
  if (!f) throw new Error(`Forme ${id} introuvable dans le modele`);
  return xml.slice(0, f.debut) + modifier(xml.slice(f.debut, f.fin)) + xml.slice(f.fin);
}

export function retirerForme(xml: string, id: number): string {
  return modifierForme(xml, id, () => "");
}

/** Ajoute une forme en dernier (donc au premier plan) de la diapositive. */
export function ajouterForme(xml: string, bloc: string): string {
  const fin = xml.lastIndexOf("</p:spTree>");
  if (fin < 0) throw new Error("Diapositive sans arbre de formes");
  return xml.slice(0, fin) + bloc + xml.slice(fin);
}

/** Position et taille d'une forme (en EMU) ; les valeurs absentes sont gardees. */
export function positionner(bloc: string, p: { x?: number; y?: number; cx?: number; cy?: number }): string {
  let r = bloc;
  if (p.x !== undefined || p.y !== undefined) {
    r = r.replace(/<a:off x="(-?\d+)" y="(-?\d+)"\/>/, (_m, x, y) => `<a:off x="${Math.round(p.x ?? +x)}" y="${Math.round(p.y ?? +y)}"/>`);
  }
  if (p.cx !== undefined || p.cy !== undefined) {
    r = r.replace(/<a:ext cx="(\d+)" cy="(\d+)"\/>/, (_m, cx, cy) => `<a:ext cx="${Math.round(p.cx ?? +cx)}" cy="${Math.round(p.cy ?? +cy)}"/>`);
  }
  return r;
}

/** Couleur de remplissage (hex, sans #) d'une forme, lue dans son `spPr`. */
export function couleurDe(bloc: string): string | null {
  return /<\/a:prstGeom><a:solidFill><a:srgbClr val="([0-9A-Fa-f]{6})"/.exec(bloc)?.[1] ?? null;
}

/** Recolore le remplissage et le contour d'une forme (pas son texte). */
export function colorer(bloc: string, hex: string): string {
  const fin = bloc.indexOf("</p:spPr>");
  if (fin < 0) return bloc;
  return bloc.slice(0, fin).replace(/<a:srgbClr val="[0-9A-Fa-f]{6}"\/>/g, `<a:srgbClr val="${hex}"/>`) + bloc.slice(fin);
}

/** Copie la forme `idSource` sous un nouvel identifiant (et un nom lisible). */
export function dupliquer(xml: string, idSource: number, nouvelId: number, nom: string): string {
  return forme(xml, idSource)
    .replace(/<p:cNvPr id="\d+" name="[^"]*"/, `<p:cNvPr id="${nouvelId}" name="${echapper(nom).replace(/"/g, "&quot;")}"`);
}

/* ------------------------------------------ texte ------------------------------------------ */

const RE_TEXTE = /<a:t>[\s\S]*?<\/a:t>|<a:t\/>/;

/** Un paragraphe : le texte de chacun de ses segments (runs), le premier segment pour une simple chaine. */
export type ParagrapheTexte = string | string[];

export interface OptionsTexte {
  /** Taille de police, en centiemes de point (1100 = 11 pt), a la place de celle du modele. */
  taille?: number;
}

function remplirParagraphe(modele: string, textes: string[], options: OptionsTexte): string {
  let p = modele.replace(/lang="en-US"/g, 'lang="fr-FR"');
  if (options.taille) p = p.replace(/\bsz="\d+"/g, `sz="${options.taille}"`).replace(/<a:buSzPts val="\d+"\/>/g, `<a:buSzPts val="${options.taille}"/>`);
  const runs = p.match(/<a:r>[\s\S]*?<\/a:r>/g) ?? [];
  if (runs.length === 0) {
    // Paragraphe du modele sans segment : on en cree un, avant la fin de paragraphe.
    const run = `<a:r><a:rPr lang="fr-FR"/><a:t>${echapper(textes.join(""))}</a:t></a:r>`;
    return p.includes("<a:endParaRPr") ? p.replace("<a:endParaRPr", `${run}<a:endParaRPr`) : p.replace("</a:p>", `${run}</a:p>`);
  }
  let i = 0;
  return p.replace(/<a:r>[\s\S]*?<\/a:r>/g, (run) => {
    const j = i++;
    // Les textes en trop vont au dernier segment ; les segments en trop restent vides (le style reste a portee de saisie).
    const texte = j === runs.length - 1 ? textes.slice(j).join("") : textes[j] ?? "";
    return run.replace(RE_TEXTE, `<a:t>${echapper(texte)}</a:t>`);
  });
}

/**
 * Reecrit le texte d'une forme. Chaque paragraphe reprend la mise en forme du paragraphe du modele de meme rang (le
 * dernier si le modele en a moins : une liste s'allonge en copiant sa derniere puce) ; chaque segment d'un paragraphe
 * reprend celle du segment du modele de meme rang (un libelle en gras suivi de sa valeur, par exemple). Sans paragraphe :
 * un paragraphe vide, qui garde la mise en forme pour la saisie.
 */
export function definirTexte(bloc: string, paragraphes: ParagrapheTexte[], options: OptionsTexte = {}): string {
  const debut = bloc.indexOf("<a:p>");
  const fin = bloc.lastIndexOf("</a:p>") + "</a:p>".length;
  if (debut < 0 || fin <= debut) throw new Error("Forme sans texte : impossible de la remplir");
  const modeles = bloc.slice(debut, fin).match(/<a:p>[\s\S]*?<\/a:p>/g) ?? [];
  const specs = paragraphes.length ? paragraphes : [""];
  const nouveaux = specs.map((spec, i) =>
    remplirParagraphe(modeles[Math.min(i, modeles.length - 1)], Array.isArray(spec) ? spec : [spec], options));
  return bloc.slice(0, debut) + nouveaux.join("") + bloc.slice(fin);
}

/** Reecrit le texte de la forme `id` de la diapositive (voir `definirTexte` : un paragraphe par element de la liste). */
export function ecrireTexte(xml: string, id: number, paragraphes: ParagrapheTexte[], options: OptionsTexte = {}): string {
  return modifierForme(xml, id, (b) => definirTexte(b, paragraphes, options));
}

/** Reecrit le texte d'une cellule (ligne, colonne : depuis 0) du tableau `id`. */
export function ecrireCellule(xml: string, id: number, ligne: number, colonne: number, texte: string): string {
  return modifierForme(xml, id, (bloc) => {
    const lignes = [...bloc.matchAll(/<a:tr [\s\S]*?<\/a:tr>/g)];
    const l = lignes[ligne];
    if (!l) throw new Error(`Tableau ${id} : ligne ${ligne} introuvable`);
    const cellules = [...l[0].matchAll(/<a:tc>[\s\S]*?<\/a:tc>/g)];
    const c = cellules[colonne];
    if (!c) throw new Error(`Tableau ${id} : colonne ${colonne} introuvable`);
    const cellule = c[0].replace(/lang="en-US"/g, 'lang="fr-FR"').replace(RE_TEXTE, `<a:t>${echapper(texte)}</a:t>`);
    const nouvelleLigne = l[0].slice(0, c.index!) + cellule + l[0].slice(c.index! + c[0].length);
    return bloc.slice(0, l.index!) + nouvelleLigne + bloc.slice(l.index! + l[0].length);
  });
}

/* --------------------------------------- diapositives --------------------------------------- */

const RELS_PRESENTATION = "ppt/_rels/presentation.xml.rels";
const PRESENTATION = "ppt/presentation.xml";
const TYPES = "[Content_Types].xml";

const enleverRelation = (xml: string, cible: string) =>
  xml.replace(new RegExp(`<Relationship [^>]*Target="${cible.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"[^>]*/>`), "");
const enleverType = (xml: string, partie: string) =>
  xml.replace(new RegExp(`<Override [^>]*PartName="${partie.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"[^>]*/>`), "");

/** Retire la diapositive `ppt/slides/slide{n}.xml` : sa reference dans la presentation, ses notes, ses relations et son type. */
export function retirerDiapositive(paquet: Paquet, n: number): void {
  const chemin = `ppt/slides/slide${n}.xml`;
  const cheminRels = `ppt/slides/_rels/slide${n}.xml.rels`;

  const rels = lire(paquet, RELS_PRESENTATION);
  const rId = new RegExp(`<Relationship [^>]*Id="([^"]+)"[^>]*Target="slides/slide${n}\\.xml"`).exec(rels)?.[1]
    ?? new RegExp(`<Relationship [^>]*Target="slides/slide${n}\\.xml"[^>]*Id="([^"]+)"`).exec(rels)?.[1];
  if (!rId) throw new Error(`Diapositive ${n} absente de la presentation`);
  ecrire(paquet, RELS_PRESENTATION, enleverRelation(rels, `slides/slide${n}.xml`));
  ecrire(paquet, PRESENTATION, lire(paquet, PRESENTATION).replace(new RegExp(`<p:sldId [^>]*r:id="${rId}"[^>]*/>`), ""));

  let types = enleverType(lire(paquet, TYPES), `/${chemin}`);
  const notes = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(lire(paquet, cheminRels))?.[1];
  if (notes) {
    paquet.delete(`ppt/notesSlides/${notes}`);
    paquet.delete(`ppt/notesSlides/_rels/${notes}.rels`);
    types = enleverType(types, `/ppt/notesSlides/${notes}`);
  }
  ecrire(paquet, TYPES, types);
  paquet.delete(chemin);
  paquet.delete(cheminRels);
}

/** Supprime les images que plus aucune relation ne cite (celles des diapositives retirees). */
export function purgerImages(paquet: Paquet): void {
  const citees = new Set<string>();
  for (const [nom, contenu] of paquet) {
    if (!nom.endsWith(".rels")) continue;
    for (const m of strFromU8(contenu).matchAll(/Target="\.\.\/media\/([^"]+)"/g)) citees.add(`ppt/media/${m[1]}`);
  }
  for (const nom of [...paquet.keys()]) if (nom.startsWith("ppt/media/") && !citees.has(nom)) paquet.delete(nom);
}
