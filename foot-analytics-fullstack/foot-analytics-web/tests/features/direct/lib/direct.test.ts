import { describe, expect, it } from "vitest";

import { ACTIONS, joueurLibelle, libelleEvenement, nomZone, zoneCourte } from "@/features/direct/lib/actions";
import { compteurs as compteursDe, score as calculerScore } from "@/features/direct/lib/calculs";
import { formaterChrono, libelleMinute, minuteDe } from "@/features/direct/lib/chrono";
import type { ChronoDirect } from "@/features/direct/lib/direct-types";
import { manque, saisieInitiale, versEvenement } from "@/features/direct/lib/saisie";

const T0 = 1_800_000_000_000;
const chrono = (extra: Partial<ChronoDirect> = {}): ChronoDirect => ({
  statut: "en_cours", periode: 1, accumuleMs: 0, demarreLe: T0, dureePeriodeMin: 45, minute: 0, clotureLe: null, serveurMs: T0, ...extra,
});

describe("chrono affiché", () => {
  it("34:12 de jeu est la minute 34 ; la deuxième période repart de 45:00", () => {
    expect(minuteDe(chrono(), T0 + 34 * 60_000 + 12_000)).toBe(34);
    expect(formaterChrono(chrono(), T0 + 34 * 60_000 + 12_000)).toBe("34:12");
    const deux = chrono({ periode: 2, accumuleMs: 0, demarreLe: T0 });
    expect(formaterChrono(deux, T0 + 90_000)).toBe("46:30");
    expect(minuteDe(deux, T0 + 90_000)).toBe(46);
  });

  it("arrêté, le chrono ne bouge plus ; temps additionnel en 45+2", () => {
    const pause = chrono({ statut: "pause", accumuleMs: 600_000, demarreLe: null });
    expect(formaterChrono(pause, T0 + 99 * 60_000)).toBe("10:00");
    expect(libelleMinute(47, 1, 45)).toBe("45+2");
    expect(libelleMinute(30, 1, 45)).toBe("30");
  });
});

describe("saisie d'un événement", () => {
  it("un but : résultat déjà choisi, il faut un tir sans cadre inutile", () => {
    const s = { ...saisieInitiale("but", "dom", 1, 34), joueurNumero: 9, joueurNom: "Martin", zoneTier: 0, zoneCouloir: 3, zoneCadre: 2, contextes: ["Attaque placée"] };
    expect(manque(s)).toBeNull();
    expect(versEvenement(s, "abcdefgh")).toMatchObject({ type: "tir", resultat: "but", zoneTier: 0, zoneCouloir: 3, zoneCadre: 2, contextes: ["Attaque placée"], minute: 34 });
  });

  it("un tir demande son résultat ; un tir non cadré perd sa zone du cadre", () => {
    const s = { ...saisieInitiale("tir", "ext", 2, 70), joueurNumero: 11, zoneCadre: 4, resultat: null as string | null };
    expect(manque(s)).toBe("Choisis le résultat.");
    expect(versEvenement({ ...s, resultat: "non_cadre" }, "abcdefgh")).toMatchObject({ cote: "ext", resultat: "non_cadre", zoneCadre: null, joueurNom: null });
  });

  it("une action sans terrain ni résultat n'envoie ni zone ni contexte", () => {
    const s = { ...saisieInitiale("carton_jaune", "dom", 1, 19), joueurNumero: 6, zoneTier: 1, zoneCouloir: 2, contextes: ["Centre"], resultat: "but" };
    expect(versEvenement(s, "abcdefgh")).toMatchObject({ type: "carton_jaune", resultat: null, zoneTier: null, zoneCouloir: null, zoneCadre: null, contextes: [] });
  });

  it("un remplacement demande le joueur qui sort et celui qui entre", () => {
    const s = saisieInitiale("remplacement", "dom", 2, 60);
    expect(manque(s)).toBe("Choisis le joueur qui sort.");
    expect(manque({ ...s, joueurNumero: 7 })).toBe("Choisis le joueur qui entre.");
    expect(manque({ ...s, joueurNumero: 7, joueur2Numero: 14 })).toBeNull();
  });

  it("un penalty n'a pas de zone de terrain", () => {
    const s = { ...saisieInitiale("penalty", "dom", 1, 40), joueurNumero: 10, resultat: "arrete", zoneTier: 0, zoneCouloir: 2 };
    expect(versEvenement(s, "abcdefgh")).toMatchObject({ type: "penalty", resultat: "arrete", zoneTier: null, zoneCouloir: null });
  });
});

describe("libellés", () => {
  it("noms de zones, de tirs et de joueurs", () => {
    expect(nomZone(0, 3)).toBe("Offensif · axe droit");
    expect(zoneCourte(0, 3)).toBe("Off. axe d.");
    expect(zoneCourte(null, null)).toBe("");
    expect(libelleEvenement({ type: "tir", resultat: "cadre" })).toBe("Tir cadré");
    expect(libelleEvenement({ type: "penalty", resultat: "arrete" })).toBe("Penalty arrêté");
    expect(libelleEvenement({ type: "carton_jaune", resultat: null })).toBe("Carton jaune");
    expect(joueurLibelle(9, "Martin")).toBe("n°9 Martin");
    expect(joueurLibelle(9, null)).toBe("n°9");
    expect(joueurLibelle(null, null)).toBe("");
  });

  it("chaque action de la grille a ses étapes et un type connu", () => {
    expect(ACTIONS.map((a) => a.id)).toEqual(["but", "tir", "arret", "corner", "coup_franc", "penalty", "faute", "hors_jeu", "carton_jaune", "carton_rouge", "remplacement", "blessure"]);
    for (const a of ACTIONS) expect(a.etapes[0]).toBe("joueur");
  });
});

describe("score recalculé sur l'écran", () => {
  it("mêmes règles que l'API", () => {
    const evs = [
      { cote: "dom" as const, type: "tir" as const, resultat: "but" }, { cote: "ext" as const, type: "penalty" as const, resultat: "but" },
      { cote: "dom" as const, type: "tir" as const, resultat: "cadre" }, { cote: "dom" as const, type: "corner" as const, resultat: null },
    ];
    expect(calculerScore(evs)).toEqual({ dom: 1, ext: 1 });
    expect(compteursDe(evs).dom).toMatchObject({ tirs: 2, tirsCadres: 2, buts: 1, corners: 1 });
  });
});
