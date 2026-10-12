import { estCartonDuStaff } from "@/features/fmi/carton-staff";

const joueurs = [{ licence: "111", nom: "REPELEN Gekavogiv" }, { licence: "222", nom: "LUDENOZ Dofufulik" }];
const staff = [{ licence: "900", nom: "BUVORAS Nadi" }, { licence: "901", nom: "FEVUMAZ GIS LAGUREZ Vafu Philippe" }];

describe("estCartonDuStaff", () => {
  it("la licence d'un membre de l'encadrement : carton du staff", () => {
    expect(estCartonDuStaff({ licence: "900", joueur: "BUVORAS Nadi" }, joueurs, staff)).toBe(true);
  });
  it("la licence d'un joueur de la feuille : carton de joueur, meme si un nom ressemble a celui du staff", () => {
    expect(estCartonDuStaff({ licence: "111", joueur: "REPELEN Gekavogiv" }, joueurs, staff)).toBe(false);
    expect(estCartonDuStaff({ licence: "111", joueur: "BUVORAS Nadi" }, joueurs, staff)).toBe(false);
  });
  it("sans licence : par le nom (ordre et accents indifferents), jamais si un joueur porte ce nom", () => {
    expect(estCartonDuStaff({ joueur: "Nadi BUVORAS" }, joueurs, staff)).toBe(true);
    expect(estCartonDuStaff({ licence: "", joueur: "fevumaz gis lagurez vafu philippe" }, joueurs, staff)).toBe(true);
    expect(estCartonDuStaff({ joueur: "REPELEN Gekavogiv" }, joueurs, [{ licence: "9", nom: "REPELEN Gekavogiv" }])).toBe(false);
  });
  it("une personne inconnue ou un nom vide : carton de joueur (jamais perdu)", () => {
    expect(estCartonDuStaff({ licence: "555", joueur: "INCONNU Paul" }, joueurs, staff)).toBe(false);
    expect(estCartonDuStaff({ joueur: "" }, joueurs, staff)).toBe(false);
  });
});
