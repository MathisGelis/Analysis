// src/features/medical/components/MedicalPage.tsx
//
// Suivi medical et fatigue (charge d'entrainement + charge en match).
// SAISON-SENSITIVE : la fatigue et les charges 7j/28j sont par nature
// liees a la saison en cours : sur une saison future ou passee la page
// l'explique au lieu d'afficher des zeros. Les blessures sont filtrees par
// periode saisonniere (aout <anneeDebut> -> juillet <anneeDebut+1>).

import { Activity, AlertTriangle, Heart, HeartPulse } from "lucide-react";

import { api } from "@/shared/lib/api";
import { resolveEquipePropre } from "@/features/equipes/lib/resolve-equipe-propre";
import { FatigueBar } from "@/features/joueurs/components/FatigueBar";
import { FatigueLegende } from "@/features/joueurs/components/FatiguePanel";
import { estEstimation, facteursPrincipaux, lireDetailFatigue, niveauFatigue } from "@/features/joueurs/lib/fatigue";

import { BlessuresEditeur } from "./BlessuresEditeur";

export default async function Medical() {
  const [equipes, saisons] = await Promise.all([api.equipes(), api.saisons()]);
  // Equipe et saison resolues de facon centralisee : sur une saison
  // differente de celle du cookie d'equipe, on obtient l'equivalent.
  const { equipe, saison: saisonCourante } =
    await resolveEquipePropre({ equipes, saisons });

  if (!equipe) {
    return (
      <div className="space-y-6 fade-up">
        <header>
          <div className="h-section">Medical & charge</div>
          <h1 className="font-display text-2xl font-bold text-ink">Suivi de l'effectif</h1>
        </header>
        <section className="panel p-8 text-center">
          <div className="text-sm text-muted mb-2">Aucune equipe selectionnee.</div>
          <p className="text-xs text-faint max-w-sm mx-auto">
            Choisis une equipe dans le selecteur en bas a gauche pour
            voir le suivi medical et la charge d'entrainement.
          </p>
        </section>
      </div>
    );
  }

  const [effectif, blessuresApi] = await Promise.all([
    api.effectifEquipe(equipe.id),
    api.blessures(),
  ]);

  // Une saison est "en cours" (stats de charge pertinentes) uniquement
  // si elle est marquee active dans la BDD. Une saison future/passee
  // n'a pas de sens pour les charges 7j/28j -> tout a 0 pour eviter
  // d'afficher des valeurs trompeuses.
  const estSaisonActive = saisonCourante?.actif === true;

  // Fenetre saisonniere pour filtrer les blessures : aout N -> juillet N+1.
  const anneeDebut = saisonCourante?.anneeDebut ?? null;
  const debutSaison = anneeDebut ? new Date(`${anneeDebut}-08-01`) : null;
  const finSaison = anneeDebut ? new Date(`${anneeDebut + 1}-07-31`) : null;

  const effectifIds = new Set(effectif.map((j: any) => j.id));
  const blessuresEquipe = blessuresApi
    .filter((b: any) => effectifIds.has(b.joueurId))
    // Blessures dans la fenetre saisonniere, OU statut "en cours" (pas
    // encore de date de fin) et saison active.
    .filter((b: any) => {
      if (!debutSaison || !finSaison) return true;
      if (!b.dateDebut) return estSaisonActive; // pas de date + saison active = ok
      const d = new Date(b.dateDebut);
      return d >= debutSaison && d <= finSaison;
    });

  // Fatigue : uniquement sur la saison active (l'API ne la renvoie pas ailleurs). Un joueur sans score
  // (blesse, ou aucune seance ni match sur 28 jours) n'apparait pas : jamais de valeur inventee.
  const suivis = estSaisonActive
    ? effectif
        .filter((j: any) => typeof j.scoreFatigue === "number")
        .map((j: any) => ({ ...j, detail: lireDetailFatigue(j.fatigueDetail) }))
        .sort((a: any, b: any) => b.scoreFatigue - a.scoreFatigue)
    : [];
  const sansScore = estSaisonActive
    ? effectif.filter((j: any) => typeof j.scoreFatigue !== "number")
    : [];

  const chargeTotaleAcute = suivis.reduce(
    (s: number, j: any) => s + (j.chargeAcute7j ?? 0), 0,
  );

  const BLESSES = blessuresEquipe.filter((b: any) => {
    const s = (b.statut ?? "").toLowerCase();
    return !s.includes("retabli") && !s.includes("guerie") && !s.includes("termine");
  });

  // "Fatigue elevee" : niveaux charge et surcharge (score de 55 et plus).
  const fatigueElevee = suivis.filter((j: any) => ["charge", "surcharge"].includes(niveauFatigue(j.scoreFatigue) ?? "")).length;
  const rienImporte = effectif.length === 0;

  const headerLibelle = equipe
    ? `${equipe.nom}${equipe.competitionLibelle ? ` · ${equipe.competitionLibelle}` : ""}`
    : "Medical & charge";

  return (
    <div className="space-y-6 fade-up">
      <header>
        <div className="h-section">Medical & charge</div>
        <h1 className="font-display text-2xl font-bold text-ink">{headerLibelle}</h1>
        {saisonCourante && (
          <div className="text-xs text-muted flex items-center gap-1.5 mt-1">
            <HeartPulse size={11} className="text-accent"/>
            Saison <strong className="text-ink">{saisonCourante.nom}</strong>
            {!estSaisonActive && (
              <span className="text-faint">· stats non pertinentes (saison inactive)</span>
            )}
          </div>
        )}
      </header>

      {rienImporte ? (
        <section className="panel p-8 text-center">
          <HeartPulse size={22} className="text-muted mx-auto mb-2"/>
          <div className="text-sm text-muted mb-2">Aucune donnee sur cette equipe.</div>
          <p className="text-xs text-faint max-w-md mx-auto">
            Le suivi medical et la charge se remplissent au fur et a
            mesure des imports de feuilles FMI et de la saisie
            d'entrainements. C'est normal en debut de saison.
          </p>
        </section>
      ) : !estSaisonActive ? (
        <section className="panel p-8 text-center">
          <HeartPulse size={22} className="text-muted mx-auto mb-2"/>
          <div className="text-sm text-muted mb-2">
            Charge et fatigue : indisponibles hors saison active.
          </div>
          <p className="text-xs text-faint max-w-md mx-auto">
            La fatigue se mesure sur les 4 dernieres semaines
            d'entrainements et de matchs : elle n'a de sens que sur la
            saison active en cours. Bascule sur la saison active dans le
            switcher pour la voir.
          </p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Effectif" value={effectif.length} icon={<HeartPulse size={14}/>}/>
            <Kpi label="Blesses" value={BLESSES.length} icon={<Heart size={14}/>}
              tone={BLESSES.length > 0 ? "danger" : "neutral"}/>
            <Kpi label="Fatigue elevee" value={fatigueElevee} icon={<AlertTriangle size={14}/>}
              tone={fatigueElevee > 0 ? "amber" : "neutral"}/>
            <Kpi label="Charge cumulee 7j" value={Math.round(chargeTotaleAcute)}
              suffix="UA" icon={<Activity size={14}/>}/>
          </section>

          {/* Les blessures d'abord : c'est ce qui change la composition d'equipe, la fatigue vient ensuite. */}
          <BlessuresEditeur joueurs={effectif as any} initialBlessures={blessuresEquipe as any}/>

          <section className="panel p-5">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="h-section">Fatigue de l'effectif</h2>
              <span className="text-[11px] text-faint">charge d'entrainement + charge en match, 28 derniers jours</span>
            </div>
            {suivis.length === 0 ? (
              <p className="py-4 text-sm text-muted">
                Aucune charge recente connue : ni match ni seance avec presences sur les 4 dernieres semaines.
                Saisis les presences aux entrainements pour suivre la fatigue de l'effectif.
              </p>
            ) : (
              <table className="table-fm table-dense">
                <thead>
                  <tr>
                    <th>Joueur</th>
                    <th className="hidden sm:table-cell">Poste</th>
                    <th className="text-right">Min. 7j</th>
                    <th className="hidden text-right md:table-cell">Charge 7j</th>
                    <th className="hidden text-right md:table-cell">ACWR</th>
                    <th>Fatigue</th>
                    <th className="hidden lg:table-cell">Ce qui pese</th>
                  </tr>
                </thead>
                <tbody>
                  {suivis.slice(0, 15).map((j: any) => (
                    <tr key={j.id ?? j.nom}>
                      <td className="font-semibold">{j.prenom} {j.nom}</td>
                      <td className="hidden text-xs text-muted sm:table-cell">{j.poste ?? "—"}</td>
                      <td className="text-right tabular-nums">{j.detail?.minutes7j ?? 0}</td>
                      <td className="hidden text-right tabular-nums md:table-cell">{Math.round(j.chargeAcute7j ?? 0)}</td>
                      <td className="hidden text-right tabular-nums md:table-cell">{j.acwr != null ? j.acwr.toFixed(2) : "—"}</td>
                      <td><FatigueBar score={j.scoreFatigue} detail={j.fatigueDetail} /></td>
                      <td className="hidden max-w-[22rem] text-[11px] text-faint lg:table-cell">
                        {j.detail ? facteursPrincipaux(j.detail, 2).map((f) => f.libelle).join(" · ") : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {suivis.length > 15 && (
              <p className="mt-3 text-center text-[11px] text-faint">
                Les 15 joueurs les plus fatigues sur {suivis.length} suivis. Le detail de chaque score est sur la fiche du joueur.
              </p>
            )}
            {suivis.some((j: any) => estEstimation(j.detail)) && (
              <p className="mt-3 text-[11px] text-faint">* Estimation : historique de moins de 2 semaines ou aucune presence aux seances enregistree.</p>
            )}
            {sansScore.length > 0 && suivis.length > 0 && (
              <p className="mt-2 text-[11px] text-faint">
                {sansScore.length} joueur{sansScore.length > 1 ? "s" : ""} sans score (blesse, ou aucune charge sur 28 jours).
              </p>
            )}
            <div className="mt-4 border-t border-line pt-3"><FatigueLegende /></div>
          </section>

        </>
      )}
    </div>
  );
}

function Kpi({
  label, value, suffix, icon, tone = "neutral",
}: {
  label: string; value: number | string; suffix?: string;
  icon?: React.ReactNode;
  tone?: "neutral" | "accent" | "danger" | "amber";
}) {
  const toneClass =
    tone === "accent" ? "text-accent"
    : tone === "danger" ? "text-danger"
    : tone === "amber" ? "text-amber"
    : "text-ink";
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-1.5 text-faint">
        {icon}<span className="stat-label">{label}</span>
      </div>
      <div className={`font-display text-2xl font-bold leading-none mt-2 tabular-nums ${toneClass}`}>
        {value}{suffix && <span className="text-xs text-muted font-medium ml-1">{suffix}</span>}
      </div>
    </div>
  );
}
