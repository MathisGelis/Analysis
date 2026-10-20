// Reconstruction : seules les fiches qui changent sont reecrites. Sur la base hebergee chaque ecriture est un
// aller-retour reseau : reecrire tous les joueurs a chaque import faisait grossir la reconstruction avec la base.

import { DerivationService, lignesModifiees } from "@/features/derivation/derivation.service";
import { AppTest, creerAppTest } from "@test/support/app-test";
import { creerMonde, Monde } from "@test/support/monde";

describe("lignesModifiees", () => {
  const colonnes = ["nom", "matchs", "fatigueDetail", "equipesAttachees"];
  const existant = { id: "a", nom: "DURAND", matchs: 3, fatigueDetail: JSON.stringify({ niveau: "bas", calculeLe: "2026-10-01T00:00:00Z" }), equipesAttachees: ["e1"] };

  it("ignore l'horodatage du detail de fatigue, null/undefined et les champs hors colonnes", () => {
    const recalcule = { ...existant, fatigueDetail: JSON.stringify({ niveau: "bas", calculeLe: "2026-10-20T09:00:00Z" }), equipesAttachees: ["e1"], scoreDiscipline: 90 };
    expect(lignesModifiees([recalcule], () => existant, colonnes)).toEqual([]);
    expect(lignesModifiees([{ id: "b", nom: "X", matchs: undefined }], () => ({ id: "b", nom: "X", matchs: null }), colonnes)).toEqual([]);
  });

  it("garde une ligne dont une colonne change, et toute ligne nouvelle", () => {
    expect(lignesModifiees([{ ...existant, matchs: 4 }], () => existant, colonnes)).toHaveLength(1);
    expect(lignesModifiees([{ ...existant, fatigueDetail: JSON.stringify({ niveau: "haut", calculeLe: "x" }) }], () => existant, colonnes)).toHaveLength(1);
    expect(lignesModifiees([{ nom: "NOUVEAU" }], () => undefined, colonnes)).toHaveLength(1);
  });
});

describe("recomputeJoueurs : ecritures minimales", () => {
  let t: AppTest;
  let m: Monde;
  beforeAll(async () => {
    t = await creerAppTest();
    m = await creerMonde(t);
    await t.f.compo({ matchId: m.m26.id, cote: "dom", numero: 9, nom: "DURAND", prenom: "Luc", licence: "LICOL0001" });
    await t.f.compo({ matchId: m.m26.id, cote: "ext", numero: 4, nom: "MARTIN", prenom: "Paul", licence: "LICMI0002" });
  });
  afterAll(() => t.fermer());

  it("une seconde reconstruction sans changement ne reecrit aucun joueur ; un nouveau match ne reecrit que ses joueurs", async () => {
    const svc = t.app.get(DerivationService);
    const premier = await svc.recomputeJoueurs();
    expect(premier.joueursModifies).toBeGreaterThan(0);
    expect((await svc.recomputeJoueurs()).joueursModifies).toBe(0);

    await t.f.compo({ matchId: m.m25.id, cote: "dom", numero: 9, nom: "DURAND", prenom: "Luc", licence: "LICOL0001" });
    const apres = await svc.recomputeJoueurs();
    expect(apres.joueursModifies).toBe(1);
  });
});
