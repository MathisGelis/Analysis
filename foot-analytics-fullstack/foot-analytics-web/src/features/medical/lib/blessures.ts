// src/features/medical/lib/blessures.ts
//
// Helpers partages pour le calcul des jours manques par blessure :
//  - terminees : retourEstime - dateDebut
//  - en cours  : aujourd'hui - dateDebut

export interface BlessureLite {
  id: string;
  localisation?: string | null;
  dateDebut?: string | null;
  retourEstime?: string | null;
  statut?: string | null;
}

/** Une blessure est en cours si pas de date de retour ou statut != Retabli. */
export function blessureEnCours(b: BlessureLite): boolean {
  const s = (b.statut ?? "").toLowerCase();
  if (s.includes("retabli") || s.includes("guerie") || s.includes("termine")) return false;
  // statut neutre + pas de retour -> on suppose en cours
  return !b.retourEstime;
}

/** Parse ISO "2026-03-15" ou format "DD/MM/YYYY" en Date locale. */
function parseDate(s?: string | null): Date | null {
  if (!s) return null;
  // Try ISO first
  const d = new Date(s);
  if (!isNaN(d.getTime())) return d;
  // DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (m) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10) - 1;
    const year = parseInt(m[3], 10) < 100 ? 2000 + parseInt(m[3], 10) : parseInt(m[3], 10);
    return new Date(year, month, day);
  }
  return null;
}

/**
 * Nombre de jours manques par une blessure.
 *  - Si terminee (retourEstime) -> retourEstime - dateDebut
 *  - Si en cours -> aujourd'hui - dateDebut
 * Retourne 0 si dates inutilisables.
 */
export function joursManques(b: BlessureLite, now: Date = new Date()): number {
  const debut = parseDate(b.dateDebut);
  if (!debut) return 0;
  const fin = b.retourEstime ? parseDate(b.retourEstime) : now;
  if (!fin) return 0;
  const ms = fin.getTime() - debut.getTime();
  return Math.max(0, Math.round(ms / (1000 * 60 * 60 * 24)));
}

/**
 * Cumul des jours manques par zone (clef = localisation normalisee).
 * Permet d'afficher un total sur chaque point de la silhouette, meme
 * pour les blessures recurrentes.
 */
export function cumulJoursParZone(
  blessures: BlessureLite[],
  now: Date = new Date(),
): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of blessures) {
    const loc = (b.localisation ?? "").trim();
    if (!loc) continue;
    const key = loc.toLowerCase();
    const jours = joursManques(b, now);
    if (jours <= 0) continue;
    out.set(key, (out.get(key) ?? 0) + jours);
  }
  return out;
}
