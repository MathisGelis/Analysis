import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { BandeauAlertes } from "@/features/direct/components/BandeauAlertes";
import { alertesDirect } from "@/features/direct/lib/alertes-direct";
import type { EtatCompo } from "@/features/direct/lib/compo-direct";
import type { EvenementDirect, JoueurDirect } from "@/features/direct/lib/direct-types";

const j = (n: number, fatigue: number | null = null): JoueurDirect => ({ id: `j${n}`, nom: `Nom${n}`, prenom: null, poste: null, numero: n, role: "titulaire", fatigue });
let k = 0;
const ev = (e: Partial<EvenementDirect>): EvenementDirect => ({
  id: `e${++k}`, cote: "dom", type: "faute", resultat: null, periode: 1, minute: 10, joueurNumero: null, joueurNom: null, joueurId: null, joueur2Numero: null, joueur2Nom: null, joueur2Id: null,
  zoneTier: null, zoneCouloir: null, zoneCadre: null, contextes: [], ...e,
});
const joueur4 = { joueurNumero: 4, joueurNom: "Nom4", joueurId: "j4" };
const alertes = (evenements: EvenementDirect[], extra: object = {}) => alertesDirect({ evenements, nousCote: "dom", minute: 40, compo: null, joueurs: [], ...extra });

describe("alertes du direct", () => {
  it("un joueur déjà averti qui refait faute : alerte, qui s'aggrave à chaque faute (son identifiant change)", () => {
    const base = [ev({ type: "carton_jaune", minute: 10, ...joueur4 }), ev({ type: "faute", minute: 20, ...joueur4 })];
    const a1 = alertes(base);
    expect(a1).toHaveLength(1);
    expect(a1[0]).toMatchObject({ niveau: "alerte", titre: expect.stringContaining("est averti et refait faute") });
    const a2 = alertes([...base, ev({ type: "faute", minute: 25, ...joueur4 })]);
    expect(a2[0].id).not.toBe(a1[0].id);
  });

  it("une faute avant le jaune ne déclenche rien ; trois fautes sans carton : attention ; un expulsé n'alerte plus", () => {
    expect(alertes([ev({ type: "faute", minute: 5, ...joueur4 }), ev({ type: "carton_jaune", minute: 10, ...joueur4 })])).toEqual([]);
    const trois = alertes([5, 8, 12].map((m) => ev({ minute: m, ...joueur4 })));
    expect(trois).toHaveLength(1);
    expect(trois[0]).toMatchObject({ niveau: "attention", titre: "n°4 Nom4 : 3 fautes sans carton" });
    expect(alertes([ev({ type: "carton_jaune", ...joueur4 }), ev({ minute: 20, ...joueur4 }), ev({ type: "carton_rouge", minute: 30, ...joueur4 })]).map((a) => a.id)).not.toContain(expect.stringContaining("jaune-faute"));
  });

  it("les fautes de l'adversaire ne comptent pas", () => {
    expect(alertes([5, 8, 12].map((m) => ev({ cote: "ext", minute: m, ...joueur4 })))).toEqual([]);
  });

  it("fatigue élevée d'un joueur sur le terrain, après la 30e minute seulement", () => {
    const compo: EtatCompo = { formation: "4-4-2", slots: [{ joueur: j(6, 80), expulse: false }, { joueur: j(7, 40), expulse: false }, { joueur: j(8, 90), expulse: true }], banc: [], sortis: [] };
    const a = alertes([], { compo });
    expect(a.map((x) => x.titre)).toEqual(["n°6 Nom6 : fatigue élevée"]);               // le 8 est expulsé, le 7 est frais
    expect(alertes([], { compo, minute: 20 })).toEqual([]);
  });

  it("une série de tirs adverses cadrés dans les 10 dernières minutes", () => {
    const tir = (m: number, resultat: string) => ev({ cote: "ext", type: "tir", resultat, minute: m });
    expect(alertes([tir(32, "cadre"), tir(35, "non_cadre"), tir(38, "cadre")])[0]).toMatchObject({ niveau: "alerte", titre: expect.stringContaining("3 tirs en 10 minutes") });
    expect(alertes([tir(10, "cadre"), tir(12, "cadre"), tir(14, "cadre")])).toEqual([]);              // trop ancien
    expect(alertes([tir(32, "non_cadre"), tir(35, "non_cadre"), tir(38, "cadre")])).toEqual([]);     // un seul cadré
  });

  it("un rouge de chez nous : on joue à 10, avec l'invitation à changer de système", () => {
    const a = alertes([ev({ type: "carton_rouge", minute: 30, joueurNumero: 6, joueurNom: "Nom6" })]);
    expect(a[0]).toMatchObject({ niveau: "alerte", titre: "On joue à 10" });
    expect(a[0].detail).toContain("changement de système");
  });
});

describe("bandeau d'alertes", () => {
  it("affiche au plus trois alertes, les plus graves d'abord, chacune avec son bouton pour la fermer", () => {
    const toutes = [
      { id: "a1", niveau: "attention" as const, titre: "Attention 1", detail: "d" }, { id: "a2", niveau: "alerte" as const, titre: "Alerte 2", detail: "d" },
      { id: "a3", niveau: "attention" as const, titre: "Attention 3", detail: "d" }, { id: "a4", niveau: "attention" as const, titre: "Attention 4", detail: "d" },
    ];
    const html = renderToStaticMarkup(<BandeauAlertes alertes={toutes} />);
    expect(html.indexOf("Alerte 2")).toBeLessThan(html.indexOf("Attention 1"));
    expect(html).not.toContain("Attention 4");
    expect(html).toContain("+ 1 autre alerte");
    expect(html).toContain("Fermer l&#x27;alerte : Alerte 2");
  });
  it("rien à afficher : rien", () => { expect(renderToStaticMarkup(<BandeauAlertes alertes={[]} />)).toBe(""); });
});
