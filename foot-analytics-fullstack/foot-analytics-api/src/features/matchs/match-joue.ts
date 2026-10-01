// src/features/matchs/match-joue.ts
//
// Un match programme (calendrier : statut "prevu" / "a_venir", score 0-0) n'est pas un nul : il ne
// doit entrer dans aucune statistique. Les matchs annules ou reportes non plus.

export function estMatchJoue(m: { statut?: string | null }): boolean {
  return !["annule", "reporte", "prevu", "a_venir"].includes((m.statut ?? "joue").toLowerCase());
}
