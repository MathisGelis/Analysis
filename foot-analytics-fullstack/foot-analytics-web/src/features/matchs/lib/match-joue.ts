// src/features/matchs/lib/match-joue.ts
//
// Un match programme (statut "prevu" / "a_venir", score 0-0) n'est pas un nul : il ne doit entrer dans aucune statistique ni aucun
// resultat. Les matchs annules ou reportes non plus. Meme regle que l'API (matchs/match-joue.ts) et que le classement.

export function estMatchJoue(m: { statut?: string | null }): boolean {
  return !["annule", "reporte", "prevu", "a_venir"].includes((m.statut ?? "joue").toLowerCase());
}
