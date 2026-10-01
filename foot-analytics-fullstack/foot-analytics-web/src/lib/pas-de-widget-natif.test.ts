// Garde-fou : aucune liste, calendrier ni boite de dialogue dessines par le navigateur. Les composants maison
// (Select, DatePicker, TimePicker24, useFeedback) les remplacent ; ce test echoue si quelqu'un en reintroduit un.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const RACINE = path.resolve(__dirname, "..");

function fichiers(dossier: string): string[] {
  return readdirSync(dossier).flatMap((nom) => {
    const chemin = path.join(dossier, nom);
    if (statSync(chemin).isDirectory()) return fichiers(chemin);
    return /\.tsx?$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
  });
}

const INTERDITS: [RegExp, string][] = [
  [/<select[\s>]/, "<select> natif : utiliser components/Select"],
  [/<datalist[\s>]/, "<datalist> natif : utiliser un selecteur maison (voir AdversairePicker)"],
  [/type=["'](date|time|datetime-local|month|week)["']/, "champ de date ou d'heure natif : utiliser DatePicker / TimePicker24"],
  [/\b(window\.)?(alert|confirm|prompt)\(/, "boite de dialogue du navigateur : utiliser useFeedback (notifier, confirmer)"],
];

describe("pas de widget natif du navigateur", () => {
  const sources = fichiers(RACINE);

  it("le balayage couvre bien les composants et les pages", () => {
    expect(sources.length).toBeGreaterThan(50);
  });

  it.each(INTERDITS)("aucune occurrence de %s", (motif, conseil) => {
    const trouves = sources.flatMap((f) =>
      readFileSync(f, "utf8").split("\n")
        .map((ligne, i) => ({ ligne, i }))
        // Les commentaires qui expliquent ce qu'on remplace restent permis.
        .filter(({ ligne }) => !/^\s*(\/\/|\*|\/\*)/.test(ligne) && motif.test(ligne))
        .map(({ i }) => `${path.relative(RACINE, f)}:${i + 1}`),
    );
    expect(trouves, conseil).toEqual([]);
  });
});
