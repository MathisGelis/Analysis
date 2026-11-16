import { describe, expect, it } from "vitest";

import type { Operation } from "@/features/direct/lib/file-envoi";
import { ecrireFile, lireFile } from "@/features/direct/lib/file-persistante";

const memoire = () => { const m = new Map<string, string>(); return { m, s: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } }; };
const ajout = (id: string): Operation => ({ genre: "ajout", evenement: { id, cote: "dom", type: "tir", resultat: "but", periode: 1, minute: 12, contextes: [] } as any });

describe("file persistante", () => {
  it("écrit et relit la file d'un match, une file par match", () => {
    const { s } = memoire();
    const file: Operation[] = [ajout("a"), { genre: "suppression", id: "b" }];
    ecrireFile(s, "m1", file);
    ecrireFile(s, "m2", [ajout("z")]);
    expect(lireFile(s, "m1")).toEqual(file);
    expect(lireFile(s, "m2")).toHaveLength(1);
    expect(lireFile(s, "m3")).toEqual([]);
  });

  it("une file vide efface la sauvegarde", () => {
    const { s, m } = memoire();
    ecrireFile(s, "m1", [ajout("a")]);
    ecrireFile(s, "m1", []);
    expect(m.size).toBe(0);
  });

  it("ignore ce qui est abîmé : JSON invalide, mauvais type, opérations incomplètes", () => {
    const { s, m } = memoire();
    m.set("fa.direct.file.m1", "{pas du json");
    expect(lireFile(s, "m1")).toEqual([]);
    m.set("fa.direct.file.m1", JSON.stringify({ a: 1 }));
    expect(lireFile(s, "m1")).toEqual([]);
    m.set("fa.direct.file.m1", JSON.stringify([ajout("ok"), { genre: "ajout", evenement: { id: "x" } }, { genre: "suppression" }, null, 3, { genre: "autre" }]));
    expect(lireFile(s, "m1").map((o) => (o.genre === "ajout" ? o.evenement.id : o.id))).toEqual(["ok"]);
  });

  it("jamais d'exception : stockage absent, plein ou qui refuse", () => {
    expect(lireFile(null, "m1")).toEqual([]);
    expect(() => ecrireFile(null, "m1", [ajout("a")])).not.toThrow();
    const plein = { getItem: () => { throw new Error("refusé"); }, setItem: () => { throw new Error("plein"); }, removeItem: () => { throw new Error("refusé"); } };
    expect(lireFile(plein, "m1")).toEqual([]);
    expect(() => ecrireFile(plein, "m1", [ajout("a")])).not.toThrow();
    expect(() => ecrireFile(plein, "m1", [])).not.toThrow();
  });
});
