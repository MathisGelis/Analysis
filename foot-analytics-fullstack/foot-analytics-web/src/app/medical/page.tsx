// src/app/medical/page.tsx
//
// Suivi medical et charge d'entrainement.
// SAISON-SENSITIVE : les stats de charge (7j/28j) sont par nature
// liees a la saison en cours. Sur une saison future ou passee, elles
// s'affichent a 0. Les blessures sont filtrees par periode saisonniere
// (aout <anneeDebut> -> juillet <anneeDebut+1>).

import { api } from "@/lib/api";
import { resolveEquipePropre } from "@/lib/resolve-equipe-propre";
import { BlessuresEditeur } from "@/components/BlessuresEditeur";
import { Activity, AlertTriangle, Heart, HeartPulse } from "lucide-react";

export const metadata = { title: "Medical & charge · Foot Analytics" };

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

  // Stats de charge : uniquement si saison active. Sinon on remet tout
  // a 0 (les valeurs stockees sont des snapshots temps reel qui ne
  // s'appliquent qu'a la saison en cours).
  const effectifPourStats = effectif.map((j: any) => estSaisonActive ? j : ({
    ...j,
    chargeAcute7j: 0,
    chargeChronic28j: 0,
    scoreFatigue: 0,
    scoreForme: 0,
    // Cartons/minutes/matchs restent visibles seulement si actif.
    minutes: 0, matchs: 0,
    cartonsJaunes: 0, cartonsRouges: 0,
  }));

  const joueursActifs = effectifPourStats.filter((j: any) =>
    (j.chargeAcute7j ?? 0) > 0 || (j.chargeChronic28j ?? 0) > 0 || (j.matchs ?? 0) >= 5,
  );
  const fatigue = joueursActifs
    .map((j: any) => ({
      ...j,
      fatigue: j.scoreFatigue ?? Math.min(95, Math.round((j.minutes ?? 0) / 18)),
      risque: Math.min(90, (j.cartonsJaunes ?? 0) * 5 + ((j.minutes ?? 0) > 1200 ? 25 : 5)),
    }))
    .sort((a: any, b: any) => b.fatigue - a.fatigue);

  const chargeTotaleAcute = joueursActifs.reduce(
    (s: number, j: any) => s + (j.chargeAcute7j ?? 0), 0,
  );

  const BLESSES = blessuresEquipe.filter((b: any) => {
    const s = (b.statut ?? "").toLowerCase();
    return !s.includes("retabli") && !s.includes("guerie") && !s.includes("termine");
  });

  const fatigueElevee = fatigue.filter((j: any) => j.fatigue >= 70).length;
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
            Les mesures de charge (ACWR 7j/28j, fatigue) sont des
            snapshots temps reel qui ne s'appliquent qu'a la saison
            active en cours. Bascule sur la saison active dans le
            switcher pour voir les stats a jour.
          </p>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Kpi label="Effectif" value={effectif.length} icon={<HeartPulse size={14}/>}/>
            <Kpi label="Fatigue elevee" value={fatigueElevee} icon={<AlertTriangle size={14}/>}
              tone={fatigueElevee > 0 ? "amber" : "neutral"}/>
            <Kpi label="Blesses" value={BLESSES.length} icon={<Heart size={14}/>}
              tone={BLESSES.length > 0 ? "danger" : "neutral"}/>
            <Kpi label="Charge cumulee 7j" value={Math.round(chargeTotaleAcute)}
              suffix="UA" icon={<Activity size={14}/>}/>
          </section>

          {fatigue.length > 0 && (
            <section className="panel p-5">
              <h2 className="h-section mb-3">Charge & risque (top 10)</h2>
              <table className="table-fm">
                <thead>
                  <tr>
                    <th>Joueur</th><th>Poste</th>
                    <th className="text-right">Minutes</th>
                    <th className="text-right">Charge 7j</th>
                    <th className="text-right">ACWR</th>
                    <th className="text-right">Fatigue</th>
                  </tr>
                </thead>
                <tbody>
                  {fatigue.slice(0, 10).map((j: any) => (
                    <tr key={j.id}>
                      <td className="font-semibold">{j.prenom} {j.nom}</td>
                      <td className="text-xs text-muted">{j.poste ?? "—"}</td>
                      <td className="text-right tabular-nums">{j.minutes ?? 0}</td>
                      <td className="text-right tabular-nums">{Math.round(j.chargeAcute7j ?? 0)}</td>
                      <td className="text-right tabular-nums">{(j.acwr ?? 1).toFixed(2)}</td>
                      <td className="text-right tabular-nums">
                        <span className={
                          j.fatigue >= 80 ? "text-danger font-bold"
                          : j.fatigue >= 60 ? "text-amber font-bold"
                          : "text-accent font-bold"}>
                          {j.fatigue}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          )}

          <BlessuresEditeur joueurs={effectif as any} initialBlessures={blessuresEquipe as any}/>
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
