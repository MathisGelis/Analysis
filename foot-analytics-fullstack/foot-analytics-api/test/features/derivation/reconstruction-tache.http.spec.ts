// Reconstruction en tache de fond par HTTP : 202 tout de suite, puis l'etat se lit jusqu'a la fin.

import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

describe("POST /derivation/rebuild/tache", () => {
  let t: AppTest;
  let m: Monde;
  beforeAll(async () => { t = await creerAppTest(); m = await creerMonde(t); });
  afterAll(() => t.fermer());

  it("rend 202 et un identifiant, puis l'etat termine avec le resultat ; une tache inconnue : 404 ; sans connexion : 401", async () => {
    const referent = await t.compte({ login: "RTACHE", role: "referent", clubId: m.ol.id });
    const appeler = t.appel(referent);
    const lance = await appeler("POST", "/derivation/rebuild/tache");
    expect(lance.statut).toBe(202);
    expect(lance.corps).toMatchObject({ id: expect.any(String), statut: "en_cours" });

    let etat: any = null;
    for (let i = 0; i < 100 && etat?.statut !== "terminee"; i++) {
      etat = (await appeler("GET", `/derivation/rebuild/tache/${lance.corps.id}`)).corps;
      if (etat.statut === "echec") break;
      await new Promise((r) => setTimeout(r, 50));
    }
    expect(etat).toMatchObject({ statut: "terminee", erreur: null, resultat: { ok: true } });

    expect((await appeler("GET", "/derivation/rebuild/tache/inconnue")).statut).toBe(404);
    expect((await t.appel()("POST", "/derivation/rebuild/tache")).statut).toBe(401);
  });
});
