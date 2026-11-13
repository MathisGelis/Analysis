import { describe, expect, it } from "vitest";

import {
  adressePlausible, bilanFff, derniereSynchro, jourCourt, libelleLigne, notesFff, type RapportFff,
} from "@/features/calendrier/lib/calendrier-fff";

const rapport = (extra: Partial<RapportFff> = {}): RapportFff => ({
  equipeId: "e1", source: "fichier", total: 22, crees: [], modifies: [], disparus: [], reapparus: 0, inchanges: 0, passes: 0, dejaJoues: 0,
  avertissements: [], ...extra,
});
const ligne = { journee: "4", date: "2026-11-14", heure: "19:00", adversaire: "Football Club de la Plaine" };

describe("calendrier FFF : affichage du rapport", () => {
  it("libelle d'un match : journee, jour et heure, adversaire", () => {
    expect(libelleLigne(ligne)).toBe("J4 · 14/11 19:00 · Football Club de la Plaine");
    expect(libelleLigne({ journee: null, date: "2026-11-14", heure: null, adversaire: "X" })).toBe("14/11 · X");
    expect(jourCourt("pas une date")).toBe("pas une date");
  });

  it("bilan : ce qui change, au singulier et au pluriel ; sinon « a jour »", () => {
    expect(bilanFff(rapport())).toBe("Calendrier a jour : 22 matchs, rien ne change.");
    expect(bilanFff(rapport({ total: 1 }))).toBe("Calendrier a jour : 1 match, rien ne change.");
    expect(bilanFff(rapport({ crees: [ligne], modifies: [{ ...ligne, avant: "a", apres: "b" }, { ...ligne, avant: "c", apres: "d" }], disparus: [ligne], reapparus: 1 })))
      .toBe("1 match ajoute, 2 matchs modifies, 1 match disparu du calendrier, 1 match revenu (22 matchs dans le calendrier).");
  });

  it("notes : les matchs passes non crees et les matchs deja joues sont expliques", () => {
    expect(notesFff(rapport())).toEqual([]);
    expect(notesFff(rapport({ passes: 6, dejaJoues: 1 }))).toEqual([
      "6 matchs deja passes ne sont pas crees : ils apparaitront avec l'import de leur feuille de match.",
      "1 match a deja sa feuille : inchange.",
    ]);
  });

  it("derniere synchronisation en heure de Paris ; jamais sans date", () => {
    expect(derniereSynchro("2026-11-13T14:02:00.000Z")).toBe("13/11/2026 15:02");
    expect(derniereSynchro(null)).toBe("jamais");
    expect(derniereSynchro("n'importe quoi")).toBe("jamais");
  });

  it("adresse plausible : calendrier d'equipe de la FFF, avec ou sans protocole", () => {
    expect(adressePlausible("media.fff.fr/calendars/2026/eq/6701_SEM_4.ics")).toBe(true);
    expect(adressePlausible(" webcal://media.fff.fr/calendars/2026/eq/6701_SEM_4.ics ")).toBe(true);
    expect(adressePlausible("https://example.com/agenda.ics")).toBe(false);
    expect(adressePlausible("")).toBe(false);
  });
});
