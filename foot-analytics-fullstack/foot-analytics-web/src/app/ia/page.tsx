// src/app/ia/page.tsx
//
// Predictions pour le prochain match, calculees sur VOS feuilles de match importees (plus aucun jeu d'exemple) :
//   - projection du resultat (modele de Poisson sur les moyennes de buts),
//   - systeme de jeu probable de l'adversaire (d'apres les dispositifs que le staff a renseignes : la FMI n'en
//     contient aucun),
//   - onze probable (titulaires les plus utilises),
//   - joueurs a surveiller chez nous (fatigue), et pistes du rapport pre-match.
// Chaque bloc dit sur quoi il repose et se tait quand l'echantillon est trop petit.
//
// L'adversaire est celui du prochain match programme, ou celui choisi avec ?adversaire=<clubId>.

import Link from "next/link";
import { api } from "@/lib/api";
import { resolveEquipePropre } from "@/lib/resolve-equipe-propre";
import { resultatsDeLEquipe } from "@/lib/matchs-equipe";
import { ligneDuPoste } from "@/lib/composition";
import { plusFatigues, COULEUR_NIVEAU, LIBELLE_NIVEAU, niveauFatigue } from "@/lib/fatigue";
import { decimal } from "@/lib/tendances-format";
import { ClubBadge } from "@/components/ClubBadge";
import { Pitch, type JoueurTerrain } from "@/components/Pitch";
import { FatigueBar } from "@/components/FatigueBar";
import { PistesMatch } from "@/components/prematch/PistesMatch";
import { SystemeProbable } from "@/components/prematch/SystemeProbable";
import { ArrowRight, Brain, CalendarClock, Sparkles, Target, Users } from "lucide-react";

export const metadata = { title: "Predictions · Foot Analytics" };

export default async function Predictions({ searchParams }: { searchParams?: { adversaire?: string } }) {
  const [equipes, saisons, matchs, clubs] = await Promise.all([api.equipes(), api.saisons(), api.matchs(), api.clubs()]);
  const { equipe: maEquipe, saison, equipesDuChampionnat } = await resolveEquipePropre({ equipes, saisons, matchs });

  if (!maEquipe) {
    return <Vide titre="Choisissez d'abord votre equipe">Les predictions se lisent du point de vue de votre equipe : selectionnez-la dans la barre du haut.</Vide>;
  }

  // Adversaire : le prochain match programme, sinon celui choisi dans la liste.
  const prochain = resultatsDeLEquipe(matchs, maEquipe.id).aVenir[0];
  const prochainAdvId = prochain ? (prochain.equipeDomId === maEquipe.id ? prochain.clubExt : prochain.clubDom) : null;
  const adversaireId = searchParams?.adversaire ?? prochainAdvId;
  const adversaires = clubs
    .filter((c) => c.id !== maEquipe.clubId && equipes.some((e: any) => e.clubId === c.id && equipesDuChampionnat.has(e.id)))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  const r = adversaireId && adversaireId !== maEquipe.clubId
    ? await api.prematch(maEquipe.id, adversaireId, prochain && adversaireId === prochainAdvId ? prochain.id : null)
    : null;
  const effectif: any[] = saison?.actif ? await api.effectifEquipe(maEquipe.id) : [];
  const surveilles = plusFatigues(effectif.filter((j) => j.id), 5);

  return (
    <div className="space-y-6 fade-up">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="h-section flex items-center gap-1.5"><Brain size={11} /> Calcule sur vos feuilles de match</div>
          <h1 className="font-display text-2xl font-bold text-ink">Predictions</h1>
        </div>
        {prochain && r && adversaireId === prochainAdvId && (
          <span className="badge badge-accent"><CalendarClock size={11} aria-hidden /> Prochain match : {prochain.date ?? "date a confirmer"}</span>
        )}
      </header>

      {/* Choix de l'adversaire */}
      {adversaires.length > 0 && (
        <nav aria-label="Adversaire" className="flex flex-wrap gap-1.5">
          {adversaires.map((c) => (
            <Link key={c.id} href={`/ia?adversaire=${c.id}`}
              className={`badge ${c.id === adversaireId ? "badge-accent" : "hover:border-accent/40 hover:text-accent"}`}
              aria-current={c.id === adversaireId ? "page" : undefined}>
              <ClubBadge clubId={c.id} size={14} /> {c.nom}{c.id === prochainAdvId ? " · prochain" : ""}
            </Link>
          ))}
        </nav>
      )}

      {!r ? (
        <Vide titre={adversaires.length ? "Choisissez un adversaire" : "Aucun adversaire dans votre championnat"}>
          {adversaires.length
            ? "Aucun match n'est programme : choisissez un adversaire ci-dessus pour obtenir ses predictions."
            : "Les predictions demandent des feuilles de match importees pour le championnat de votre equipe."}
        </Vide>
      ) : (
        <>
          {/* Projection et joueurs a surveiller (gauche) ; systeme et onze probable (droite) */}
          <section className="grid grid-cols-12 items-start gap-4">
            <div className="col-span-12 space-y-4 lg:col-span-5">
            <div className="panel p-5">
              <div className="h-section mb-3 flex items-center gap-1.5"><Target size={11} className="text-accent" /> Projection du resultat</div>
              <div className="mb-4 flex items-center gap-3">
                <ClubBadge clubId={r.monEquipe.clubId} size={36} />
                <span className="font-display font-bold">{r.monEquipe.clubNom}</span>
                <span className="text-faint">vs</span>
                <span className="font-display font-bold">{r.adversaire.clubNom}</span>
                <ClubBadge clubId={r.adversaire.clubId} size={36} />
              </div>
              {r.projection ? (
                <>
                  <div className="space-y-3">
                    <Proba label="Victoire" valeur={r.projection.pV} couleur="rgb(var(--win))" />
                    <Proba label="Match nul" valeur={r.projection.pN} couleur="rgb(var(--draw))" />
                    <Proba label="Defaite" valeur={r.projection.pD} couleur="rgb(var(--loss))" />
                  </div>
                  <div className="panel-inset mt-4 border-l-2 border-accent p-3">
                    <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-accent"><Sparkles size={11} aria-hidden /> Score le plus probable</div>
                    <div className="mt-1 font-display text-3xl font-black tabular-nums text-ink">
                      {r.projection.scoreProbable.moi} – {r.projection.scoreProbable.adv}
                      <span className="ml-2 text-xs font-normal text-faint">{r.projection.scoreProbable.proba} % de chances</span>
                    </div>
                    <p className="mt-1 text-[12px] text-muted">
                      Buts attendus : {decimal(r.projection.buts.moi)} pour nous, {decimal(r.projection.buts.adv)} pour eux. Modele de Poisson sur les moyennes
                      de buts (sur au moins {r.projection.matchs} matchs de chaque equipe){r.match ? `, ${r.match.domicile ? "a domicile" : "a l'exterieur"} compris` : ""}.
                    </p>
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted">
                  Pas assez de matchs joues pour projeter un resultat : il en faut au moins 5 de chaque cote ({r.monEquipe.matchs} pour nous, {r.adversaire.matchs} pour {r.adversaire.clubNom}).
                </p>
              )}
            </div>
            <div className="panel p-5">
              <div className="h-section mb-3">Joueurs a surveiller chez nous</div>
              {surveilles.length === 0 ? (
                <p className="text-sm text-muted">
                  {saison?.actif
                    ? "Aucune charge recente connue : la fatigue se calcule sur les seances et les matchs des 28 derniers jours."
                    : "La fatigue est une mesure du moment : elle n'est disponible que sur la saison en cours."}
                </p>
              ) : (
                <ul className="divide-y divide-line">
                  {surveilles.map((j: any) => {
                    const niveau = niveauFatigue(j.scoreFatigue);
                    return (
                      <li key={j.id} className="flex items-center gap-3 py-2 text-sm">
                        <Link href={`/joueur/${j.id}`} className="min-w-0 flex-1 truncate font-semibold text-ink hover:text-accent">{j.prenom} {j.nom}</Link>
                        {niveau && <span className="text-[11px]" style={{ color: COULEUR_NIVEAU[niveau] }}>{LIBELLE_NIVEAU[niveau]}</span>}
                        <FatigueBar score={j.scoreFatigue} detail={j.fatigueDetail} largeur="w-16" />
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            </div>

            <div className="col-span-12 space-y-4 lg:col-span-7">
              <div className="panel p-5">
                <div className="h-section mb-3 flex items-center gap-1.5"><Brain size={11} className="text-accent" /> Systeme de jeu probable de {r.adversaire.clubNom}</div>
                <SystemeProbable donnees={r.systemeAdverse} adversaire={r.adversaire.clubNom} />
              </div>
              <div className="panel p-5">
                <div className="h-section mb-3 flex items-center gap-1.5"><Users size={11} className="text-accent" /> Onze probable</div>
                <OnzeProbable compo={r.analyse?.compoProbable ?? []} systeme={r.systemeAdverse.prediction?.systeme ?? null} matchsAnalyses={r.analyse?.matchsAnalyses ?? 0} />
              </div>
            </div>
          </section>

          {/* Pistes du rapport pre-match */}
            <div className="panel p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div className="h-section">Pistes pour le match</div>
                <Link href={`/rapports/prematch/${r.adversaire.clubId}${r.match ? `?matchId=${r.match.id}` : ""}`} className="flex items-center gap-1 text-xs font-semibold text-accent hover:underline">
                  Rapport pre-match complet <ArrowRight size={12} aria-hidden />
                </Link>
              </div>
              {r.pistes.length > 0 ? <PistesMatch pistes={r.pistes.slice(0, 4)} /> : (
                <p className="text-sm text-muted">Pas encore assez de matchs joues pour degager des pistes fiables.</p>
              )}
            </div>
        </>
      )}
    </div>
  );
}

function Proba({ label, valeur, couleur }: { label: string; valeur: number; couleur: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-xs text-muted">{label}</div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" role="img" aria-label={`${label} : ${valeur} %`}>
        <div className="h-full" style={{ width: `${valeur}%`, background: couleur }} />
      </div>
      <div className="w-10 text-right font-mono font-bold tabular-nums">{valeur}%</div>
    </div>
  );
}

/**
 * Le onze le plus utilise par l'adversaire. Sur le terrain quand son systeme est connu (joueurs ranges de la
 * defense a l'attaque d'apres leur poste, selon les lignes du systeme) ; sinon en liste, sans inventer de dispositif.
 */
function OnzeProbable({ compo, systeme, matchsAnalyses }: {
  compo: { poste: string; numero?: number; nom: string; matchsJoues: number }[]; systeme: string | null; matchsAnalyses: number;
}) {
  if (compo.length === 0) {
    return <p className="text-sm text-muted">Aucune feuille de match de cet adversaire n'a ete analysee sur la saison : pas de onze probable.</p>;
  }
  const ordre = { GB: 0, DEF: 1, MIL: 2, ATT: 3 } as const;
  const tries = [...compo].sort((a, b) => ordre[ligneDuPoste(a.poste) ?? "MIL"] - ordre[ligneDuPoste(b.poste) ?? "MIL"]);
  const note = <p className="mt-3 text-[11px] text-muted">Titulaires les plus utilises sur {matchsAnalyses} match{matchsAnalyses > 1 ? "s" : ""} analyse{matchsAnalyses > 1 ? "s" : ""}.</p>;
  if (!systeme) {
    return (
      <>
        <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
          {tries.map((j) => (
            <li key={`${j.poste}-${j.nom}`} className="flex items-center gap-3 border-b border-line py-1.5 text-sm">
              <span className="badge w-10 justify-center">{j.poste}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-ink">{j.nom}</span>
              <span className="text-xs tabular-nums text-faint">{j.matchsJoues} titu.</span>
            </li>
          ))}
        </ul>
        {note}
      </>
    );
  }
  // Sur le terrain : le nom de famille (en majuscules sur la feuille) ; les numeros de maillot, seulement s'ils sont tous distincts.
  const onze = tries.slice(0, 11);
  const numerosDistincts = new Set(onze.map((j) => j.numero)).size === onze.length && onze.every((j) => typeof j.numero === "number");
  const joueurs: JoueurTerrain[] = onze.map((j, i) => ({
    numero: numerosDistincts ? (j.numero as number) : i + 1,
    nom: j.nom.split(" ").filter((m) => m.length > 1 && m === m.toUpperCase()).join(" ") || j.nom,
  }));
  return (
    <>
      <div className="mx-auto max-w-[360px]">
        <Pitch formation={systeme} joueurs={joueurs} couleur="rgb(var(--sky))" titre={`Onze probable · ${systeme}`} />
      </div>
      {note}
    </>
  );
}

function Vide({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <section className="panel space-y-2 p-8 text-center">
      <div className="font-display text-lg font-bold text-ink">{titre}</div>
      <p className="mx-auto max-w-xl text-sm text-muted">{children}</p>
    </section>
  );
}
