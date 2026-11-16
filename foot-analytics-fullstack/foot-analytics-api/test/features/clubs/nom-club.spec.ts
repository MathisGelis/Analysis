// Identite d'un club d'apres son nom : sigle des feuilles de match (FMI) contre nom complet du calendrier FFF.

import { clubParAbrege, estAbregeDe } from "@/features/clubs/nom-club";

describe("estAbregeDe : un sigle designe-t-il le nom complet ?", () => {
  it.each([
    ["FCLCR", "FC Lyon Croix Rousse"],
    ["FCLCR", "Football Club Lyon Croix Rousse"],
    ["F.C.L.C.R.", "FC Lyon Croix Rousse"],
    ["LCR", "FC Lyon Croix Rousse"],
    ["FCLYONCR", "FC Lyon Croix Rousse"],
    ["ASVVV", "AS Villeurbanne Vaulx Velin"],
    ["FCLCR 2", "FC Lyon Croix Rousse"],
    ["CSNDM", "Club Sportif Notre Dame de la Mouche"],
  ])("%s est l'abrege de %s", (abrege, complet) => expect(estAbregeDe(abrege, complet)).toBe(true));

  it.each([
    ["FC Lyon Croix Rousse", "FC Lyon Croix Rousse"],   // le meme nom : ce n'est pas un abrege
    ["FCLCR", "FC Lyon Sud"],
    ["FCL", "FC Lyon Croix Rousse"],                    // trop court : trois lettres au moins, et chaque mot compte
    ["LCR", "FC Lyon"],                                  // nom complet trop court pour deviner
    ["XY", "FC Lyon Croix Rousse"],
    ["FCLCRX", "FC Lyon Croix Rousse"],
  ])("%s n'est pas l'abrege de %s", (abrege, complet) => expect(estAbregeDe(abrege, complet)).toBe(false));
});

describe("clubParAbrege", () => {
  const clubs = [{ id: "a", nom: "FCLCR" }, { id: "b", nom: "AS Bron Terraillon" }, { id: "c", nom: "FC Lyon Sud" }];
  it("retrouve le club dont le nom est le sigle (ou dont le nom complet a ce sigle)", () => {
    expect(clubParAbrege("FC Lyon Croix Rousse", clubs)).toBe("a");
    expect(clubParAbrege("ASBT", clubs)).toBe("b");
  });
  it("rien si aucun, ou si deux clubs conviennent (jamais de fusion au hasard)", () => {
    expect(clubParAbrege("Union Sportive Inconnue", clubs)).toBeUndefined();
    expect(clubParAbrege("FC Lyon Croix Rousse", [...clubs, { id: "d", nom: "LCR" }])).toBeUndefined();
  });
});
