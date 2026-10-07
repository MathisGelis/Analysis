import { describe, expect, it } from "vitest";

import {
  changerDispositif, FORMATION_DEFAUT, FORMATIONS, formationDeDepart, formationsProposees, ligneDuPoste, nettoyerComposition, optionsJoueurs, parseFormation, slotsDeFormation, suggererOnze, vigilances,
  type JoueurTactique,
} from "@/features/tactique/lib/composition";
import { bilanMutations } from "@/features/tactique/lib/mutations";

let n = 0;
const joueur = (poste: string, extra: Partial<JoueurTactique> = {}): JoueurTactique => ({
  id: `j${++n}`, nom: `NOM${n}`, prenom: "Jo", poste, statutMutation: "Pas mutation",
  matchs: 10, titularisations: 10, minutes: 900, noteMoyenne: 6, scoreFatigue: 40, ...extra,
});

/** Un effectif complet : 2 gardiens, 7 defenseurs, 6 milieux, 4 attaquants. */
function effectif(extra: (i: number, poste: string) => Partial<JoueurTactique> = () => ({})): JoueurTactique[] {
  const postes = ["GB", "GB", "DC", "DC", "DC", "DD", "DG", "DC", "DD", "MD", "MD", "MO", "MO", "MD", "MO", "AT", "AT", "AG", "AT"];
  return postes.map((p, i) => joueur(p, { titularisations: 20 - i, minutes: 1800 - i * 50, ...extra(i, p) }));
}

describe("ligneDuPoste", () => {
  it.each([["GB", "GB"], ["G", "GB"], ["DC", "DEF"], ["DD", "DEF"], ["MO", "MIL"], ["MD", "MIL"], ["MC", "MIL"], ["AT", "ATT"], ["BU", "ATT"], ["AG", "ATT"], ["", null], [null, null], ["XX", null]] as const)(
    "%s -> %s", (poste, ligne) => expect(ligneDuPoste(poste)).toBe(ligne),
  );
});

describe("parseFormation / slotsDeFormation", () => {
  it("toutes les formations proposees sont valides et donnent 11 postes", () => {
    for (const f of FORMATIONS) {
      expect(parseFormation(f)).not.toBeNull();
      expect(slotsDeFormation(f)).toHaveLength(11);
    }
  });
  it("refuse les dispositifs incoherents", () => {
    for (const f of ["4-4-3", "4-4", "abc", "", null, undefined, "4-4-2-1-1-1", "0-5-5", "7-2-1"]) expect(parseFormation(f)).toBeNull();
  });
  it("4-2-3-1 : gardien, 4 defenseurs, 2 puis 3 milieux, 1 attaquant, dans l'ordre du terrain", () => {
    const slots = slotsDeFormation("4-2-3-1");
    expect(slots.map((s) => s.ligne)).toEqual(["GB", "DEF", "DEF", "DEF", "DEF", "MIL", "MIL", "MIL", "MIL", "MIL", "ATT"]);
    expect(slots.map((s) => s.index)).toEqual([...Array(11).keys()]);
    expect(slots[1].libelle).toBe("DEF 1");
    expect(slots[10].libelle).toBe("ATT");
    // Numerotation continue sur les deux lignes de milieu : MIL 1 a MIL 5, jamais deux "MIL 1".
    expect(slots.filter((x) => x.ligne === "MIL").map((x) => x.libelle)).toEqual(["MIL 1", "MIL 2", "MIL 3", "MIL 4", "MIL 5"]);
  });
  it("chaque poste de chaque dispositif a un libelle unique", () => {
    for (const f of FORMATIONS) {
      const l = slotsDeFormation(f).map((x) => x.libelle);
      expect(new Set(l).size).toBe(l.length);
    }
  });
  it("dispositif invalide : repli sur 4-4-2", () => {
    expect(slotsDeFormation("n'importe quoi").map((s) => s.ligne)).toEqual(slotsDeFormation("4-4-2").map((s) => s.ligne));
  });
});

describe("formationDeDepart : le dispositif identifie par le logiciel devient le dispositif par defaut", () => {
  it("un dispositif identifie et valide est repris tel quel (liste habituelle ou non)", () => {
    expect(formationDeDepart("4-3-3")).toEqual({ formation: "4-3-3", identifie: true });
    expect(formationDeDepart("4-4-1-1")).toEqual({ formation: "4-4-1-1", identifie: true });
    expect(formationDeDepart(" 3 - 5 - 2 ")).toEqual({ formation: "3-5-2", identifie: true });
  });
  it("rien d'identifie, ou un dispositif incoherent : le dispositif par defaut, non annonce comme identifie", () => {
    for (const x of [null, undefined, "", "abc", "4-4-3", "4-4"]) expect(formationDeDepart(x)).toEqual({ formation: FORMATION_DEFAUT, identifie: false });
  });
  it("le selecteur propose la liste habituelle, plus le dispositif courant s'il n'y est pas", () => {
    expect(formationsProposees("4-3-3")).toEqual([...FORMATIONS]);
    expect(formationsProposees("4-4-1-1")).toEqual([...FORMATIONS, "4-4-1-1"]);
    expect(formationsProposees("n'importe quoi")).toEqual([...FORMATIONS]);
  });
});

describe("suggererOnze", () => {
  it("onze complet, chacun a son poste, gardien dans le but, sans doublon", () => {
    const joueurs = effectif();
    const r = suggererOnze({ formation: "4-4-2", joueurs });
    expect(r.titulaires.every(Boolean)).toBe(true);
    expect(new Set(r.titulaires).size).toBe(11);
    const par = new Map(joueurs.map((j) => [j.id, j]));
    const slots = slotsDeFormation("4-4-2");
    r.titulaires.forEach((id, i) => expect(ligneDuPoste(par.get(id!)!.poste)).toBe(slots[i].ligne));
  });

  it("le banc est complete (3 remplacants par defaut), sans doublon avec les titulaires, avec un gardien", () => {
    const joueurs = effectif();
    const r = suggererOnze({ formation: "4-4-2", joueurs });
    expect(r.remplacants).toHaveLength(3);
    expect(r.remplacants.some((id) => r.titulaires.includes(id))).toBe(false);
    const par = new Map(joueurs.map((j) => [j.id, j]));
    expect(r.remplacants.some((id) => ligneDuPoste(par.get(id)!.poste) === "GB")).toBe(true);
  });

  it("le banc peut etre elargi a la demande, jamais au-dela du maximum autorise", () => {
    const joueurs = effectif();
    expect(suggererOnze({ formation: "4-4-2", joueurs, maxRemplacants: 5 }).remplacants).toHaveLength(5);
    expect(suggererOnze({ formation: "4-4-2", joueurs, maxRemplacants: 12 }).remplacants).toHaveLength(7);
    expect(suggererOnze({ formation: "4-4-2", joueurs, maxRemplacants: 0 }).remplacants).toHaveLength(0);
  });

  it("prefere les joueurs les plus utilises", () => {
    const joueurs = effectif();
    const r = suggererOnze({ formation: "4-4-2", joueurs });
    // Le 1er gardien (20 titularisations) devant le second (19).
    expect(r.titulaires[0]).toBe(joueurs[0].id);
  });

  it("ecarte les indisponibles et le dit", () => {
    const joueurs = effectif((i) => (i === 0 ? { indisponible: true } : {}));
    const r = suggererOnze({ formation: "4-4-2", joueurs });
    expect(r.titulaires).not.toContain(joueurs[0].id);
    expect(r.remplacants).not.toContain(joueurs[0].id);
    expect(r.ecartes).toContainEqual({ id: joueurs[0].id, raison: "indisponible" });
    expect(r.titulaires[0]).toBe(joueurs[1].id);               // l'autre gardien prend le but
  });

  it("un joueur en surcharge passe derriere un joueur frais a niveau comparable", () => {
    const joueurs = [
      joueur("GB"), joueur("DC", { titularisations: 10, scoreFatigue: 90 }), joueur("DC", { titularisations: 9, scoreFatigue: 20 }),
    ];
    const r = suggererOnze({ formation: "1-4-5", joueurs });     // invalide -> 4-4-2 : un seul DC dispo suffit pour le test
    const dc = r.titulaires.filter((id) => id && joueurs.find((j) => j.id === id)!.poste === "DC");
    expect(dc[0]).toBe(joueurs[2].id);
  });

  it("jamais plus de 6 mutes dont 2 hors delai, meme si les meilleurs joueurs le sont", () => {
    // Les 10 meilleurs sont mutes : 4 hors delai et 6 mutes.
    const joueurs = effectif((i) => (i < 4 ? { statutMutation: "Mutation hors delai" } : i < 12 ? { statutMutation: "Mutation" } : {}));
    const r = suggererOnze({ formation: "4-4-2", joueurs });
    const par = new Map(joueurs.map((j) => [j.id, j]));
    const liste = [...r.titulaires, ...r.remplacants].map((id) => par.get(id!)!.statutMutation);
    const b = bilanMutations(liste);
    expect(b.valide).toBe(true);
    expect(b.mutes).toBeLessThanOrEqual(6);
    expect(b.horsDelai).toBeLessThanOrEqual(2);
    expect(r.ecartes.some((e) => e.raison === "regle des mutes")).toBe(true);
    expect(r.titulaires.every(Boolean)).toBe(true);            // la regle n'empeche pas d'avoir un onze complet
  });

  it("pas assez de joueurs : les postes non pourvus restent vides", () => {
    const r = suggererOnze({ formation: "4-4-2", joueurs: [joueur("GB"), joueur("DC")] });
    expect(r.titulaires.filter(Boolean)).toHaveLength(2);
    expect(r.titulaires.filter((x) => x === null)).toHaveLength(9);
  });

  it("aucun joueur : onze vide, sans planter", () => {
    const r = suggererOnze({ formation: "4-3-3", joueurs: [] });
    expect(r).toEqual({ titulaires: Array(11).fill(null), remplacants: [], ecartes: [] });
  });

  it("un gardien n'est jamais place en champ", () => {
    const r = suggererOnze({ formation: "4-4-2", joueurs: [joueur("GB"), joueur("GB"), joueur("GB")] });
    expect(r.titulaires.filter(Boolean)).toHaveLength(1);
  });
});

describe("vigilances", () => {
  const joueurs = effectif();
  const base = suggererOnze({ formation: "4-4-2", joueurs });

  it("une composition saine n'a aucune alerte", () => {
    const v = vigilances({ formation: "4-4-2", ...base, joueurs });
    expect(v.filter((x) => x.niveau === "alerte")).toEqual([]);
  });

  it("depassement de la regle des mutes : alerte", () => {
    const beaucoup = joueurs.map((j, i) => (i < 8 ? { ...j, statutMutation: "Mutation" } : j));
    const v = vigilances({ formation: "4-4-2", titulaires: base.titulaires, remplacants: base.remplacants, joueurs: beaucoup });
    expect(v.some((x) => x.niveau === "alerte" && /joueurs mutes/.test(x.texte))).toBe(true);
  });

  it("indisponible et surcharge : alertes nominatives", () => {
    const j2 = joueurs.map((j) => (j.id === base.titulaires[1] ? { ...j, indisponible: true } : j.id === base.titulaires[5] ? { ...j, scoreFatigue: 88 } : j));
    const v = vigilances({ formation: "4-4-2", ...base, joueurs: j2 });
    expect(v.some((x) => /Indisponible/.test(x.texte))).toBe(true);
    expect(v.some((x) => /surcharge/.test(x.texte))).toBe(true);
  });

  it("statut inconnu : information, pas alerte", () => {
    const j2 = joueurs.map((j) => (j.id === base.titulaires[2] ? { ...j, statutMutation: "Non connu" } : j));
    const v = vigilances({ formation: "4-4-2", ...base, joueurs: j2 });
    expect(v.find((x) => /inconnu/.test(x.texte))?.niveau).toBe("info");
  });

  it("joueur place hors de sa ligne, postes vacants, banc sans gardien", () => {
    const titulaires = [...base.titulaires];
    [titulaires[1], titulaires[10]] = [titulaires[10], titulaires[1]];   // un attaquant en defense et inversement
    titulaires[3] = null;
    const sansGardien = base.remplacants.filter((id) => ligneDuPoste(joueurs.find((j) => j.id === id)!.poste) !== "GB");
    const v = vigilances({ formation: "4-4-2", titulaires, remplacants: sansGardien, joueurs });
    expect(v.some((x) => /Hors de leur ligne/.test(x.texte))).toBe(true);
    expect(v.some((x) => /1 poste a pourvoir/.test(x.texte))).toBe(true);
    expect(v.some((x) => /gardien remplacant/.test(x.texte))).toBe(true);
  });
});

describe("nettoyerComposition", () => {
  it("retire les joueurs disparus de l'effectif et compte combien", () => {
    const r = nettoyerComposition({ titulaires: ["a", "zzz", "b"], remplacants: ["c", "yyy", "a"] }, new Set(["a", "b", "c"]));
    expect(r.titulaires.slice(0, 3)).toEqual(["a", null, "b"]);
    expect(r.titulaires).toHaveLength(11);
    expect(r.remplacants).toEqual(["c"]);                     // "a" deja titulaire : pas de doublon
    expect(r.retires).toBe(2);
  });
});

describe("changerDispositif", () => {
  // 4-4-2 : GB, DEF x4, MIL x4, ATT x2
  const onze = ["gb", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", "a1", "a2"];

  it("meme ligne, meme joueur : passage a 4-2-3-1 conserve defense et gardien, reorganise milieu et attaque", () => {
    const r = changerDispositif("4-4-2", "4-2-3-1", onze);
    expect(r.titulaires).toEqual(["gb", "d1", "d2", "d3", "d4", "m1", "m2", "m3", "m4", null, "a1"]);
    // 4-2-3-1 a 5 milieux (2 + 3) : les 4 milieux de depart y entrent ; il manque 1 milieu et un attaquant sort.
    expect(r.surplus).toEqual(["a2"]);
  });

  it("3 defenseurs : le 4e sort en surplus au lieu d'etre perdu", () => {
    const r = changerDispositif("4-4-2", "3-5-2", onze);
    expect(r.titulaires.slice(0, 4)).toEqual(["gb", "d1", "d2", "d3"]);
    expect(r.surplus).toEqual(["d4"]);
  });

  it("meme dispositif : rien ne bouge", () => {
    expect(changerDispositif("4-4-2", "4-4-2", onze)).toEqual({ titulaires: onze, surplus: [] });
  });

  it("postes vides conserves et aucun joueur perdu ni duplique", () => {
    const partiel = ["gb", null, "d2", null, "d4", "m1", null, null, "m4", "a1", null];
    const r = changerDispositif("4-4-2", "5-3-2", partiel);
    const avant = partiel.filter(Boolean).sort();
    const apres = [...r.titulaires.filter(Boolean), ...r.surplus].sort();
    expect(apres).toEqual(avant);
    expect(new Set(apres).size).toBe(apres.length);
  });
});

describe("optionsJoueurs", () => {
  const dc1 = joueur("DC", { titularisations: 20 });
  const dc2 = joueur("DC", { titularisations: 5 });
  const at = joueur("AT", { titularisations: 30 });
  const blesse = joueur("DC", { indisponible: true });
  const tous = [dc1, dc2, at, blesse];
  const base = { joueurs: tous, ligne: "DEF" as const, liste: [] as string[], ailleurs: new Set<string>() };

  it("les joueurs du poste d'abord, puis les autres ; chacun classe par valeur", () => {
    const o = optionsJoueurs(base);
    // Les 3 defenseurs d'abord, par valeur decroissante (20, 10, 5 titularisations), puis l'attaquant.
    expect(o.map((x) => x.joueur.id)).toEqual([dc1.id, blesse.id, dc2.id, at.id]);
    expect(o.map((x) => x.groupe)).toEqual(["poste", "poste", "poste", "autres"]);
  });

  it("retire ceux deja places ailleurs ; le joueur courant reste choisissable", () => {
    const o = optionsJoueurs({ ...base, ailleurs: new Set([dc2.id, at.id]), courantId: dc1.id, liste: [dc1.id] });
    expect(o.map((x) => x.joueur.id)).toEqual([dc1.id, blesse.id]);
  });

  it("indisponible : refuse, sauf s'il est deja en place (le coach doit pouvoir le retirer)", () => {
    expect(optionsJoueurs(base).find((x) => x.joueur.id === blesse.id)?.refus).toBe("indisponible");
    expect(optionsJoueurs({ ...base, courantId: blesse.id, liste: [blesse.id] }).find((x) => x.joueur.id === blesse.id)?.refus).toBeNull();
  });

  describe("regle des mutes", () => {
    const six = Array.from({ length: 6 }, () => joueur("MD", { statutMutation: "Mutation" }));
    const mute = joueur("DC", { statutMutation: "Mutation" });
    const horsDelai = joueur("DC", { statutMutation: "Mutation hors delai" });
    const libre = joueur("DC", { statutMutation: "Pas mutation" });
    const inconnu = joueur("DC", { statutMutation: "Non connu" });
    const candidats = [mute, horsDelai, libre, inconnu];
    const refus = (o: ReturnType<typeof optionsJoueurs>) => Object.fromEntries(o.map((x) => [x.joueur.id, x.refus]));

    it("avec 6 mutes deja listes, un 7e est refuse ; un non-mute ou un statut inconnu ne l'est jamais", () => {
      const r = refus(optionsJoueurs({ ...base, joueurs: [...six, ...candidats], liste: six.map((j) => j.id), ailleurs: new Set(six.map((j) => j.id)) }));
      expect(r[mute.id]).toBe("regle des mutes");
      expect(r[horsDelai.id]).toBe("regle des mutes");
      expect(r[libre.id]).toBeNull();
      expect(r[inconnu.id]).toBeNull();
    });

    it("remplacer un mute par un autre mute reste possible a 6 : le joueur courant ne compte pas deux fois", () => {
      const r = refus(optionsJoueurs({
        ...base, joueurs: [...six, mute], liste: six.map((j) => j.id), ailleurs: new Set(six.slice(1).map((j) => j.id)), courantId: six[0].id,
      }));
      expect(r[mute.id]).toBeNull();
    });

    it("un joueur deja sur le banc peut etre promu titulaire : il ne compte pas deux fois dans les 6", () => {
      const r = refus(optionsJoueurs({
        ...base, joueurs: [...six, libre], liste: six.map((j) => j.id), ailleurs: new Set(),
      }));
      // six[0] est sur le banc et candidat a un poste : le retirer de la liste le laisse a 5 autres mutes -> accepte.
      expect(r[six[0].id]).toBeNull();
    });

    it("3e mute hors delai refuse alors qu'un mute dans les delais passe", () => {
      const hd1 = joueur("MD", { statutMutation: "Mutation hors delai" });
      const hd2 = joueur("MD", { statutMutation: "Mutation hors delai" });
      const r = refus(optionsJoueurs({
        ...base, joueurs: [hd1, hd2, horsDelai, mute], liste: [hd1.id, hd2.id], ailleurs: new Set([hd1.id, hd2.id]),
      }));
      expect(r[horsDelai.id]).toBe("regle des mutes");
      expect(r[mute.id]).toBeNull();
    });
  });

  it("sans ligne (banc) : tous dans le groupe 'autres'", () => {
    expect(optionsJoueurs({ ...base, ligne: null }).every((x) => x.groupe === "autres")).toBe(true);
  });
});
