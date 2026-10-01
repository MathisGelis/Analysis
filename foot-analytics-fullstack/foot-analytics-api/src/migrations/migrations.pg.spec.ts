import { randomBytes } from "node:crypto";
import { DataSource } from "typeorm";
import { OPTIONS_ENTITES } from "@/entities";
import { MIGRATIONS } from "@/common/postgres";
import { refuserBaseHebergee } from "@/testing/test-db";

// Ces tests exigent un Postgres (TEST_DATABASE_URL) ; sans lui, ils sont ignores.
const URL_PG = process.env.TEST_DATABASE_URL;
const sur = URL_PG ? describe : describe.skip;

sur("migrations Postgres", () => {
  let schema: string;
  let ds: DataSource;

  /** Le schema est choisi par le search_path de la connexion : les migrations ecrivent des noms non qualifies. */
  async function connecter() {
    return new DataSource({
      type: "postgres", url: URL_PG!, ...OPTIONS_ENTITES, synchronize: false, migrations: MIGRATIONS,
      extra: { max: 2, options: `-c search_path=${schema}` },
    }).initialize();
  }

  beforeEach(async () => {
    refuserBaseHebergee(URL_PG!);
    schema = `m_${randomBytes(6).toString("hex")}`;
    const admin = await new DataSource({ type: "postgres", url: URL_PG!, extra: { max: 1 } }).initialize();
    await admin.query(`CREATE SCHEMA "${schema}"`);
    // Simule Supabase : roles publics et privileges par defaut accordes a toute table creee.
    await admin.query(`DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
    END $$`);
    await admin.query(`GRANT USAGE ON SCHEMA "${schema}" TO anon, authenticated`);
    await admin.query(`ALTER DEFAULT PRIVILEGES IN SCHEMA "${schema}" GRANT ALL ON TABLES TO anon, authenticated`);
    await admin.destroy();
    ds = await connecter();
  });

  afterEach(async () => {
    await ds.destroy();
    const admin = await new DataSource({ type: "postgres", url: URL_PG!, extra: { max: 1 } }).initialize();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.destroy();
  });

  it("le schema migre est exactement celui des entites : aucune derive a rattraper", async () => {
    await ds.runMigrations();

    const { upQueries } = await ds.driver.createSchemaBuilder().log();

    expect(upQueries.map((q) => q.query)).toEqual([]);
  });

  it("chaque table est verrouillee : RLS active, aucun privilege pour anon ni authenticated", async () => {
    await ds.runMigrations();

    const tables: { relname: string; relrowsecurity: boolean }[] = await ds.query(
      `SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND c.relkind = 'r'`, [schema]);
    expect(tables.length).toBeGreaterThanOrEqual(18);
    expect(tables.filter((t) => !t.relrowsecurity).map((t) => t.relname)).toEqual([]);

    const ouvertes: { relname: string; role: string }[] = await ds.query(
      `SELECT c.relname, r.rolname AS role FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       CROSS JOIN (VALUES ('anon'), ('authenticated')) AS r(rolname)
       WHERE n.nspname = $1 AND c.relkind = 'r'
         AND has_table_privilege(r.rolname, format('%I.%I', n.nspname, c.relname), 'SELECT,INSERT,UPDATE,DELETE')`, [schema]);
    expect(ouvertes).toEqual([]);
  });

  it("une table creee apres coup n'est pas ouverte a anon (privileges par defaut retires)", async () => {
    await ds.runMigrations();

    await ds.query(`CREATE TABLE futur (id varchar PRIMARY KEY)`);

    const [{ ouvert }] = await ds.query(`SELECT has_table_privilege('anon', $1, 'SELECT') AS ouvert`, [`${schema}.futur`]);
    expect(ouvert).toBe(false);
  });

  it("reversible : annuler toutes les migrations ne laisse que la table de suivi", async () => {
    await ds.runMigrations();
    await ds.undoLastMigration();
    await ds.undoLastMigration();

    const restantes: { tablename: string }[] = await ds.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = $1 ORDER BY 1`, [schema]);

    expect(restantes.map((t) => t.tablename)).toEqual(["migrations"]);
  });

  it("deux executions de suite : la seconde n'a plus rien a faire", async () => {
    await ds.runMigrations();

    expect(await ds.runMigrations()).toEqual([]);
  });
});
