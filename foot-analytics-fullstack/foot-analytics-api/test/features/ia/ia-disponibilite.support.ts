import { champsFatigue } from "@/features/joueurs/fatigue";

/** Une fiche de fatigue serialisee, avec les seuls drapeaux utiles aux tests. */
export function serialiserEntreePourTest(o: { indisponible?: boolean; enReprise?: boolean }): string {
  return champsFatigue({
    aujourdhui: new Date(), efforts: [], indisponible: !!o.indisponible, enReprise: !!o.enReprise, blessuresAnt: 0, sources: "matchs",
  }).fatigueEntree;
}
