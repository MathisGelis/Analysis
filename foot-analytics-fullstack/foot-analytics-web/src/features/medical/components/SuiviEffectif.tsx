// src/features/medical/components/SuiviEffectif.tsx
//
// MEDICAL SUR LA SAISON EN COURS (ou a venir) : les blessures d'abord (c'est ce qui change la composition d'equipe), puis la
// fatigue de l'effectif (charge d'entrainement + charge en match sur 28 jours). La fatigue est TOUJOURS affichee sur la saison
// en cours : quand il n'y a rien a montrer (aucune charge recente, effectif vide), la section le dit au lieu de disparaitre.
// Sur une saison a venir, la fatigue n'existe pas encore : la section l'explique.

import { Activity, AlertTriangle, Heart, HeartPulse } from "lucide-react";

import { FatigueBar } from "@/features/joueurs/components/FatigueBar";
import { FatigueLegende } from "@/features/joueurs/components/FatiguePanel";
import { estEstimation, facteursPrincipaux, lireDetailFatigue, niveauFatigue } from "@/features/joueurs/lib/fatigue";

import { blessureEnCours } from "../lib/blessures";
import { BlessuresEditeur } from "./BlessuresEditeur";

interface Props {
  effectif: any[];
  blessures: any[];
  /** true : saison en cours, la fatigue est calculee. false : saison a venir. */
  saisonEnCours: boolean;
}

export function SuiviEffectif({ effectif, blessures, saisonEnCours }: Props) {
  // Un joueur sans score (blesse, ou aucune seance ni match sur 28 jours) n'apparait pas : jamais de valeur inventee.
  const suivis = saisonEnCours
    ? effectif
        .filter((j) => typeof j.scoreFatigue === "number")
        .map((j) => ({ ...j, detail: lireDetailFatigue(j.fatigueDetail) }))
        .sort((a, b) => b.scoreFatigue - a.scoreFatigue)
    : [];
  const sansScore = saisonEnCours ? effectif.filter((j) => typeof j.scoreFatigue !== "number") : [];
  const chargeAcute = suivis.reduce((s: number, j: any) => s + (j.chargeAcute7j ?? 0), 0);
  const blesses = blessures.filter((b) => blessureEnCours(b));
  // "Fatigue elevee" : niveaux charge et surcharge (score de 55 et plus).
  const fatigueElevee = suivis.filter((j) => ["charge", "surcharge"].includes(niveauFatigue(j.scoreFatigue) ?? "")).length;

  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Chiffres cles" data-testid="suivi-chiffres">
        <Chiffre label="Effectif" value={effectif.length} icon={<HeartPulse size={14} />} />
        <Chiffre label="Blesses" value={blesses.length} icon={<Heart size={14} />} tone={blesses.length > 0 ? "danger" : "neutral"} />
        <Chiffre label="Fatigue elevee" value={saisonEnCours ? fatigueElevee : "—"} icon={<AlertTriangle size={14} />}
          tone={fatigueElevee > 0 ? "amber" : "neutral"} />
        <Chiffre label="Charge cumulee 7j" value={saisonEnCours ? Math.round(chargeAcute) : "—"} suffix={saisonEnCours ? "UA" : undefined}
          icon={<Activity size={14} />} />
      </section>

      {effectif.length === 0 ? (
        <section className="panel p-8 text-center">
          <HeartPulse size={22} className="mx-auto mb-2 text-muted" aria-hidden />
          <div className="mb-2 text-sm text-muted">Aucune donnee sur cette equipe.</div>
          <p className="mx-auto max-w-md text-xs text-faint">
            Le suivi medical et la charge se remplissent au fur et a mesure des imports de feuilles FMI et de la saisie
            d&apos;entrainements. C&apos;est normal en debut de saison.
          </p>
        </section>
      ) : (
        <BlessuresEditeur joueurs={effectif as any} initialBlessures={blessures as any} />
      )}

      <section className="panel p-5" data-testid="fatigue-effectif" aria-label="Fatigue de l'effectif">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="h-section">Fatigue de l&apos;effectif</h2>
          <span className="text-[11px] text-faint">charge d&apos;entrainement + charge en match, 28 derniers jours</span>
        </div>
        {!saisonEnCours ? (
          <p className="py-4 text-sm text-muted">
            La fatigue se mesure sur les 4 dernieres semaines d&apos;entrainements et de matchs : elle apparait des que la saison est en cours.
          </p>
        ) : suivis.length === 0 ? (
          <p className="py-4 text-sm text-muted">
            Aucune charge recente connue : ni match ni seance avec presences sur les 4 dernieres semaines.
            Saisis les presences aux entrainements pour suivre la fatigue de l&apos;effectif.
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
        {saisonEnCours && <div className="mt-4 border-t border-line pt-3"><FatigueLegende /></div>}
      </section>
    </>
  );
}

function Chiffre({
  label, value, suffix, icon, tone = "neutral",
}: { label: string; value: number | string; suffix?: string; icon?: React.ReactNode; tone?: "neutral" | "danger" | "amber" }) {
  const couleur = tone === "danger" ? "text-danger" : tone === "amber" ? "text-amber" : "text-ink";
  return (
    <div className="panel p-4">
      <div className="flex items-center gap-1.5 text-faint">{icon}<span className="stat-label">{label}</span></div>
      <div className={`mt-2 font-display text-2xl font-bold leading-none tabular-nums ${couleur}`}>
        {value}{suffix && <span className="ml-1 text-xs font-medium text-muted">{suffix}</span>}
      </div>
    </div>
  );
}
