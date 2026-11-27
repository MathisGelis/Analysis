import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ChoixJoueur } from "@/features/direct/components/ChoixJoueur";
import { postesDuDispositif, TerrainCompo } from "@/features/direct/components/TerrainCompo";
import type { SlotCompo } from "@/features/direct/lib/compo-direct";
import type { JoueurDirect } from "@/features/direct/lib/direct-types";

const j = (n: number): JoueurDirect => ({ id: `j${n}`, nom: `Nom${n}`, prenom: null, poste: null, numero: n, role: "titulaire" });
const slots: SlotCompo[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((n) => ({ joueur: j(n), expulse: n === 6 }));

describe("postes du terrain", () => {
  it("un poste par joueur, le gardien en bas, l'attaque en haut ; le losange a un seul milieu défensif et un meneur", () => {
    const p = postesDuDispositif("4-1-2-1-2");
    expect(p).toHaveLength(11);
    expect(p[0].y).toBeGreaterThan(p[10].y);
    expect(p.filter((x) => x.y === p[5].y)).toHaveLength(1);              // le pivot, seul sur sa ligne
    expect(p[5].x).toBe(50);
  });
});

describe("compo visuelle", () => {
  it("un joueur expulsé est grisé avec son carton, et ne se choisit plus ; un joueur inactif non plus", () => {
    const html = renderToStaticMarkup(<TerrainCompo formation="4-2-3-1" slots={slots} inactifs={(_, s) => s.joueur?.numero === 9} onChoisir={() => {}} />);
    expect(html).toContain("6 Nom6, expulsé");
    expect(html).toMatch(/disabled=""[^>]*aria-label="6 Nom6, expulsé"|aria-label="6 Nom6, expulsé"[^>]*disabled=""/);
    expect(html).toMatch(/aria-label="9 Nom9, indisponible"[^>]*disabled=""|disabled=""[^>]*aria-label="9 Nom9, indisponible"/);
    expect(html).not.toMatch(/aria-label="10 Nom10[^"]*"[^>]*disabled=""/);
  });
});

describe("choix d'un joueur", () => {
  const choisi = { numero: null, nom: null, id: null };
  it("avec une compo : le terrain, sans liste de remplaçants ni « Autre joueur »", () => {
    const html = renderToStaticMarkup(<ChoixJoueur joueurs={[...slots.map((s) => s.joueur!), { ...j(12), role: "remplacant" }]} adversaire={false} choisi={choisi} onChoisir={() => {}}
      compo={{ formation: "4-2-3-1", slots, banc: [], sortis: [] }} />);
    expect(html).toContain('data-testid="terrain-compo"');
    expect(html).not.toContain("Remplaçants");
    expect(html).not.toContain("Autre joueur");
    expect(html).toContain("Joueur inconnu");
  });
  it("sans compo (avant-match non fait) : la liste habituelle", () => {
    const html = renderToStaticMarkup(<ChoixJoueur joueurs={slots.map((s) => s.joueur!)} adversaire={false} choisi={choisi} onChoisir={() => {}} />);
    expect(html).not.toContain("terrain-compo");
    expect(html).toContain("Nom1");
  });
  it("l'adversaire garde son pavé numérique", () => {
    expect(renderToStaticMarkup(<ChoixJoueur joueurs={[]} adversaire choisi={choisi} onChoisir={() => {}} compo={{ formation: "4-4-2", slots, banc: [], sortis: [] }} />)).toContain("Numéro de maillot adverse");
  });
});
