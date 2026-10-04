// src/features/prematch/lib/export-pptx.ts
//
// Export du rapport d'avant-match en PowerPoint : les pages proposees par le serveur et le choix de l'utilisateur.
// Fonctions pures ; l'appel et le telechargement sont dans ExportPowerPoint.tsx.

/** Une page du rapport (GET /analyse/prematch/pages). */
export interface PageExport { id: string; titre: string; contenu: string }

/** Le choix : toutes les pages au depart. */
export function toutesLesPages(pages: PageExport[]): Set<string> {
  return new Set(pages.map((p) => p.id));
}

export function basculerPage(choix: Set<string>, id: string): Set<string> {
  const suivant = new Set(choix);
  if (suivant.has(id)) suivant.delete(id); else suivant.add(id);
  return suivant;
}

/** Les pages cochees, dans l'ordre du modele (celui de la liste du serveur), pour la requete. */
export function pagesChoisies(pages: PageExport[], choix: Set<string>): string[] {
  return pages.filter((p) => choix.has(p.id)).map((p) => p.id);
}

/** "3 pages sur 7" */
export function resumeChoix(pages: PageExport[], choix: Set<string>): string {
  const n = pagesChoisies(pages, choix).length;
  return `${n} page${n > 1 ? "s" : ""} sur ${pages.length}`;
}

/** Nom de fichier propose par le serveur (en-tete Content-Disposition), ou le nom par defaut. */
export function nomFichier(contentDisposition: string | null | undefined, defaut = "rapport-avant-match.pptx"): string {
  const m = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(contentDisposition ?? "");
  if (!m) return defaut;
  try { return decodeURIComponent(m[1]).trim() || defaut; } catch { return m[1].trim() || defaut; }
}
