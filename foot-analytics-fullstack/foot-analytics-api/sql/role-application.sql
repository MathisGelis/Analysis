-- foot-analytics-api/sql/role-application.sql
--
-- Compte de service a droits minimaux pour l'API (a executer dans l'editeur SQL de Supabase, avec le role
-- proprietaire "postgres"). Idempotent : on peut le relancer apres chaque migration qui cree une table.
--
-- Le role "foot_app" lit et ecrit les donnees, rien d'autre : pas de DDL (CREATE, ALTER, DROP), pas de TRUNCATE,
-- pas d'acces aux autres schemas. Les tables restent verrouillees pour anon et authenticated (RLS sans politique,
-- voir la migration VerrouillerApiDonnees) ; foot_app recoit sa propre politique sur chaque table.
--
-- Ensuite :
--   1. Render : DATABASE_URL = la chaine du pooler avec l'utilisateur foot_app (Supabase : "foot_app.<ref projet>")
--      et DB_MIGRATIONS_RUN=false (foot_app ne peut pas migrer) ;
--   2. les migrations se lancent avec le role proprietaire, depuis un poste ou la CI :
--        DATABASE_URL=<chaine proprietaire> npm run migration:run
--      puis on relance ce script (politique de la nouvelle table).
--
-- Remplacer CHANGER_MOI par un mot de passe long et aleatoire (openssl rand -base64 32), garde dans un coffre.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'foot_app') THEN
    CREATE ROLE foot_app LOGIN PASSWORD 'CHANGER_MOI' NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END $$;

-- Pas plus que necessaire : connexion, schema public, lecture/ecriture des lignes.
GRANT CONNECT ON DATABASE postgres TO foot_app;
GRANT USAGE ON SCHEMA public TO foot_app;
REVOKE CREATE ON SCHEMA public FROM foot_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO foot_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO foot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO foot_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO foot_app;

-- Le journal d'audit est en ecriture seule pour l'application : pas de modification ni d'effacement d'une trace.
-- La purge des traces de plus de 12 mois passe par la fonction purger_journal_audit (SECURITY DEFINER, creee par la
-- migration JournalAudit), qui ne supprime que ce qui a depasse la duree de conservation.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'journal_audit') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON public.journal_audit FROM foot_app;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'purger_journal_audit') THEN
    GRANT EXECUTE ON FUNCTION public.purger_journal_audit(character varying) TO foot_app;
  END IF;
END $$;

-- Une politique par table pour foot_app (la RLS reste active : anon et authenticated n'ont toujours rien).
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'migrations' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tablename);
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = t.tablename AND policyname = 'foot_app_donnees') THEN
      EXECUTE format('CREATE POLICY foot_app_donnees ON public.%I TO foot_app USING (true) WITH CHECK (true)', t.tablename);
    END IF;
  END LOOP;
END $$;

-- Verification : les droits de foot_app, table par table (aucune ligne ne doit montrer TRUNCATE ou REFERENCES).
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS droits
FROM information_schema.role_table_grants
WHERE grantee = 'foot_app' AND table_schema = 'public'
GROUP BY table_name ORDER BY table_name;
