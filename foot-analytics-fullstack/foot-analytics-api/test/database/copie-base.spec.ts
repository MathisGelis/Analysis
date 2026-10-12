import { DataSource } from "typeorm";

import { Club } from "@/features/clubs/club.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { OPTIONS_ENTITES } from "@/database/entities";
import { creerBaseTest, fabriques, TESTS_SUR_POSTGRES } from "@test/support/test-db";
import { convertirValeur, copierBase, ordreDeCopie, tailleDeLot } from "@/database/copie-base";

async function baseSqlite(): Promise<DataSource> {
  return new DataSource({ type: "sqljs", ...OPTIONS_ENTITES, synchronize: true, dropSchema: true }).initialize();
}

describe("ordreDeCopie / tailleDeLot / convertirValeur", () => {
  it("une table referencee passe toujours avant celle qui la reference", async () => {
    const ds = await baseSqlite();
    const ordre = ordreDeCopie(ds.entityMetadatas).map((m) => m.tableName);
    const avant = (a: string, b: string) => expect(ordre.indexOf(a)).toBeLessThan(ordre.indexOf(b));
    avant("clubs", "equipes"); avant("saisons", "equipes"); avant("clubs", "joueurs");
    avant("matchs", "compositions"); avant("matchs", "evenements_match");
    avant("arbitres", "arbitres_matchs"); avant("coachs", "staff_matchs");
    expect(ordre).toHaveLength(21);
    await ds.destroy();
  });

  it("les lots restent sous la limite de parametres de Postgres", () => {
    expect(tailleDeLot(30) * 30).toBeLessThanOrEqual(65_535);
    expect(tailleDeLot(100_000)).toBe(1);
  });

  it("SQLite range les booleens en 0/1 : ils redeviennent vrais ; le reste passe tel quel", async () => {
    const ds = await baseSqlite();
    const actif = ds.getMetadata(Saison).columns.find((c) => c.propertyName === "actif")!;
    const nom = ds.getMetadata(Saison).columns.find((c) => c.propertyName === "nom")!;
    expect(convertirValeur(actif, 1)).toBe(true);
    expect(convertirValeur(actif, 0)).toBe(false);
    expect(convertirValeur(actif, null)).toBeNull();
    expect(convertirValeur(nom, "2025-2026")).toBe("2025-2026");
    expect(convertirValeur(nom, undefined)).toBeNull();
    await ds.destroy();
  });
});

// La copie elle-meme n'a de sens que vers Postgres.
(TESTS_SUR_POSTGRES ? describe : describe.skip)("copierBase SQLite -> Postgres", () => {
  let source: DataSource;
  let cible: DataSource;

  beforeEach(async () => {
    source = await baseSqlite();
    cible = await creerBaseTest();
    const f = fabriques(source);
    const club = await f.club("OL Sud", { ville: "Lyon" });
    const adv = await f.club("Adverse FC");
    const saison = await f.saison("2025-2026", 2025, { actif: true });
    const equipe = await f.equipe({ clubId: club.id, nom: "Seniors", saisonId: saison.id, categorie: "Seniors" });
    await f.joueur({ nom: "MARTIN", prenom: "Luc", clubId: club.id, licence: "L1", equipesAttachees: [equipe.id, "autre-id"] });
    const m = await f.match({ clubDom: club.id, clubExt: adv.id, saisonId: saison.id, date: "07/09/2025", scoreDom: 2, scoreExt: 1 });
    await f.compo({ matchId: m.id, cote: "dom", nom: "MARTIN", prenom: "Luc", licence: "L1" });
    await f.evenement({ matchId: m.id, type: "but", joueur: "MARTIN Luc", equipe: "dom", minute: 12 });
  });
  afterEach(async () => { await source.destroy(); await cible.destroy(); });

  it("copie toutes les tables a l'identique : booleens, listes, dates, relations", async () => {
    const bilan = await copierBase(source, cible);

    expect(bilan.find((b) => b.table === "clubs")).toEqual({ table: "clubs", source: 2, cible: 2 });
    expect(bilan.every((b) => b.source === b.cible)).toBe(true);
    const saison = await cible.getRepository(Saison).findOneByOrFail({ nom: "2025-2026" });
    expect(saison.actif).toBe(true);
    const joueur = await cible.getRepository(Joueur).findOneByOrFail({ licence: "L1" });
    expect(joueur.equipesAttachees).toHaveLength(2);
    expect(joueur.equipesAttachees).toContain("autre-id");
    const equipe = await cible.getRepository(Equipe).findOneByOrFail({ nom: "Seniors" });
    expect(joueur.equipesAttachees).toContain(equipe.id);
    expect(joueur.clubId).toBe(equipe.clubId);
    const match = await cible.getRepository(Match).findOneByOrFail({ date: "07/09/2025" });
    expect([match.scoreDom, match.scoreExt]).toEqual([2, 1]);
    expect((await cible.getRepository(Club).findOneByOrFail({ nom: "OL Sud" })).creeLe).toBeInstanceOf(Date);
  });

  it("refuse une cible deja remplie, sauf avec ecraser", async () => {
    await copierBase(source, cible);

    await expect(copierBase(source, cible)).rejects.toThrow(/n'est pas vide.*--ecraser/s);
    const bilan = await copierBase(source, cible, { ecraser: true });

    expect(bilan.find((b) => b.table === "joueurs")?.cible).toBe(1);
    expect(await cible.getRepository(Joueur).count()).toBe(1);
  });

  it("une ligne orpheline fait tout echouer : la cible reste vide", async () => {
    await source.query(`PRAGMA foreign_keys = OFF`);
    await source.query(`INSERT INTO equipes (id, club_id, nom, formationDef, createdAt) VALUES ('e-orph', 'club-fantome', 'Orpheline', '4-2-3-1', datetime('now'))`);

    await expect(copierBase(source, cible)).rejects.toThrow(/foreign key|cle etrangere/i);

    expect(await cible.getRepository(Club).count()).toBe(0);
  });
});
