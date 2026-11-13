// src/features/calendrier/lib/calendrier-fff.ts
//
// Calendrier FFF d'une equipe (fichier .ics de myFFF) : types du rapport de synchronisation rendu par l'API et sa mise en
// phrases pour l'ecran. Fonctions pures.

export interface LigneRapportFff { journee: string | null; date: string; heure: string | null; adversaire: string }
export interface ModificationFff extends LigneRapportFff { avant: string; apres: string }

export interface RapportFff {
  equipeId: string;
  source: "adresse" | "fichier";
  total: number;
  crees: LigneRapportFff[];
  modifies: ModificationFff[];
  disparus: LigneRapportFff[];
  reapparus: number;
  inchanges: number;
  passes: number;
  dejaJoues: number;
  avertissements: string[];
}

/** "2026-11-14" -> "14/11". */
export const jourCourt = (iso: string): string => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}` : iso);

/** "J4 · 14/11 19:00 · Football Club de la Plaine". */
export function libelleLigne(l: LigneRapportFff): string {
  return [l.journee ? `J${l.journee}` : null, `${jourCourt(l.date)}${l.heure ? ` ${l.heure}` : ""}`, l.adversaire].filter(Boolean).join(" · ");
}

const pluriel = (n: number, un: string, plusieurs: string) => `${n} ${n > 1 ? plusieurs : un}`;

/** La phrase de bilan : ce qui a change, ou « rien ne change ». */
export function bilanFff(r: RapportFff): string {
  const morceaux: string[] = [];
  if (r.crees.length) morceaux.push(pluriel(r.crees.length, "match ajoute", "matchs ajoutes"));
  if (r.modifies.length) morceaux.push(pluriel(r.modifies.length, "match modifie", "matchs modifies"));
  if (r.disparus.length) morceaux.push(pluriel(r.disparus.length, "match disparu du calendrier", "matchs disparus du calendrier"));
  if (r.reapparus) morceaux.push(pluriel(r.reapparus, "match revenu", "matchs revenus"));
  if (!morceaux.length) return `Calendrier a jour : ${pluriel(r.total, "match", "matchs")}, rien ne change.`;
  return `${morceaux.join(", ")} (${pluriel(r.total, "match", "matchs")} dans le calendrier).`;
}

/** Ce que le rapport ne fait volontairement pas : a dire, pour ne pas laisser croire a un oubli. */
export function notesFff(r: RapportFff): string[] {
  const notes: string[] = [];
  if (r.passes) notes.push(`${pluriel(r.passes, "match deja passe n'est pas cree", "matchs deja passes ne sont pas crees")} : ils apparaitront avec l'import de leur feuille de match.`);
  if (r.dejaJoues) notes.push(`${pluriel(r.dejaJoues, "match a deja sa feuille", "matchs ont deja leur feuille")} : inchange${r.dejaJoues > 1 ? "s" : ""}.`);
  return notes;
}

/** "2026-11-13T14:02:00.000Z" -> "13/11/2026 15:02" (heure de Paris) ; "jamais" sans date. */
export function derniereSynchro(iso: string | null | undefined): string {
  if (!iso) return "jamais";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "jamais";
  return d.toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** L'adresse a coller est-elle plausible ? (l'API fait foi ; ceci evite un aller-retour sur une faute evidente.) */
export function adressePlausible(s: string): boolean {
  return /media\.fff\.fr\/calendars\/\d{4}\/eq\/[\w-]+\.ics/i.test(s.trim());
}
