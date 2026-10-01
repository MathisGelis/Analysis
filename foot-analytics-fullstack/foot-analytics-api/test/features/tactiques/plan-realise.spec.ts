import { comparerPlanRealise, JoueurRef, LigneFeuille } from "@/features/tactiques/plan-realise";

const joueurs: JoueurRef[] = Array.from({ length: 16 }, (_, i) => ({
  id: `j${i + 1}`, nom: `NOM${i + 1}`, prenom: `Prenom${i + 1}`, licence: `L${i + 1}`,
}));
const ids = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => `j${a + i}`);
/** Ligne de feuille du joueur n (par licence et par nom). */
const ligne = (n: number, extra: Partial<LigneFeuille> = {}): LigneFeuille =>
  ({ nom: `NOM${n}`, prenom: `Prenom${n}`, licence: `L${n}`, titulaire: true, minutes: 90, ...extra });
const plan = (extra = {}) => ({
  formation: "4-4-2", titulaires: ids(1, 11), remplacants: ids(12, 16), capitaineId: "j6", ...extra,
});
/** Feuille conforme : j1-j11 titulaires, j12-j16 sur le banc sans jouer. */
const feuilleConforme = () => [
  ...ids(1, 11).map((id) => ligne(+id.slice(1), { capitaine: id === "j6" })),
  ...ids(12, 16).map((id) => ligne(+id.slice(1), { titulaire: false, minutes: 0 })),
];

describe("comparerPlanRealise", () => {
  it("feuille conforme : 100 %, rien a signaler sauf un onze conforme", () => {
    const c = comparerPlanRealise({ plan: plan(), joueurs, feuille: feuilleConforme() });
    expect(c.etat).toBe("ok");
    expect(c.adequation).toBe(100);
    expect(c.titulairesConformes).toBe(11);
    expect(c.lignes.every((l) => l.ecart === "conforme")).toBe(true);
    expect(c.capitaine.identique).toBe(true);
    expect(c.observations.map((o) => o.titre)).toEqual(["Onze conforme au plan"]);
  });

  it("feuille sans composition : rien a comparer, rien d'invente", () => {
    const c = comparerPlanRealise({ plan: plan(), joueurs, feuille: [] });
    expect(c).toMatchObject({ etat: "feuille_vide", adequation: null, lignes: [], observations: [] });
  });

  it("titulaire prevu absent de la feuille, remplace par une surprise", () => {
    const feuille = feuilleConforme().filter((l) => l.nom !== "NOM9");
    feuille.push(ligne(99, { nom: "NOUVEAU", prenom: "Zed", licence: "L99" }));
    const c = comparerPlanRealise({ plan: plan(), joueurs, feuille });
    expect(c.adequation).toBe(91);                       // 10 / 11
    expect(c.lignes.find((l) => l.joueurId === "j9")).toMatchObject({ reel: "absent", ecart: "absent" });
    expect(c.lignes.find((l) => l.nom === "Zed NOUVEAU")).toMatchObject({ prevu: null, ecart: "surprise" });
    const titres = c.observations.map((o) => o.titre);
    expect(titres).toContain("1 titulaire prevu absent de la feuille");
    expect(titres).toContain("1 titulaire non prevu");
  });

  it("titulaire prevu au banc (entre ou non) et remplacant promu", () => {
    const feuille = feuilleConforme().map((l) => {
      if (l.nom === "NOM3") return { ...l, titulaire: false, minutes: 35 };   // prevu titulaire, entre en jeu
      if (l.nom === "NOM4") return { ...l, titulaire: false, minutes: 0 };    // prevu titulaire, non utilise
      if (l.nom === "NOM12") return { ...l, titulaire: true, minutes: 90 };   // prevu remplacant, promu
      return l;
    });
    const c = comparerPlanRealise({ plan: plan(), joueurs, feuille });
    expect(c.lignes.find((l) => l.joueurId === "j3")).toMatchObject({ reel: "entre", ecart: "relegue", minutes: 35 });
    expect(c.lignes.find((l) => l.joueurId === "j4")).toMatchObject({ reel: "banc", ecart: "relegue" });
    expect(c.lignes.find((l) => l.joueurId === "j12")).toMatchObject({ prevu: "remplacant", ecart: "promu" });
    expect(c.adequation).toBe(82);                       // 9 / 11
    const releve = c.observations.find((o) => o.titre.startsWith("Prevus titulaires"))!;
    expect(releve.detail).toContain("Prenom3 NOM3 (entre en jeu, 35 min)");
    expect(releve.detail).toContain("Prenom4 NOM4 (non utilise)");
  });

  it("`entre` explicite prime sur les minutes (entree a la 90e : zero minute, mais entre)", () => {
    const feuille = feuilleConforme().map((l) => (l.nom === "NOM13" ? { ...l, minutes: 0, entre: true } : l));
    const c = comparerPlanRealise({ plan: plan(), joueurs, feuille });
    expect(c.lignes.find((l) => l.joueurId === "j13")).toMatchObject({ reel: "entre", ecart: "conforme" });
  });

  it("remplacant prevu qui entre : conforme ; remplacant non prevu qui entre : signale ; non prevu non utilise : ignore", () => {
    const feuille = feuilleConforme().map((l) => (l.nom === "NOM13" ? { ...l, minutes: 20 } : l));
    feuille.push(ligne(50, { nom: "EXTRA", prenom: "Un", licence: "L50", titulaire: false, minutes: 12 }));
    feuille.push(ligne(51, { nom: "EXTRA", prenom: "Deux", licence: "L51", titulaire: false, minutes: 0 }));
    const c = comparerPlanRealise({ plan: plan(), joueurs, feuille });
    expect(c.lignes.find((l) => l.joueurId === "j13")).toMatchObject({ reel: "entre", ecart: "conforme" });
    expect(c.lignes.find((l) => l.nom === "Un EXTRA")).toMatchObject({ ecart: "non_prevu" });
    expect(c.lignes.find((l) => l.nom === "Deux EXTRA")).toBeUndefined();
    expect(c.observations.find((o) => o.titre === "Remplacements")!.detail).toBe("2 joueurs entres en jeu, dont 1 prevu sur le banc.");
  });

  it("rapproche par nom quand la licence manque, dans n'importe quel ordre et sans accent", () => {
    const js: JoueurRef[] = [{ id: "a", nom: "Ben Kahla", prenom: "Eddy", licence: null }, ...joueurs.slice(1, 11)];
    const feuille: LigneFeuille[] = [
      { nom: "BEN KAHLA", prenom: "Eddy", titulaire: true, minutes: 90 },
      ...ids(2, 11).map((id) => ligne(+id.slice(1))),
    ];
    const c = comparerPlanRealise({ plan: plan({ titulaires: ["a", ...ids(2, 11)], remplacants: [] }), joueurs: js, feuille });
    expect(c.lignes.find((l) => l.joueurId === "a")).toMatchObject({ reel: "titulaire", ecart: "conforme" });
    // Nom de famille et prenom inverses, accents en plus.
    const inverse = comparerPlanRealise({
      plan: plan({ titulaires: ["e"], remplacants: [] }),
      joueurs: [{ id: "e", nom: "DUPONT", prenom: "Jean-Pierre" }],
      feuille: [{ nom: "Jean Pierre", prenom: "Düpont", titulaire: true }],
    });
    expect(inverse.lignes[0].ecart).toBe("conforme");
  });

  it("une ligne de feuille n'est attribuee qu'a un joueur (homonymes)", () => {
    const js: JoueurRef[] = [{ id: "a", nom: "MARTIN", prenom: "Luc" }, { id: "b", nom: "MARTIN", prenom: "Luc" }];
    const c = comparerPlanRealise({
      plan: plan({ titulaires: ["a", "b"], remplacants: [] }), joueurs: js,
      feuille: [{ nom: "MARTIN", prenom: "Luc", titulaire: true }],
    });
    expect(c.lignes.map((l) => l.reel).sort()).toEqual(["absent", "titulaire"]);
  });

  it("capitaine et dispositif : differences relevees, dispositif reel inconnu jamais reproche", () => {
    const feuille = feuilleConforme().map((l) => ({ ...l, capitaine: l.nom === "NOM2" }));
    const diff = comparerPlanRealise({ plan: plan(), joueurs, feuille, formationReelle: "3-5-2" });
    expect(diff.capitaine).toEqual({ prevu: "Prenom6 NOM6", reel: "Prenom2 NOM2", identique: false });
    expect(diff.formation).toEqual({ prevue: "4-4-2", reelle: "3-5-2", identique: false });
    expect(diff.observations.map((o) => o.titre)).toEqual(expect.arrayContaining(["Capitaine different", "Dispositif different"]));

    const inconnu = comparerPlanRealise({ plan: plan(), joueurs, feuille, formationReelle: null });
    expect(inconnu.formation.identique).toBeNull();
    expect(inconnu.observations.map((o) => o.titre)).not.toContain("Dispositif different");
  });

  it("onze tres different : vigilance en tete", () => {
    const feuille = [
      ...ids(1, 4).map((id) => ligne(+id.slice(1))),
      ...ids(12, 16).map((id) => ligne(+id.slice(1))),                     // les remplacants demarrent
      ...Array.from({ length: 2 }, (_, i) => ligne(70 + i, { nom: `X${i}`, prenom: "Y", licence: `L7${i}` })),
    ];
    const c = comparerPlanRealise({ plan: plan(), joueurs, feuille });
    expect(c.adequation).toBe(36);                        // 4 / 11
    expect(c.observations[0]).toMatchObject({ ton: "vigilance", titre: expect.stringMatching(/absent|different/) });
    expect(c.observations.some((o) => o.titre === "Onze tres different du plan")).toBe(true);
  });

  it("un joueur du plan sorti de la base est ignore sans planter", () => {
    const c = comparerPlanRealise({ plan: plan({ titulaires: ["fantome", ...ids(2, 11)] }), joueurs, feuille: feuilleConforme() });
    expect(c.lignes.find((l) => l.joueurId === "fantome")).toBeUndefined();
    expect(c.titulairesPrevus).toBe(11);
  });
});
