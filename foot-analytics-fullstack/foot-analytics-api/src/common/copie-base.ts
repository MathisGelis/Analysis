// src/common/copie-base.ts
//
// Copie le contenu d'une base TypeORM vers une autre (SQLite -> Postgres pour la mise en ligne), table par
// table, sans passer par les entites : les lignes sont lues et ecrites telles quelles, donc ni hooks (calcul
// de fatigue a la lecture) ni transformations. Tout se fait dans UNE transaction sur la cible : en cas
// d'erreur (ligne orpheline, cle en double...) rien n'est ecrit.

import type { DataSource } from "typeorm";
import type { ColumnMetadata } from "typeorm/metadata/ColumnMetadata";
import type { EntityMetadata } from "typeorm/metadata/EntityMetadata";

/** Limite du protocole Postgres : 65 535 parametres par requete ; on garde de la marge. */
const PARAMETRES_MAX = 60_000;

/** Les tables referencees passent avant celles qui les referencent (cles etrangeres). */
export function ordreDeCopie(metadatas: EntityMetadata[]): EntityMetadata[] {
  const restantes = new Set(metadatas);
  const faites = new Set<EntityMetadata>();
  const ordre: EntityMetadata[] = [];
  while (restantes.size) {
    const pretes = [...restantes].filter((m) =>
      m.foreignKeys.every((fk) => fk.referencedEntityMetadata === m || faites.has(fk.referencedEntityMetadata)));
    if (pretes.length === 0) throw new Error(`Cycle de cles etrangeres entre : ${[...restantes].map((m) => m.tableName).join(", ")}`);
    for (const m of pretes) { restantes.delete(m); faites.add(m); ordre.push(m); }
  }
  return ordre;
}

export function tailleDeLot(nbColonnes: number): number {
  return Math.max(1, Math.floor(PARAMETRES_MAX / Math.max(1, nbColonnes)));
}

const estBooleen = (c: ColumnMetadata) => c.type === Boolean || c.type === "boolean";

/** SQLite range les booleens en 0/1 ; Postgres veut de vrais booleens. Le reste passe tel quel. */
export function convertirValeur(colonne: ColumnMetadata, valeur: unknown): unknown {
  if (valeur === null || valeur === undefined) return null;
  if (estBooleen(colonne)) return valeur === true || valeur === 1 || valeur === "1" || valeur === "true";
  return valeur;
}

export interface OptionsCopie {
  /** Vide d'abord les tables de la cible (TRUNCATE ... CASCADE). Sans cela, une cible non vide est refusee. */
  ecraser?: boolean;
  journal?: (ligne: string) => void;
}

export interface BilanTable { table: string; source: number; cible: number }

export async function copierBase(source: DataSource, cible: DataSource, options: OptionsCopie = {}): Promise<BilanTable[]> {
  const log = options.journal ?? (() => {});
  const tables = ordreDeCopie(cible.entityMetadatas.filter((m) => m.tableType === "regular"));
  const q = (nom: string) => `"${nom.replace(/"/g, '""')}"`;
  // Nom de table sur la cible : qualifie du schema quand la connexion en impose un (tests), nu sinon.
  const t = (m: EntityMetadata) => (m.schema ? `${q(m.schema)}.${q(m.tableName)}` : q(m.tableName));

  if (!options.ecraser) {
    const occupees: string[] = [];
    for (const m of tables) {
      const [{ n }] = await cible.query(`SELECT COUNT(*)::int AS n FROM ${t(m)}`);
      if (n > 0) occupees.push(`${m.tableName} (${n})`);
    }
    if (occupees.length) {
      throw new Error(`La base cible n'est pas vide : ${occupees.join(", ")}. Relance avec --ecraser pour la vider d'abord.`);
    }
  }

  const bilan: BilanTable[] = [];
  await cible.transaction(async (tx) => {
    if (options.ecraser) {
      await tx.query(`TRUNCATE ${tables.map(t).join(", ")} CASCADE`);
      log("Tables de la cible videes.");
    }
    for (const m of tables) {
      const colonnes = m.columns.filter((c) => !c.isVirtual);
      const lignes: Record<string, unknown>[] = await source.query(`SELECT * FROM ${q(m.tableName)}`);
      const lot = tailleDeLot(colonnes.length);
      for (let debut = 0; debut < lignes.length; debut += lot) {
        const morceau = lignes.slice(debut, debut + lot);
        const valeurs: unknown[] = [];
        const groupes = morceau.map((ligne) => `(${colonnes.map((c) => {
          valeurs.push(convertirValeur(c, ligne[c.databaseName]));
          return `$${valeurs.length}`;
        }).join(", ")})`);
        await tx.query(`INSERT INTO ${t(m)} (${colonnes.map((c) => q(c.databaseName)).join(", ")}) VALUES ${groupes.join(", ")}`, valeurs);
      }
      const [{ n }] = await tx.query(`SELECT COUNT(*)::int AS n FROM ${t(m)}`);
      bilan.push({ table: m.tableName, source: lignes.length, cible: n });
      log(`${m.tableName.padEnd(22)} ${String(lignes.length).padStart(6)} ligne(s)`);
    }
  });

  const ecarts = bilan.filter((b) => b.source !== b.cible);
  if (ecarts.length) throw new Error(`Comptes differents apres copie : ${ecarts.map((b) => `${b.table} ${b.source} -> ${b.cible}`).join(", ")}`);
  return bilan;
}
