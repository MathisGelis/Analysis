import { describe, expect, it } from "vitest";
import { equipeConsultee } from "./equipe-consultee";

const eq = (id: string, clubId: string, saisonId: string, poule: string | null, comp = "Seniors D2") =>
  ({ id, clubId, saisonId, poule, competitionLibelle: comp });

const equipes = [
  eq("moi-c-25", "moi", "s25", "C"), eq("moi-u20-25", "moi", "s25", "B", "U20 R2"),
  eq("moi-a-26", "moi", "s26", "A"),
  eq("adv-c-25", "adv", "s25", "C"), eq("adv-u20-25", "adv", "s25", "B", "U20 R2"),
  eq("adv-a-26", "adv", "s26", "A"), eq("adv-b-26", "adv", "s26", "B"),
];

describe("equipeConsultee", () => {
  it("prend l'equipe du club qui joue dans mon championnat", () => {
    const r = equipeConsultee({ equipes, clubId: "adv", saisonId: "s25", maEquipe: equipes[0] });
    expect(r?.id).toBe("adv-c-25");
    const u20 = equipeConsultee({ equipes, clubId: "adv", saisonId: "s25", maEquipe: equipes[1] });
    expect(u20?.id).toBe("adv-u20-25");
  });

  it("ne sort jamais de la saison choisie : poule A en 26-27, pas la poule C de l'an passe", () => {
    const r = equipeConsultee({ equipes, clubId: "adv", saisonId: "s26", maEquipe: equipes[2] });
    expect(r?.id).toBe("adv-a-26");
  });

  it("aucune equipe du club dans mon championnat : la premiere de la saison", () => {
    const r = equipeConsultee({ equipes, clubId: "adv", saisonId: "s26", maEquipe: equipes[0] });
    expect(r?.saisonId).toBe("s26");
  });

  it("club sans equipe sur la saison : null", () => {
    expect(equipeConsultee({ equipes, clubId: "adv", saisonId: "s24", maEquipe: null })).toBeNull();
  });

  it("sans saison choisie, sans mon equipe : premiere equipe du club", () => {
    expect(equipeConsultee({ equipes, clubId: "moi", saisonId: null })?.id).toBe("moi-c-25");
  });
});
