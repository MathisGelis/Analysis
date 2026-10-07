import {
  carte, carteTexte, cell, compteurIds, COULEUR, enTete, image, para, piedDePage, tableau, texte, titreSection,
} from "@/features/analyse/pptx-formes";

const ZONE = { x: 100.4, y: 200.6, cx: 3000, cy: 400 };
const textes = (xml: string) => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]);

describe("compteurIds", () => {
  it("numerote a partir de 2 : le 1 est le groupe racine de la diapositive", () => {
    const ids = compteurIds();
    expect([ids(), ids(), ids()]).toEqual([2, 3, 4]);
    expect(compteurIds()()).toBe(2);       // chaque diapositive repart de zero
  });
});

describe("formes au style du modele", () => {
  it("une carte arrondie : position arrondie, remplissage et contour de la meme couleur, rayon du modele", () => {
    const xml = carte(5, "Carte", ZONE, COULEUR.carte);
    expect(xml).toContain('<p:cNvPr id="5" name="Carte"/>');
    expect(xml).toContain('<a:off x="100" y="201"/>');
    expect(xml).toContain('prst="roundRect"');
    expect(xml).toContain(`<a:srgbClr val="${COULEUR.carte}"/>`);
    // Rayon 73152 EMU sur le petit cote (400) : plafonne a 50 % (rond complet).
    expect(xml).toContain('fmla="val 50000"');
    expect(carte(6, "Large", { x: 0, y: 0, cx: 4000000, cy: 2000000 }, COULEUR.carte)).toContain('fmla="val 3658"');
    expect(carte(7, "Rond", ZONE, COULEUR.rouge, "ellipse")).toContain('prst="ellipse"');
  });

  it("le texte est echappe, en Arial, avec le style demande", () => {
    const xml = texte(8, "Libelle <x>", ZONE, [para("A & B < C", { taille: 10.5, gras: true, couleur: COULEUR.rouge })]);
    expect(xml).toContain('name="Libelle &lt;x&gt;"');
    expect(textes(xml)).toEqual(["A &amp; B &lt; C"]);
    expect(xml).toContain('sz="1050"');
    expect(xml).toContain('b="1"');
    expect(xml).toContain(`<a:srgbClr val="${COULEUR.rouge}"/>`);
    expect(xml).toContain('typeface="Arial"');
    expect(xml).toContain('txBox="1"');
  });

  it("puces rondes avec retrait, espace avant et alignement", () => {
    const xml = texte(9, "Liste", ZONE, [para("un", { puce: true }), para("deux", { puce: true, avant: 3, align: "r" })]);
    expect(xml.match(/<a:buChar char="•"\/>/g)).toHaveLength(2);
    expect(xml).toContain('marL="171450"');
    expect(xml).toContain('<a:spcPts val="300"/>');
    expect(xml).toContain('algn="r"');
    expect(texte(9, "Sans", ZONE, [para("x")])).toContain("<a:buNone/>");
  });

  it("une carte qui porte son texte (pastille) et une image citee par sa relation", () => {
    const pastille = carteTexte(10, "Pastille", ZONE, COULEUR.vert, [para("V", { align: "ctr" })], { forme: "ellipse" });
    expect(pastille).toContain('prst="ellipse"');
    expect(textes(pastille)).toEqual(["V"]);
    const pic = image(11, "Icone", "rId2", ZONE);
    expect(pic).toContain('r:embed="rId2"');
    expect(pic).toContain('<p:cNvPr descr="Icone" id="11" name="Icone"/>');
  });

  it("en-tete, pied de page et titre de section", () => {
    const ids = compteurIds();
    const haut = enTete(ids, "rId2", "TACTIQUE", "Pourquoi ce système ?");
    expect(textes(haut)).toEqual(["TACTIQUE", "Pourquoi ce système ?"]);
    expect(haut).toContain('r:embed="rId2"');
    expect([...haut.matchAll(/<p:cNvPr[^>]*?\sid="(\d+)"/g)].map((m) => m[1])).toEqual(["2", "3", "4", "5"]);
    expect(textes(piedDePage(ids, "OL SUD SENIORS 2", 4))).toEqual(["OL SUD SENIORS 2  ·  PRÉSENTATION ADVERSAIRE", "4"]);
    expect(textes(titreSection(20, "Leurs 5 derniers matchs", 0, 0, 100))).toEqual(["LEURS 5 DERNIERS MATCHS"]);
  });
});

describe("tableau", () => {
  const colonnes = [1000, 2000];
  const lignes = [
    { hauteur: 300, cellules: [cell("Indicateur", { gras: true, fond: COULEUR.carte }), cell("Valeur", { align: "ctr" })] },
    { hauteur: 280, cellules: [cell("Points & buts"), cell("12", { align: "r", couleur: COULEUR.vert })] },
  ];

  it("un tableau natif : grille, hauteurs, texte echappe, fond d'entete", () => {
    const xml = tableau(30, "Comparatif", { x: 10, y: 20 }, colonnes, lignes);
    expect(xml).toContain('<a:gridCol w="1000"/><a:gridCol w="2000"/>');
    expect(xml).toContain('<a:tr h="300">');
    expect(xml).toContain('<a:tr h="280">');
    expect(xml).toContain('<a:ext cx="3000" cy="580"/>');
    expect(textes(xml)).toEqual(["Indicateur", "Valeur", "Points &amp; buts", "12"]);
    expect(xml).toContain(`<a:solidFill><a:srgbClr val="${COULEUR.carte}"/></a:solidFill></a:tcPr>`);
  });

  it("filets : horizontaux seulement, ou complets comme le modele", () => {
    const horizontal = tableau(31, "H", { x: 0, y: 0 }, colonnes, lignes, { filets: "horizontal" });
    const complet = tableau(32, "C", { x: 0, y: 0 }, colonnes, lignes);
    expect(horizontal).toContain('<a:lnL w="0"><a:noFill/></a:lnL>');
    expect(complet).not.toContain('<a:lnL w="0">');
    expect(horizontal.match(/<a:lnB cap="flat"/g)).toHaveLength(4);
  });

  it("une cellule fusionnee couvre plusieurs colonnes ; un compte de colonnes faux est une erreur franche", () => {
    const fusion = tableau(33, "F", { x: 0, y: 0 }, colonnes, [{ hauteur: 300, cellules: [{ ...cell("Titre"), colonnes: 2 }] }]);
    expect(fusion).toContain('gridSpan="2"');
    expect(fusion).toContain('<a:tc hMerge="1">');
    expect(() => tableau(34, "Cassé", { x: 0, y: 0 }, colonnes, [{ hauteur: 300, cellules: [cell("seule")] }])).toThrow(/couvre 1 colonnes sur 2/);
  });
});
