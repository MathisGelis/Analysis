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
      "/arbitres", "/scouting", "/ia", "/rapports", "/import", "/saisons"]) {
      expect(hrefs).toContain(page);
    }
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
  });
  it("chemin inconnu : nom de l'application", () => {
    expect(titrePage("/nimportequoi")).toBe("Foot Analytics");
  });
});
