import { plageBlessure, seChevauchent } from "@/features/blessures/periode-blessure";

describe("plageBlessure", () => {
  it("en cours : sans fin", () => {
    expect(plageBlessure({ dateDebut: "2026-03-01", statut: "Indisponible" })?.fin).toBe(Infinity);
  });
  it("terminee sans date de retour : un seul jour", () => {
    const p = plageBlessure({ dateDebut: "2026-03-01", statut: "Retabli" })!;
    expect(p.fin).toBe(p.debut);
  });
  it("date de debut illisible : null", () => {
    expect(plageBlessure({ dateDebut: null })).toBeNull();
  });
});

describe("seChevauchent", () => {
  const mars = { dateDebut: "2026-03-01", retourEstime: "2026-03-31", statut: "Retabli" };

  it("periodes qui se recouvrent", () => {
    expect(seChevauchent(mars, { dateDebut: "2026-03-20", retourEstime: "2026-04-10" })).toBe(true);
  });
  it("periode incluse dans une autre", () => {
    expect(seChevauchent(mars, { dateDebut: "2026-03-10", retourEstime: "2026-03-12" })).toBe(true);
  });
  it("bornes qui se touchent = chevauchement (meme jour)", () => {
    expect(seChevauchent(mars, { dateDebut: "2026-03-31", retourEstime: "2026-04-05" })).toBe(true);
  });
  it("periodes disjointes", () => {
    expect(seChevauchent(mars, { dateDebut: "2026-04-01", retourEstime: "2026-04-10" })).toBe(false);
  });
  it("une blessure en cours chevauche tout ce qui la suit", () => {
    const enCours = { dateDebut: "2026-03-01", statut: "Indisponible" };
    expect(seChevauchent(enCours, { dateDebut: "2026-09-01", retourEstime: "2026-09-10" })).toBe(true);
    expect(seChevauchent(enCours, { dateDebut: "2026-02-01", retourEstime: "2026-02-20" })).toBe(false);
  });
  it("dates inutilisables : pas de faux positif", () => {
    expect(seChevauchent(mars, { dateDebut: null })).toBe(false);
  });
});
