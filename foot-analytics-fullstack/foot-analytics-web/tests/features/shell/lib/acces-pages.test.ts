import { describe, expect, it } from "vitest";

import { PAGES_ADMIN, PAGES_SAISON_EN_COURS, pageAccessible, restrictionDe } from "@/features/shell/lib/acces-pages";

describe("saison passée : la préparation du prochain match est fermee", () => {
  it.each(["/calendrier", "/entrainements", "/tactique", "/ia", "/rapports/prematch/club-1", "/rapports/prematch/club-1?matchId=m1"])(
    "%s : fermee pour tous, y compris l'administrateur", (chemin) => {
      for (const role of ["admin", "referent", "user"]) expect(restrictionDe(chemin, { role, mode: "passee" })).toBe("saison-passee");
    });

  it("ouverte sur la saison en cours, à venir, ou quand on ne sait pas (aucune saison choisie)", () => {
    for (const mode of ["active", "future", "inconnue"] as const) {
      for (const chemin of PAGES_SAISON_EN_COURS) expect(restrictionDe(chemin, { role: "user", mode })).toBeNull();
    }
  });

  it("le reste reste consultable sur une saison passée : matchs, effectif, médical, analyse d'équipe, rapports, classement", () => {
    for (const chemin of ["/", "/matchs", "/matchs/m1", "/effectif", "/medical", "/classement", "/rapports",
      "/rapports/equipe/club-1", "/club/club-1", "/club/club-1/scouting", "/joueur/j1", "/arbitres", "/import"]) {
      expect(restrictionDe(chemin, { role: "user", mode: "passee" }), chemin).toBeNull();
    }
  });

  it("un prefixe n'est pas un chemin : /entrainementsXYZ et /rapports/prematchs ne sont pas fermes", () => {
    expect(restrictionDe("/entrainementsXYZ", { role: "user", mode: "passee" })).toBeNull();
    expect(restrictionDe("/rapports/prematchs", { role: "user", mode: "passee" })).toBeNull();
    expect(restrictionDe("/calendrierXYZ", { role: "user", mode: "passee" })).toBeNull();
  });
});

describe("pages réservées à l'administrateur : saisons et IA", () => {
  it("fermées au référent, a l'éducateur et a un compte inconnu ; ouvertes à l'administrateur, sur n'importe quelle saison", () => {
    for (const chemin of PAGES_ADMIN) {
      for (const role of ["referent", "user", null, undefined]) expect(restrictionDe(chemin, { role, mode: "active" })).toBe("admin");
      for (const mode of ["active", "passee", "future", "inconnue"] as const) expect(restrictionDe(chemin, { role: "admin", mode })).toBeNull();
    }
    expect(restrictionDe("/saisons/nouvelle", { role: "user", mode: "active" })).toBe("admin");
  });

  it("la gestion des comptes reste à l'administrateur ET au référent : /admin/utilisateurs n'est pas dans la liste", () => {
    expect(restrictionDe("/admin/utilisateurs", { role: "referent", mode: "active" })).toBeNull();
  });

  it("l'administrateur sur une saison passée : ses pages restent ouvertes, la préparation du match non", () => {
    expect(pageAccessible("/saisons", { role: "admin", mode: "passee" })).toBe(true);
    expect(pageAccessible("/tactique", { role: "admin", mode: "passee" })).toBe(false);
  });
});
