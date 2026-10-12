// src/features/analyse/components/ProfilCard.tsx
//
// Profil des scores : combien de matchs sans encaisser / sans marquer, serres, gros ecarts,
// et la comparaison des deux moities de saison.

import type { Tendances } from "@/features/analyse/lib/analyse-types";
import { decimal } from "@/features/analyse/lib/tendances-format";

function Ligne({ label, valeur, detail }: { label: string; valeur: string; detail?: string }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-t border-line py-2 first:border-t-0">
      <span className="text-xs text-muted">{label}</span>
      <span className="text-right">
        <b className="font-display text-sm tabular-nums text-ink">{valeur}</b>
        {detail && <span className="ml-2 text-[11px] text-faint">{detail}</span>}
      </span>
    </li>
  );
}

export function ProfilCard({ profil, moities }: { profil: Tendances["profil"]; moities: Tendances["moities"] }) {
  const sur = `sur ${profil.matchs}`;
  const serres = profil.recordMatchsSerres;
  return (
    <ul>
      <Ligne label="Sans encaisser" valeur={String(profil.matchsSansEncaisser)} detail={sur} />
      <Ligne label="Sans marquer" valeur={String(profil.matchsSansMarquer)} detail={sur} />
      <Ligne label="Matchs serres (un but d'ecart ou moins)" valeur={String(profil.matchsSerres)}
        detail={serres.joues ? `${serres.v}V ${serres.n}N ${serres.d}D` : undefined} />
      <Ligne label="Grosses victoires (3 buts d'ecart ou plus)" valeur={String(profil.grossesVictoires)} />
      <Ligne label="Grosses defaites (3 buts d'ecart ou plus)" valeur={String(profil.grossesDefaites)} />
      {moities && (
        <Ligne label="1re moitie → 2e moitie de saison" valeur={`${decimal(moities.premiere.ppm, 2)} → ${decimal(moities.seconde.ppm, 2)}`} detail="pt/match" />
      )}
    </ul>
  );
}
