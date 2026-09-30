import {
  Apparition, apparitionsDesEquipes, changementDeClub, clubParSaison, derniereApparition, derniereSaison, saisonCourte, SaisonRef,
  statutMutationDeduit, statutSaisi,
} from "./parcours-joueur";

const s24: SaisonRef = { id: "s24", nom: "2024-2025", anneeDebut: 2024 };
const s25: SaisonRef = { id: "s25", nom: "2025-2026", anneeDebut: 2025 };
const s26: SaisonRef = { id: "s26", nom: "2026-2027", anneeDebut: 2026 };
const saisons = new Map([s24, s25, s26].map((s) => [s.id, s]));
const app = (clubId: string, saisonId: string | null, date: string | null): Apparition => ({ clubId, saisonId, date });

describe("derniereApparition", () => {
  it("prend la plus recente par date, pas par ordre de la liste ni comparaison de chaines", () => {
    // "06/09/2026" < "22/11/2025" comme chaine : c'est pourtant la plus recente.
    const apps = [app("OL", "s26", "06/09/2026"), app("MIONS", "s25", "22/11/2025"), app("MIONS", "s25", "07/09/2025")];
    expect(derniereApparition(apps, saisons)?.clubId).toBe("OL");
  });

  it("a defaut de date, le debut de la saison sert d'instant", () => {
    expect(derniereApparition([app("A", "s24", null), app("B", "s25", null)], saisons)?.clubId).toBe("B");
  });

  it("aucune apparition datable : null (l'appelant garde ce qu'il sait)", () => {
    expect(derniereApparition([app("A", null, null)], saisons)).toBeNull();
    expect(derniereApparition([], saisons)).toBeNull();
  });
});

describe("clubParSaison", () => {
  it("club de la fin de saison, une saison inconnue est ignoree", () => {
    const apps = [app("A", "s25", "01/09/2025"), app("B", "s25", "01/03/2026"), app("C", "inconnue", "01/01/2026"), app("D", null, "01/01/2026")];
    expect([...clubParSaison(apps, saisons)]).toEqual([["s25", "B"]]);
  });
});

describe("derniereSaison", () => {
  it("la plus recente par annee de debut", () => {
    expect(derniereSaison([app("A", "s25", null), app("A", "s24", null)], saisons)).toBe(s25);
    expect(derniereSaison([app("A", null, "01/01/2026")], saisons)).toBeNull();
  });
});

describe("changementDeClub", () => {
  it("meme club deux saisons de suite", () => {
    expect(changementDeClub([app("OL", "s25", "01/10/2025"), app("OL", "s26", "06/09/2026")], saisons)).toBe("meme_club");
  });

  it("club different d'une saison a l'autre (Mions puis Lyon Sud)", () => {
    expect(changementDeClub([app("MIONS", "s25", "07/12/2025"), app("OL", "s26", "06/09/2026")], saisons)).toBe("club_different");
  });

  it("saison precedente non consecutive ou absente : inconnu, jamais deduit d'un trou", () => {
    expect(changementDeClub([app("OL", "s24", "01/10/2024"), app("OL", "s26", "06/09/2026")], saisons)).toBe("inconnu");
    expect(changementDeClub([app("OL", "s26", "06/09/2026")], saisons)).toBe("inconnu");
    expect(changementDeClub([], saisons)).toBe("inconnu");
  });

  it("transfert en cours de saison : c'est le club de fin de saison qui compte", () => {
    const apps = [app("A", "s25", "01/09/2025"), app("OL", "s25", "01/03/2026"), app("OL", "s26", "06/09/2026")];
    expect(changementDeClub(apps, saisons)).toBe("meme_club");
  });
});

describe("saisonCourte", () => {
  it("raccourcit 2024-2025 en 24-25 et laisse le reste", () => {
    expect(saisonCourte("2024-2025")).toBe("24-25");
    expect(saisonCourte("2025 / 2026")).toBe("25-26");
    expect(saisonCourte("Saison test")).toBe("Saison test");
  });
});

describe("rattachement a une equipe", () => {
  it("vaut presence dans la saison de l'equipe : Pas mutation pour un joueur du club sans match cette saison", () => {
    // A joue au club l'an dernier, pas encore de match cette saison, mais il est dans l'effectif de la saison.
    const apps = [app("OL", "s25", "07/12/2025"), ...apparitionsDesEquipes([{ clubId: "OL", saisonId: "s26" }])];
    expect(changementDeClub(apps, saisons)).toBe("meme_club");
  });

  it("arrive d'un autre club et rattache a l'effectif sans avoir encore joue : club different", () => {
    const apps = [app("MIONS", "s25", "07/12/2025"), ...apparitionsDesEquipes([{ clubId: "OL", saisonId: "s26" }])];
    expect(changementDeClub(apps, saisons)).toBe("club_different");
  });

  it("un match plus recent dans la saison prime sur le rattachement (date du match contre debut de saison)", () => {
    const apps = [...apparitionsDesEquipes([{ clubId: "OL", saisonId: "s26" }]), app("AUTRE", "s26", "06/09/2026"), app("OL", "s25", "01/10/2025")];
    expect(changementDeClub(apps, saisons)).toBe("club_different");
  });
});

describe("statutSaisi", () => {
  it("le drapeau, ou une valeur que le calcul n'ecrit jamais (Mutation, hors delai)", () => {
    expect(statutSaisi("Pas mutation", true)).toBe(true);
    expect(statutSaisi("Mutation", false)).toBe(true);
    expect(statutSaisi("Mutation hors delai", null)).toBe(true);
    expect(statutSaisi("Pas mutation", false)).toBe(false);
    expect(statutSaisi("Non connu", undefined)).toBe(false);
    expect(statutSaisi(null, false)).toBe(false);
  });
});

describe("statutMutationDeduit", () => {
  const base = { parDefaut: "Non connu" };

  it("meme club : Pas mutation, meme si une autre valeur etait saisie", () => {
    expect(statutMutationDeduit({ ...base, actuel: "Mutation hors delai", saisi: true, changement: "meme_club" })).toBe("Pas mutation");
  });

  it("club different : Mutation par defaut, y compris sur Non connu et sur un Pas mutation calcule", () => {
    expect(statutMutationDeduit({ ...base, actuel: "Non connu", saisi: false, changement: "club_different" })).toBe("Mutation");
    expect(statutMutationDeduit({ ...base, actuel: "Pas mutation", saisi: false, changement: "club_different" })).toBe("Mutation");
    expect(statutMutationDeduit({ ...base, actuel: null, saisi: false, changement: "club_different" })).toBe("Mutation");
  });

  it("club different : la saisie du staff est respectee (hors delai, ou Pas mutation voulu)", () => {
    expect(statutMutationDeduit({ ...base, actuel: "Mutation hors delai", saisi: true, changement: "club_different" })).toBe("Mutation hors delai");
    expect(statutMutationDeduit({ ...base, actuel: "Pas mutation", saisi: true, changement: "club_different" })).toBe("Pas mutation");
  });

  it("parcours insuffisant : la valeur en place, sinon la valeur par defaut", () => {
    expect(statutMutationDeduit({ parDefaut: "Pas mutation", actuel: null, saisi: false, changement: "inconnu" })).toBe("Pas mutation");
    expect(statutMutationDeduit({ parDefaut: "Pas mutation", actuel: "Non connu", saisi: false, changement: "inconnu" })).toBe("Pas mutation");
    expect(statutMutationDeduit({ parDefaut: "Non connu", actuel: "Non connu", saisi: false, changement: "inconnu" })).toBe("Non connu");
    expect(statutMutationDeduit({ parDefaut: "Non connu", actuel: "Pas mutation", saisi: false, changement: "inconnu" })).toBe("Pas mutation");
  });

  it("parcours insuffisant : un Non connu saisi a la main est conserve", () => {
    expect(statutMutationDeduit({ parDefaut: "Pas mutation", actuel: "Non connu", saisi: true, changement: "inconnu" })).toBe("Non connu");
  });
});
