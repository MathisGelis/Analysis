import { seedAutomatique, verifierResetAutorise } from "@/features/seed/garde-seed";

describe("seedAutomatique", () => {
  it("SQLite : actif par defaut ; Postgres : jamais sans demande explicite", () => {
    expect(seedAutomatique({})).toBe(true);
    expect(seedAutomatique({ DB_TYPE: "sqlite" })).toBe(true);
    expect(seedAutomatique({ DB_TYPE: "postgres" })).toBe(false);
  });

  it("AUTO_SEED explicite l'emporte dans les deux sens", () => {
    expect(seedAutomatique({ AUTO_SEED: "false" })).toBe(false);
    expect(seedAutomatique({ DB_TYPE: "postgres", AUTO_SEED: "true" })).toBe(true);
  });
});

describe("verifierResetAutorise", () => {
  it("libre sur SQLite, refuse sur Postgres sauf SEED_FORCE=true", () => {
    expect(() => verifierResetAutorise({})).not.toThrow();
    expect(() => verifierResetAutorise({ DB_TYPE: "postgres" })).toThrow(/refuse sur une base Postgres/);
    expect(() => verifierResetAutorise({ DB_TYPE: "postgres", SEED_FORCE: "true" })).not.toThrow();
  });
});
