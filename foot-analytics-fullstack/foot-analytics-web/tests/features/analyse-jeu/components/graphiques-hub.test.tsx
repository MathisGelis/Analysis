import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Lectures, SectionAdversaires, SectionProfil } from "@/features/analyse-jeu/components/AnalysesHub";
import { BarresH, BarresTranches, Camembert, CarteValeurs, CourbesMatchs, Radar } from "@/features/analyse-jeu/components/graphiques";
import type { AnalysesHub } from "@/features/analyse-jeu/lib/data-hub-types";

describe("graphiques du Data Hub", () => {
  it("camembert : une tranche par part, une legende avec les pourcentages, un resume pour les lecteurs d'ecran ; rien a repartir : un message", () => {
    const html = renderToStaticMarkup(<Camembert titre="Dispositifs" parts={[{ libelle: "4-4-2", valeur: 3 }, { libelle: "4-3-3", valeur: 1 }]} />);
    expect(html).toContain("<path");
    expect(html.match(/<path/g)).toHaveLength(2);
    expect(html).toContain("75 %");
    expect(html).toContain("Dispositifs : 4-4-2 75 %, 4-3-3 25 %.");
    expect(renderToStaticMarkup(<Camembert titre="x" parts={[{ libelle: "a", valeur: 0 }]} />)).toContain("Rien à répartir");
  });

  it("barres, tranches, radar, courbes et carte : alternative textuelle pour chacun", () => {
    expect(renderToStaticMarkup(<BarresH titre="Points" lignes={[{ libelle: "4-4-2", valeur: 2, texte: "2 pts" }]} />)).toContain("4-4-2 : 2 pts");
    const t = renderToStaticMarkup(<BarresTranches titre="xG" noms={["0–15", "15–30"]} pour={[0.5, 0]} contre={[0, 1.2]} format={(x) => x.toFixed(1)} />);
    expect(t).toContain("0–15 minutes, Nous 0.5, Adversaire 0.0");
    const r = renderToStaticMarkup(<Radar titre="Profil" axes={["Création", "Défense", "Volume"]} base={[100, 100, 100]} recent={[120, null, 90]} legende={["Saison", "5 derniers"]} />);
    expect(r).toContain("Création 120, Défense inconnu, Volume 90");
    const c = renderToStaticMarkup(<CourbesMatchs titre="xG" noms={["01/10", "08/10"]} pour={[0.4, 1.1]} contre={[1.0, null]} />);
    expect(c).toContain("<polyline");
    expect(c).toContain("01/10, Créé 0,40, Concédé 1,00");
    expect(renderToStaticMarkup(<CourbesMatchs titre="xG" noms={["a"]} pour={[null]} contre={[null]} />)).toContain("Aucun match saisi");
    const z = renderToStaticMarkup(<CarteValeurs valeurs={[...Array(15).fill(0).map((_, i) => (i === 2 ? 0.5 : 0))]} nom="xG créé" />);
    expect(z).toContain("offensif centre 0,50");
  });
});

const analyses = (extra: Partial<AnalysesHub> = {}): AnalysesHub => ({
  matchsSaisis: 6,
  dispositifs: {
    couverture: { avec: 4, total: 6 }, repartition: [{ formation: "4-4-2", matchs: 3 }, { formation: "3-5-2", matchs: 1 }],
    lignes: [{ formation: "4-4-2", matchs: 3, v: 0, n: 1, d: 2, ptsParMatch: 0.33, bpParMatch: 0.7, bcParMatch: 2, saisis: 3, tirsPour: 12, tirsContre: 20, xgPour: 1.6, xgContre: 3.9, xgDiffParMatch: -0.77, conversionAdv: 30, butsAdvMoinsXg: 2.1, fiabilite: "moyenne" }],
    reponses: [{ adverse: "4-4-2", nous: "4-3-3", matchs: 2, ptsParMatch: 1.5 }],
  },
  creation: { tirs: 0, buts: 0, xg: 0, zones: { tirs: [], buts: [], xg: [], sansZone: 0 }, couloirs: [], familles: [], qualite: [], grosses: { total: 0, marquees: 0 }, reseau: [] },
  concession: { tirs: 0, buts: 0, xg: 0, zones: { tirs: [], buts: [], xg: [], sansZone: 0 }, couloirs: [], familles: [], qualite: [], grosses: { total: 0, marquees: 0 }, reseau: [], gardien: null },
  score: { matchs: 0, etats: [] }, rythme: { tirsPour: [], tirsContre: [], xgPour: [], xgContre: [], butsPour: [], butsContre: [], fautes: [], cartons: { pour: [], contre: [] } },
  profil: { recents: 5, indicateurs: [{ cle: "butsPour", libelle: "Buts marqués par match", saison: 1, recent: 2, meilleurSiHaut: true, unite: "" }, { cle: "butsContre", libelle: "Buts encaissés par match", saison: 1, recent: 2, meilleurSiHaut: false, unite: "" }],
    radar: [{ axe: "Création", saison: 100, recent: 120 }, { axe: "Défense", saison: 100, recent: 80 }, { axe: "Volume", saison: 100, recent: null }] },
  dependances: { buts: 8, buteur: { joueurId: "p9", buts: 5, part: 63 }, passeur: null, partCpa: 25, partTransition: null },
  constats: [], ...extra,
});

describe("sections d'analyse", () => {
  it("lectures : titre, detail, piste et niveau de fiabilite ; vide : le message demande", () => {
    const html = renderToStaticMarkup(<Lectures constats={[{ id: "x", domaine: "creation", ton: "alerte", titre: "Des occasions perdues", detail: "5 buts pour 8 xG", piste: "Travailler la finition", fiabilite: "bonne" }]} />);
    for (const t of ["Des occasions perdues", "5 buts pour 8 xG", "Travailler la finition", "Fiabilité bonne", "●●●"]) expect(html).toContain(t);
    expect(renderToStaticMarkup(<Lectures constats={[]} vide="Rien à signaler" />)).toContain("Rien à signaler");
    expect(renderToStaticMarkup(<Lectures constats={[]} />)).toBe("");
  });

  it("dispositifs affrontes : couverture dite, camembert, points par match, efficacite de l'adversaire, meilleure reponse", () => {
    const html = renderToStaticMarkup(<SectionAdversaires a={analyses()} />);
    expect(html).toContain("4 matchs sur 6");
    expect(html).toContain("Les dispositifs qu&#x27;on affronte");
    expect(html).toContain("4-4-2 · 3 matchs");
    expect(html).toContain("0,33 pts · 0V 1N 2D");
    expect(html).toContain("Leur efficacité contre nous");
    expect(html).toContain("Notre meilleure réponse");
    expect(html).toContain("4-3-3");
    const sans = renderToStaticMarkup(<SectionAdversaires a={analyses({ dispositifs: { couverture: { avec: 0, total: 6 }, repartition: [], lignes: [], reponses: [] } })} />);
    expect(sans).toContain("Aucun dispositif adverse saisi");
  });

  it("profil : radar, tendance (progres et recul), dependances nommees", () => {
    const html = renderToStaticMarkup(<SectionProfil a={analyses()} noms={{ p9: "Luc Durand" }} />);
    expect(html).toContain("Création 120, Défense 80, Volume inconnu");
    expect(html).toContain("en progrès");                       // buts marques : 1 -> 2
    expect(html).toContain("en recul");                         // buts encaisses : 1 -> 2
    expect(html).toContain("Meilleur buteur : Luc Durand");
    expect(html).toContain("63 % (5/8)");
    const peu = renderToStaticMarkup(<SectionProfil a={analyses({ profil: { recents: 2, indicateurs: [], radar: [] }, dependances: null })} noms={{}} />);
    expect(peu).toContain("au moins 3 matchs");
    expect(peu).toContain("Pas assez de buts saisis");
  });
});
