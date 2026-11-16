// Le chrono du direct : fonctions pures, l'instant est toujours donne.

import { appliquerChrono, baseDeLaPeriode, EtatChrono, etatInitial, libelleMinute, minuteDe, TransitionChronoInvalide } from "@/features/direct/chrono";

const T0 = 1_800_000_000_000;
const minutes = (n: number) => n * 60_000;

describe("chrono du direct", () => {
  it("compte les minutes depuis le coup d'envoi (34:12 = minute 34) et s'arrete en pause", () => {
    let e = appliquerChrono(etatInitial(), "demarrer", T0);
    expect(minuteDe(e, T0)).toBe(0);
    expect(minuteDe(e, T0 + minutes(34) + 12_000)).toBe(34);
    e = appliquerChrono(e, "pause", T0 + minutes(10));
    expect(minuteDe(e, T0 + minutes(500))).toBe(10);                       // arrete : le temps ne passe plus
    e = appliquerChrono(e, "reprendre", T0 + minutes(20));
    expect(minuteDe(e, T0 + minutes(25))).toBe(15);                        // 10 de jeu + 5 depuis la reprise
  });

  it("deuxieme periode : repart de la minute 45, temps additionnel affiche 45+2", () => {
    let e = appliquerChrono(etatInitial(), "demarrer", T0);
    e = appliquerChrono(e, "mi_temps", T0 + minutes(47));
    expect(e).toMatchObject({ statut: "mi_temps", periode: 1, demarreLe: null });
    expect(minuteDe(e, T0 + minutes(90))).toBe(47);                        // 2 minutes d'arret de jeu en premiere periode
    expect(libelleMinute(47, 1, 45)).toBe("45+2");
    e = appliquerChrono(e, "deuxieme_periode", T0 + minutes(60));
    expect(e).toMatchObject({ statut: "en_cours", periode: 2, accumuleMs: 0 });
    expect(baseDeLaPeriode(e)).toBe(45);
    expect(minuteDe(e, T0 + minutes(60) + minutes(3))).toBe(48);
    expect(libelleMinute(92, 2, 45)).toBe("90+2");
    expect(libelleMinute(44, 1, 45)).toBe("44");
  });

  it("fin du match depuis la marche, la pause ou la mi-temps ; plus rien ensuite", () => {
    const enMarche = appliquerChrono(etatInitial(), "demarrer", T0);
    expect(appliquerChrono(enMarche, "fin", T0 + minutes(90))).toMatchObject({ statut: "termine", demarreLe: null });
    expect(appliquerChrono(appliquerChrono(enMarche, "pause", T0 + 1), "fin", T0 + 2).statut).toBe("termine");
    const fini = appliquerChrono(enMarche, "fin", T0 + 1);
    expect(() => appliquerChrono(fini, "fin", T0 + 2)).toThrow(TransitionChronoInvalide);
    expect(() => appliquerChrono(fini, "reprendre", T0 + 2)).toThrow(TransitionChronoInvalide);
  });

  it("refuse ce qui n'a pas de sens", () => {
    const avant = etatInitial();
    for (const action of ["pause", "reprendre", "mi_temps", "deuxieme_periode", "fin"] as const) {
      expect(() => appliquerChrono(avant, action, T0)).toThrow(TransitionChronoInvalide);
    }
    const enMarche = appliquerChrono(avant, "demarrer", T0);
    expect(() => appliquerChrono(enMarche, "demarrer", T0)).toThrow(TransitionChronoInvalide);
    expect(() => appliquerChrono(enMarche, "reprendre", T0)).toThrow(TransitionChronoInvalide);
    expect(() => appliquerChrono(enMarche, "deuxieme_periode", T0)).toThrow(TransitionChronoInvalide);
    expect(() => appliquerChrono(enMarche, "corriger", T0)).toThrow(TransitionChronoInvalide);            // minute absente
    expect(() => appliquerChrono(avant, "corriger", T0, 10)).toThrow(TransitionChronoInvalide);           // pas commence
  });

  it("recale le chrono sur une minute, en marche comme a l'arret, sans changer son etat", () => {
    const enMarche = appliquerChrono(etatInitial(), "demarrer", T0);
    const recale = appliquerChrono(enMarche, "corriger", T0 + minutes(3), 30);
    expect(recale.statut).toBe("en_cours");
    expect(minuteDe(recale, T0 + minutes(3))).toBe(30);
    expect(minuteDe(recale, T0 + minutes(5))).toBe(32);
    const enPause = appliquerChrono(recale, "pause", T0 + minutes(5));
    const recalePause = appliquerChrono(enPause, "corriger", T0 + minutes(9), 41);
    expect(recalePause).toMatchObject({ statut: "pause", demarreLe: null });
    expect(minuteDe(recalePause, T0 + minutes(500))).toBe(41);
    // En seconde periode, la minute est celle du match : 50 = 5 minutes dans la periode.
    let deux = appliquerChrono(appliquerChrono(etatInitial(), "demarrer", T0), "mi_temps", T0 + minutes(45));
    deux = appliquerChrono(deux, "deuxieme_periode", T0 + minutes(60));
    expect(minuteDe(appliquerChrono(deux, "corriger", T0 + minutes(61), 50), T0 + minutes(61))).toBe(50);
  });

  it("une periode plus courte (jeunes : 35 minutes)", () => {
    let e: EtatChrono = appliquerChrono(etatInitial(35), "demarrer", T0);
    e = appliquerChrono(appliquerChrono(e, "mi_temps", T0 + minutes(35)), "deuxieme_periode", T0 + minutes(50));
    expect(minuteDe(e, T0 + minutes(51))).toBe(36);
    expect(libelleMinute(72, 2, 35)).toBe("70+2");
  });
});
