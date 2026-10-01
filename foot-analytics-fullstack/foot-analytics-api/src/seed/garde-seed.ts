// src/seed/garde-seed.ts
//
// Garde-fous du peuplement de demonstration : il ne doit jamais toucher une base Postgres (production) sans
// que ce soit demande en toutes lettres. `reset()` vide toutes les tables.

type Env = Record<string, string | undefined>;
const estPostgres = (env: Env) => (env.DB_TYPE ?? "sqlite") === "postgres";

/** Peuplement automatique au demarrage : actif par defaut sur SQLite, desactive par defaut sur Postgres. */
export function seedAutomatique(env: Env): boolean {
  const demande = env.AUTO_SEED;
  if (demande === "true" || demande === "false") return demande === "true";
  return !estPostgres(env);
}

/** `npm run seed` vide la base : refuse sur Postgres, sauf SEED_FORCE=true. */
export function verifierResetAutorise(env: Env): void {
  if (estPostgres(env) && env.SEED_FORCE !== "true") {
    throw new Error("Le peuplement de demonstration vide toutes les tables : refuse sur une base Postgres (SEED_FORCE=true pour passer outre).");
  }
}
