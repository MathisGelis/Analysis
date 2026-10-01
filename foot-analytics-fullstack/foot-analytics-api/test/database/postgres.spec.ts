import { join } from "node:path";

import { connexionPostgres, hoteDe, lireCertificat, MIGRATIONS, modeSsl, optionsSsl } from "@/database/postgres";

describe("modeSsl", () => {
  it("base locale : pas de chiffrement ; base distante : chiffre par defaut", () => {
    expect(modeSsl("postgres://u:p@localhost:5432/foot", {})).toBe("off");
    expect(modeSsl("postgres://u@127.0.0.1/foot", {})).toBe("off");
    expect(modeSsl("postgres://postgres.abcd:pw@aws-0-eu-west-3.pooler.supabase.com:5432/postgres", {})).toBe("require");
  });

  it("DB_SSL l'emporte, sans casse ; une valeur inconnue est refusee plutot qu'ignoree", () => {
    expect(modeSsl("postgres://u@localhost/foot", { DB_SSL: "Require" })).toBe("require");
    expect(modeSsl("postgres://u@db.exemple.fr/foot", { DB_SSL: "off" })).toBe("off");
    expect(modeSsl("postgres://u@db.exemple.fr/foot", { DB_SSL: "verify" })).toBe("verify");
    expect(() => modeSsl("postgres://u@db.exemple.fr/foot", { DB_SSL: "oui" })).toThrow(/off, require ou verify/);
  });

  it("URL illisible : on chiffre par prudence (l'erreur viendra de la connexion) ; socket Unix : en local", () => {
    expect(hoteDe("pas une url")).toBeNull();
    expect(modeSsl("pas une url", {})).toBe("require");
    expect(modeSsl("postgres:///foot?host=/var/run/postgresql", {})).toBe("off");
  });
});

describe("optionsSsl / lireCertificat", () => {
  it("off, require (sans verification), verify (avec l'autorite)", () => {
    expect(optionsSsl("off")).toBe(false);
    expect(optionsSsl("require")).toEqual({ rejectUnauthorized: false });
    expect(optionsSsl("verify", "PEM")).toEqual({ rejectUnauthorized: true, ca: "PEM" });
  });

  it("verify sans certificat : erreur explicite, jamais une verification silencieusement desactivee", () => {
    expect(() => optionsSsl("verify")).toThrow(/DB_SSL_CA/);
  });

  it("certificat en clair (retours a la ligne echappes d'une variable d'hebergeur) ou lu depuis un fichier", () => {
    expect(lireCertificat("-----BEGIN CERTIFICATE-----\\nABC\\n-----END CERTIFICATE-----"))
      .toBe("-----BEGIN CERTIFICATE-----\nABC\n-----END CERTIFICATE-----");
    expect(lireCertificat("/etc/ssl/supabase.crt", (chemin) => `contenu de ${chemin}`)).toBe("contenu de /etc/ssl/supabase.crt");
    expect(lireCertificat("   ")).toBeUndefined();
    expect(lireCertificat(undefined)).toBeUndefined();
  });
});

describe("connexionPostgres", () => {
  it("sans DATABASE_URL : erreur claire", () => {
    expect(() => connexionPostgres({})).toThrow(/DATABASE_URL/);
  });

  it("jamais de synchronize ; migrations appliquees au demarrage sauf demande contraire", () => {
    const base = connexionPostgres({ DATABASE_URL: "postgres://u@db.exemple.fr/foot" });
    expect(base).toMatchObject({ type: "postgres", synchronize: false, migrationsRun: true, ssl: { rejectUnauthorized: false } });
    expect(connexionPostgres({ DATABASE_URL: "postgres://u@db.exemple.fr/foot", DB_MIGRATIONS_RUN: "false" }).migrationsRun).toBe(false);
  });

  it("taille du pool reglable ; entites et generateur d'identifiants toujours declares", () => {
    const o = connexionPostgres({ DATABASE_URL: "postgres://u@localhost/foot", DB_POOL_MAX: "4" });
    expect(o.extra).toEqual({ max: 4 });
    expect((o.entities as unknown[]).length).toBe(18);
    expect(o.subscribers).toHaveLength(1);
  });
});

describe("MIGRATIONS", () => {
  it("ne charge que les fichiers horodates : migrations.pg.spec.ts, a cote, ne doit jamais etre pris pour une migration", () => {
    expect(MIGRATIONS).toHaveLength(1);
    expect(MIGRATIONS[0].endsWith(join("migrations", "[0-9]*.{ts,js}"))).toBe(true);
  });
});
