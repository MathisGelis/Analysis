import { designeLeJoueur, minutesJouees } from "./minutes";

const compo = (o: Record<string, any> = {}) => ({
  nom: "GRANGE", prenom: "Enzo", cote: "ext" as const, titulaire: true, minutes: 0, ...o,
});
const remplacement = (sortant: string, entrant: string, minute: number, equipe: "dom" | "ext" = "ext") =>
  ({ type: "remplacement", equipe, joueur: sortant, joueur2: entrant, minute });

describe("minutesJouees", () => {
  it("la valeur stockee prime quand elle est positive", () => {
    expect(minutesJouees(compo({ minutes: 73 }), [remplacement("GRANGE Enzo", "X Y", 65)])).toBe(73);
  });

  it("titulaire jamais remplace : 90", () => {
    expect(minutesJouees(compo(), [])).toBe(90);
  });

  it("titulaire remplace : minute de sa sortie", () => {
    expect(minutesJouees(compo(), [remplacement("GRANGE Enzo", "GRANJON Alexandre", 65)])).toBe(65);
  });

  it("remplacant entre a la 80e : 10 minutes ; jamais entre : 0", () => {
    const evts = [remplacement("BESSON Charly", "GRANGE Robin", 80)];
    expect(minutesJouees(compo({ nom: "GRANGE", prenom: "Robin", titulaire: false }), evts)).toBe(10);
    expect(minutesJouees(compo({ nom: "AUTRE", prenom: "Zed", titulaire: false }), evts)).toBe(0);
  });

  it("deux homonymes d'une meme equipe ne se voient pas attribuer les remplacements l'un de l'autre", () => {
    // Cas reel : Enzo GRANGE (titulaire) sort a la 65e, Robin GRANGE (remplacant) entre a la 80e.
    const evts = [
      remplacement("GRANGE Enzo", "GRANJON Alexandre", 65),
      remplacement("BESSON Charly", "GRANGE Robin", 80),
    ];
    expect(minutesJouees(compo({ prenom: "Enzo", titulaire: true }), evts)).toBe(65);
    expect(minutesJouees(compo({ prenom: "Robin", titulaire: false }), evts)).toBe(10);
    // Robin titulaire fictif ne "sort" pas a la place d'Enzo.
    expect(minutesJouees(compo({ prenom: "Robin", titulaire: true }), evts)).toBe(90);
  });

  it("ignore les remplacements de l'autre equipe", () => {
    expect(minutesJouees(compo(), [remplacement("GRANGE Enzo", "X Y", 30, "dom")])).toBe(90);
  });

  it("sans minute de sortie renseignee : 90 ; sans minute d'entree : 0", () => {
    expect(minutesJouees(compo(), [{ ...remplacement("GRANGE Enzo", "X", 0), minute: null as any }])).toBe(90);
    expect(minutesJouees(compo({ titulaire: false }), [{ ...remplacement("Y", "GRANGE Enzo", 0), minute: null as any }])).toBe(0);
  });
});

describe("designeLeJoueur", () => {
  it("insensible a la casse et aux accents", () => {
    expect(designeLeJoueur("MARÇON  Léo", { nom: "Marcon", prenom: "leo" })).toBe(true);
  });
  it("sans prenom en base : le nom suffit", () => {
    expect(designeLeJoueur("DUPONT Jean", { nom: "DUPONT", prenom: null as any })).toBe(true);
  });
  it("libelle vide ou joueur different", () => {
    expect(designeLeJoueur("", { nom: "DUPONT", prenom: "Jean" })).toBe(false);
    expect(designeLeJoueur("DURAND Paul", { nom: "DUPONT", prenom: "Jean" })).toBe(false);
  });
});
