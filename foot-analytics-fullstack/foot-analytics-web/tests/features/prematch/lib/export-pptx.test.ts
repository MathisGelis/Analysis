import { describe, expect, it } from "vitest";

import { basculerPage, nomFichier, pagesChoisies, pagesDuGroupe, resumeChoix, toutesLesPages, type PageExport } from "@/features/prematch/lib/export-pptx";

const pages: PageExport[] = [
  { id: "couverture", titre: "Couverture", contenu: "", groupe: "modele" }, { id: "match", titre: "Le match", contenu: "", groupe: "modele" },
  { id: "saison", titre: "Leur saison", contenu: "", groupe: "modele" },
];

const dossier: PageExport[] = [
  ...pages, { id: "comparatif", titre: "Nous contre eux", contenu: "", groupe: "analyse" }, { id: "onze", titre: "Onze probable", contenu: "", groupe: "analyse" },
];

describe("choix des pages", () => {
  it("au depart, toutes les pages sont cochees", () => {
    expect(pagesChoisies(pages, toutesLesPages(pages))).toEqual(["couverture", "match", "saison"]);
  });

  it("decocher une page la retire (par exemple la page convocation), la recocher la remet", () => {
    const sans = basculerPage(toutesLesPages(pages), "match");
    expect(pagesChoisies(pages, sans)).toEqual(["couverture", "saison"]);
    expect(pagesChoisies(pages, basculerPage(sans, "match"))).toEqual(["couverture", "match", "saison"]);
  });

  it("les pages demandees gardent l'ordre du modele, quel que soit l'ordre des clics", () => {
    const choix = basculerPage(basculerPage(new Set<string>(), "saison"), "couverture");
    expect(pagesChoisies(pages, choix)).toEqual(["couverture", "saison"]);
  });

  it("ne modifie pas le choix d'origine", () => {
    const choix = toutesLesPages(pages);
    basculerPage(choix, "match");
    expect(choix.has("match")).toBe(true);
  });

  it("par groupe : le modele du staff seul, ou les pages d'analyse seules", () => {
    expect(pagesChoisies(dossier, pagesDuGroupe(dossier, "modele"))).toEqual(["couverture", "match", "saison"]);
    expect(pagesChoisies(dossier, pagesDuGroupe(dossier, "analyse"))).toEqual(["comparatif", "onze"]);
    expect(pagesDuGroupe(pages, "analyse").size).toBe(0);
  });

  it("resume du choix", () => {
    expect(resumeChoix(pages, toutesLesPages(pages))).toBe("3 pages sur 3");
    expect(resumeChoix(pages, new Set(["match"]))).toBe("1 page sur 3");
    expect(resumeChoix(pages, new Set())).toBe("0 page sur 3");
  });
});

describe("nomFichier", () => {
  it("lit le nom propose par le serveur", () => {
    expect(nomFichier('attachment; filename="avant-match-Adverse-FC-2099-03-14.pptx"')).toBe("avant-match-Adverse-FC-2099-03-14.pptx");
    expect(nomFichier("attachment; filename=rapport.pptx")).toBe("rapport.pptx");
    expect(nomFichier("attachment; filename*=UTF-8''avant%20match.pptx")).toBe("avant match.pptx");
  });

  it("sans en-tete exploitable : le nom par defaut", () => {
    expect(nomFichier(null)).toBe("rapport-avant-match.pptx");
    expect(nomFichier("inline")).toBe("rapport-avant-match.pptx");
    expect(nomFichier("", "x.pptx")).toBe("x.pptx");
  });
});
