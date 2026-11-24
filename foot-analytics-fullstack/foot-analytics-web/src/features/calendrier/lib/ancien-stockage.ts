// src/features/calendrier/lib/ancien-stockage.ts
//
// Avant, les jours d'entrainement prevus et les evenements « autre » du calendrier vivaient dans le navigateur (localStorage, par
// equipe) : perdus en changeant d'appareil. Ils sont maintenant gardes par l'API. Ce qui reste dans un navigateur est repris une seule
// fois (envoye au serveur si le serveur n'a rien), puis efface. Fonctions pures, sans acces au navigateur.

export interface PlanningLocal { jours: number[]; heure: string }
export interface AutreLocal { id: string; date: string; heure?: string; titre: string; description?: string }

export const clePlanning = (equipeId: string) => `fa.planning.${equipeId}`;
export const cleAutres = (equipeId: string) => `fa.autres.${equipeId}`;

const ID = /^[A-Za-z0-9_-]{8,64}$/;
const HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Le planning gardé dans le navigateur, seulement s'il est complet et valide (sinon, il est ignoré). */
export function lirePlanningLocal(brut: string | null): PlanningLocal | null {
  if (!brut) return null;
  try {
    const p = JSON.parse(brut);
    if (!p || !Array.isArray(p.jours) || typeof p.heure !== "string" || !HEURE.test(p.heure)) return null;
    const jours = [...new Set<number>(p.jours.filter((j: unknown) => Number.isInteger(j) && (j as number) >= 0 && (j as number) <= 6))].sort((a, b) => a - b);
    return { jours, heure: p.heure };
  } catch { return null; }
}

/** Les evenements « autre » valides gardés dans le navigateur ; ceux dont l'identifiant, la date ou le titre sont inutilisables sont ignorés. */
export function lireAutresLocaux(brut: string | null): AutreLocal[] {
  if (!brut) return [];
  try {
    const liste = JSON.parse(brut);
    if (!Array.isArray(liste)) return [];
    return liste.flatMap((e: any): AutreLocal[] => {
      if (!e || typeof e.id !== "string" || !ID.test(e.id) || typeof e.date !== "string" || !DATE.test(e.date) || typeof e.titre !== "string" || !e.titre.trim()) return [];
      return [{
        id: e.id, date: e.date, titre: e.titre.trim().slice(0, 120),
        ...(typeof e.heure === "string" && HEURE.test(e.heure) ? { heure: e.heure } : {}),
        ...(typeof e.description === "string" && e.description.trim() ? { description: e.description.trim().slice(0, 1000) } : {}),
      }];
    });
  } catch { return []; }
}
