// Le classement suit les matchs : un score saisi, modifie ou supprime depuis l'API le recalcule tout de suite (avant, il
// restait celui du dernier import FMI).

import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

describe("API : le classement suit les ecritures de matchs", () => {
  let t: AppTest;
  let m: Monde;
  beforeEach(async () => { t = await creerAppTest(); m = await creerMonde(t); });
  afterEach(() => t.fermer());

  const ligne = async (admin: { jeton: string }, equipeId: string) =>
    ((await t.appel(admin)("GET", "/classement")).corps as any[]).find((l) => l.equipeId === equipeId);

  it("un score modifie, un match cree puis supprime : la ligne est recalculee", async () => {
    const admin = await t.compte({ login: "AADMIN", role: "admin" });
    const appel = t.appel(admin);

    // Modification : le match de la saison courante passe de 2-1 a 0-3.
    expect((await appel("PATCH", `/matchs/${m.m26.id}`, { scoreDom: 0, scoreExt: 3 })).statut).toBe(200);
    expect(await ligne(admin, m.sen26.id)).toMatchObject({ joues: 1, v: 0, d: 1, bp: 0, bc: 3, pts: 0, rang: 2 });
    expect(await ligne(admin, m.mionsSen26.id)).toMatchObject({ joues: 1, v: 1, pts: 3, rang: 1 });

    // Creation d'un second match joue, gagne par mon equipe.
    const cree = await appel("POST", "/matchs", {
      clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: m.sen26.id, equipeExtId: m.mionsSen26.id, saisonId: m.s26.id,
      date: "2026-10-18", journee: "2", scoreDom: 4, scoreExt: 0, statut: "joue",
    });
    expect(cree.statut).toBe(201);
    expect(await ligne(admin, m.sen26.id)).toMatchObject({ joues: 2, v: 1, d: 1, bp: 4, bc: 3, pts: 3, forme: ["D", "V"] });

    // Suppression : on revient a un seul match.
    expect((await appel("DELETE", `/matchs/${cree.corps.id}`)).statut).toBe(200);
    expect(await ligne(admin, m.sen26.id)).toMatchObject({ joues: 1, pts: 0 });
  });
});
