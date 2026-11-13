import { normaliserAdresseCalendrier } from "@/features/calendrier-fff/adresse-calendrier";
import { analyserCalendrier, dateHeureParis, nomLisible } from "@/features/calendrier-fff/ics";
import { construireIcs, saisonFictive } from "@test/support/calendrier-fff";

describe("analyserCalendrier", () => {
  it("lit les matchs d'un calendrier d'equipe de la FFF : equipe, domicile / exterieur, date, heure, lieu, noms complets", () => {
    const r = analyserCalendrier(construireIcs(saisonFictive()));
    expect(r).toMatchObject({ nom: "OL SUD - SEM 2 - Saison 2026/2027", saisonDebut: 2026, notreNom: "OL SUD 2", ignores: [] });
    expect(r.matchs).toHaveLength(6);
    expect(r.matchs[0]).toEqual({
      idFff: "55680001", journee: "1", date: "2026-09-05", heure: "15:00", competition: "SENIORS D2", lieu: "STADE DE LA PLAINE 1",
      domicile: true, adversaire: "US RIVIERE 3", adversaireComplet: "Union Sportive de la Riviere",
      modifieLe: "2026-09-06T15:00:00Z", fiche: "https://epreuves.fff.fr/competition/match/55680001-ol-sud-union-sportive-de-la-riviere/match",
    });
    // Exterieur : nos mots ferment l'adresse de la fiche.
    expect(r.matchs[1]).toMatchObject({ domicile: false, adversaire: "FC PLAINE", adversaireComplet: "Football Club de la Plaine", heure: "19:00" });
    expect(r.matchs.map((m) => m.date)).toEqual([...r.matchs.map((m) => m.date)].sort());
  });

  it("l'equipe du calendrier est celle de tous les matchs ; sans nom complet (trop peu de matchs), le titre abrege sert", () => {
    const r = analyserCalendrier(construireIcs(saisonFictive().slice(0, 2)));
    expect(r.notreNom).toBe("OL SUD 2");
    expect(r.matchs.map((m) => m.adversaireComplet)).toEqual([null, null]);
    // Un seul match : impossible de savoir qui est « nous ».
    const seul = analyserCalendrier(construireIcs(saisonFictive().slice(0, 1)));
    expect(seul.matchs).toEqual([]);
    expect(seul.ignores[0]).toContain("equipe du calendrier non identifiee");
  });

  it("lignes repliees, caracteres echappes, heure UTC convertie en heure de Paris (ete et hiver), journee entiere", () => {
    const ics = [
      "BEGIN:VCALENDAR", "X-WR-CALNAME:CLUB X - SEM 1 - Saison 2026/2027",
      ...[1, 2].flatMap((i) => [
        "BEGIN:VEVENT", `UID:90${i}@fff.fr`, `DTSTART:${i === 1 ? "20261004T130000Z" : "20270116T180000Z"}`,
        `SUMMARY:J${i} - CLUB X - ADV${i}`, "DESCRIPTION:COUPE\\nVoir la fiche",
        "LOCATION:STADE DU\\, PARC", " SUITE", "END:VEVENT"]),
      "BEGIN:VEVENT", "UID:903@fff.fr", "DTSTART;VALUE=DATE:20270301", "SUMMARY:J3 - ADV3 - CLUB X", "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    const r = analyserCalendrier(ics);
    expect(r.matchs.map((m) => [m.date, m.heure, m.lieu, m.competition])).toEqual([
      ["2026-10-04", "15:00", "STADE DU, PARCSUITE", "COUPE"],     // 13:00 UTC en octobre (CEST) = 15:00
      ["2027-01-16", "19:00", "STADE DU, PARCSUITE", "COUPE"],     // 18:00 UTC en janvier (CET) = 19:00
      ["2027-03-01", null, null, null],
    ]);
    expect(dateHeureParis("20261004T223000Z")).toEqual({ date: "2026-10-05", heure: "00:30" });
  });

  it("un titre a trois clubs ou sans date est ignore, avec sa raison ; un fichier illisible rend zero match sans lever", () => {
    const evts = saisonFictive();
    const brut = construireIcs(evts).replace("SUMMARY:J2 - FC PLAINE - OL SUD 2", "SUMMARY:J2 - FC PLAINE - OL SUD 2 - EXTRA");
    const r = analyserCalendrier(brut);
    expect(r.matchs).toHaveLength(5);
    expect(r.ignores).toEqual(["J2 - FC PLAINE - OL SUD 2 - EXTRA"]);
    for (const texte of ["", "pas un calendrier", "BEGIN:VCALENDAR\nEND:VCALENDAR", "\u0000\u0001"]) {
      expect(analyserCalendrier(texte).matchs).toEqual([]);
    }
  });
});

describe("nomLisible", () => {
  it("sigles reconstitues, petits mots en minuscule", () => {
    expect(nomLisible("latino a f c de lyon".split(" "))).toBe("Latino A.F.C. de Lyon");
    expect(nomLisible("o s pouilly pommiers".split(" "))).toBe("O.S. Pouilly Pommiers");
    expect(nomLisible("grand ouest association lyonnaise".split(" "))).toBe("Grand Ouest Association Lyonnaise");
  });
});

describe("normaliserAdresseCalendrier : seul le calendrier d'equipe de la FFF est accepte", () => {
  const bonne = "https://media.fff.fr/calendars/2026/eq/6701_SEM_4.ics";
  it("accepte l'adresse avec ou sans protocole, et celle d'abonnement", () => {
    for (const e of [bonne, "media.fff.fr/calendars/2026/eq/6701_SEM_4.ics", "webcal://media.fff.fr/calendars/2026/eq/6701_SEM_4.ics",
      "  HTTPS://MEDIA.FFF.FR/calendars/2026/eq/6701_SEM_4.ics?x=1#a  "]) {
      expect(normaliserAdresseCalendrier(e)).toBe(bonne);
    }
  });
  it("refuse tout autre serveur, protocole, port, identifiants ou chemin (pas d'appel de serveur arbitraire)", () => {
    for (const e of ["", null, undefined, "n'importe quoi", "http://media.fff.fr/calendars/2026/eq/6701_SEM_4.ics",
      "https://evil.example/calendars/2026/eq/6701_SEM_4.ics", "https://media.fff.fr.evil.example/calendars/2026/eq/a.ics",
      "https://media.fff.fr@evil.example/calendars/2026/eq/a.ics", "https://user:pw@media.fff.fr/calendars/2026/eq/a.ics",
      "https://media.fff.fr:8443/calendars/2026/eq/a.ics", "https://media.fff.fr/calendars/2026/eq/../../secret.ics",
      "https://media.fff.fr/calendars/2026/eq/a.txt", "https://media.fff.fr/autre/2026/eq/a.ics", "file:///etc/passwd",
      "https://127.0.0.1/calendars/2026/eq/a.ics", "https://localhost/calendars/2026/eq/a.ics"]) {
      expect({ e, r: normaliserAdresseCalendrier(e as string) }).toEqual({ e, r: null });
    }
  });
});
