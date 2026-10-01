// src/testing/monde.ts
//
// Un petit championnat pour les tests d'acces : deux clubs (le mien, "OL", et un adversaire, "Mions"), trois saisons
// (2024-2025 et 2025-2026 passees, 2026-2027 actuelle), les equipes, un match par saison, des joueurs, des seances,
// des blessures et un classement. Les saisons passees sont celles qu'un educateur restreint ne doit pas voir.

import { Blessure, Entrainement, LigneClassement } from "@/entities";
import { AppTest } from "@/testing/app-test";

export async function creerMonde(t: AppTest) {
  const { f, ds } = t;
  const ol = await f.club("OL Sud");
  const mions = await f.club("Mions");
  const s24 = await f.saison("2024-2025", 2024, { actif: false });
  const s25 = await f.saison("2025-2026", 2025, { actif: false });
  const s26 = await f.saison("2026-2027", 2026, { actif: true });

  const equipe = (clubId: string, saisonId: string, poule: string, extra: Record<string, string> = {}) => f.equipe({
    clubId, saisonId, nom: `${extra.categorie ?? "Seniors"} ${extra.division ?? "D2"} Poule ${poule}`,
    categorie: "Seniors", division: "D2", poule, competitionLibelle: "Seniors D2 / Phase Unique", ...extra,
  });
  const sen24 = await equipe(ol.id, s24.id, "B");
  const sen25 = await equipe(ol.id, s25.id, "C");
  const sen26 = await equipe(ol.id, s26.id, "A");
  const u20 = await equipe(ol.id, s26.id, "B", { categorie: "U20", division: "R2", competitionLibelle: "U20 R2" });
  const mionsSen24 = await equipe(mions.id, s24.id, "B");
  const mionsSen25 = await equipe(mions.id, s25.id, "C");
  const mionsSen26 = await equipe(mions.id, s26.id, "A");

  const match = (saison: { id: string }, dom: any, ext: any, date: string, extra: Record<string, unknown> = {}) => f.match({
    clubDom: ol.id, clubExt: mions.id, equipeDomId: dom.id, equipeExtId: ext.id, saisonId: saison.id,
    date, statut: "joue", scoreDom: 2, scoreExt: 1, numeroFmi: `fmi-${date}`, ...extra,
  } as any);
  const m24 = await match(s24, sen24, mionsSen24, "2024-10-06");
  const m25 = await match(s25, sen25, mionsSen25, "2025-10-05");
  const m26 = await match(s26, sen26, mionsSen26, "2026-10-04");
  const mU20 = await f.match({
    clubDom: ol.id, clubExt: mions.id, equipeDomId: u20.id, saisonId: s26.id, date: "2026-10-11", statut: "prevu",
  } as any);

  const joueurOl = await f.joueur({
    nom: "DURAND", prenom: "Luc", clubId: ol.id, commentaire: "gaucher, rapide", tailleCm: 181,
    scoreFatigue: 70, buts: 4, matchs: 12,
  } as any);
  const joueurMions = await f.joueur({
    nom: "MARTIN", prenom: "Paul", clubId: mions.id, commentaire: "note privee de Mions", tailleCm: 178, buts: 2, matchs: 9,
  } as any);

  const bles = ds.getRepository(Blessure);
  const blessure26 = await bles.save(bles.create({ joueurId: joueurOl.id, joueurNom: "DURAND Luc", localisation: "Cheville", dateDebut: "2026-09-20", statut: "Indisponible" }));
  const blessure24 = await bles.save(bles.create({ joueurId: joueurOl.id, joueurNom: "DURAND Luc", localisation: "Genou", dateDebut: "2024-11-02", retourEstime: "2024-12-02", statut: "Retabli" }));
  const blessureMions = await bles.save(bles.create({ joueurId: joueurMions.id, joueurNom: "MARTIN Paul", localisation: "Epaule", dateDebut: "2026-09-25", statut: "Indisponible" }));

  const ent = ds.getRepository(Entrainement);
  const seance = (equipeId: string, date: string) => ent.save(ent.create({ equipeId, date, type: "Tactique", dureeMin: 90, intensite: 6, charge: 400 }));
  const seanceSen26 = await seance(sen26.id, "2026-10-01");
  const seanceU20 = await seance(u20.id, "2026-10-02");
  const seanceSen25 = await seance(sen25.id, "2025-10-01");
  const seanceMions = await seance(mionsSen26.id, "2026-10-03");

  const cl = ds.getRepository(LigneClassement);
  const ligne = (clubId: string, equipeId: string, saisonId: string, rang: number) =>
    cl.save(cl.create({ clubId, equipeId, saisonId, rang, joues: 5, v: 3, n: 1, d: 1, bp: 9, bc: 5, pts: 10, forme: ["V", "N"] }));
  await ligne(ol.id, sen24.id, s24.id, 1); await ligne(ol.id, sen25.id, s25.id, 2); await ligne(ol.id, sen26.id, s26.id, 3);

  return {
    ol, mions, s24, s25, s26, sen24, sen25, sen26, u20, mionsSen24, mionsSen25, mionsSen26,
    m24, m25, m26, mU20, joueurOl, joueurMions, blessure26, blessure24, blessureMions,
    seanceSen26, seanceU20, seanceSen25, seanceMions,
  };
}
export type Monde = Awaited<ReturnType<typeof creerMonde>>;
