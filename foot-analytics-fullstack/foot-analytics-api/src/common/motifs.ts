// src/common/motifs.ts
//
// Motifs de cartons lus dans les feuilles FMI : nettoyage, regroupement et decompte.
// Fonctions pures.
//
// Pourquoi : le meme motif arrive sous plusieurs ecritures ("Desapprobation en paroles ou en
// actes" / espaces doubles / lettre parasite finale), et une partie des cartons n'a AUCUN motif
// (arbitre qui ne l'a pas saisi). Si on ne compte que les motifs lus, "4 cartons" s'affiche avec
// "2 raisons" : le decompte doit toujours retomber sur le total, cartons sans motif compris.

export interface CompteMotif { motif: string; n: number }

/** Libelle des cartons dont la feuille ne donne aucun motif. */
export const MOTIF_NON_RENSEIGNE = "Motif non renseigne";

/**
 * Motif propre : espaces normalises, lettre parasite finale retiree ("...brutalite r" : initiale de
 * couleur restee collee au texte), ":" suivi d'un espace ("Staff:manifester" -> "Staff : manifester"),
 * premiere lettre en majuscule. Chaine vide si rien d'exploitable.
 */
export function nettoyerMotif(brut: string | null | undefined): string {
  let m = (brut ?? "").replace(/\s+/g, " ").trim();
  m = m.replace(/\s+[rjv]$/i, "");
  m = m.replace(/\s*:\s*(?=\S)/g, " : ");
  m = m.trim();
  return m ? m.charAt(0).toUpperCase() + m.slice(1) : "";
}

/** Cle de regroupement : sans accents, sans casse, sans ponctuation. */
export function cleMotif(motif: string): string {
  return nettoyerMotif(motif)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * Decompte des motifs d'une liste de cartons. `motifs` contient UNE entree par carton : la somme
 * de `motifs[].n` + `sansMotif` vaut toujours le nombre de cartons. Les ecritures d'un meme motif
 * sont regroupees sous la plus frequente (a egalite, la plus longue). Tri : plus frequent d'abord.
 */
export function compterMotifs(
  bruts: (string | null | undefined)[],
): { motifs: CompteMotif[]; sansMotif: number } {
  const groupes = new Map<string, Map<string, number>>();
  let sansMotif = 0;
  for (const brut of bruts) {
    const propre = nettoyerMotif(brut);
    const cle = cleMotif(propre);
    if (!cle) { sansMotif++; continue; }
    const ecritures = groupes.get(cle) ?? new Map<string, number>();
    ecritures.set(propre, (ecritures.get(propre) ?? 0) + 1);
    groupes.set(cle, ecritures);
  }
  const motifs: CompteMotif[] = [...groupes.values()].map((ecritures) => {
    const [libelle] = [...ecritures.entries()].sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)[0];
    return { motif: libelle, n: [...ecritures.values()].reduce((s, x) => s + x, 0) };
  });
  motifs.sort((a, b) => b.n - a.n || a.motif.localeCompare(b.motif));
  return { motifs, sansMotif };
}

/** Somme de plusieurs decomptes (ex. tous les championnats d'un arbitre), regroupes par cle. */
export function fusionnerMotifs(
  decomptes: { motifs: CompteMotif[]; sansMotif: number }[],
): { motifs: CompteMotif[]; sansMotif: number } {
  const groupes = new Map<string, CompteMotif>();
  let sansMotif = 0;
  for (const d of decomptes) {
    sansMotif += d.sansMotif;
    for (const { motif, n } of d.motifs) {
      const cle = cleMotif(motif);
      const g = groupes.get(cle);
      if (g) g.n += n; else groupes.set(cle, { motif: nettoyerMotif(motif), n });
    }
  }
  return { motifs: [...groupes.values()].sort((a, b) => b.n - a.n || a.motif.localeCompare(b.motif)), sansMotif };
}

/** "Motif (3) · Autre (1)" : les `max` plus frequents, plus "+N autres" si la liste est plus longue. */
export function resumeMotifs(d: { motifs: CompteMotif[]; sansMotif: number }, max = 3): string | null {
  const tete = d.motifs.slice(0, max).map((x) => `${x.motif} (${x.n})`);
  const reste = d.motifs.slice(max).reduce((s, x) => s + x.n, 0) + d.sansMotif;
  if (tete.length === 0 && d.sansMotif === 0) return null;
  if (tete.length === 0) return `${MOTIF_NON_RENSEIGNE} (${d.sansMotif})`;
  return tete.join(" · ") + (reste > 0 ? ` · +${reste} autre${reste > 1 ? "s" : ""}` : "");
}
