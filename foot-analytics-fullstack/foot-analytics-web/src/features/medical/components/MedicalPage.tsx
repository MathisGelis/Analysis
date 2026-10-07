// src/features/medical/components/MedicalPage.tsx
//
// MEDICAL : deux lectures selon la position de la saison choisie par rapport a la saison en cours.
//  - saison en cours (ou a venir) : le suivi de l'effectif, avec la FATIGUE (toujours affichee sur la saison en cours) et les
//    blessures (SuiviEffectif) ;
//  - saison precedente : le RESUME des blessures de la saison (ResumeSaison) ; la fatigue, instantane du moment, n'a plus de sens.
// SAISON-SENSITIVE : une blessure appartient a la saison ou elle commence (aout -> juillet).

import { HeartPulse } from "lucide-react";

import { api } from "@/shared/lib/api";
import { resolveEquipePropre } from "@/features/equipes/lib/resolve-equipe-propre";
import { modeSaison } from "@/features/saisons/lib/saison-mode";

import { blessuresDeLaSaison, fenetreSaison } from "../lib/resume-blessures";
import { ResumeSaison } from "./ResumeSaison";
import { SuiviEffectif } from "./SuiviEffectif";

export default async function Medical() {
  const [equipes, saisons] = await Promise.all([api.equipes(), api.saisons()]);
  const { equipe, saison } = await resolveEquipePropre({ equipes, saisons });

  if (!equipe) {
    return (
      <div className="space-y-6 fade-up">
        <header>
          <div className="h-section">Medical</div>
          <h1 className="font-display text-2xl font-bold text-ink">Suivi de l&apos;effectif</h1>
        </header>
        <section className="panel p-8 text-center">
          <div className="mb-2 text-sm text-muted">Aucune equipe selectionnee.</div>
          <p className="mx-auto max-w-sm text-xs text-faint">Choisissez une equipe dans le selecteur en bas a gauche pour voir son suivi medical.</p>
        </section>
      </div>
    );
  }

  const [effectif, blessuresApi] = await Promise.all([api.effectifEquipe(equipe.id), api.blessures()]);
  const mode = modeSaison(saison, saisons.find((s: any) => s.actif) ?? null);
  const passee = mode === "passee" && saison !== null;
  const saisonEnCours = saison?.actif === true;
  const noms = new Map<string, string>(effectif.filter((j: any) => j.id).map((j: any) => [j.id as string, `${j.prenom ?? ""} ${j.nom}`.trim()]));
  const blessures = saison
    ? blessuresDeLaSaison(blessuresApi as any[], new Set(noms.keys()), fenetreSaison(saison.anneeDebut), saisonEnCours)
    : (blessuresApi as any[]).filter((b: any) => noms.has(b.joueurId));
  const libelleEquipe = `${equipe.nom}${equipe.competitionLibelle ? ` · ${equipe.competitionLibelle}` : ""}`;

  return (
    <div className="space-y-6 fade-up">
      <header>
        <div className="h-section">{passee ? "Medical · resume de la saison" : "Medical & fatigue"}</div>
        <h1 className="font-display text-2xl font-bold text-ink">{libelleEquipe}</h1>
        {saison && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted" data-testid="medical-saison">
            <HeartPulse size={11} className="text-accent" aria-hidden />
            {passee
              ? <>Resume des blessures de la saison <strong className="text-ink">{saison.nom}</strong><span className="text-faint">· saison terminee</span></>
              : <>Saison <strong className="text-ink">{saison.nom}</strong>{!saisonEnCours && <span className="text-faint">· saison a venir</span>}</>}
          </div>
        )}
      </header>

      {passee
        ? <ResumeSaison saison={saison} effectif={effectif} blessures={blessures} noms={noms} maintenant={Date.now()} />
        : <SuiviEffectif effectif={effectif} blessures={blessures} saisonEnCours={saisonEnCours} />}
    </div>
  );
}
