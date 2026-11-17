// La deduction des journees (reconstruction) ne sert que de repli : une journee deja connue (calendrier FFF, saisie a la main) fait foi.
// Regression : plus de « vagues » de dates que de journees estimees rattachait toutes les dernieres matchs a la meme journee (J11 partout).

import { DataSource } from "typeorm";

import { Arbitre } from "@/features/arbitres/arbitre.entity";
import { ArbitreMatch } from "@/features/arbitres/arbitre-match.entity";
import { Blessure } from "@/features/blessures/blessure.entity";
import { Coach } from "@/features/coachs/coach.entity";
import { Entrainement } from "@/features/entrainements/entrainement.entity";
import { Equipe } from "@/features/equipes/equipe.entity";
import { EvenementMatch } from "@/features/matchs/evenement-match.entity";
import { Joueur } from "@/features/joueurs/joueur.entity";
import { LigneClassement } from "@/features/classement/ligne-classement.entity";
import { Match } from "@/features/matchs/match.entity";
import { Saison } from "@/features/saisons/saison.entity";
import { StaffMatch } from "@/features/coachs/staff-match.entity";
import { DerivationService } from "@/features/derivation/derivation.service";
import { creerBaseTest, fabriques } from "@test/support/test-db";

describe("derivation : journees", () => {
  let ds: DataSource;
  let svc: DerivationService;
  let f: ReturnType<typeof fabriques>;

  beforeEach(async () => {
    ds = await creerBaseTest();
    f = fabriques(ds);
    const r = <T extends object>(e: new () => T) => ds.getRepository(e);
    svc = new DerivationService(
      r(Joueur), r(Match), r(LigneClassement), r(Entrainement), r(Blessure),
      r(Arbitre), r(ArbitreMatch), r(Coach), r(StaffMatch), r(Equipe), r(Saison), r(EvenementMatch),
    );
  });
  afterEach(() => ds.destroy());

  /** 14 dimanches consecutifs d'un seul club contre autant d'adversaires, toutes journees deja renseignees (calendrier FFF). */
  async function calendrierComplet() {
    const moi = await f.club("Mon club");
    const ids: string[] = [];
    for (let i = 1; i <= 14; i++) {
      const adv = await f.club(`Adversaire ${i}`);
      const jour = new Date(Date.UTC(2026, 8, 6 + (i - 1) * 7)).toISOString().slice(0, 10);   // un dimanche sur deux... toutes les semaines
      const m = await f.match({ clubDom: i % 2 ? moi.id : adv.id, clubExt: i % 2 ? adv.id : moi.id, date: jour, journee: String(i), competition: "D2", poule: "C", statut: i < 8 ? "joue" : "prevu" } as any);
      ids.push(m.id);
    }
    return ids;
  }

  it("ne touche jamais une journee deja renseignee, meme quand les dates donneraient un autre decoupage", async () => {
    const ids = await calendrierComplet();
    await (svc as any).recomputeJournees();
    const apres = await ds.getRepository(Match).find();
    expect(apres.map((m) => m.journee).sort((a, b) => Number(a) - Number(b))).toEqual(Array.from({ length: 14 }, (_, i) => String(i + 1)));
    expect(new Set(apres.map((m) => m.id))).toEqual(new Set(ids));
  });

  it("deduit seulement la journee des matchs qui n'en ont pas, sans changer les autres", async () => {
    await calendrierComplet();
    const matchs = ds.getRepository(Match);
    const sans = (await matchs.find({ order: { date: "ASC" } })).slice(2, 4);          // J3 et J4 : feuilles importees sans journee
    await matchs.update(sans.map((m) => m.id), { journee: null as any });
    await (svc as any).recomputeJournees();
    const apres = await matchs.find({ order: { date: "ASC" } });
    for (const m of apres) {
      const voulu = sans.some((s) => s.id === m.id) ? undefined : String(apres.indexOf(m) + 1);
      if (voulu) expect(m.journee).toBe(voulu);                                        // les autres : inchangees
      else expect((m.journee ?? "").length).toBeGreaterThan(0);                        // J3 et J4 : une journee a ete deduite
    }
  });

  it("une journee saisie a la main reste, meme si elle ne ressemble pas aux dates", async () => {
    const moi = await f.club("Mon club 2");
    const adv = await f.club("Adversaire X");
    const a = await f.match({ clubDom: moi.id, clubExt: adv.id, date: "2026-09-06", journee: "11", competition: "D2", poule: "C", statut: "joue" } as any);
    const b = await f.match({ clubDom: adv.id, clubExt: moi.id, date: "2026-09-13", journee: "3", competition: "D2", poule: "C", statut: "joue" } as any);
    await (svc as any).recomputeJournees();
    expect((await ds.getRepository(Match).findOneByOrFail({ id: a.id })).journee).toBe("11");
    expect((await ds.getRepository(Match).findOneByOrFail({ id: b.id })).journee).toBe("3");
  });
});
