import { dernierPassage, estDu, PassageAuto, prochainPassage, ReglagePlanning } from "@/features/ia/ia-planning";

const utc = (a: number, m: number, j: number, h = 0, min = 0) => Date.UTC(a, m - 1, j, h, min);

describe("calendrier du reentrainement : le mercredi a 5 h, heure de Paris", () => {
  it("en ete (UTC+2) : mercredi 5 h = 3 h UTC", () => {
    expect(dernierPassage(utc(2025, 10, 8, 3, 0))).toBe(utc(2025, 10, 8, 3, 0));
    expect(dernierPassage(utc(2025, 10, 8, 2, 59))).toBe(utc(2025, 10, 1, 3, 0));      // une minute avant : le mercredi precedent
    expect(dernierPassage(utc(2025, 10, 11, 12, 0))).toBe(utc(2025, 10, 8, 3, 0));     // le samedi suivant
  });

  it("en hiver (UTC+1) : mercredi 5 h = 4 h UTC", () => {
    expect(dernierPassage(utc(2026, 1, 14, 4, 0))).toBe(utc(2026, 1, 14, 4, 0));
    expect(dernierPassage(utc(2026, 1, 14, 3, 59))).toBe(utc(2026, 1, 7, 4, 0));
  });

  it("le passage au changement d'heure : la semaine du 26 octobre 2025 passe de 3 h a 4 h UTC", () => {
    expect(dernierPassage(utc(2025, 10, 25, 12, 0))).toBe(utc(2025, 10, 22, 3, 0));   // encore l'heure d'ete
    expect(dernierPassage(utc(2025, 10, 29, 12, 0))).toBe(utc(2025, 10, 29, 4, 0));   // deja l'heure d'hiver
    expect(prochainPassage(utc(2025, 10, 25, 12, 0))).toBe(utc(2025, 10, 29, 4, 0));
  });

  it("le prochain passage est strictement apres maintenant", () => {
    expect(prochainPassage(utc(2025, 10, 8, 3, 0))).toBe(utc(2025, 10, 15, 3, 0));
    expect(prochainPassage(utc(2025, 10, 8, 2, 59))).toBe(utc(2025, 10, 8, 3, 0));
    expect(new Date(prochainPassage(utc(2025, 10, 9, 0, 0))).getUTCDay()).toBe(3);
  });

  it("toujours un mercredi a 5 h a Paris, toute l'annee", () => {
    const parisH = (t: number) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "long", hour: "2-digit", hourCycle: "h23" }).format(new Date(t));
    for (let semaine = 0; semaine < 60; semaine++) {
      const t = prochainPassage(utc(2025, 1, 1) + semaine * 7 * 86_400_000 + 3_600_000);
      expect(parisH(t)).toMatch(/^mercredi 05/);
    }
  });
});

describe("estDu : l'entrainement automatique de la semaine est-il a faire ?", () => {
  const actif: ReglagePlanning = { actif: true, depuis: new Date(utc(2025, 10, 1, 8, 0)).toISOString() };
  const mercredi10h = utc(2025, 10, 8, 8, 0);                    // 5 h passee, 10 h a Paris
  const auto = (creeLe: number, statut = "termine", message: string | null = null): PassageAuto => ({ creeLe: new Date(creeLe).toISOString(), statut, message });

  it("planning actif, passage echu, rien de lance depuis : a faire", () => {
    expect(estDu(mercredi10h, actif, [])).toBe(true);
    expect(estDu(utc(2025, 10, 11, 12, 0), actif, [])).toBe(true);                  // rattrapage le samedi, serveur eteint le mercredi
  });

  it("une seule fois par semaine : deja lance depuis le passage, termine, en echec ou annule", () => {
    for (const statut of ["en_cours", "termine", "echec", "annule"]) {
      expect(estDu(mercredi10h, actif, [auto(utc(2025, 10, 8, 3, 5), statut, statut === "echec" ? "Il faut au moins deux semaines" : null)])).toBe(false);
    }
  });

  it("un entrainement de la semaine precedente ne compte pas", () => {
    expect(estDu(mercredi10h, actif, [auto(utc(2025, 10, 1, 3, 5))])).toBe(true);
    expect(estDu(mercredi10h, actif, [auto(utc(2025, 10, 8, 2, 59))])).toBe(true);
  });

  it("un entrainement interrompu par un arret du serveur est repris", () => {
    expect(estDu(mercredi10h, actif, [auto(utc(2025, 10, 8, 3, 5), "echec", "Interrompu : le serveur a ete arrete pendant l'entrainement.")])).toBe(true);
  });

  it("planning desactive : jamais", () => {
    expect(estDu(mercredi10h, { ...actif, actif: false }, [])).toBe(false);
  });

  it("active apres le passage de la semaine : pas d'entrainement immediat, le premier est le mercredi suivant", () => {
    const activeJeudi: ReglagePlanning = { actif: true, depuis: new Date(utc(2025, 10, 9, 9, 0)).toISOString() };
    expect(estDu(utc(2025, 10, 9, 10, 0), activeJeudi, [])).toBe(false);
    expect(estDu(utc(2025, 10, 14, 10, 0), activeJeudi, [])).toBe(false);
    expect(estDu(utc(2025, 10, 15, 3, 0), activeJeudi, [])).toBe(true);
  });
});
