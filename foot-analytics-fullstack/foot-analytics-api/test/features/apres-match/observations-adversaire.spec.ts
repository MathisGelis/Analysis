// Les observations de l'adversaire : validation contre le catalogue, synthese sur plusieurs matchs, et routes (acces, autosauvegarde par section).

import { BadRequestException } from "@nestjs/common";

import { CATALOGUE, sectionsRemplies, synthetiser, validerSection } from "@/features/apres-match/observations-adversaire";
import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

describe("validerSection", () => {
  it("le catalogue couvre toutes les sous-sections demandees", () => {
    expect(CATALOGUE.map((s) => s.id)).toEqual([
      "dispositif", "meilleurs_joueurs", "joueurs_faibles", "points_forts", "points_faibles", "sorties_de_balle", "gardien",
      "transitions", "structure_off", "structure_def", "pressing", "couloirs", "cpa_def", "cpa_off",
    ]);
    expect(CATALOGUE.find((s) => s.id === "gardien")!.champs.map((c) => c.id)).toEqual(["relances", "sorties_aeriennes", "un_contre_un", "remarque"]);
    expect(CATALOGUE.find((s) => s.id === "pressing")!.champs.map((c) => c.id)).toEqual(["declenchement", "efficacite", "zones", "remarque"]);
  });

  it("garde ce qui est valide, retire le vide, dedoublonne les choix et rogne le texte", () => {
    expect(validerSection("pressing", { declenchement: ["Touche", "Touche", "Passe en retrait"], efficacite: 4, zones: [], remarque: "  Haut et agressif  " }))
      .toEqual({ declenchement: ["Touche", "Passe en retrait"], efficacite: 4, remarque: "Haut et agressif" });
    expect(validerSection("dispositif", { en_possession: "4-3-3", sans_ballon: "" })).toEqual({ en_possession: "4-3-3" });
    expect(validerSection("couloirs", {})).toEqual({});
  });

  it("refuse une section ou un champ inconnu, un choix hors catalogue, une note hors 1 a 5, un texte trop long", () => {
    for (const [section, valeurs] of [
      ["inconnue", {}], ["pressing", { inconnu: ["Touche"] }], ["pressing", { declenchement: ["Au hasard"] }], ["dispositif", { en_possession: "9-9-9" }],
      ["pressing", { efficacite: 0 }], ["pressing", { efficacite: 3.5 }], ["pressing", { remarque: "x".repeat(301) }], ["pressing", []], ["pressing", null],
    ] as const) {
      expect(() => validerSection(section, valeurs)).toThrow(BadRequestException);
    }
  });

  it("joueurs : numeros de 1 a 99 sans doublon, trois au plus", () => {
    expect(validerSection("meilleurs_joueurs", { joueurs: [{ numero: 10, commentaire: " Gaucher " }, { numero: 7 }] }))
      .toEqual({ joueurs: [{ numero: 10, commentaire: "Gaucher" }, { numero: 7 }] });
    for (const joueurs of [[{ numero: 0 }], [{ numero: 100 }], [{ numero: 7 }, { numero: 7 }], [{ numero: 1 }, { numero: 2 }, { numero: 3 }, { numero: 4 }], [{ numero: "7" }]]) {
      expect(() => validerSection("meilleurs_joueurs", { joueurs })).toThrow(BadRequestException);
    }
  });
});

describe("synthetiser : plusieurs matchs contre le meme adversaire", () => {
  const obs = (matchId: string, date: string | null, valeurs: any) => ({ matchId, date, valeurs });

  it("compte les observations par valeur, moyenne les notes, garde le dernier commentaire d'un joueur", () => {
    const r = synthetiser([
      obs("m1", "2026-09-10", { pressing: { declenchement: ["Touche"], efficacite: 2 }, meilleurs_joueurs: { joueurs: [{ numero: 10, commentaire: "Ancien" }] } }),
      obs("m2", "2026-11-01", { pressing: { declenchement: ["Touche", "Passe en retrait"], efficacite: 5, remarque: "Plus haut" }, meilleurs_joueurs: { joueurs: [{ numero: 10, commentaire: "Récent" }, { numero: 7 }] } }),
      obs("m0", "2026-08-01", {}),
    ]);
    expect(r.matchs).toBe(2);
    expect(r.derniere).toBe("2026-11-01");
    const pressing = r.sections.find((s) => s.id === "pressing")!;
    expect(pressing.champs.find((c) => c.id === "declenchement")!.valeurs).toEqual([{ valeur: "Touche", matchs: 2 }, { valeur: "Passe en retrait", matchs: 1 }]);
    expect(pressing.champs.find((c) => c.id === "efficacite")!.moyenne).toBe(3.5);
    expect(pressing.champs.find((c) => c.id === "remarque")!.textes).toEqual([{ texte: "Plus haut", date: "2026-11-01" }]);
    const joueurs = r.sections.find((s) => s.id === "meilleurs_joueurs")!.champs[0].joueurs;
    expect(joueurs).toEqual([{ numero: 10, matchs: 2, commentaire: "Récent" }, { numero: 7, matchs: 1 }]);
    expect(r.sections.some((s) => s.id === "gardien")).toBe(false);                    // jamais de section vide
  });

  it("sans observation : rien", () => {
    expect(synthetiser([])).toEqual({ matchs: 0, derniere: null, sections: [] });
    expect(sectionsRemplies({ a: {}, b: { x: "1" } })).toBe(1);
  });
});

describe("observations de l'adversaire : routes", () => {
  let t: AppTest;
  let m: Monde;
  beforeAll(async () => { t = await creerAppTest(); m = await creerMonde(t); });
  afterAll(() => t.fermer());

  const ref = () => t.compte({ login: `RO${Math.random().toString(36).slice(2, 7)}`, role: "referent", clubId: m.ol.id });
  const base = (id: string) => `/apres-match/matchs/${id}/adversaire`;
  const matchJoue = () => t.f.match({ clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: m.sen26.id, equipeExtId: m.mionsSen26.id, saisonId: m.s26.id, date: "2026-11-22", statut: "joue", scoreDom: 1, scoreExt: 0 } as any);

  it("catalogue et avancement, puis une section enregistree sans toucher les autres, effacee quand elle est videe", async () => {
    const mt = await matchJoue();
    const a = t.appel(await ref());
    const vide = (await a("GET", base(mt.id))).corps;
    expect(vide.catalogue).toHaveLength(14);
    expect(vide).toMatchObject({ valeurs: {}, avancement: { sections: 0, total: 14 }, adversaireId: m.mions.id });

    expect((await a("PUT", `${base(mt.id)}/pressing`, { declenchement: ["Touche"], efficacite: 4 })).statut).toBe(200);
    await a("PUT", `${base(mt.id)}/gardien`, { un_contre_un: "Faible" });
    let etat = (await a("GET", base(mt.id))).corps;
    expect(etat.valeurs).toEqual({ pressing: { declenchement: ["Touche"], efficacite: 4 }, gardien: { un_contre_un: "Faible" } });
    expect(etat.avancement.sections).toBe(2);

    await a("PUT", `${base(mt.id)}/pressing`, { declenchement: ["Touche", "Passe en retrait"] });     // remplace la section, pas les autres
    expect((await a("GET", base(mt.id))).corps.valeurs.pressing).toEqual({ declenchement: ["Touche", "Passe en retrait"] });
    await a("PUT", `${base(mt.id)}/gardien`, {});                                                     // videe : effacee
    etat = (await a("GET", base(mt.id))).corps;
    expect(Object.keys(etat.valeurs)).toEqual(["pressing"]);
  });

  it("refuse une saisie invalide (400), un match a venir (409), un autre club (403) et une personne non connectee (401)", async () => {
    const mt = await matchJoue();
    const a = t.appel(await ref());
    expect((await a("PUT", `${base(mt.id)}/pressing`, { declenchement: ["Au hasard"] })).statut).toBe(400);
    expect((await a("PUT", `${base(mt.id)}/inconnue`, {})).statut).toBe(400);
    const aVenir = await t.f.match({ clubDom: m.ol.id, clubExt: m.mions.id, equipeDomId: m.sen26.id, saisonId: m.s26.id, date: "2026-12-22", statut: "prevu", scoreDom: 0, scoreExt: 0 } as any);
    expect((await a("GET", base(aVenir.id))).statut).toBe(409);
    const tiers = await t.f.club("Club Tiers Observations");
    const intrus = await t.compte({ login: "ROTIERS1", role: "referent", clubId: tiers.id });
    expect((await t.appel(intrus)("GET", base(mt.id))).statut).toBe(403);
    expect((await t.appel()("GET", base(mt.id))).statut).toBe(401);
  });

  it("le dispositif observe de l'adversaire apparait sur la fiche du match, sans écraser un dispositif saisi à la main", async () => {
    const mt = await matchJoue();                                                                  // nous = OL, a domicile : l'adversaire est le visiteur
    const a = t.appel(await ref());
    const fiche = async () => (await a("GET", `/matchs/${mt.id}`)).corps;
    const nous0 = (await fiche()).formationDom;
    await a("PUT", `${base(mt.id)}/dispositif`, { en_possession: "4-3-3", sans_ballon: "5-3-2" });
    expect(await fiche()).toMatchObject({ formationExt: "4-3-3", formationDom: nous0 });             // avec le ballon d'abord ; jamais notre cote
    await a("PUT", `${base(mt.id)}/dispositif`, { en_possession: "3-5-2" });                       // corrige : suit
    expect((await fiche()).formationExt).toBe("3-5-2");
    await a("PUT", `${base(mt.id)}/dispositif`, { sans_ballon: "5-4-1" });                         // sans le ballon seulement : sert a defaut
    expect((await fiche()).formationExt).toBe("5-4-1");
    await a("PUT", `${base(mt.id)}/dispositif`, { en_possession: "Autre" });                        // « Autre » n'est pas un dispositif
    expect((await fiche()).formationExt).toBeNull();                                                // l'observation retire ce qu'elle avait reporte
    await a("PUT", `${base(mt.id)}/dispositif`, { en_possession: "4-4-2" });
    expect((await fiche()).formationExt).toBe("4-4-2");
    await a("PATCH", `/matchs/${mt.id}/dispositifs`, { formationExt: "4-1-4-1" });                  // saisi a la main : l'observation n'y touche plus
    await a("PUT", `${base(mt.id)}/dispositif`, { en_possession: "4-3-3" });
    expect((await fiche()).formationExt).toBe("4-1-4-1");
    await a("PUT", `${base(mt.id)}/dispositif`, {});
    expect((await fiche()).formationExt).toBe("4-1-4-1");
  });

  it("vu du visiteur, l'adversaire est le recevant", async () => {
    const mt = await matchJoue();
    const visiteur = await t.compte({ login: `ROV${Math.random().toString(36).slice(2, 5)}`, role: "referent", clubId: m.mions.id });
    const ext0 = (await t.appel(visiteur)("GET", `/matchs/${mt.id}`)).corps.formationExt;
    await t.appel(visiteur)("PUT", `${base(mt.id)}/dispositif`, { en_possession: "4-2-3-1" });
    expect((await t.appel(visiteur)("GET", `/matchs/${mt.id}`)).corps).toMatchObject({ formationDom: "4-2-3-1", formationExt: ext0 });
  });

  it("le club adverse ne voit pas mes observations : elles restent privees a mon club", async () => {
    const mt = await matchJoue();
    await t.appel(await ref())("PUT", `${base(mt.id)}/points_forts`, { atouts: ["Vitesse"] });
    const adverse = await t.compte({ login: "ROMIONS1", role: "referent", clubId: m.mions.id });
    const r = (await t.appel(adverse)("GET", base(mt.id))).corps;
    expect(r.valeurs).toEqual({});                                // son propre carnet, vide : jamais celui du club adverse
    expect(r.adversaireId).toBe(m.ol.id);
  });
});
