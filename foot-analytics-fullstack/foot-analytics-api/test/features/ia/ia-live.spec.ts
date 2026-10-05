import { DataSource } from "typeorm";

import { AnalyseService } from "@/features/analyse/analyse.service";
import { Club } from "@/features/clubs/club.entity";
import { Coach } from "@/features/coachs/coach.entity";
import { Composition } from "@/features/matchs/composition.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { IaEntrainement } from "@/features/ia/ia-entrainement.entity";
import { IaModele } from "@/features/ia/ia-modele.entity";
import { IaService } from "@/features/ia/ia.service";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { LigneClassement } from "@/features/classement/ligne-classement.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { StaffMatch } from "@/features/coachs/staff-match.entity";
import { compoProbableDuModele, feuillesDeLEquipe, MatchDeLEquipe } from "@/features/ia/ia-live";
import { poidsInitiaux } from "@/features/ia/ia-modele";
import { creerBaseTest } from "@test/support/test-db";
import { insererLigue, ligue } from "./ligue";

/** Les matchs d'un club de la ligue synthetique, au format du rapport d'equipe. */
function matchsDuClub(club: number, semaines = 8): MatchDeLEquipe[] {
  const e = ligue({ clubs: 4, semaines });
  return e.matchs.filter((m) => m.clubDom === `c${club}` || m.clubExt === `c${club}`).map((m) => {
    const cote = m.clubDom === `c${club}` ? "dom" : "ext";
    const lignes = e.compos.filter((c) => c.matchId === m.id && c.cote === cote);
    return { m: { id: m.id, date: m.date, journee: m.journee, saisonId: m.saisonId }, dom: cote === "dom", titulaires: lignes.filter((l) => l.titulaire), bancs: lignes.filter((l) => !l.titulaire) };
  });
}

describe("feuillesDeLEquipe", () => {
  it("de la plus ancienne a la plus recente, quel que soit l'ordre d'arrivee ; sans onze : ignoree", () => {
    const matchs = matchsDuClub(0);
    const melange = [...matchs].reverse();
    melange[2] = { ...melange[2], titulaires: [] };                      // une feuille sans onze
    const feuilles = feuillesDeLEquipe(melange);
    expect(feuilles).toHaveLength(matchs.length - 1);
    expect(feuilles.map((f) => f.temps)).toEqual([...feuilles.map((f) => f.temps)].sort((a, b) => a - b));
    expect(feuilles[0].lignes.filter((l) => l.titulaire)).toHaveLength(11);
    expect(feuilles[0].lignes.find((l) => l.titulaire)!.minutes).toBe(90);
  });
});

describe("compoProbableDuModele", () => {
  it("11 titulaires avec leur numero et leur probabilite, la confiance et le nombre de feuilles lues", () => {
    const matchs = matchsDuClub(0);
    const c = compoProbableDuModele(poidsInitiaux(), matchs, "s25")!;
    expect(c.titulaires).toHaveLength(11);
    expect(c.titulaires.map((t) => t.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(c.titulaires.every((t) => t.proba > 0 && t.proba <= 1 && t.titularisations > 0)).toBe(true);
    expect(c.sur).toBe(Math.min(matchs.length, poidsInitiaux().hyper.fenetre));
    expect(c.confiance).toBeGreaterThan(0.5);
  });

  it("aucun match avec onze : rien a predire", () => {
    expect(compoProbableDuModele(poidsInitiaux(), [], "s25")).toBeNull();
    expect(compoProbableDuModele(poidsInitiaux(), matchsDuClub(0).map((m) => ({ ...m, titulaires: [] })), "s25")).toBeNull();
  });
});

describe("AnalyseService.rapportClub avec le modele de l'IA", () => {
  let ds: DataSource;
  let ia: IaService;
  let avec: AnalyseService;
  let sans: AnalyseService;

  beforeEach(async () => {
    ds = await creerBaseTest();
    ia = new IaService(
      ds.getRepository(Match), ds.getRepository(Equipe), ds.getRepository(Club), ds.getRepository(Composition),
      ds.getRepository(Saison), ds.getRepository(IaEntrainement), ds.getRepository(IaModele),
    );
    const repos = [
      ds.getRepository(Club), ds.getRepository(Match), ds.getRepository(Joueur), ds.getRepository(Composition), ds.getRepository(EvenementMatch),
      ds.getRepository(Entrainement), ds.getRepository(Coach), ds.getRepository(StaffMatch), ds.getRepository(Equipe),
      ds.getRepository(LigneClassement), ds.getRepository(Saison),
    ] as const;
    avec = new AnalyseService(...repos, ia);
    sans = new AnalyseService(...repos);
    await insererLigue(ds, ligue({ clubs: 4, semaines: 10 }));
  });
  afterEach(() => ds.destroy());

  it("sans modele actif : le moteur a regles, comme avant", async () => {
    const r = await avec.rapportClub("c0");
    expect(r.compoProbableSource).toBe("regles");
    expect(r.compoProbableModele).toBeNull();
    expect(r.compoProbable).toHaveLength(11);
    expect(r.compoProbable.every((j) => j.proba === undefined)).toBe(true);
  });

  it("avec un modele actif : la compo vient du modele, avec la probabilite de chaque joueur ; sans lui, retour aux regles", async () => {
    const lance = await ia.lancer(null, { optimiser: false });
    await ia.attendre(lance.id);
    const modele = (await ia.resume(lance.id)).modele!;
    await ia.activer(modele.id);

    const r = await avec.rapportClub("c0");
    expect(r.compoProbableSource).toBe("modele");
    expect(r.compoProbableModele).toBe("Modele n°1");
    expect(r.compoProbable).toHaveLength(11);
    expect(r.compoProbable.every((j) => typeof j.proba === "number" && j.proba > 0 && j.matchsJoues > 0)).toBe(true);
    expect(r.compoProbable.map((j) => j.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(r.compoProbable.map((j) => j.poste)).toEqual(["GB", "DD", "DG", "DCD", "DCG", "MDC", "AG", "MC", "BU", "MO", "AD"]);
    expect(r.compoProbableSur).toBe(10);

    // Le service sans IA (comme dans l'ancien code) et la desactivation reviennent au moteur a regles.
    expect((await sans.rapportClub("c0")).compoProbableSource).toBe("regles");
    await ia.desactiver();
    expect((await avec.rapportClub("c0")).compoProbableSource).toBe("regles");
  });
});
