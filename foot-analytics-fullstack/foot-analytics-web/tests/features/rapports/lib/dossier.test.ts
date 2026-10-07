import { describe, expect, it } from "vitest";

import { ongletsDuDossier } from "@/features/rapports/lib/dossier";

describe("ongletsDuDossier : les documents d'un club adverse", () => {
  it("pre-match, analyse et scouting, relies au meme club", () => {
    expect(ongletsDuDossier("c1", { prematchOuvert: true })).toEqual([
      { id: "prematch", label: "Pre-match", href: "/rapports/prematch/c1" },
      { id: "equipe", label: "Analyse d'equipe", href: "/rapports/equipe/c1" },
      { id: "scouting", label: "Scouting", href: "/club/c1/scouting" },
    ]);
  });

  it("le pre-match du prochain match porte son identifiant", () => {
    expect(ongletsDuDossier("c1", { prematchOuvert: true, matchId: "m 1" })[0].href).toBe("/rapports/prematch/c1?matchId=m%201");
  });

  it("sur une saison passee, il n'y a pas de match a preparer : plus de pre-match", () => {
    expect(ongletsDuDossier("c1", { prematchOuvert: false }).map((o) => o.id)).toEqual(["equipe", "scouting"]);
  });

  it("mon propre club : seulement l'analyse d'equipe (on ne prepare pas un match contre soi, on ne s'observe pas)", () => {
    expect(ongletsDuDossier("moi", { monClub: true, prematchOuvert: true }).map((o) => o.id)).toEqual(["equipe"]);
  });
});
