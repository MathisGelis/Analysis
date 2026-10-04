import { analyserNumeros, FENETRE_NUMEROS, LigneFeuille, PLAFOND_CONFIANCE_NUMEROS, structureDe } from "@/features/analyse/compo-numeros";

/** Un joueur "pN" porte le numero N sauf indication contraire ; `numeros` change le numero de certains joueurs pour le match. */
function feuille(matchId: string, date: string, numeros: Record<string, number> = {}): LigneFeuille[] {
  return Array.from({ length: 11 }, (_, i) => {
    const joueur = `p${i + 1}`;
    return { matchId, date, journee: null, joueur, nom: `Joueur ${i + 1}`, numero: numeros[joueur] ?? i + 1, titulaire: true };
  });
}
/** Des feuilles datees du 1er septembre, une par semaine, de la plus ancienne a la plus recente. */
function saison(...changements: Record<string, number>[]): LigneFeuille[] {
  return changements.flatMap((c, i) => feuille(`m${i + 1}`, `${String(1 + 7 * i).padStart(2, "0")}/09/2025`, c));
}

describe("analyserNumeros : postes", () => {
  it("numeros stables : un joueur par poste, et le systeme n'est PAS deduit (rien a lire)", () => {
    const a = analyserNumeros(saison({}, {}, {}));
    expect(a.matchs).toBe(3);
    expect(a.fiabilite).toMatchObject({ exploitable: true, part: 1 });
    expect(a.onze.map((p) => [p.numero, p.poste, p.nom, p.fois, p.origine])).toEqual([
      [1, "GB", "Joueur 1", 3, "numero"], [2, "DD", "Joueur 2", 3, "numero"], [3, "DG", "Joueur 3", 3, "numero"],
      [4, "DCD", "Joueur 4", 3, "numero"], [5, "DCG", "Joueur 5", 3, "numero"], [6, "MDC", "Joueur 6", 3, "numero"],
      [7, "AG", "Joueur 7", 3, "numero"], [8, "MC", "Joueur 8", 3, "numero"], [9, "BU", "Joueur 9", 3, "numero"],
      [10, "MO", "Joueur 10", 3, "numero"], [11, "AD", "Joueur 11", 3, "numero"],
    ]);
    expect(a.systeme).toBeNull();
    expect(a.indices).toEqual([]);
    expect(a.structure).toEqual({ defense: null, attaque: null });
    expect(a.notes.join(" ")).toMatch(/Aucun changement de numero/);
  });

  it("une seule feuille : les postes, mais aucun changement a observer", () => {
    const a = analyserNumeros(feuille("m1", "01/09/2025"));
    expect(a.onze).toHaveLength(11);
    expect(a.systeme).toBeNull();
    expect(a.notes.join(" ")).toMatch(/Une seule feuille/);
  });

  it("numeros de saison (plus de 25 % des titulaires hors 1-11) : rien n'est deduit", () => {
    const lignes = saison({}, {}).map((l) => ({ ...l, numero: l.numero + 12 }));
    const a = analyserNumeros(lignes);
    expect(a.fiabilite.exploitable).toBe(false);
    expect(a.onze).toEqual([]);
    expect(a.profils).toEqual([]);
    expect(a.systeme).toBeNull();
    expect(a.notes[0]).toMatch(/Numeros peu fiables : 100 %/);
  });

  it("pas de feuille avec onze (que des remplacants) : rien a lire", () => {
    const a = analyserNumeros(feuille("m1", "01/09/2025").map((l) => ({ ...l, titulaire: false })));
    expect(a.matchs).toBe(0);
    expect(a.onze).toEqual([]);
    expect(a.notes[0]).toMatch(/Aucune feuille/);
  });

  it("un joueur qui change de numero n'occupe qu'un poste : le plus recent et frequent, l'autre poste revient a un autre", () => {
    // p3 (DG) joue 3 aux deux premiers matchs puis 4 aux trois derniers ; p4 (DCD) ne joue que les deux premiers.
    const a = analyserNumeros([
      ...feuille("m1", "01/09/2025"), ...feuille("m2", "08/09/2025"),
      ...feuille("m3", "15/09/2025", { p3: 4 }), ...feuille("m4", "22/09/2025", { p3: 4 }), ...feuille("m5", "29/09/2025", { p3: 4 }),
    ].filter((l) => !(l.joueur === "p4" && ["m3", "m4", "m5"].includes(l.matchId))));
    const p3 = a.profils.find((p) => p.joueur === "p3")!;
    expect(p3.numeros).toEqual([{ numero: 4, poste: "DCD", fois: 3 }, { numero: 3, poste: "DG", fois: 2 }]);
    expect(p3.principal).toBe("DCD");
    expect(p3.polyvalent).toBe(true);
    expect(a.onze.find((p) => p.numero === 4)).toMatchObject({ joueur: "p3", fois: 3, origine: "numero" });
    // p4 (2 titularisations en 4) ne prend pas le 4 ; le 3 n'a plus de titulaire : p4, de la meme ligne (defense), le tient a defaut.
    expect(a.onze.find((p) => p.numero === 3)).toMatchObject({ joueur: "p4", origine: "ligne", fois: 0 });
    expect(a.onze.find((p) => p.numero === 4)!.autres).toEqual([{ nom: "Joueur 4", fois: 2 }]);
  });

  it("poste sans joueur possible : vide, jamais invente", () => {
    const a = analyserNumeros([
      ...saison({}, {}).filter((l) => l.joueur !== "p9"),
    ]);
    expect(a.onze.find((p) => p.numero === 9)).toMatchObject({ joueur: null, nom: null, origine: null, fois: 0 });
  });

  it("un titulaire en 14 n'a pas de poste lisible mais ne fausse pas la lecture des autres", () => {
    const a = analyserNumeros(saison({ p10: 14 }, {}, {}));
    expect(a.fiabilite.exploitable).toBe(true);
    expect(a.fiabilite.titulaires).toBe(33);
    expect(a.fiabilite.dansLesOnze).toBe(32);
    const p10 = a.profils.find((p) => p.joueur === "p10")!;
    expect(p10.titularisations).toBe(3);
    expect(p10.numeros).toEqual([{ numero: 10, poste: "MO", fois: 2 }]);
  });

  it("ne lit que les feuilles les plus recentes (fenetre) et ordonne par date, pas par ordre de lecture", () => {
    // 12 feuilles : les 2 plus anciennes (m1, m2) ou p5 porte le 4 sortent de la fenetre de 10.
    const lignes = saison({ p5: 4 }, { p5: 4 }, ...Array.from({ length: 10 }, () => ({})));
    const a = analyserNumeros([...lignes].reverse());
    expect(a.matchs).toBe(FENETRE_NUMEROS);
    expect(a.profils.find((p) => p.joueur === "p5")!.numeros).toEqual([{ numero: 5, poste: "DCG", fois: 10 }]);
    expect(a.indices).toEqual([]);
  });
});

describe("analyserNumeros : systeme d'apres les changements de numero", () => {
  it("un lateral qui passe dans l'axe (2 puis 4) : defense a 4 (DD -> DC)", () => {
    // p2 est 2 trois fois et 4 deux fois ; p4 prend le 2 les deux fois ou p2 est 4.
    const a = analyserNumeros(saison({ p2: 4, p4: 2 }, {}, { p2: 4, p4: 2 }, {}, {}));
    const indice = a.indices.find((i) => i.regle === "lateral-axe");
    expect(indice).toBeDefined();
    expect(indice!.texte).toMatch(/Joueur 2 porte le 2 \(3 fois\) et le 4 \(2 fois\) : un lateral qui passe dans l'axe \(DD\/DG vers DC\) : defense a 4/);
    expect(a.systeme).not.toBeNull();
    expect(["4-4-2", "4-3-3", "4-2-3-1"]).toContain(a.systeme!.systeme);
    expect(a.structure.defense).toEqual({ lignes: 4, part: 100 });
    // La defense a 4 est lue ; l'attaque, non (trois systemes a egalite : aucune valeur ne domine).
    expect(a.structure.attaque).toBeNull();
  });

  it("un attaquant tantot 9 tantot 10 : deux attaquants (4-4-2)", () => {
    const a = analyserNumeros(saison({ p9: 10, p10: 9 }, {}, { p9: 10, p10: 9 }, {}, { p9: 10, p10: 9 }, {}));
    expect(a.indices.some((i) => i.regle === "deux-attaquants")).toBe(true);
    expect(a.systeme!.systeme).toBe("4-4-2");
    expect(a.structure.attaque).toMatchObject({ attaquants: 2 });
    expect(a.systeme!.distribution.map((d) => d.systeme)).toEqual(["4-4-2", "3-5-2", "5-3-2"]);
  });

  it("un avant-centre qui alterne avec un ailier (9 et 11, 7 et 9) : trois attaquants (4-3-3)", () => {
    const a = analyserNumeros(saison({ p9: 11, p11: 9 }, {}, { p9: 7, p7: 9 }, {}, { p9: 11, p11: 9 }, {}));
    expect(a.indices.some((i) => i.regle === "trois-attaquants")).toBe(true);
    expect(a.systeme!.systeme).toBe("4-3-3");
    expect(a.structure.attaque).toMatchObject({ attaquants: 3, part: 100 });
  });

  it("un lateral qui monte (2 et 7) : piston, defense a 3 ou 5", () => {
    const a = analyserNumeros(saison({ p2: 7, p7: 2 }, {}, { p2: 7, p7: 2 }, {}));
    expect(a.indices.some((i) => i.regle === "lateral-piston")).toBe(true);
    expect(a.systeme!.distribution.map((d) => d.systeme)).toEqual(["3-5-2", "3-4-3", "5-3-2", "5-4-1"]);
    expect(a.structure.defense).toBeNull();      // 3 ou 5 : aucune valeur ne domine
  });

  it("les indices se cumulent : lateral dans l'axe + deux attaquants -> 4-4-2 en tete", () => {
    const a = analyserNumeros(saison({ p2: 4, p4: 2, p9: 10, p10: 9 }, {}, { p2: 4, p4: 2, p9: 10, p10: 9 }, {}, {}));
    expect(a.systeme!.systeme).toBe("4-4-2");
    expect(a.structure.defense).toMatchObject({ lignes: 4 });
    expect(a.structure.attaque).toMatchObject({ attaquants: 2 });
  });

  it("la confiance reste plafonnee et d'autant plus basse que les indices sont minces", () => {
    const mince = analyserNumeros(saison({}, {}, {}, {}, { p9: 10, p10: 9 })).systeme!;     // un seul changement, tout recent
    const epais = analyserNumeros(saison(
      { p9: 10, p10: 9, p2: 4, p4: 2 }, {}, { p9: 10, p10: 9, p2: 4, p4: 2 }, {}, { p9: 10, p10: 9, p2: 4, p4: 2 }, {},
    )).systeme!;
    expect(mince.preuves).toBeLessThan(1);
    expect(mince.fiabilite).toBe("faible");
    expect(mince.confiance).toBeLessThanOrEqual(PLAFOND_CONFIANCE_NUMEROS);
    expect(epais.confiance).toBeGreaterThanOrEqual(mince.confiance);
    expect(epais.confiance).toBeLessThanOrEqual(PLAFOND_CONFIANCE_NUMEROS);
  });

  it("un changement recent pese plus qu'un changement ancien", () => {
    const ancien = analyserNumeros(saison({ p9: 10, p10: 9 }, {}, {}, {}, {}, {})).indices[0];
    const recent = analyserNumeros(saison({}, {}, {}, {}, {}, { p9: 10, p10: 9 })).indices[0];
    expect(recent.force).toBeGreaterThan(ancien.force);
  });

  it("un joueur n'emporte pas la decision a lui seul : sa force est plafonnee", () => {
    const lignes = saison(...Array.from({ length: 6 }, () => ({ p2: 4, p3: 5, p4: 2, p5: 3 })));
    const a = analyserNumeros(lignes);
    expect(a.indices.every((i) => i.force <= 1.5)).toBe(true);
  });

  it("la force totale d'une regle est plafonnee, tous joueurs confondus", () => {
    const changements: Record<string, number>[] = Array.from({ length: 6 }, (_, i): Record<string, number> => (i % 2 ? {} : { p2: 4, p3: 5, p4: 2, p5: 3, p9: 10, p10: 9 }));
    const a = analyserNumeros(saison(...changements));
    const total = a.indices.filter((i) => i.regle === "lateral-axe").reduce((s, i) => s + i.force, 0);
    expect(total).toBeLessThanOrEqual(3);
  });
});

describe("structureDe", () => {
  it("sans estimation : aucune structure", () => {
    expect(structureDe(null)).toEqual({ defense: null, attaque: null });
  });

  it("lit les lignes dans une distribution quelconque (dispositifs saisis compris)", () => {
    expect(structureDe({ distribution: [{ systeme: "4-4-2", poids: 50 }, { systeme: "4-4-1-1", poids: 30 }, { systeme: "3-5-2", poids: 20 }] }))
      .toEqual({ defense: { lignes: 4, part: 80 }, attaque: { attaquants: 2, part: 70 } });
    // Aucune valeur ne domine (40 / 30 / 30) : rien n'est affirme.
    expect(structureDe({ distribution: [{ systeme: "4-4-2", poids: 40 }, { systeme: "4-3-3", poids: 30 }, { systeme: "4-2-3-1", poids: 30 }] }).attaque).toBeNull();
    expect(structureDe({ distribution: [{ systeme: "4-3-3", poids: 100 }] }))
      .toEqual({ defense: { lignes: 4, part: 100 }, attaque: { attaquants: 3, part: 100 } });
  });
});
