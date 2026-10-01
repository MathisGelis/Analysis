import { equipeDuCote, isEquipeSurCote } from "@/features/matchs/matching-cote";

const match = {
  clubDom: "A", clubExt: "B", equipeDomId: "eA", equipeExtId: "eB",
};

describe("isEquipeSurCote", () => {
  it("se fie a l'id d'equipe du match", () => {
    expect(isEquipeSurCote(match, { id: "eA", clubId: "A" }, "dom")).toBe(true);
    expect(isEquipeSurCote(match, { id: "eA", clubId: "A" }, "ext")).toBe(false);
    expect(isEquipeSurCote(match, { id: "eB", clubId: "B" }, "ext")).toBe(true);
  });

  it("distingue deux equipes du meme club (coupe Seniors 1 - Seniors 2)", () => {
    const derby = { clubDom: "A", clubExt: "A", equipeDomId: "eA1", equipeExtId: "eA2" };
    expect(isEquipeSurCote(derby, { id: "eA1", clubId: "A" }, "dom")).toBe(true);
    expect(isEquipeSurCote(derby, { id: "eA1", clubId: "A" }, "ext")).toBe(false);
    expect(isEquipeSurCote(derby, { id: "eA2", clubId: "A" }, "ext")).toBe(true);
  });

  it("se rabat sur le club pour un ancien match sans equipe", () => {
    const ancien = { clubDom: "A", clubExt: "B", equipeDomId: null, equipeExtId: null } as any;
    expect(isEquipeSurCote(ancien, { id: "x", clubId: "A" }, "dom")).toBe(true);
    expect(isEquipeSurCote(ancien, { id: "x", clubId: "A" }, "ext")).toBe(false);
  });
});

describe("equipeDuCote", () => {
  it("renvoie club et equipe du cote demande", () => {
    expect(equipeDuCote(match, "dom")).toEqual({ clubId: "A", equipeId: "eA" });
    expect(equipeDuCote(match, "ext")).toEqual({ clubId: "B", equipeId: "eB" });
  });
  it("equipeId null pour un ancien match", () => {
    const ancien = { clubDom: "A", clubExt: "B", equipeDomId: undefined, equipeExtId: undefined } as any;
    expect(equipeDuCote(ancien, "dom")).toEqual({ clubId: "A", equipeId: null });
  });
});
