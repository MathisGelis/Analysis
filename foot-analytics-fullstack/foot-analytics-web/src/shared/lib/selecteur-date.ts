// src/shared/lib/selecteur-date.ts
//
// Logique pure du selecteur de date maison (shared/ui/DatePicker.tsx). Les dates circulent en ISO "AAAA-MM-JJ" ;
// la saisie et l'affichage se font en "JJ/MM/AAAA". Tout est calcule en UTC : aucun decalage de fuseau possible.

export const MOIS = [
  "janvier", "fevrier", "mars", "avril", "mai", "juin",
  "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
] as const;
export const JOURS_COURTS = ["L", "M", "M", "J", "V", "S", "D"] as const;

const deuxChiffres = (n: number) => String(n).padStart(2, "0");

/** "AAAA-MM-JJ" correspondant a un vrai jour du calendrier (le 31/02 n'existe pas). */
export function isoValide(iso: string | null | undefined): iso is string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? "");
  if (!m) return false;
  const [a, mo, j] = [+m[1], +m[2], +m[3]];
  const d = new Date(Date.UTC(a, mo - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === mo - 1 && d.getUTCDate() === j;
}

export function construireIso(annee: number, mois: number, jour: number): string {
  return `${String(annee).padStart(4, "0")}-${deuxChiffres(mois)}-${deuxChiffres(jour)}`;
}

export function decouper(iso: string): { annee: number; mois: number; jour: number } {
  const [annee, mois, jour] = iso.split("-").map(Number);
  return { annee, mois, jour };
}

/** Jour local "aujourd'hui" en ISO (celui que l'utilisateur voit sur son horloge). */
export function aujourdhuiIso(d: Date = new Date()): string {
  return construireIso(d.getFullYear(), d.getMonth() + 1, d.getDate());
}

/**
 * Date ISO depuis ce que la base contient : "2026-10-18", "2026-10-18T14:00:00Z" ou "18/10/2026" (feuilles FMI).
 * Chaine vide si rien de lisible : le selecteur affiche alors un champ vide sans toucher a la valeur d'origine.
 */
export function isoDepuisValeur(valeur: string | null | undefined): string {
  const v = (valeur ?? "").trim();
  const debut = /^(\d{4}-\d{2}-\d{2})(?:$|[T ])/.exec(v)?.[1];
  if (debut) return isoValide(debut) ? debut : "";
  return isoDepuisSaisie(v) ?? "";
}

/** "2026-10-18" -> "18/10/2026" ; vide si illisible. */
export function saisieDepuisIso(iso: string | null | undefined): string {
  if (!isoValide(iso)) return "";
  const { annee, mois, jour } = decouper(iso);
  return `${deuxChiffres(jour)}/${deuxChiffres(mois)}/${String(annee).padStart(4, "0")}`;
}

/** "18/10/2026" (ou 18-10-2026, 18.10.2026, 2026-10-18) -> "2026-10-18" ; null si illisible ou date inexistante. */
export function isoDepuisSaisie(texte: string): string | null {
  const t = texte.trim();
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(t);
  const fr = /^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{4})$/.exec(t);
  const candidat = iso ? construireIso(+iso[1], +iso[2], +iso[3]) : fr ? construireIso(+fr[3], +fr[2], +fr[1]) : null;
  return candidat && isoValide(candidat) ? candidat : null;
}

/**
 * Saisie au clavier : les chiffres sont regroupes en JJ/MM/AAAA au fil de la frappe ("12032004" -> "12/03/2004").
 * Une saisie qui n'est pas que des chiffres et des separateurs usuels (ISO collee, par exemple) est laissee telle quelle.
 */
export function formaterFrappe(texte: string): string {
  if (!/^[\d/\-. ]*$/.test(texte) || /^\d{4}-/.test(texte)) return texte;
  const chiffres = texte.replace(/\D/g, "").slice(0, 8);
  const parties = [chiffres.slice(0, 2), chiffres.slice(2, 4), chiffres.slice(4, 8)].filter(Boolean);
  const fini = /[/\-. ]$/.test(texte) && parties.length > 0 && parties.length < 3 && parties[parties.length - 1].length === 2;
  return parties.join("/") + (fini ? "/" : "");
}

/** Ajoute (ou retire) des jours a une date ISO. */
export function ajouterJours(iso: string, n: number): string {
  const { annee, mois, jour } = decouper(iso);
  const d = new Date(Date.UTC(annee, mois - 1, jour + n));
  return construireIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Ajoute des mois en gardant le jour (ramene au dernier jour du mois si besoin : 31 janvier + 1 mois = 28 fevrier). */
export function ajouterMois(iso: string, n: number): string {
  const { annee, mois, jour } = decouper(iso);
  const total = annee * 12 + (mois - 1) + n;
  const a = Math.floor(total / 12);
  const m = (total % 12) + 1;
  const dernier = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return construireIso(a, m, Math.min(jour, dernier));
}

/** Ramene une date dans [min, max] (bornes facultatives, ISO). */
export function borner(iso: string, min?: string, max?: string): string {
  if (min && isoValide(min) && iso < min) return min;
  if (max && isoValide(max) && iso > max) return max;
  return iso;
}

export interface CaseJour { iso: string; jour: number; dansMois: boolean }

/** Les six semaines (lundi en premier) qui couvrent le mois : jours du mois precedent et suivant en grise. */
export function grilleDuMois(annee: number, mois: number): CaseJour[] {
  const premier = new Date(Date.UTC(annee, mois - 1, 1));
  const decalage = (premier.getUTCDay() + 6) % 7;            // lundi = 0
  const cases: CaseJour[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(Date.UTC(annee, mois - 1, 1 - decalage + i));
    cases.push({
      iso: construireIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()),
      jour: d.getUTCDate(),
      dansMois: d.getUTCMonth() === mois - 1,
    });
  }
  return cases;
}

/** "18 octobre 2026", pour les lecteurs d'ecran. */
export function libelleLong(iso: string): string {
  const { annee, mois, jour } = decouper(iso);
  return `${jour === 1 ? "1er" : jour} ${MOIS[mois - 1]} ${annee}`;
}

/** Premiere annee de la page de 12 annees qui contient `annee`. */
export const debutPageAnnees = (annee: number) => Math.floor(annee / 12) * 12;
