// Non-regression RGPD : les journaux du serveur (Logger Nest) ne contiennent jamais un nom, un prenom ou un numero de
// licence. On capture tout ce qui est journalise (niveau debug compris) pendant un import de feuille de match qui
// tourne mal par endroits, une erreur du parseur qui cite un joueur, un rattachement de joueur, et des connexions
// (echecs, verrouillage, rejeu de jeton), puis on cherche chaque nom et chaque licence de la feuille.

import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Logger, LoggerService } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { IsNull, Not } from "typeorm";

import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { ArbitreMatch } from "@/features/arbitres/arbitre-match.entity";
import { ArbitresService } from "@/features/arbitres/arbitres.service";
import { AuthService } from "@/features/auth/auth.service";
import { Session } from "@/features/auth/session.entity";
import { Club } from "@/features/clubs/club.entity";
import { ClubsService } from "@/features/clubs/clubs.service";
import { Coach } from "@/features/coachs/coach.entity";
import { CoachsService } from "@/features/coachs/coachs.service";
import { StaffMatch } from "@/features/coachs/staff-match.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EquipesService } from "@/features/equipes/equipes.service";
import { FmiService } from "@/features/fmi/fmi.service";
import { JoueursService } from "@/features/joueurs/joueurs.service";
import { Composition } from "@/features/matchs/composition.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Match } from "@/features/matchs/match.entity";
import { MatchsService } from "@/features/matchs/matchs.service";
import { Saison } from "@/features/saisons/saison.entity";
import { SaisonsService } from "@/features/saisons/saisons.service";
import { AppTest, creerAppTest } from "@test/support/app-test";
import reference from "@test/support/fixtures/fmi-reference.parsed.json";

/** Tout ce qui est journalise, tous niveaux. */
class Capture implements LoggerService {
  lignes: string[] = [];
  private noter = (...args: unknown[]) => { this.lignes.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(" ")); };
  log = this.noter; error = this.noter; warn = this.noter; debug = this.noter; verbose = this.noter; fatal = this.noter;
}

/** Noms, prenoms et licences de la feuille de reference (anonymisee) : ce qui ne doit jamais sortir dans un journal. */
function donneesPersonnelles(): string[] {
  const d: any = reference;
  const valeurs = new Set<string>();
  const ajouter = (v: unknown) => {
    for (const mot of String(v ?? "").split(/\s+/)) if (mot.length >= 4) valeurs.add(mot.toUpperCase());
  };
  for (const j of [...d.compo_recevante, ...d.compo_visiteuse]) { ajouter(j.nom); ajouter(j.prenom); ajouter(j.licence); }
  for (const o of d.officiels ?? []) { ajouter(o.nom_complet); ajouter(o.licence); }
  for (const e of d.encadrement ?? []) { ajouter(e.nom_complet); ajouter(e.licence); }
  return [...valeurs];
}

describe("journaux du serveur sans donnees personnelles", () => {
  const capture = new Capture();
  let t: AppTest;
  let dossier: string;

  afterAll(() => { Logger.overrideLogger(false); });
  beforeEach(async () => {
    t = await creerAppTest();
    // Apres la creation de l'application, qui coupe les journaux (logger: false).
    Logger.overrideLogger(capture);
    dossier = await mkdtemp(join(tmpdir(), "logs-rgpd-"));
  });
  afterEach(async () => {
    await t.fermer();
    await rm(dossier, { recursive: true, force: true });
  });

  it("aucun nom, prenom ni licence dans les journaux d'un import, d'erreurs et de connexions", async () => {
    const ds = t.ds;
    const repo = <T extends object>(e: new () => T) => ds.getRepository(e);
    const equipes = new EquipesService(repo(Equipe));
    const arbitres = new ArbitresService(repo(Arbitre), repo(ArbitreMatch));
    const coachs = new CoachsService(repo(Coach), repo(StaffMatch));
    // Parseur qui echoue en citant un joueur (comme pourrait le faire une exception Python).
    const parseur = join(dossier, "parseur.js");
    const [premier] = (reference as any).compo_recevante;
    await writeFile(parseur, `process.stderr.write("Traceback\\nValueError: joueur ${premier.nom} ${premier.prenom} licence ${premier.licence}\\n"); process.exit(1);`);
    const svc = new FmiService(
      new ConfigService({ PYTHON_BIN: process.execPath, FMI_PARSER_PATH: parseur }),
      new MatchsService(repo(Match), repo(Composition), repo(EvenementMatch)),
      new ClubsService(repo(Club)),
      { rebuildAll: jest.fn().mockResolvedValue({ joueurs: 0, classement: 0 }) } as any,
      arbitres, coachs, equipes, new SaisonsService(repo(Saison), equipes),
    );

    // 1. Import d'une feuille dont l'enregistrement des arbitres et du staff echoue (message d'erreur nominatif).
    jest.spyOn(arbitres, "upsertByNomComplet").mockImplementation(async (nom: string) => { throw new Error(`doublon ${nom}`); });
    jest.spyOn(coachs, "upsert").mockImplementation(async (nom: string) => { throw new Error(`doublon ${nom}`); });
    jest.spyOn(svc, "parseBuffersBatch").mockResolvedValue([{ originalname: "a.pdf", parsed: JSON.parse(JSON.stringify(reference)) }]);
    await svc.importMany([{ buffer: Buffer.from("x"), originalname: "a.pdf" }] as any);
    jest.restoreAllMocks();

    // 2. Le parseur echoue en citant un joueur.
    await expect(svc.parseBuffer(Buffer.from("%PDF"), `${premier.nom}.pdf`)).rejects.toThrow();

    // 3. Rattachement d'un joueur a une equipe (trace de debogage).
    const club = await t.f.club("OL Sud");
    const equipe = await t.f.equipe({ clubId: club.id, nom: "Seniors" });
    const joueur = await t.f.joueur({ nom: premier.nom, prenom: premier.prenom, licence: premier.licence, clubId: club.id });
    await t.app.get(JoueursService).attachEquipe(joueur.id, equipe.id);

    // 4. Connexions : echecs jusqu'au verrouillage, puis rejeu d'un jeton de rafraichissement.
    const login = `${premier.prenom[0]}${premier.nom}`.replace(/\s+/g, "").toUpperCase();
    await t.compte({ login, prenom: premier.prenom, nom: premier.nom, role: "user", clubId: club.id, passwordHash: await AuthService.hash("Un mot de passe solide") } as any);
    const { refreshToken } = (await t.appel()("POST", "/auth/login", { login, password: "Un mot de passe solide" })).corps;
    await t.appel()("POST", "/auth/refresh", { refreshToken });
    await ds.getRepository(Session).update({ remplaceeLe: Not(IsNull()) }, { remplaceeLe: "2000-01-01T00:00:00.000Z" });
    await t.appel()("POST", "/auth/refresh", { refreshToken });
    for (let i = 0; i < 6; i++) await t.appel()("POST", "/auth/login", { login, password: `faux ${premier.licence}` });

    const journal = capture.lignes.join("\n").toUpperCase();
    expect(capture.lignes.length).toBeGreaterThan(0);
    // Les traces attendues sont bien la (preuve que la capture fonctionne), sans les noms.
    expect(journal).toMatch(/UN ARBITRE NON ENREGISTRE/);
    expect(journal).toMatch(/UN ENCADRANT NON ENREGISTRE/);
    expect(journal).toMatch(/ECHEC PARSING FMI : VALUEERROR/);
    expect(journal).toMatch(/VERROUILLE/);
    expect(journal).toMatch(/REJEU/);
    const fuites = donneesPersonnelles().filter((v) => journal.includes(v));
    expect(fuites).toEqual([]);
    expect(journal).not.toContain(login);
  });
});
