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
import { creerBaseTest, fabriques } from "@test/support/test-db";
import { DerivationService } from "@/features/derivation/derivation.service";

describe("DerivationService : les cartons du staff ne sont pas des cartons de joueurs", () => {
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

  it("un carton du coach (ni joueur de la feuille, mais membre de l'encadrement du bon cote) est reclasse, une seule fois", async () => {
    const dom = await f.club("Dom");
    const ext = await f.club("Ext");
    const m = await f.match({ clubDom: dom.id, clubExt: ext.id, statut: "joue", scoreDom: 1, scoreExt: 0 });
    await f.compo({ matchId: m.id, cote: "dom", nom: "LUDENOZ", prenom: "Dofufulik", licence: "222" });
    const coach = await ds.getRepository(Coach).save({ id: "coach-1", nom: "BUVORAS", prenom: "Nadi", licence: "900", clubId: dom.id } as any);
    await ds.getRepository(StaffMatch).save({ id: "sm-1", matchId: m.id, coachId: coach.id, cote: "dom", fonctions: "E" } as any);
    await f.evenement({ matchId: m.id, type: "carton", sousType: "rouge", equipe: "dom", joueur: "BUVORAS Nadi", motif: "Contestation" });
    await f.evenement({ matchId: m.id, type: "carton", sousType: "jaune", equipe: "dom", joueur: "LUDENOZ Dofufulik", motif: "Antisportif" });
    // Meme nom que le coach, mais chez l'adversaire : un carton de joueur de l'autre equipe n'est pas touche.
    await f.evenement({ matchId: m.id, type: "carton", sousType: "jaune", equipe: "ext", joueur: "BUVORAS Nadi", motif: "Antisportif" });

    expect(await svc.reclasserCartonsStaff()).toBe(1);
    const evts = await ds.getRepository(EvenementMatch).find({ where: { matchId: m.id } });
    expect(evts.filter((e) => e.type === "carton_staff").map((e) => e.joueur)).toEqual(["BUVORAS Nadi"]);
    expect(evts.filter((e) => e.type === "carton")).toHaveLength(2);
    expect(await svc.reclasserCartonsStaff()).toBe(0);                      // idempotent

    // Le carton est credite au coach, et plus aux joueurs.
    await svc.recomputeCoachs();
    const c = await ds.getRepository(Coach).findOneByOrFail({ id: "coach-1" });
    expect(c.cartonsRouges).toBe(1);
  });
});
