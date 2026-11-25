// src/features/joueurs/components/colonnes-effectif.tsx
//
// Catalogue des colonnes de l'effectif : chaque vue (voir lib/vues-effectif.ts) en pioche une liste.
// `masque` = classes responsive appliquees dans la vue « Général » seulement (les autres vues montrent tout).

import type { ReactNode } from "react";

import type { Joueur } from "@/shared/lib/types";
import { classeBadgeMutation } from "@/features/tactique/lib/mutations";
import { postesCompacts } from "@/features/joueurs/lib/postes";
import type { CleTri } from "@/features/joueurs/lib/tri-effectif";
import { ageAu, parMatch } from "@/features/joueurs/lib/vues-effectif";

import { FatigueBar } from "./FatigueBar";
import { Stepper } from "./Stepper";

export interface Colonne {
  label: ReactNode;
  titre?: string;
  cle?: CleTri;
  align?: string;
  classe?: string;
  masque?: string;
  cell: (j: Joueur, ctx: { patchStat: (id: string, patch: { buts?: number; passesDecisives?: number }) => void }) => ReactNode;
}

const vide = <span className="text-faint">—</span>;
const nombre = (n: number | null | undefined, d = 0) => (n === null || n === undefined ? vide : n.toFixed(d));

export const COLONNES: Record<string, Colonne> = {
  poste: { label: "Poste", cle: "poste", cell: (j) => <span className="badge">{j.poste}</span> },
  matchs: { label: "Mat.", titre: "Matchs joués", cle: "matchs", align: "text-center", classe: "tabular-nums", cell: (j) => j.matchs },
  titularisations: { label: "Titu", titre: "Titularisations", cle: "titularisations", align: "text-center", classe: "tabular-nums",
    masque: "hidden min-[1100px]:table-cell", cell: (j) => j.titularisations },
  minutes: { label: "Minutes", cle: "minutes", classe: "tabular-nums text-muted", masque: "hidden min-[1280px]:table-cell", cell: (j) => `${j.minutes}'` },
  minParMatch: { label: "Min/m", titre: "Minutes par match", align: "text-right", classe: "tabular-nums text-muted",
    cell: (j) => nombre(parMatch(j.minutes, j.matchs), 0) },
  note: { label: "Note", cle: "note", classe: "font-semibold text-accent tabular-nums", masque: "hidden min-[1440px]:table-cell",
    cell: (j) => j.noteMoyenne?.toFixed(1) },
  fatigue: { label: "Fatigue", cle: "fatigue", masque: "hidden lg:table-cell", cell: (j) => <FatigueBar score={j.scoreFatigue} detail={j.fatigueDetail} /> },
  buts: { label: "B", titre: "Buts", cle: "buts", align: "text-center", masque: "max-sm:hidden",
    cell: (j, { patchStat }) => <Stepper value={j.buts ?? 0} onChange={(v) => patchStat(j.id, { buts: v })} color="accent" /> },
  passes: { label: "PD", titre: "Passes décisives", cle: "passes", align: "text-center", masque: "max-sm:hidden",
    cell: (j, { patchStat }) => <Stepper value={j.passesDecisives ?? 0} onChange={(v) => patchStat(j.id, { passesDecisives: v })} color="sky" /> },
  butsParMatch: { label: "B/m", titre: "Buts par match", align: "text-right", classe: "tabular-nums", cell: (j) => nombre(parMatch(j.buts, j.matchs), 2) },
  contributions: { label: "B+PD", titre: "Buts + passes décisives", align: "text-center", classe: "tabular-nums font-semibold",
    cell: (j) => (j.buts ?? 0) + (j.passesDecisives ?? 0) },
  jaunes: { label: "CJ", titre: "Cartons jaunes", cle: "jaunes", classe: "text-amber font-mono", cell: (j) => j.cartonsJaunes || "" },
  rouges: { label: "CR", titre: "Cartons rouges", cle: "rouges", classe: "text-danger font-mono", cell: (j) => j.cartonsRouges || "" },
  jaunesParMatch: { label: "CJ/m", titre: "Cartons jaunes par match", align: "text-right", classe: "tabular-nums", cell: (j) => nombre(parMatch(j.cartonsJaunes, j.matchs), 2) },
  scoreDiscipline: { label: "Disc.", titre: "Score de discipline (100 = irréprochable)", cle: "scoreDiscipline", align: "text-center", classe: "tabular-nums",
    cell: (j) => nombre(j.scoreDiscipline, 0) },
  profilDiscipline: { label: "Profil", titre: "Profil de discipline (d'après les motifs de cartons)",
    cell: (j) => j.typeDiscipline ? <span className="badge badge-danger !px-1.5 !py-0 text-[10px]!">{j.typeDiscipline}</span> : vide },
  acwr: { label: "ACWR", titre: "Ratio de charge aiguë / chronique (0,8 – 1,3 = zone saine)", cle: "acwr", align: "text-center", classe: "tabular-nums",
    cell: (j) => nombre(j.acwr, 2) },
  charge7: { label: "Ch. 7j", titre: "Charge des 7 derniers jours", cle: "charge7", align: "text-right", classe: "tabular-nums", cell: (j) => nombre(j.chargeAcute7j, 0) },
  charge28: { label: "Ch. 28j", titre: "Charge moyenne sur 28 jours", cle: "charge28", align: "text-right", classe: "tabular-nums", cell: (j) => nombre(j.chargeChronic28j, 0) },
  blessures: { label: "Bless.", titre: "Blessures passées", cle: "blessures", align: "text-center", classe: "tabular-nums", cell: (j) => j.blessuresAnt || "" },
  statut: { label: "Statut", cle: "statut", masque: "hidden min-[1440px]:table-cell",
    cell: (j) => <span className={`badge ${classeBadgeMutation(j.statutMutation)}`}>{j.statutMutation}</span> },
  postes: { label: "Postes joués", masque: "hidden whitespace-nowrap font-mono text-[11px] text-muted 2xl:table-cell", classe: "whitespace-nowrap font-mono text-[11px] text-muted",
    cell: (j) => {
      const { visibles, restants } = postesCompacts(j.postes);
      return visibles.length === 0 ? vide : <>{visibles.join(" · ")}{restants > 0 && <span className="ml-1 text-faint">+{restants}</span>}</>;
    } },
  age: { label: "Âge", cle: "age", align: "text-center", classe: "tabular-nums", cell: (j) => nombre(ageAu(j.dateNaissance, new Date())) },
  taille: { label: "Taille", cle: "taille", align: "text-right", classe: "tabular-nums", cell: (j) => (j.tailleCm ? `${j.tailleCm} cm` : vide) },
  poids: { label: "Poids", cle: "poids", align: "text-right", classe: "tabular-nums", cell: (j) => (j.poidsKg ? `${j.poidsKg} kg` : vide) },
  pied: { label: "Pied", titre: "Pied fort", cell: (j) => j.piedFort ?? vide },
  numero: { label: "N°", titre: "Numéro le plus porté", align: "text-center", classe: "tabular-nums", cell: (j) => j.numeroFavori ?? vide },
};
