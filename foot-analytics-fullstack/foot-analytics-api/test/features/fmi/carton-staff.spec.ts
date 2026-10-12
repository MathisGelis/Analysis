import { estCartonDuStaff } from "@/features/fmi/carton-staff";

const joueurs = [{ licence: "111", nom: "GRANJON Alexandre" }, { licence: "222", nom: "MANSOUR Abdamalek" }];
const staff = [{ licence: "900", nom: "DELORME Eric" }, { licence: "901", nom: "CLOUZET DIT ORIENTI Jean Philippe" }];

describe("estCartonDuStaff", () => {
  it("la licence d'un membre de l'encadrement : carton du staff", () => {
    expect(estCartonDuStaff({ licence: "900", joueur: "DELORME Eric" }, joueurs, staff)).toBe(true);
  });
  it("la licence d'un joueur de la feuille : carton de joueur, meme si un nom ressemble a celui du staff", () => {
    expect(estCartonDuStaff({ licence: "111", joueur: "GRANJON Alexandre" }, joueurs, staff)).toBe(false);
    expect(estCartonDuStaff({ licence: "111", joueur: "DELORME Eric" }, joueurs, staff)).toBe(false);
  });
  it("sans licence : par le nom (ordre et accents indifferents), jamais si un joueur porte ce nom", () => {
    expect(estCartonDuStaff({ joueur: "Eric DELORME" }, joueurs, staff)).toBe(true);
    expect(estCartonDuStaff({ licence: "", joueur: "clouzet dit orienti jean philippe" }, joueurs, staff)).toBe(true);
    expect(estCartonDuStaff({ joueur: "GRANJON Alexandre" }, joueurs, [{ licence: "9", nom: "GRANJON Alexandre" }])).toBe(false);
  });
  it("une personne inconnue ou un nom vide : carton de joueur (jamais perdu)", () => {
    expect(estCartonDuStaff({ licence: "555", joueur: "INCONNU Paul" }, joueurs, staff)).toBe(false);
    expect(estCartonDuStaff({ joueur: "" }, joueurs, staff)).toBe(false);
  });
});
