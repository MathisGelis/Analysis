import { describe, expect, it } from "vitest";

import { lireSaisie, numeroEffectif, numerosAEnvoyer, numerosOk, verifierNumeros } from "@/features/avant-match/lib/numeros";

const habituels = { a: 1, b: 9, c: 10, d: null, e: undefined };

describe("numéros du jour", () => {
  it("le choix du staff prime sur le numéro habituel", () => {
    expect(numeroEffectif("a", { a: 14 }, habituels)).toBe(14);
    expect(numeroEffectif("a", {}, habituels)).toBe(1);
    expect(numeroEffectif("d", {}, habituels)).toBeNull();
    expect(numeroEffectif("z", {}, habituels)).toBeNull();
  });

  it("lecture d'une case : vide = pas de choix, entier valide, ou illisible", () => {
    expect(lireSaisie("")).toBeUndefined();
    expect(lireSaisie("  ")).toBeUndefined();
    expect(lireSaisie("7")).toBe(7);
    expect(lireSaisie(" 99 ")).toBe(99);
    for (const mauvais of ["0", "100", "1.5", "-3", "a", "1e2", "007x"]) expect(lireSaisie(mauvais)).toBeNull();
  });

  it("détecte les joueurs sans numéro, les doublons (même avec un habituel) et les numéros invalides", () => {
    const p = verifierNumeros(["a", "b", "c", "d"], { b: 10 }, habituels);        // b prend 10 comme c ; d n'a rien
    expect(p.manquants).toEqual(["d"]);
    expect([...p.doublons]).toEqual([[10, ["b", "c"]]]);
    expect(numerosOk(p)).toBe(false);
    expect(verifierNumeros(["a"], { a: 0 }, habituels).invalides).toEqual(["a"]);
  });

  it("tout est en ordre : chacun un numéro différent", () => {
    const p = verifierNumeros(["a", "b", "d"], { d: 14 }, habituels);
    expect(numerosOk(p)).toBe(true);
    expect(numerosAEnvoyer(["a", "b", "d"], { d: 14 }, habituels)).toEqual({ a: 1, b: 9, d: 14 });
  });

  it("à l'envoi, seuls les joueurs retenus et leur numéro effectif", () => {
    expect(numerosAEnvoyer(["a", "c"], { b: 5, c: 3 }, habituels)).toEqual({ a: 1, c: 3 });
    expect(numerosAEnvoyer([], {}, habituels)).toEqual({});
  });
});
