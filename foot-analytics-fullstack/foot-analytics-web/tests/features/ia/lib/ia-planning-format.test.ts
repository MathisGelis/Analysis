import { describe, expect, it } from "vitest";

import { badgeDecision, datePassage, resumeDernierAuto, texteFrequence } from "@/features/ia/lib/ia-format";
import type { Decision, EntrainementResume } from "@/features/ia/lib/ia-types";

const decision = (action: Decision["action"], appliquee = false): Decision => ({ action, appliquee, raison: `raison ${action}`, comparaison: null });

describe("texteFrequence / datePassage", () => {
  it("dit quand l'IA se reentraine", () => {
    expect(texteFrequence({ jour: 3, heure: 5 })).toBe("chaque mercredi a 5 h (heure de Paris)");
  });

  it("lit l'instant a l'heure de Paris, ete comme hiver", () => {
    expect(datePassage("2025-10-08T03:00:00.000Z")).toBe("mercredi 8 octobre, 5 h");        // UTC+2
    expect(datePassage("2026-01-14T04:00:00.000Z")).toBe("mercredi 14 janvier, 5 h");       // UTC+1
    expect(datePassage("2025-08-13T03:30:00.000Z")).toBe("mercredi 13 aout, 5 h 30");
  });

  it("un instant absent ou illisible : un tiret", () => {
    expect(datePassage(null)).toBe("—");
    expect(datePassage("n'importe quoi")).toBe("—");
  });
});

describe("badgeDecision : le verdict face au modele actif", () => {
  it("applique : il a remplace l'actif ; manuel : seulement un avis", () => {
    expect(badgeDecision(decision("remplace", true))).toEqual({ texte: "Remplace l'actif", ton: "ok" });
    expect(badgeDecision(decision("remplace", false))).toEqual({ texte: "Au moins aussi bon que l'actif", ton: "ok" });
  });

  it("moins bon ou comparaison impossible : non retenu (garde dans l'historique)", () => {
    expect(badgeDecision(decision("conserve"))).toEqual({ texte: "Non retenu", ton: "non" });
  });

  it("aucun actif, rien de nouveau, pas de decision (ancien entrainement)", () => {
    expect(badgeDecision(decision("sans_actif"))).toEqual({ texte: "Non active", ton: "neutre" });
    expect(badgeDecision(decision("inchange"))?.ton).toBe("neutre");
    expect(badgeDecision(null)).toBeNull();
  });
});

describe("resumeDernierAuto", () => {
  const base = { id: "e1", progression: 100, message: "Termine", options: { optimiser: true, saisonIds: null }, lancePar: null, modeleId: "m1", termineLe: null, creeLe: "2025-10-08T03:00:00.000Z", declencheur: "auto", modele: null } as const;
  const e = (patch: Partial<EntrainementResume>): EntrainementResume => ({ ...base, statut: "termine", decision: null, ...patch }) as EntrainementResume;

  it("rien : null", () => expect(resumeDernierAuto(null)).toBeNull());
  it("termine : la raison de la decision", () => expect(resumeDernierAuto(e({ decision: decision("conserve") }))).toMatch(/raison conserve$/));
  it("echec : le message", () => expect(resumeDernierAuto(e({ statut: "echec", message: "Il faut au moins deux semaines" }))).toMatch(/Echec le .*Il faut au moins deux semaines/));
  it("en cours", () => expect(resumeDernierAuto(e({ statut: "en_cours" }))).toMatch(/^En cours depuis le/));
});
