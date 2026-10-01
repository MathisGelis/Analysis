// src/common/postgres.ts
//
// Connexion Postgres (Supabase ou autre), partagee par l'application et la ligne de commande des migrations.
//
// Variables : DATABASE_URL (obligatoire), DB_SSL (off | require | verify), DB_SSL_CA (certificat PEM ou chemin,
// pour verify), DB_POOL_MAX, DB_MIGRATIONS_RUN (false pour ne pas migrer au demarrage).
// Chez Supabase, utiliser le pooler en mode "session" (port 5432) ou la connexion directe, pas le mode
// "transaction" (6543) : les migrations et les transactions TypeORM supposent une session stable.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { PostgresConnectionOptions } from "typeorm/driver/postgres/PostgresConnectionOptions";
import { OPTIONS_ENTITES } from "@/entities";

export type ModeSsl = "off" | "require" | "verify";

const HOTES_LOCAUX = new Set(["localhost", "127.0.0.1", "::1", "[::1]", ""]);

/** Hote d'une URL de connexion : vide pour une socket Unix, null si l'URL est illisible. */
export function hoteDe(url: string | undefined): string | null {
  try { return new URL(url ?? "").hostname.toLowerCase(); } catch { return null; }
}

/**
 * off : base locale (aucun chiffrement). require : chiffre sans verifier le certificat (comportement historique,
 * suffisant derriere un pooler gere). verify : chiffre et verifie la chaine avec DB_SSL_CA.
 * Sans reglage explicite : off pour une base locale, require pour toute autre.
 */
export function modeSsl(url: string | undefined, env: Record<string, string | undefined>): ModeSsl {
  const demande = (env.DB_SSL ?? "").trim().toLowerCase();
  if (demande === "off" || demande === "require" || demande === "verify") return demande;
  if (demande) throw new Error(`DB_SSL doit valoir off, require ou verify (recu : "${env.DB_SSL}")`);
  // Hote inconnu (URL illisible) : on chiffre, la connexion echouera de toute facon si l'URL est fausse.
  const hote = hoteDe(url);
  return hote !== null && HOTES_LOCAUX.has(hote) ? "off" : "require";
}

/** Certificat PEM, donne en clair (variable d'environnement d'un hebergeur) ou sous forme de chemin de fichier. */
export function lireCertificat(valeur: string | undefined, lire: (chemin: string) => string = (c) => readFileSync(c, "utf8")): string | undefined {
  const v = valeur?.trim();
  if (!v) return undefined;
  return v.includes("-----BEGIN") ? v.replace(/\\n/g, "\n") : lire(v);
}

export function optionsSsl(mode: ModeSsl, ca?: string): PostgresConnectionOptions["ssl"] {
  if (mode === "off") return false;
  if (mode === "require") return { rejectUnauthorized: false };
  if (!ca) throw new Error("DB_SSL=verify demande le certificat de l'autorite dans DB_SSL_CA (PEM ou chemin)");
  return { rejectUnauthorized: true, ca };
}

/**
 * Dossier des migrations : src/migrations en ts-node et Jest, dist/migrations une fois compile. Seuls les
 * fichiers qui commencent par l'horodatage sont des migrations (le test migrations.pg.spec.ts vit a cote).
 */
export const MIGRATIONS = [join(__dirname, "..", "migrations", "[0-9]*.{ts,js}")];

export function connexionPostgres(env: Record<string, string | undefined> = process.env): PostgresConnectionOptions {
  const url = env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL est obligatoire quand DB_TYPE=postgres");
  return {
    type: "postgres",
    url,
    ssl: optionsSsl(modeSsl(url, env), lireCertificat(env.DB_SSL_CA)),
    ...OPTIONS_ENTITES,
    // Le schema ne change que par migration : jamais de synchronisation automatique sur une vraie base.
    synchronize: false,
    migrations: MIGRATIONS,
    migrationsRun: env.DB_MIGRATIONS_RUN !== "false",
    extra: { max: Number(env.DB_POOL_MAX ?? 10) },
  };
}
