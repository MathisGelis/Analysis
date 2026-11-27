import { describe, expect, it } from "vitest";

import type { EvenementDirect, JoueurDirect } from "@/features/direct/lib/direct-types";
import { etatCompo, joueursSurLeTerrain, lignesDeFormation, repartirDansSysteme } from "@/features/direct/lib/compo-direct";

const j = (n: number, role: JoueurDirect["role"] = "titulaire"): JoueurDirect => ({ id: `j${n}`, nom: `Joueur${n}`, prenom: null, poste: null, numero: n, role });
const onze = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => j(n));
const banc = [12, 14, 15].map((n) => j(n, "remplacant"));
const joueurs = [...onze, ...banc];
const compo = { formation: "4-2-3-1", titulaires: onze.map((x) => x.id) };
let k = 0;
const ev = (e: Partial<EvenementDirect>): EvenementDirect => ({
  id: `e${++k}`, cote: "dom", type: "tir", resultat: null, periode: 1, minute: 10, joueurNumero: null, joueurNom: null, joueurId: null, joueur2Numero: null, joueur2Nom: null, joueur2Id: null,
  zoneTier: null, zoneCouloir: null, zoneCadre: null, contextes: [], ...e,
});
const etat = (evenements: EvenementDirect[]) => etatCompo({ compo, joueurs, evenements, nousCote: "dom" });
const numeros = (e: ReturnType<typeof etat>) => e.slots.map((s) => s.joueur?.numero ?? null);

describe("lignesDeFormation", () => {
  it("le gardien d'abord, le losange est 4-1-2-1-2", () => {
    expect(lignesDeFormation("4-1-2-1-2")).toEqual([1, 4, 1, 2, 1, 2]);
    expect(lignesDeFormation("4-3-3")).toEqual([1, 4, 3, 3]);
    expect(lignesDeFormation("4-4-3")).toBeNull();
    expect(lignesDeFormation(null)).toBeNull();
  });
});

describe("etatCompo", () => {
  it("au coup d'envoi : le onze du plan, le banc au complet", () => {
    const e = etat([]);
    expect(numeros(e)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(e.banc.map((x) => x.numero)).toEqual([12, 14, 15]);
    expect(joueursSurLeTerrain(e)).toBe(11);
  });

  it("un remplacement met l'entrant au poste du sortant ; le sortant ne revient pas et l'entrant quitte le banc", () => {
    const e = etat([ev({ type: "remplacement", minute: 46, joueurNumero: 7, joueurId: "j7", joueur2Numero: 14, joueur2Id: "j14" })]);
    expect(numeros(e)).toEqual([1, 2, 3, 4, 5, 6, 14, 8, 9, 10, 11]);
    expect(e.banc.map((x) => x.numero)).toEqual([12, 15]);
    expect(e.sortis.map((x) => x.numero)).toEqual([7]);
  });

  it("un rouge laisse le joueur a son poste, grise ; il ne compte plus sur le terrain ; l'adversaire est ignore", () => {
    const e = etat([ev({ type: "carton_rouge", minute: 58, joueurNumero: 6, joueurId: "j6" }), ev({ cote: "ext", type: "carton_rouge", joueurNumero: 3 })]);
    expect(e.slots[5]).toMatchObject({ expulse: true });
    expect(e.slots[5].joueur?.numero).toBe(6);
    expect(joueursSurLeTerrain(e)).toBe(10);
    expect(e.sortis.map((x) => x.numero)).toEqual([6]);
  });

  it("un changement de systeme replace les joueurs, sans l'expulse (le dernier poste reste vide)", () => {
    const e = etat([
      ev({ type: "carton_rouge", minute: 58, joueurNumero: 6, joueurId: "j6" }),
      ev({ type: "systeme", minute: 64, resultat: "4-1-2-1-2" }),
    ]);
    expect(e.formation).toBe("4-1-2-1-2");
    expect(numeros(e)).toEqual([1, 2, 3, 4, 5, 7, 8, 9, 10, 11, null]);
    expect(e.slots.every((s) => !s.expulse)).toBe(true);
  });

  it("l'arrangement choisi a l'ecran (identifiants des 11 postes) est garde", () => {
    const ordre = ["j1", "j2", "j3", "j4", "j5", "j8", "j6", "j7", "j9", "j11", "j10"];
    const e = etat([ev({ type: "systeme", minute: 30, resultat: "4-1-2-1-2", contextes: ordre })]);
    expect(numeros(e)).toEqual([1, 2, 3, 4, 5, 8, 6, 7, 9, 11, 10]);
  });

  it("l'ordre est celui du match (periode, minute), pas celui de la saisie", () => {
    const e = etat([
      ev({ type: "remplacement", periode: 2, minute: 70, joueurNumero: 14, joueurId: "j14", joueur2Numero: 12, joueur2Id: "j12" }),
      ev({ type: "remplacement", periode: 1, minute: 20, joueurNumero: 9, joueurId: "j9", joueur2Numero: 14, joueur2Id: "j14" }),
    ]);
    expect(numeros(e)[8]).toBe(12);
    expect(e.sortis.map((x) => x.numero)).toEqual([9, 14]);
  });

  it("un entrant inconnu de l'effectif apparait quand meme (numero et nom saisis)", () => {
    const e = etat([ev({ type: "remplacement", joueurNumero: 2, joueurId: "j2", joueur2Numero: 30, joueur2Nom: "Invite" })]);
    expect(e.slots[1].joueur).toMatchObject({ numero: 30, nom: "Invite" });
  });
});

describe("repartirDansSysteme", () => {
  it("onze postes pour 4-3-3, expulse retire", () => {
    const base = onze.map((joueur) => ({ joueur, expulse: false }));
    base[2] = { ...base[2], expulse: true };
    const r = repartirDansSysteme(base, "4-3-3");
    expect(r).toHaveLength(11);
    expect(r.filter((s) => s.joueur).length).toBe(10);
    expect(r[10].joueur).toBeNull();
  });
});
