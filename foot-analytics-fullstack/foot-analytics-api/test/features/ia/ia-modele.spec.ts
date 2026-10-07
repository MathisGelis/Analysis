import { construireJeuDonnees, FeuilleEquipe } from "@/features/ia/ia-donnees";
import {
  alignerPoids, CARACTERISTIQUES_NUMERO, CARACTERISTIQUES_SYSTEME, CARACTERISTIQUES_TITULAIRE, compterSysteme, exemplesNumeros, exemplesTitularisation,
  frequencesVides, numerosDeFeuilleExploitables, poidsInitiaux, predireOnze, predireSysteme, preparerCandidats, preparerSysteme,
  probaTitulaire, structureDuSysteme,
} from "@/features/ia/ia-modele";
import { ligue } from "./ligue";

/** L'historique d'une equipe de la ligue synthetique, de la plus recente a la plus ancienne. */
function historique(club: number, opts: Parameters<typeof ligue>[0] = {}): FeuilleEquipe[] {
  const jeu = construireJeuDonnees(ligue({ clubs: 4, semaines: 8, ...opts }));
  return jeu.feuilles.filter((f) => f.libelleEquipe.startsWith(`Club ${club} `)).reverse();
}

const idx = (id: string) => CARACTERISTIQUES_TITULAIRE.findIndex((c) => c.id === id);

describe("catalogue", () => {
  it("un libelle en clair pour chaque poids, dans l'ordre des poids de depart", () => {
    const p = poidsInitiaux();
    expect(p.titularisation.noms).toEqual(CARACTERISTIQUES_TITULAIRE.map((c) => c.id));
    expect(p.numeros.noms).toEqual(CARACTERISTIQUES_NUMERO.map((c) => c.id));
    expect(p.systeme!.noms).toEqual(CARACTERISTIQUES_SYSTEME.map((c) => c.id));
    expect(p.titularisation.w).toHaveLength(CARACTERISTIQUES_TITULAIRE.length);
    expect(p.numeros.w).toHaveLength(CARACTERISTIQUES_NUMERO.length);
    expect(p.systeme!.w).toHaveLength(CARACTERISTIQUES_SYSTEME.length);
    for (const c of [...CARACTERISTIQUES_TITULAIRE, ...CARACTERISTIQUES_NUMERO, ...CARACTERISTIQUES_SYSTEME]) {
      expect(c.libelle.length).toBeGreaterThan(3);
      expect(c.aide.length).toBeGreaterThan(10);
    }
  });
});

describe("preparerCandidats", () => {
  it("sans feuille : rien a predire", () => {
    expect(preparerCandidats([], "s25", 10)).toEqual({ candidats: [], derniersTitulaires: new Map(), n: 0, numerosExploitables: false });
  });

  it("un joueur toujours titulaire a des caracteristiques hautes, un remplacant jamais utilise des basses", () => {
    const h = historique(0, { absence: 0 });
    const prep = preparerCandidats(h, "s25", 10);
    expect(prep.n).toBe(h.length);
    expect(prep.numerosExploitables).toBe(true);
    const titulaire = prep.candidats.find((c) => c.nom === "P1 JOUEUR0X1")!;
    const banc = prep.candidats.find((c) => c.nom === "P16 JOUEUR0X16")!;
    expect(titulaire.x[idx("tauxPondere")]).toBeCloseTo(1, 9);
    expect(titulaire.x[idx("titDernier")]).toBe(1);
    expect(titulaire.x[idx("jamaisTitulaire")]).toBe(0);
    expect(titulaire.numeros[0]).toBeCloseTo(1, 9);         // toujours le numero 1
    expect(titulaire.dernierNumero).toBe(1);
    expect(banc.x[idx("tauxPondere")]).toBe(0);
    expect(banc.x[idx("jamaisTitulaire")]).toBe(1);
    expect(banc.x[idx("banc")]).toBeCloseTo(1, 9);
    expect(banc.x[idx("minutesDernier")]).toBe(0);
    expect(banc.dernierNumero).toBeNull();
    expect(prep.derniersTitulaires.get(1)).toBe(titulaire.joueur);
    expect(prep.candidats).toHaveLength(16);
  });

  it("les matchs recents pesent plus, et la fenetre limite l'historique", () => {
    const h = historique(0, { absence: 0 });
    // Le joueur 3 ne joue que le match le plus ancien de la fenetre de 4.
    const ancien = h.slice(0, 4).map((f, i) => ({ ...f, lignes: f.lignes.map((l) => (l.nom === "P3 JOUEUR0X3" ? { ...l, titulaire: i === 3 } : l)) }));
    const recent = h.slice(0, 4).map((f, i) => ({ ...f, lignes: f.lignes.map((l) => (l.nom === "P3 JOUEUR0X3" ? { ...l, titulaire: i === 0 } : l)) }));
    const pa = preparerCandidats(ancien, "s25", 4).candidats.find((c) => c.nom === "P3 JOUEUR0X3")!;
    const pr = preparerCandidats(recent, "s25", 4).candidats.find((c) => c.nom === "P3 JOUEUR0X3")!;
    expect(pr.x[idx("tauxPondere")]).toBeGreaterThan(pa.x[idx("tauxPondere")]);
    expect(pr.x[idx("titDernier")]).toBe(1);
    expect(pa.x[idx("titDernier")]).toBe(0);
    expect(preparerCandidats(h, "s25", 3).n).toBe(3);
  });

  it("les titularisations d'une autre saison sont reperees", () => {
    const h = historique(0, { absence: 0 });
    expect(preparerCandidats(h, "s25", 10).candidats[0].x[idx("ancienneSaison")]).toBe(0);
    expect(preparerCandidats(h, "s26", 10).candidats[0].x[idx("ancienneSaison")]).toBe(1);
  });

  it("numeros hors convention (numeros de saison) : non exploitables", () => {
    const h = historique(0, { absence: 0 }).map((f) => ({ ...f, lignes: f.lignes.map((l) => ({ ...l, numero: l.numero + 12 })) }));
    const prep = preparerCandidats(h, "s25", 10);
    expect(prep.numerosExploitables).toBe(false);
    expect(prep.candidats[0].numeros.every((v) => v === 0)).toBe(true);
  });
});

describe("poste habituel", () => {
  it("un titulaire a poste fixe : tauxAuPoste = taux de titularisation, et il est le titulaire du poste ; un remplacant, ni l'un ni l'autre", () => {
    const prep = preparerCandidats(historique(0, { absence: 0 }), "s25", 10);
    const t = prep.candidats.find((c) => c.nom === "P4 JOUEUR0X4")!;
    const banc = prep.candidats.find((c) => c.nom === "P14 JOUEUR0X14")!;
    expect(t.x[idx("tauxAuPoste")]).toBeCloseTo(1, 9);
    expect(t.x[idx("titulaireDuPoste")]).toBe(1);
    expect(banc.x[idx("tauxAuPoste")]).toBe(0);
    expect(banc.x[idx("titulaireDuPoste")]).toBe(0);
  });

  it("un joueur qui comble des trous partout commence souvent mais n'a pas de poste : tauxAuPoste bas, aucun poste a lui", () => {
    const h = historique(0, { absence: 0 }).slice(0, 8);
    // Le joueur 14 remplace un absent different a chaque match (numeros 2 a 9), qui perd sa place.
    const volant = h.map((f, i) => ({
      ...f, lignes: f.lignes.map((l) => {
        const numeroTrou = 2 + i;
        if (l.nom === "P14 JOUEUR0X14") return { ...l, titulaire: true, numero: numeroTrou, minutes: 90 };
        if (l.numero === numeroTrou && l.titulaire) return { ...l, titulaire: false, minutes: 0 };
        return l;
      }),
    }));
    const c = preparerCandidats(volant, "s25", 10).candidats.find((x) => x.nom === "P14 JOUEUR0X14")!;
    expect(c.titularisations).toBe(8);
    expect(c.x[idx("tauxAuPoste")]).toBeLessThan(0.3);       // jamais plus d'un match au meme numero
    expect(c.x[idx("titulaireDuPoste")]).toBe(0);
  });
});

describe("alignerPoids", () => {
  it("range les poids dans l'ordre du catalogue actuel, par nom ; un poids absent vaut zero", () => {
    expect(alignerPoids({ noms: ["frequence", "dernier"], w: [5, 1] }, CARACTERISTIQUES_NUMERO)).toEqual([5, 1, 0, 0]);
    expect(alignerPoids({ noms: ["vacant", "inconnu", "ligne"], w: [3, 9, 2] }, CARACTERISTIQUES_NUMERO)).toEqual([0, 0, 2, 3]);
  });

  it("un modele enregistre avant l'ajout d'une caracteristique predit encore, avec les memes cles", () => {
    const h = historique(0, { absence: 0 });
    const prep = preparerCandidats(h, "s25", 10);
    const p = poidsInitiaux();
    const ancien = { ...p, titularisation: { noms: p.titularisation.noms.slice(0, 13), w: p.titularisation.w.slice(0, 13) } };
    const a = predireOnze(ancien, prep)!;
    const b = predireOnze(p, prep)!;
    expect(a.titulaires.map((t) => t.nom).sort()).toEqual(b.titulaires.map((t) => t.nom).sort());
    expect(a.probas.size).toBe(b.probas.size);
  });
});

describe("predireOnze (poids de depart)", () => {
  it("rien a predire sans historique", () => {
    expect(predireOnze(poidsInitiaux(), preparerCandidats([], "s25", 10))).toBeNull();
  });

  it("choisit les titulaires reguliers, un seul gardien, et un numero distinct de 1 a 11 chacun", () => {
    const h = historique(0, { absence: 0 });
    const pred = predireOnze(poidsInitiaux(), preparerCandidats(h, "s25", 10))!;
    expect(pred.titulaires).toHaveLength(11);
    expect(pred.titulaires.map((t) => t.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(pred.titulaires.map((t) => t.nom)).toEqual(Array.from({ length: 11 }, (_, i) => `P${i + 1} JOUEUR0X${i + 1}`));
    expect(pred.titulaires.every((t) => t.proba > 0.9)).toBe(true);
    expect(pred.confiance).toBeGreaterThan(0.9);
    expect(pred.banc).toHaveLength(5);
    expect(pred.banc.every((b) => b.proba < 0.3)).toBe(true);
    expect(pred.probas.size).toBe(16);
  });

  it("un titulaire absent au dernier match est moins probable : le remplacant qui l'a remplace passe devant", () => {
    const h = historique(0, { absence: 0 });
    // Au dernier match, le 9 est parti et le remplacant 12 l'a remplace.
    const dernier = { ...h[0], lignes: h[0].lignes.map((l) => (l.nom === "P9 JOUEUR0X9" ? { ...l, titulaire: false, minutes: 0 } : l.nom === "P12 JOUEUR0X12" ? { ...l, titulaire: true, numero: 9, minutes: 90 } : l)) };
    const pred = predireOnze(poidsInitiaux(), preparerCandidats([dernier, ...h.slice(1)], "s25", 10))!;
    expect(pred.probas.get(dernier.lignes.find((l) => l.nom === "P9 JOUEUR0X9")!.joueur)!).toBeLessThan(0.99);
    // Neuf matchs de titularisations pesent plus qu'une absence : le 9 reste titulaire, le 12 est le premier remplacant.
    expect(pred.titulaires.find((t) => t.numero === 9)!.nom).toBe("P9 JOUEUR0X9");
    expect(pred.banc[0].nom).toBe("P12 JOUEUR0X12");
  });

  it("numeros non exploitables : le onze est donne sans numero, du plus au moins probable", () => {
    const h = historique(0, { absence: 0 }).map((f) => ({ ...f, lignes: f.lignes.map((l) => ({ ...l, numero: l.numero + 12 })) }));
    const pred = predireOnze(poidsInitiaux(), preparerCandidats(h, "s25", 10))!;
    expect(pred.titulaires).toHaveLength(11);
    expect(pred.titulaires.every((t) => t.numero === null)).toBe(true);
  });

  it("moins de onze joueurs connus : tous predits, numeros distincts", () => {
    const h = historique(0, { absence: 0 }).map((f) => ({ ...f, lignes: f.lignes.filter((l) => l.titulaire).slice(0, 11) }));
    const reduit = h.map((f) => ({ ...f, lignes: f.lignes.filter((l) => l.numero !== 9) }));
    const pred = predireOnze(poidsInitiaux(), preparerCandidats(reduit, "s25", 10))!;
    expect(pred.titulaires).toHaveLength(10);
    expect(new Set(pred.titulaires.map((t) => t.numero)).size).toBe(10);
  });

  it("probaTitulaire : produit scalaire puis sigmoide", () => {
    expect(probaTitulaire([0, 0], [1, 1])).toBe(0.5);
    expect(probaTitulaire([10], [1])).toBeGreaterThan(0.9999);
  });
});

describe("exemples d'apprentissage", () => {
  it("titularisation : un exemple par candidat, vrai si le joueur a commence", () => {
    const h = historique(0, { absence: 0 });
    const prep = preparerCandidats(h, "s25", 10);
    const reels = new Set(prep.candidats.slice(0, 11).map((c) => c.joueur));
    const ex = exemplesTitularisation(prep, reels);
    expect(ex).toHaveLength(16);
    expect(ex.filter((e) => e.y === 1)).toHaveLength(11);
  });

  it("numeros : un exemple par titulaire connu, le bon choix etant son numero", () => {
    const h = historique(0, { absence: 0 });
    const prep = preparerCandidats(h, "s25", 10);
    const reels = prep.candidats.slice(0, 11).map((c, i) => ({ joueur: c.joueur, numero: i + 1 }));
    const ex = exemplesNumeros(prep, [...reels, { joueur: "inconnu", numero: 12 }]);
    expect(ex).toHaveLength(11);                       // le joueur inconnu de l'equipe n'apporte rien
    expect(ex.map((e) => e.vrai)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(ex[0].phi).toHaveLength(11);
  });

  it("numerosDeFeuilleExploitables : les onze numeros de 1 a 11, une fois chacun", () => {
    const onze = Array.from({ length: 11 }, (_, i) => ({ numero: i + 1 }));
    expect(numerosDeFeuilleExploitables(onze)).toBe(true);
    expect(numerosDeFeuilleExploitables([...onze.slice(1), { numero: 5 }])).toBe(false);       // doublon
    expect(numerosDeFeuilleExploitables([...onze.slice(1), { numero: 14 }])).toBe(false);      // hors 1-11
    expect(numerosDeFeuilleExploitables(onze.slice(1))).toBe(false);                           // dix titulaires
  });
});

describe("dispositif", () => {
  it("structureDuSysteme : defenseurs et attaquants", () => {
    expect(structureDuSysteme("4-2-3-1")).toEqual({ defense: 4, attaque: 1 });
    expect(structureDuSysteme("3-5-2")).toEqual({ defense: 3, attaque: 2 });
  });

  it("le dernier dispositif saisi et ceux qui reviennent sont favorises", () => {
    const h = historique(0, { absence: 0, formation: "4-3-3", semaines: 6 });
    const f = frequencesVides();
    for (let i = 0; i < 20; i++) compterSysteme(f, "4-3-3");
    const prep = preparerSysteme(h, f);
    expect(prep.nbSaisis).toBe(h.length > 8 ? 8 : h.length);
    expect(prep.dernierSaisi).toBe("4-3-3");
    expect(prep.candidats).toContain("4-3-3");
    const pred = predireSysteme(poidsInitiaux().systeme!.w, prep)!;
    expect(pred.systeme).toBe("4-3-3");
    expect(pred.classement.reduce((s, c) => s + c.proba, 0)).toBeCloseTo(1, 9);
    expect(pred.classement).toHaveLength(prep.candidats.length);
  });

  it("sans aucun dispositif saisi, les candidats courants restent proposes (le modele ne decide pas dans le vide)", () => {
    const prep = preparerSysteme(historique(0, { absence: 0 }), frequencesVides());
    expect(prep.nbSaisis).toBe(0);
    expect(prep.dernierSaisi).toBeNull();
    expect(prep.candidats.length).toBeGreaterThanOrEqual(7);
    expect(predireSysteme(poidsInitiaux().systeme!.w, prep)).not.toBeNull();
  });
});
