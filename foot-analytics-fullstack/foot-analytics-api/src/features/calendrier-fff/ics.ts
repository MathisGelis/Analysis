// src/features/calendrier-fff/ics.ts
//
// Lecture du calendrier d'une equipe publie par la FFF (fichier .ics, ex. media.fff.fr/calendars/2026/eq/6701_SEM_4.ics) :
// un evenement par match de championnat, avec date, heure, lieu, journee et un identifiant stable. Fonctions PURES.
//
// Ce que le fichier dit :
//   SUMMARY      "J4 - LATINO AFC - O. LYON SUD 2" : journee, puis le club qui RECOIT, puis celui qui se deplace ;
//   DESCRIPTION  la competition ("SENIORS D2") et le lien de la fiche match, qui contient les noms COMPLETS des clubs
//                (les titres sont abreges ou tronques : "GRAND OUEST ASSOCIAT 4") ;
//   UID          "55673077@fff.fr" : identifiant du match chez la FFF ;
//   DTSTAMP      derniere modification de l'evenement.
// Ce qu'il ne dit pas : le score, un match reporte ou annule (il change de date ou disparait), la poule.
//
// L'equipe "nous" n'est pas nommee : c'est le nom present dans TOUS les matchs (les adversaires n'y sont que deux fois).

export interface MatchCalendrier {
  /** Identifiant FFF du match (sans "@fff.fr"). */
  idFff: string;
  journee: string | null;
  /** AAAA-MM-JJ, heure de Paris. */
  date: string;
  /** HH:MM, heure de Paris ; null pour un evenement sur la journee entiere. */
  heure: string | null;
  competition: string | null;
  lieu: string | null;
  /** Nous recevons-nous ? */
  domicile: boolean;
  /** Nom de l'adversaire tel que le titre l'ecrit (abrege). */
  adversaire: string;
  /** Nom complet de l'adversaire tire du lien de la fiche, s'il a pu etre isole. */
  adversaireComplet: string | null;
  /** DTSTAMP : derniere modification, ISO. */
  modifieLe: string | null;
  /** Lien de la fiche match sur epreuves.fff.fr. */
  fiche: string | null;
}

export interface CalendrierAnalyse {
  /** Nom du calendrier (X-WR-CALNAME) : "OLYMPIQUE LYON SUD - SEM 4 - Saison 2026/2027". */
  nom: string | null;
  /** Annee de debut de la saison du fichier (2026 pour "2026/2027"), null si absente. */
  saisonDebut: number | null;
  /** Notre nom dans les titres, tel que le fichier l'ecrit ("O. LYON SUD 2"), si on a pu l'isoler. */
  notreNom: string | null;
  matchs: MatchCalendrier[];
  /** Evenements ignores, avec la raison (titre illisible...). */
  ignores: string[];
}

// ---------------------------------------------------------------------------
//  Lecture du format iCalendar
// ---------------------------------------------------------------------------

/** Les lignes du fichier, une ligne repliee (suite precedee d'un espace ou d'une tabulation) etant rejointe a la precedente. */
function lignesDepliees(texte: string): string[] {
  const brutes = texte.replace(/\r\n?/g, "\n").split("\n");
  const lignes: string[] = [];
  for (const l of brutes) {
    if ((l.startsWith(" ") || l.startsWith("\t")) && lignes.length) lignes[lignes.length - 1] += l.slice(1);
    else lignes.push(l);
  }
  return lignes.filter((l) => l.length > 0);
}

interface Propriete { nom: string; params: Record<string, string>; valeur: string }

function lirePropriete(ligne: string): Propriete | null {
  // NOM;PARAM=valeur;PARAM2="va:leur":valeur : le premier ":" hors guillemets separe les parametres de la valeur.
  let entreGuillemets = false;
  let coupe = -1;
  for (let i = 0; i < ligne.length; i++) {
    const c = ligne[i];
    if (c === '"') entreGuillemets = !entreGuillemets;
    else if (c === ":" && !entreGuillemets) { coupe = i; break; }
  }
  if (coupe < 0) return null;
  const [nom, ...params] = ligne.slice(0, coupe).split(";");
  const parametres: Record<string, string> = {};
  for (const p of params) {
    const i = p.indexOf("=");
    if (i > 0) parametres[p.slice(0, i).toUpperCase()] = p.slice(i + 1).replace(/^"|"$/g, "");
  }
  return { nom: nom.toUpperCase(), params: parametres, valeur: ligne.slice(coupe + 1) };
}

/** Texte iCalendar : \n, \, \; et \\ . */
const texteDe = (v: string): string => v.replace(/\\([nN,;\\])/g, (_, c: string) => (c === "n" || c === "N" ? "\n" : c));

const DEUX = (n: number) => String(n).padStart(2, "0");

/** Date et heure de Paris d'une valeur DTSTART : locale (TZID ou flottante), journee entiere, ou UTC ("...Z"). */
export function dateHeureParis(v: string): { date: string; heure: string | null } | null {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  const [, a, mo, j, h, mi, , z] = m;
  if (h === undefined) return { date: `${a}-${mo}-${j}`, heure: null };
  if (!z) return { date: `${a}-${mo}-${j}`, heure: `${h}:${mi}` };
  const instant = new Date(Date.UTC(+a, +mo - 1, +j, +h, +mi));
  const p = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(instant);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, heure: `${DEUX(+get("hour") % 24)}:${get("minute")}` };
}

/** DTSTAMP ("20261003T191259Z") en ISO. */
function stampIso(v: string | undefined): string | null {
  const m = (v ?? "").match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

// ---------------------------------------------------------------------------
//  Noms de clubs
// ---------------------------------------------------------------------------

const norme = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Les deux clubs d'un titre "[J4 - ]RECEVANT - VISITEUR" ; null si le titre n'a pas deux clubs. */
function clubsDuTitre(titre: string): { journee: string | null; dom: string; ext: string } | null {
  const mJ = titre.match(/^J\s*(\d+)\s+-\s+(.*)$/i);
  const reste = mJ ? mJ[2] : titre;
  const parties = reste.split(/\s+-\s+/).map((p) => p.trim()).filter(Boolean);
  if (parties.length !== 2) return null;
  return { journee: mJ ? mJ[1] : null, dom: parties[0], ext: parties[1] };
}

/** Les mots du nom complet des deux clubs dans l'adresse de la fiche : "55673074-olympique-lyon-sud-grand-ouest-..." . */
function motsDeLaFiche(fiche: string | null): string[] {
  const m = (fiche ?? "").match(/\/match\/\d+-([a-z0-9-]+)\/match/i);
  return m ? m[1].toLowerCase().split("-").filter(Boolean) : [];
}

/**
 * Nos mots dans les fiches : la plus longue suite de mots que TOUTES les fiches portent, au debut quand nous recevons, a la
 * fin quand nous nous deplacons (les adversaires different, nous non). Au moins 3 fiches : sinon rien n'est assez sur.
 */
function nosMots(fiches: string[][]): string[] | null {
  const pleines = fiches.filter((f) => f.length > 0);
  if (pleines.length < 3 || pleines.length < fiches.length * 0.8) return null;
  const premiere = pleines[0];
  const auDebut = (f: string[], s: string[]) => s.every((w, i) => f[i] === w);
  const alaFin = (f: string[], s: string[]) => s.every((w, i) => f[f.length - s.length + i] === w);
  let meilleure: string[] | null = null;
  for (let taille = premiere.length - 1; taille >= 1 && !meilleure; taille--) {
    for (const debut of [0, premiere.length - taille]) {
      const suite = premiere.slice(debut, debut + taille);
      if (pleines.every((f) => f.length > taille && (auDebut(f, suite) || alaFin(f, suite)))) { meilleure = suite; break; }
    }
  }
  return meilleure;
}

/** Le nom complet de l'adversaire : les mots de la fiche une fois les notres retires. */
function adversaireDeLaFiche(mots: string[], nous: string[] | null, domicile: boolean): string[] | null {
  if (!nous || mots.length <= nous.length) return null;
  const debut = mots.slice(0, nous.length).join("-") === nous.join("-");
  const fin = mots.slice(mots.length - nous.length).join("-") === nous.join("-");
  // Nous recevons : nos mots ouvrent l'adresse ; nous nous deplacons : ils la ferment.
  if (domicile && debut) return mots.slice(nous.length);
  if (!domicile && fin) return mots.slice(0, mots.length - nous.length);
  return null;
}

const PETITS_MOTS = new Set(["de", "du", "des", "la", "le", "les", "sur", "en", "et", "d", "l"]);

/** "latino a f c de lyon" -> "Latino A.F.C. de Lyon" : les lettres isolees se rejoignent en sigle, les petits mots restent en minuscule. */
export function nomLisible(mots: string[]): string {
  const sortie: string[] = [];
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i];
    if (m.length === 1 && !PETITS_MOTS.has(m)) {
      let j = i;
      while (j < mots.length && mots[j].length === 1 && !PETITS_MOTS.has(mots[j])) j++;
      if (j - i >= 2) { sortie.push(`${mots.slice(i, j).map((x) => x.toUpperCase()).join(".")}.`); i = j - 1; continue; }
    }
    sortie.push(PETITS_MOTS.has(m) && sortie.length ? m : m.charAt(0).toUpperCase() + m.slice(1));
  }
  return sortie.join(" ");
}

// ---------------------------------------------------------------------------
//  Analyse d'un fichier
// ---------------------------------------------------------------------------

interface Evenement { props: Propriete[] }

function evenementsDe(lignes: string[]): { entete: Propriete[]; evenements: Evenement[] } {
  const entete: Propriete[] = [];
  const evenements: Evenement[] = [];
  let courant: Evenement | null = null;
  let profondeur = 0;                       // VALARM, VTIMEZONE... : on ne lit que les proprietes de niveau VEVENT
  for (const l of lignes) {
    const p = lirePropriete(l);
    if (!p) continue;
    if (p.nom === "BEGIN") {
      if (p.valeur === "VEVENT") courant = { props: [] };
      else if (courant || p.valeur !== "VCALENDAR") profondeur++;
      continue;
    }
    if (p.nom === "END") {
      if (p.valeur === "VEVENT" && courant) { evenements.push(courant); courant = null; }
      else if (p.valeur !== "VCALENDAR") profondeur = Math.max(0, profondeur - 1);
      continue;
    }
    if (profondeur > 0) continue;
    (courant ? courant.props : entete).push(p);
  }
  return { entete, evenements };
}

/** Lit un fichier .ics de la FFF. Ne leve jamais : un fichier illisible rend simplement zero match. */
export function analyserCalendrier(texte: string): CalendrierAnalyse {
  const { entete, evenements } = evenementsDe(lignesDepliees(texte));
  const val = (props: Propriete[], nom: string) => props.find((p) => p.nom === nom);
  const nom = val(entete, "X-WR-CALNAME") ?? val(entete, "NAME");
  const saison = (nom?.valeur ?? "").match(/Saison\s+(\d{4})\s*\/\s*(\d{4})/i);

  const ignores: string[] = [];
  interface Brut {
    idFff: string; journee: string | null; dom: string; ext: string; date: string; heure: string | null;
    competition: string | null; lieu: string | null; modifieLe: string | null; fiche: string | null; mots: string[];
  }
  const bruts: Brut[] = [];
  for (const e of evenements) {
    const titre = texteDe(val(e.props, "SUMMARY")?.valeur ?? "").trim();
    const uid = (val(e.props, "UID")?.valeur ?? "").trim();
    const debut = val(e.props, "DTSTART");
    const dh = debut ? dateHeureParis(debut.valeur.trim()) : null;
    const clubs = clubsDuTitre(titre);
    if (!uid || !dh || !clubs) { ignores.push(titre || uid || "evenement sans titre"); continue; }
    const description = texteDe(val(e.props, "DESCRIPTION")?.valeur ?? "");
    const fiche = description.match(/https?:\/\/\S+/)?.[0] ?? null;
    const competition = description.split("\n")[0].trim() || null;
    bruts.push({
      idFff: uid.replace(/@.*$/, ""), journee: clubs.journee, dom: clubs.dom, ext: clubs.ext, date: dh.date, heure: dh.heure,
      competition: competition && !/^https?:/.test(competition) && !/^Voir /i.test(competition) ? competition : null,
      lieu: texteDe(val(e.props, "LOCATION")?.valeur ?? "").replace(/\s+/g, " ").trim() || null,
      modifieLe: stampIso(val(e.props, "DTSTAMP")?.valeur.trim()), fiche, mots: motsDeLaFiche(fiche),
    });
  }

  // Notre nom : celui qui revient dans (presque) tous les matchs. Il en faut au moins 2 et un net vainqueur.
  const compte = new Map<string, { nom: string; n: number }>();
  for (const b of bruts) for (const n of [b.dom, b.ext]) {
    const c = compte.get(norme(n)) ?? { nom: n, n: 0 };
    c.n++;
    compte.set(norme(n), c);
  }
  const classes = [...compte.values()].sort((x, y) => y.n - x.n);
  const notre = classes.length && classes[0].n >= 2 && (classes.length === 1 || classes[0].n > classes[1].n) ? classes[0].nom : null;
  const nous = nosMots(bruts.map((b) => b.mots));

  const matchs: MatchCalendrier[] = [];
  for (const b of bruts) {
    if (!notre) { ignores.push(`${b.dom} - ${b.ext} (equipe du calendrier non identifiee)`); continue; }
    const domicile = norme(b.dom) === norme(notre);
    if (!domicile && norme(b.ext) !== norme(notre)) { ignores.push(`${b.dom} - ${b.ext} (ne concerne pas ${notre})`); continue; }
    const mots = adversaireDeLaFiche(b.mots, nous, domicile);
    matchs.push({
      idFff: b.idFff, journee: b.journee, date: b.date, heure: b.heure, competition: b.competition, lieu: b.lieu,
      domicile, adversaire: domicile ? b.ext : b.dom, adversaireComplet: mots ? nomLisible(mots) : null,
      modifieLe: b.modifieLe, fiche: b.fiche,
    });
  }
  matchs.sort((x, y) => `${x.date} ${x.heure ?? ""}`.localeCompare(`${y.date} ${y.heure ?? ""}`));
  return { nom: nom ? texteDe(nom.valeur) : null, saisonDebut: saison ? Number(saison[1]) : null, notreNom: notre, matchs, ignores };
}
