import { describe, expect, it } from "vitest";

import { construireNavigation, lienActif, lienGestionComptes, titrePage } from "@/features/shell/lib/navigation";

describe("construireNavigation", () => {
  it("pointe 'Mon club' vers le club choisi", () => {
    const liens = construireNavigation("club-1").flatMap((s) => s.items);
    expect(liens.find((l) => l.label === "Mon club")?.href).toBe("/club/club-1");
  });
  it("sans club : 'Mon club' retombe sur le dashboard plutot que sur /club/null", () => {
    const liens = construireNavigation(null).flatMap((s) => s.items);
    expect(liens.find((l) => l.label === "Mon club")?.href).toBe("/");
  });
  it("toutes les pages de gestion restent accessibles depuis la barre laterale (la recherche ne propose plus de pages)", () => {
    const hrefs = construireNavigation("c").flatMap((s) => s.items.map((l) => l.href));
    for (const page of ["/", "/classement", "/calendrier", "/effectif", "/entrainements", "/medical", "/matchs", "/tactique",
      "/arbitres", "/rapports", "/import", "/saisons"]) {
      expect(hrefs).toContain(page);
    }
  });
  it("les rapports ont UNE entree : scouting et predictions n'ont plus d'onglet (ils s'ouvrent depuis le dossier d'un club)", () => {
    const liens = construireNavigation("c").flatMap((s) => s.items);
    expect(liens.map((l) => l.href)).not.toContain("/scouting");
    expect(liens.map((l) => l.href)).not.toContain("/ia");
    expect(construireNavigation("c").find((s) => s.section === "Analyse")?.items.map((l) => l.label)).toEqual(["Rapports"]);
    expect(liens.find((l) => l.href === "/medical")?.label).toBe("Medical");
  });
  it("la gestion des comptes n'est dans aucun menu : elle est en bas de la barre laterale, pour tous les roles", () => {
    const hrefs = construireNavigation("c").flatMap((s) => s.items.map((l) => l.href));
    expect(hrefs).not.toContain("/admin/utilisateurs");
  });
  it("aucun lien en double", () => {
    const hrefs = construireNavigation("c").flatMap((s) => s.items.map((l) => l.href));
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("construireNavigation selon le compte et la saison", () => {
  const hrefs = (acces: Parameters<typeof construireNavigation>[1]) => construireNavigation("c", acces).flatMap((s) => s.items.map((l) => l.href));

  it("saison en cours, a venir ou inconnue : tout est la (administrateur)", () => {
    for (const mode of ["active", "future", "inconnue"] as const) {
      expect(hrefs({ role: "admin", mode })).toEqual(hrefs(undefined));
    }
  });

  it("saison passee : calendrier, entrainements et tactique disparaissent, le reste demeure", () => {
    const liens = hrefs({ role: "admin", mode: "passee" });
    for (const page of ["/calendrier", "/entrainements", "/tactique"]) expect(liens).not.toContain(page);
    for (const page of ["/", "/effectif", "/medical", "/matchs", "/rapports", "/classement", "/arbitres", "/import", "/saisons", "/admin/ia"]) {
      expect(liens).toContain(page);
    }
  });

  it("les onglets Saisons et IA sont reserves a l'administrateur : ni le referent ni l'educateur ne les voient", () => {
    expect(hrefs({ role: "admin", mode: "active" })).toEqual(expect.arrayContaining(["/saisons", "/admin/ia"]));
    for (const role of ["referent", "user", null, undefined]) {
      expect(hrefs({ role, mode: "active" })).not.toContain("/saisons");
      expect(hrefs({ role, mode: "active" })).not.toContain("/admin/ia");
    }
    expect(hrefs({ role: "user", mode: "active" })).toContain("/import");                          // le reste de la section Donnees demeure
  });
  it("l'IA est dans le menu de gauche de l'administrateur, section Donnees, juste apres les Saisons", () => {
    const donnees = construireNavigation("c", { role: "admin", mode: "active" }).find((s) => s.section === "Donnees");
    expect(donnees?.items.map((l) => l.label)).toEqual(["Import feuilles FMI", "Saisons", "IA"]);
  });

  it("meme un educateur sur une saison passee garde chaque section (aucune ne reste vide)", () => {
    const sections = construireNavigation("c", { role: "user", mode: "passee" });
    expect(sections.map((s) => s.section)).toEqual(["Vue d'ensemble", "Mon equipe", "Match", "Analyse", "Donnees"]);
    expect(sections.every((s) => s.items.length > 0)).toBe(true);
    expect(sections.find((s) => s.section === "Vue d'ensemble")?.items.map((l) => l.label)).toEqual(["Dashboard", "Classement"]);
    expect(sections.find((s) => s.section === "Match")?.items.map((l) => l.label)).toEqual(["Matchs", "Arbitres"]);
    expect(sections.find((s) => s.section === "Donnees")?.items.map((l) => l.label)).toEqual(["Import feuilles FMI"]);
  });
});

describe("lienGestionComptes", () => {
  it("administrateur : Administration ; referent de club : Mes educateurs ; meme page, meme emplacement", () => {
    expect(lienGestionComptes("admin")).toMatchObject({ href: "/admin/utilisateurs", label: "Administration" });
    expect(lienGestionComptes("referent")).toMatchObject({ href: "/admin/utilisateurs", label: "Mes educateurs" });
  });
  it("educateur, role inconnu ou absent : aucun lien", () => {
    expect(lienGestionComptes("user")).toBeNull();
    expect(lienGestionComptes(undefined)).toBeNull();
    expect(lienGestionComptes(null)).toBeNull();
  });
});

describe("lienActif", () => {
  it("le dashboard n'est actif que sur '/'", () => {
    expect(lienActif("/", "/")).toBe(true);
    expect(lienActif("/", "/effectif")).toBe(false);
  });
  it("une sous-page active son parent, sans confondre les prefixes", () => {
    expect(lienActif("/matchs", "/matchs/abc")).toBe(true);
    expect(lienActif("/matchs", "/matchs")).toBe(true);
    expect(lienActif("/club/1", "/club/12")).toBe(false);
  });
});

describe("titrePage", () => {
  it("titres connus, sous-pages comprises", () => {
    expect(titrePage("/")).toBe("Dashboard");
    expect(titrePage("/joueur/abc")).toBe("Fiche joueur");
    expect(titrePage("/club/1/scouting")).toBe("Fiche club");
    expect(titrePage("/admin/utilisateurs")).toBe("Administration");
    expect(titrePage("/admin/ia")).toBe("IA");
  });
  it("chemin inconnu : nom de l'application", () => {
    expect(titrePage("/nimportequoi")).toBe("Foot Analytics");
  });
});
