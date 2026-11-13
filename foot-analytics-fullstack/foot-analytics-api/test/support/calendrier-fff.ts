// test/support/calendrier-fff.ts
//
// Fabrique de calendriers .ics au format de la FFF (media.fff.fr/calendars/AAAA/eq/xxx.ics), avec des clubs FICTIFS :
// titre "J4 - RECEVANT - VISITEUR" abrege, fiche match qui porte les noms complets, DTSTAMP par evenement.

export interface EvenementFff {
  id: string;
  journee: number;
  domicile: boolean;
  /** Nom de l'adversaire tel que le titre l'abrege. */
  adversaire: string;
  /** Nom complet de l'adversaire dans l'adresse de la fiche (mots separes par des tirets). */
  adversaireSlug: string;
  /** AAAA-MM-JJ */
  date: string;
  heure?: string;
  lieu?: string;
  /** DTSTAMP, "AAAAMMJJTHHMMSSZ". */
  stamp?: string;
}

export interface OptionsCalendrier {
  nom?: string;
  /** "2026/2027" */
  saison?: string;
  /** Notre nom dans les titres. */
  notre?: string;
  notreSlug?: string;
}

const compact = (iso: string) => iso.replace(/-/g, "");

export function construireIcs(evenements: EvenementFff[], o: OptionsCalendrier = {}): string {
  const notre = o.notre ?? "OL SUD 2";
  const slugNotre = o.notreSlug ?? "ol-sud";
  const nom = `${o.nom ?? "OL SUD"} - SEM 2 - Saison ${o.saison ?? "2026/2027"}`;
  const lignes = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FFF//DDE//EN", "CALSCALE:GREGORIAN", "X-WR-TIMEZONE:Europe/Paris",
    `X-WR-CALNAME:${nom}`, `NAME:${nom}`,
    "BEGIN:VTIMEZONE", "TZID:Europe/Paris",
    "BEGIN:DAYLIGHT", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "END:DAYLIGHT",
    "BEGIN:STANDARD", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "END:STANDARD",
    "END:VTIMEZONE",
  ];
  for (const e of evenements) {
    const heure = (e.heure ?? "15:00").replace(":", "");
    const fin = `${String(Math.min(23, Number(heure.slice(0, 2)) + 2)).padStart(2, "0")}${heure.slice(2)}`;
    const titre = e.domicile ? `${notre} - ${e.adversaire}` : `${e.adversaire} - ${notre}`;
    const slug = e.domicile ? `${slugNotre}-${e.adversaireSlug}` : `${e.adversaireSlug}-${slugNotre}`;
    lignes.push(
      "BEGIN:VEVENT",
      `UID:${e.id}@fff.fr`,
      `DTSTAMP:${e.stamp ?? "20260906T150000Z"}`,
      `DTSTART;TZID=Europe/Paris:${compact(e.date)}T${heure}00`,
      `DTEND;TZID=Europe/Paris:${compact(e.date)}T${fin}00`,
      `SUMMARY:J${e.journee} - ${titre}`,
      `DESCRIPTION:SENIORS D2\\n\\nVoir la fiche match: https://epreuves.fff.fr/competition/match/${e.id}-${slug}/match`,
      `LOCATION:${e.lieu ?? (e.domicile ? "STADE DE LA PLAINE 1" : "STADE ADVERSE")}`,
      "GEO:45.69107;4.78656",
      "BEGIN:VALARM", "TRIGGER:-PT15M", "ACTION:DISPLAY", "DESCRIPTION:Match dans 15 minutes", "END:VALARM",
      "END:VEVENT",
    );
  }
  lignes.push("END:VCALENDAR");
  return lignes.join("\r\n");
}

/** Une saison type de six journees contre des clubs fictifs, a partir d'une date. Les dates sont ISO, a +7 jours d'ecart. */
export function saisonFictive(debut = "2026-09-05"): EvenementFff[] {
  const adversaires: [string, string, boolean][] = [
    ["US RIVIERE 3", "union-sportive-de-la-riviere", true],
    ["FC PLAINE", "football-club-de-la-plaine", false],
    ["AS COLLINES 2", "association-sportive-des-collines", true],
    ["RC MARAIS", "racing-club-du-marais", false],
    ["ES VALLEE", "entente-sportive-de-la-vallee", true],
    ["US RIVIERE 3", "union-sportive-de-la-riviere", false],
  ];
  const [a, m, j] = debut.split("-").map(Number);
  return adversaires.map(([nom, slug, domicile], i) => {
    const d = new Date(Date.UTC(a, m - 1, j + 7 * i));
    return {
      id: String(55680001 + i), journee: i + 1, domicile, adversaire: nom, adversaireSlug: slug,
      date: d.toISOString().slice(0, 10), heure: i % 2 ? "19:00" : "15:00",
    };
  });
}
