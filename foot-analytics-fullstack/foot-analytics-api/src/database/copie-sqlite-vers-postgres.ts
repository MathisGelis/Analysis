// src/database/copie-sqlite-vers-postgres.ts
//
// Mise en ligne des donnees : copie un fichier SQLite vers la base Postgres (Supabase) de DATABASE_URL, apres
// avoir applique les migrations. Le fichier SQLite n'est JAMAIS modifie : il est lu en memoire.
//
//   npm run db:copier -- --sqlite foot-analytics.sqlite              (cible vide uniquement)
//   npm run db:copier -- --sqlite foot-analytics.sqlite --ecraser    (vide la cible d'abord)

import "reflect-metadata";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { DataSource } from "typeorm";

import { OPTIONS_ENTITES } from "./entities";
import { connexionPostgres, hoteDe } from "./postgres";
import { copierBase } from "./copie-base";

config();

async function main() {
  const args = process.argv.slice(2);
  const valeur = (nom: string) => { const i = args.indexOf(nom); return i >= 0 ? args[i + 1] : undefined; };
  const chemin = valeur("--sqlite");
  if (!chemin) throw new Error("Usage : npm run db:copier -- --sqlite <fichier.sqlite> [--ecraser]");

  const source = await new DataSource({
    type: "sqljs", database: readFileSync(chemin), autoSave: false, ...OPTIONS_ENTITES, synchronize: false,
  }).initialize();

  const options = connexionPostgres({ ...process.env, DB_MIGRATIONS_RUN: "false" });
  const cible = await new DataSource(options).initialize();
  console.log(`Source : ${chemin}\nCible  : ${hoteDe(process.env.DATABASE_URL) || "base locale"}`);
  try {
    const appliquees = await cible.runMigrations();
    console.log(`Migrations appliquees : ${appliquees.length ? appliquees.map((m) => m.name).join(", ") : "aucune (a jour)"}`);
    const bilan = await copierBase(source, cible, { ecraser: args.includes("--ecraser"), journal: console.log });
    console.log(`\nCopie terminee : ${bilan.reduce((n, b) => n + b.cible, 0)} lignes dans ${bilan.length} tables.`);
  } finally {
    await source.destroy();
    await cible.destroy();
  }
}

main().catch((e) => { console.error(`\nECHEC : ${e.message}`); process.exit(1); });
