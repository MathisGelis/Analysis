import { strFromU8, strToU8, zipSync } from "fflate";

import {
  ajouterDiapositive, ajouterForme, colorer, couleurDe, definirTexte, dupliquer, ecrireCellule, ecrireTexte, fermerPaquet, forme, lire, modifierForme,
  ordonnerDiapositives, ouvrirPaquet, positionner, purgerImages, retirerDiapositive, retirerForme, squeletteDiapositive, trouverForme,
} from "@/features/analyse/pptx-xml";

const RUN = (t: string, b = 0) => `<a:r><a:rPr b="${b}" lang="en-US" sz="1300"/><a:t>${t}</a:t></a:r>`;
const PARA = (spc: number, ...runs: string[]) =>
  `<a:p><a:pPr><a:spcBef><a:spcPts val="${spc}"/></a:spcBef><a:buSzPts val="1300"/></a:pPr>${runs.join("")}<a:endParaRPr sz="1300"/></a:p>`;
const SP = (id: number, ...paras: string[]) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Google Shape;${id};p3"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="100" y="200"/><a:ext cx="300" cy="400"/></a:xfrm>`
  + `<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="1F6B4A"/></a:solidFill><a:ln><a:solidFill><a:srgbClr val="1F6B4A"/></a:solidFill></a:ln></p:spPr>`
  + `<p:txBody><a:bodyPr/><a:lstStyle/>${paras.join("")}</p:txBody></p:sp>`;
const SLIDE = (...formes: string[]) => `<p:sld><p:cSld><p:spTree>${formes.join("")}</p:spTree></p:cSld></p:sld>`;

describe("formes", () => {
  const xml = SLIDE(SP(7, PARA(0, RUN("a"))), SP(70, PARA(0, RUN("b"))), `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="8" name="Trait"/><p:cNvCxnSpPr/><p:nvPr/></p:nvCxnSpPr><p:spPr/></p:cxnSp>`);

  it("retrouve une forme par son identifiant exact (7 n'est pas 70)", () => {
    expect(forme(xml, 7)).toContain('name="Google Shape;7;p3"');
    expect(forme(xml, 7)).not.toContain("Google Shape;70;");
    expect(forme(xml, 8).startsWith("<p:cxnSp>")).toBe(true);
    expect(trouverForme(xml, 99)).toBeNull();
    expect(() => forme(xml, 99)).toThrow(/Forme 99 introuvable/);
  });

  it("retire, ajoute (en dernier) et modifie une forme", () => {
    expect(retirerForme(xml, 7)).not.toContain('id="7"');
    expect(retirerForme(xml, 7)).toContain('id="70"');
    expect(ajouterForme(xml, SP(1001, PARA(0, RUN("c")))).endsWith(`${SP(1001, PARA(0, RUN("c")))}</p:spTree></p:cSld></p:sld>`)).toBe(true);
    expect(modifierForme(xml, 7, (b) => b.replace(">a<", ">z<"))).toContain(">z<");
  });

  it("deplace et redimensionne sans toucher au reste", () => {
    const b = positionner(forme(xml, 7), { x: 1234.4, y: 5 });
    expect(b).toContain('<a:off x="1234" y="5"/>');
    expect(b).toContain('<a:ext cx="300" cy="400"/>');
    expect(positionner(b, { cx: 900 })).toContain('<a:ext cx="900" cy="400"/>');
  });

  it("lit et change la couleur du remplissage et du contour, pas celle du texte", () => {
    const b = forme(xml, 7);
    expect(couleurDe(b)).toBe("1F6B4A");
    const rouge = colorer(b.replace("</p:txBody>", '<a:solidFill><a:srgbClr val="FFFFFF"/></a:solidFill></p:txBody>'), "C8412F");
    expect(rouge.match(/C8412F/g)).toHaveLength(2);
    expect(rouge).toContain('<a:srgbClr val="FFFFFF"/>');
  });

  it("duplique une forme sous un nouvel identifiant", () => {
    const copie = dupliquer(xml, 7, 1001, 'Nom "joueur"');
    expect(copie).toContain('<p:cNvPr id="1001" name="Nom &quot;joueur&quot;"');
    expect(copie).not.toContain('id="7"');
  });
});

describe("definirTexte", () => {
  it("garde la mise en forme du modele : un libelle en gras suivi de sa valeur", () => {
    const b = SP(5, PARA(0, RUN("Style : ", 1), RUN("[Jeu direct]")), PARA(300, RUN("Bloc : ", 1), RUN("[Haut]")));
    const r = definirTexte(b, [["Style : ", "possession"], ["Bloc : ", ""]]);
    expect(r).toContain('<a:rPr b="1" lang="fr-FR" sz="1300"/><a:t>Style : </a:t>');
    expect(r).toContain('<a:rPr b="0" lang="fr-FR" sz="1300"/><a:t>possession</a:t>');
    expect(r).toContain('<a:t></a:t>');                    // valeur vide : le segment reste, avec son style
    expect(r).toContain('<a:spcPts val="300"/>');          // le deuxieme paragraphe garde son espacement
  });

  it("une liste s'allonge en copiant la derniere puce, et se raccourcit", () => {
    const b = SP(5, PARA(0, RUN("x")), PARA(1000, RUN("y")));
    const quatre = definirTexte(b, ["a", "b", "c", "d"]);
    expect(quatre.match(/<a:p>/g)).toHaveLength(4);
    expect(quatre.match(/<a:spcPts val="1000"\/>/g)).toHaveLength(3);      // la 1re puce garde son 0, les trois autres copient la 2e
    expect(definirTexte(b, ["seule"]).match(/<a:p>/g)).toHaveLength(1);
  });

  it("aucun paragraphe : un paragraphe vide qui garde son style", () => {
    const r = definirTexte(SP(5, PARA(0, RUN("x"))), []);
    expect(r.match(/<a:p>/g)).toHaveLength(1);
    expect(r).toContain('<a:rPr b="0" lang="fr-FR" sz="1300"/><a:t></a:t>');
  });

  it("echappe & < > et conserve les espaces de fin", () => {
    const r = definirTexte(SP(5, PARA(0, RUN("x"))), ["Forces & faiblesses <3 > 2 "]);
    expect(r).toContain("<a:t>Forces &amp; faiblesses &lt;3 &gt; 2 </a:t>");
  });

  it("une police plus petite se propage au texte et aux puces", () => {
    const r = definirTexte(SP(5, PARA(0, RUN("x"))), ["a"], { taille: 1100 });
    expect(r).toContain('sz="1100"');
    expect(r).not.toContain('sz="1300"');
    expect(r).toContain('<a:buSzPts val="1100"/>');
  });

  it("un paragraphe du modele sans segment recoit le sien", () => {
    const b = `<p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:endParaRPr sz="1000"/></a:p></p:txBody></p:sp>`;
    expect(definirTexte(b, ["12"])).toBe(`<p:sp><p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:pPr algn="ctr"/><a:r><a:rPr lang="fr-FR"/><a:t>12</a:t></a:r><a:endParaRPr sz="1000"/></a:p></p:txBody></p:sp>`);
  });

  it("une forme sans texte est une erreur franche", () => {
    expect(() => definirTexte("<p:sp></p:sp>", ["x"])).toThrow(/sans texte/);
  });

  it("ecrireTexte cible la forme par son identifiant", () => {
    const xml = SLIDE(SP(1, PARA(0, RUN("a"))), SP(2, PARA(0, RUN("b"))));
    const r = ecrireTexte(xml, 2, ["B"]);
    expect(r).toContain(">a<");
    expect(r).toContain(">B<");
  });
});

describe("ecrireCellule", () => {
  const cellule = (t: string) => `<a:tc><a:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="en-US"/><a:t>${t}</a:t></a:r></a:p></a:txBody><a:tcPr/></a:tc>`;
  const tableau = `<p:graphicFrame><p:nvGraphicFramePr><p:cNvPr id="113" name="T"/></p:nvGraphicFramePr><a:tbl>`
    + `<a:tr h="1">${cellule("")}${cellule("V-N-D")}</a:tr><a:tr h="1">${cellule("Domicile")}${cellule("[3-0-0]")}</a:tr></a:tbl></p:graphicFrame>`;

  it("reecrit une cellule (ligne, colonne) sans toucher aux autres", () => {
    const r = ecrireCellule(SLIDE(tableau), 113, 1, 1, "3-0-0");
    expect(r).toContain("<a:t>3-0-0</a:t>");
    expect(r).toContain("<a:t>Domicile</a:t>");
    expect(r).toContain("<a:t>V-N-D</a:t>");
    expect(r).not.toContain("[3-0-0]");
  });

  it("cellule ou ligne inconnue : erreur franche", () => {
    expect(() => ecrireCellule(SLIDE(tableau), 113, 5, 0, "x")).toThrow(/ligne 5/);
    expect(() => ecrireCellule(SLIDE(tableau), 113, 0, 9, "x")).toThrow(/colonne 9/);
  });
});

describe("paquet et diapositives", () => {
  const types = `<Types><Default Extension="png" ContentType="image/png"/>`
    + `<Override ContentType="x/slide+xml" PartName="/ppt/slides/slide1.xml"/><Override ContentType="x/slide+xml" PartName="/ppt/slides/slide2.xml"/>`
    + `<Override ContentType="x/notes+xml" PartName="/ppt/notesSlides/notesSlide2.xml"/></Types>`;
  const pres = `<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId6"/><p:sldId id="257" r:id="rId7"/></p:sldIdLst></p:presentation>`;
  const presRels = `<Relationships><Relationship Id="rId6" Type="t/slide" Target="slides/slide1.xml"/><Relationship Id="rId7" Type="t/slide" Target="slides/slide2.xml"/></Relationships>`;
  const rels = (...cibles: string[]) => `<Relationships>${cibles.map((c, i) => `<Relationship Id="rId${i + 1}" Type="t" Target="${c}"/>`).join("")}</Relationships>`;
  const fichiers = {
    "[Content_Types].xml": strToU8(types), "ppt/presentation.xml": strToU8(pres), "ppt/_rels/presentation.xml.rels": strToU8(presRels),
    "ppt/slides/slide1.xml": strToU8("<p:sld/>"), "ppt/slides/_rels/slide1.xml.rels": strToU8(rels("../media/image1.png")),
    "ppt/slides/slide2.xml": strToU8("<p:sld/>"), "ppt/slides/_rels/slide2.xml.rels": strToU8(rels("../notesSlides/notesSlide2.xml", "../media/image2.png", "../media/image1.png")),
    "ppt/notesSlides/notesSlide2.xml": strToU8("<n/>"), "ppt/notesSlides/_rels/notesSlide2.xml.rels": strToU8(rels("../notesMasters/notesMaster1.xml")),
    "ppt/media/image1.png": new Uint8Array([1]), "ppt/media/image2.png": new Uint8Array([2]),
  };

  it("ouvre et referme l'archive sans rien perdre, [Content_Types].xml en tete", () => {
    const p = ouvrirPaquet(zipSync(fichiers));
    expect([...p.keys()][0]).toBe("[Content_Types].xml");
    const relu = ouvrirPaquet(fermerPaquet(p));
    expect([...relu.keys()]).toEqual([...p.keys()]);
    expect(strFromU8(relu.get("ppt/slides/slide1.xml")!)).toBe("<p:sld/>");
    expect(() => lire(relu, "ppt/absent.xml")).toThrow(/ne contient pas/);
  });

  it("retirer une diapositive efface sa reference, ses notes, ses relations et son type ; les images orphelines sont purgees", () => {
    const p = ouvrirPaquet(zipSync(fichiers));
    retirerDiapositive(p, 2);
    purgerImages(p);

    expect(lire(p, "ppt/presentation.xml")).toBe(`<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId6"/></p:sldIdLst></p:presentation>`);
    expect(lire(p, "ppt/_rels/presentation.xml.rels")).not.toContain("slide2.xml");
    expect(lire(p, "[Content_Types].xml")).not.toMatch(/slide2\.xml|notesSlide2/);
    expect(lire(p, "[Content_Types].xml")).toContain("/ppt/slides/slide1.xml");
    for (const absent of ["ppt/slides/slide2.xml", "ppt/slides/_rels/slide2.xml.rels", "ppt/notesSlides/notesSlide2.xml", "ppt/notesSlides/_rels/notesSlide2.xml.rels", "ppt/media/image2.png"]) {
      expect(p.has(absent)).toBe(false);
    }
    expect(p.has("ppt/media/image1.png")).toBe(true);      // encore citee par la diapositive 1
  });

  it("diapositive inconnue : erreur franche", () => {
    expect(() => retirerDiapositive(ouvrirPaquet(zipSync(fichiers)), 9)).toThrow(/absente de la presentation/);
  });
});

describe("formes a l'attribut id apres d'autres (image du modele)", () => {
  const pic = `<p:pic><p:nvPicPr><p:cNvPr descr="Icone" id="12" name="Image"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr><p:blipFill/><p:spPr/></p:pic>`;

  it("retrouve et retire une image dont `descr` precede `id`, sans confondre 12 et 120", () => {
    const xml = SLIDE(pic, SP(120, PARA(0, RUN("x"))));
    expect(forme(xml, 12).startsWith("<p:pic>")).toBe(true);
    expect(retirerForme(xml, 12)).toBe(SLIDE(SP(120, PARA(0, RUN("x")))));
    expect(trouverForme(xml, 1)).toBeNull();
  });
});

describe("ajout et ordre des diapositives", () => {
  const TYPE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";
  const modele = `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:bg/><p:spTree><p:nvGrpSpPr><p:cNvPr id="36" name="Shape 36"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm/></p:grpSpPr>`
    + `<p:sp><p:nvSpPr><p:cNvPr id="50" name="Forme"/></p:nvSpPr></p:sp></p:spTree></p:cSld><p:clrMapOvr/></p:sld>`;
  const fichiers = () => ({
    "[Content_Types].xml": strToU8(`<Types><Override ContentType="${TYPE}" PartName="/ppt/slides/slide1.xml"/><Override ContentType="${TYPE}" PartName="/ppt/slides/slide3.xml"/></Types>`),
    "ppt/presentation.xml": strToU8(`<p:presentation><p:sldIdLst><p:sldId id="256" r:id="rId6"/><p:sldId id="259" r:id="rId9"/></p:sldIdLst></p:presentation>`),
    "ppt/_rels/presentation.xml.rels": strToU8(`<Relationships><Relationship Id="rId6" Type="t/slide" Target="slides/slide1.xml"/><Relationship Id="rId9" Type="t/slide" Target="slides/slide3.xml"/></Relationships>`),
    "ppt/slides/slide1.xml": strToU8("<p:sld/>"), "ppt/slides/slide3.xml": strToU8("<p:sld/>"),
    "ppt/slides/_rels/slide1.xml.rels": strToU8(`<Relationships><Relationship Id="rId1" Type="t/layout" Target="../slideLayouts/slideLayout2.xml"/></Relationships>`),
  });

  it("le squelette garde l'enveloppe du modele et renumerote le groupe racine a 1", () => {
    const { debut, fin } = squeletteDiapositive(modele);
    expect(debut.startsWith('<?xml version="1.0"?><p:sld')).toBe(true);
    expect(debut).toContain('<p:cNvPr id="1" name="Shape 1"/>');
    expect(debut.endsWith("</p:grpSpPr>")).toBe(true);
    expect(debut).not.toContain('id="50"');
    expect(fin).toBe("</p:spTree></p:cSld><p:clrMapOvr/></p:sld>");
    expect(() => squeletteDiapositive("<p:sld/>")).toThrow(/sans arbre de formes/);
  });

  it("ajoute une diapositive : fichier suivant le plus grand numero, disposition, images, type, relation et identifiant", () => {
    const p = ouvrirPaquet(zipSync(fichiers()));
    const n = ajouterDiapositive(p, "<p:sld>neuve</p:sld>", ["image2.png", "image5.png"]);
    expect(n).toBe(4);
    expect(lire(p, "ppt/slides/slide4.xml")).toBe("<p:sld>neuve</p:sld>");
    const rels = lire(p, "ppt/slides/_rels/slide4.xml.rels");
    expect(rels).toContain('Id="rId1"');
    expect(rels).toContain('Target="../slideLayouts/slideLayout2.xml"');
    expect(rels).toContain('Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/image2.png"');
    expect(rels).toContain('Id="rId3"');
    expect(lire(p, "[Content_Types].xml")).toContain(`<Override ContentType="${TYPE}" PartName="/ppt/slides/slide4.xml"/>`);
    expect(lire(p, "ppt/_rels/presentation.xml.rels")).toContain('Id="rId10"');
    expect(lire(p, "ppt/_rels/presentation.xml.rels")).toContain('Target="slides/slide4.xml"');
    expect(lire(p, "ppt/presentation.xml")).toContain('<p:sldId id="260" r:id="rId10"/>');
    expect(ajouterDiapositive(p, "<p:sld/>")).toBe(5);
  });

  it("ordonne les diapositives selon les numeros de fichier demandes", () => {
    const p = ouvrirPaquet(zipSync(fichiers()));
    ajouterDiapositive(p, "<p:sld/>");
    ordonnerDiapositives(p, [4, 1, 3]);
    expect([...lire(p, "ppt/presentation.xml").matchAll(/r:id="(rId\d+)"/g)].map((m) => m[1])).toEqual(["rId10", "rId6", "rId9"]);
    expect(() => ordonnerDiapositives(p, [1, 8])).toThrow(/Diapositive 8 absente/);
  });
});
