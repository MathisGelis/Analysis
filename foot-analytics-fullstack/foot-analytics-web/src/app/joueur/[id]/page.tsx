// src/app/joueur/[id]/page.tsx
// Fiche joueur 100% dynamique : donnees, evolution forme, charge entrainement
// et historique de matchs viennent tous de l'API.

import { notFound } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getOwnSaisonIdServer } from "@/lib/own-equipe";
import { choisirSaisonFiche, indiceDiscipline, numeroPrincipal } from "@/lib/fiche-joueur";
import { JoueurEditButton } from "@/components/JoueurEditButton";
import { DonutStat, Sparkline } from "@/components/Charts";
import { ClubBadge } from "@/components/ClubBadge";
import { TerrainPostes } from "@/components/TerrainPostes";
import { HistoriqueClub } from "@/components/HistoriqueClub";
import { JoueurTabs } from "@/components/JoueurTabs";
import { CorpsHumain } from "@/components/CorpsHumain";
import { BlessuresEditeur } from "@/components/BlessuresEditeur";
import {
  Activity, AlertTriangle, ArrowLeft, Calendar, Dumbbell, Footprints,
  Ruler, Scale, Star, Target,
} from "lucide-react";

export default async function JoueurPage({
  params, searchParams,
}: { params: { id: string }; searchParams: { saison?: string } }) {
  const j = await api.joueur(params.id);
  if (!j) notFound();

  // Toute la fiche est lue sur UNE saison : celle demandee (?saison=), sinon
  // celle du selecteur, sinon la saison active. Les compteurs globaux du joueur
  // (toutes saisons confondues) ne sont jamais affiches ici.
  const [clubs, saisons, historique, equipes, blessures] = await Promise.all([
    api.clubs(),
    api.saisons(),
    api.joueurHistorique(j.id),
    api.equipes(),
    api.blessures(j.id),
  ]);
  const { saison, entree, totaux, ligne } = choisirSaisonFiche({
    historique, saisons,
    demandee: searchParams.saison, cookie: getOwnSaisonIdServer(),
  });
  const saisonActive = !!saison?.actif;

  // Equipe et club de CETTE saison (un joueur peut avoir change de club).
  const equipe = ligne?.equipeId ? equipes.find((e: any) => e.id === ligne.equipeId) : undefined;
  const club = clubs.find((c) => c.id === (ligne?.clubId ?? j.clubId));
  const numero = numeroPrincipal(totaux.numeros) ?? j.numeroFavori ?? null;

  const [entrainements, matchsJoues] = await Promise.all([
    equipe ? api.entrainements(equipe.id) : Promise.resolve([]),
    saison ? api.joueurMatchs(j.id, saison.id, 8) : Promise.resolve([]),
  ]);

  // Saisons proposees : celles du parcours + la saison consultee.
  const saisonsProposees = saisons
    .filter((s: any) => s.id === saison?.id || historique.some((h) => h.saisonId === s.id))
    .sort((x: any, y: any) => y.anneeDebut - x.anneeDebut);

  // Forme, fatigue, charge : mesures du MOMENT, sans sens sur une saison
  // passee ou a venir.
  const formeBase = j.scoreForme ?? 50;
  const evolutionForme = [-12, -8, -4, -2, 0].map((d) => Math.max(0, formeBase + d));
  const chargesRecentes = entrainements
    .filter((e: any) => e.joueursPresents?.includes(j.id))
    .slice(-8)
    .map((e: any) => Math.round(e.charge ?? 0));

  const discipline = indiceDiscipline(totaux);

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-center justify-between">
        <Link href="/effectif" className="text-xs text-muted hover:text-ink flex items-center gap-1">
          <ArrowLeft size={12}/> Retour effectif
        </Link>
        <JoueurEditButton joueur={j} />
      </div>

      {/* SAISON CONSULTEE : tout ce qui suit est lu sur cette saison */}
      {saisonsProposees.length > 0 && (
        <nav aria-label="Saison consultee" className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider text-faint flex items-center gap-1.5">
            <Calendar size={11} className="text-accent"/> Saison
          </span>
          {saisonsProposees.map((s: any) => (
            <Link key={s.id} href={`/joueur/${j.id}?saison=${s.id}`} scroll={false}
              aria-current={s.id === saison?.id ? "true" : undefined}
              className={`badge ${s.id === saison?.id ? "badge-accent" : "hover:text-ink"}`}>
              {s.nom}{s.actif ? " · en cours" : ""}
            </Link>
          ))}
        </nav>
      )}

      {/* IDENTITE */}
      <header className="panel relative grid grid-cols-12 gap-5 overflow-hidden p-6">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-accentstrong/[0.16] via-transparent to-accent2/[0.06]" />
        <div className="pitch-lines" />
        <div className="relative col-span-12 flex items-center gap-5 md:col-span-6">
          <div className="grid h-24 w-24 shrink-0 place-items-center rounded-3xl bg-gradient-to-br from-accentstrong to-accentdeep font-display text-5xl font-bold text-white shadow-glow"
            title="Numero le plus porte sur la saison">
            {numero ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-[0.18em] text-faint">{j.poste ?? "—"}</div>
            <h1 className="font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">
              {j.prenom} <span className="text-muted font-light">{j.nom}</span>
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`badge ${
                j.statutMutation === "Mutation" ? "badge-amber"
                : j.statutMutation === "Mutation hors delai" ? "badge-amber"
                : j.statutMutation === "Pas mutation" ? "badge-accent"
                : ""
              }`}>{j.statutMutation ?? "—"}</span>
              {club && (
                <Link href={`/club/${club.id}`} className="badge flex items-center gap-1 hover:text-accent">
                  <ClubBadge clubId={club.id} size={14}/> {club.nom}
                </Link>
              )}
              {equipe && (
                <span className="badge" title={equipe.nom}>
                  {equipe.categorie ?? ""} {equipe.division ?? ""}{equipe.poule ? ` · Poule ${equipe.poule}` : ""}
                </span>
              )}
              {j.typeDiscipline && (
                <span className="badge badge-danger">{j.typeDiscipline}</span>
              )}
            </div>
            {j.commentaire && (
              <div className="text-xs text-faint italic mt-2">« {j.commentaire} »</div>
            )}
          </div>
        </div>

        <div className="relative col-span-12 grid grid-cols-3 gap-3 md:col-span-6">
          <Card label="Score forme" big={
            saisonActive && j.scoreForme != null ? (
              <DonutStat value={j.scoreForme} size={96} stroke={9}
                color={j.scoreForme>70?"rgb(var(--accent))":j.scoreForme>50?"rgb(var(--amber))":"rgb(var(--danger))"}
                label="/ 100" />
            ) : (
              <Indisponible pourquoi={saisonActive ? "Pas encore calcule" : "Mesure de la saison en cours"} />
            )
          } />
          <Card label="Note moyenne" big={
            totaux.noteMoyenne != null ? (
              <div className="font-display text-5xl font-black text-accent">
                {totaux.noteMoyenne.toFixed(1)}
              </div>
            ) : (
              <Indisponible pourquoi="Aucun match cette saison" />
            )
          } />
          <Card label="Fatigue" big={
            saisonActive && j.scoreFatigue != null ? (
              <div className="flex flex-col items-center">
                <div className={`font-display text-3xl font-black ${
                  j.scoreFatigue >= 80 ? "text-danger"
                  : j.scoreFatigue >= 60 ? "text-amber"
                  : j.scoreFatigue >= 40 ? "text-accent"
                  : "text-faint"
                }`}>
                  {j.scoreFatigue}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-faint mt-1">
                  {j.acwr != null ? `ACWR ${j.acwr.toFixed(2)}` : "Derive"}
                </div>
              </div>
            ) : (
              <Indisponible pourquoi={saisonActive ? "Pas de charge suivie" : "Mesure de la saison en cours"} />
            )
          } />
        </div>
      </header>

      <JoueurTabs
        infosContent={
          <section className="space-y-5">
            {/* MORPHO + STATUT */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Mini icon={<Ruler size={14}/>} label="Taille"
                value={j.tailleCm ? `${j.tailleCm} cm` : "—"}/>
              <Mini icon={<Scale size={14}/>} label="Poids"
                value={j.poidsKg ? `${j.poidsKg} kg` : "—"}/>
              <Mini icon={<Footprints size={14}/>} label="Pied fort"
                value={j.piedFort ? j.piedFort.charAt(0).toUpperCase() + j.piedFort.slice(1) : "—"}/>
              <Mini icon={<Calendar size={14}/>} label="Date de naissance"
                value={j.dateNaissance ?? "—"}/>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Mini icon={<Star size={14}/>} label="Numero favori"
                value={j.numeroFavori ?? "—"}/>
              <Mini icon={<Target size={14}/>} label="Poste"
                value={j.poste ?? "—"}/>
              <Mini icon={<AlertTriangle size={14}/>} label="Statut"
                value={j.statutMutation ?? "—"}/>
            </div>
            {j.commentaire && (
              <section className="panel p-5">
                <div className="h-section mb-2">Commentaire</div>
                <p className="text-sm text-muted italic">« {j.commentaire} »</p>
              </section>
            )}
          </section>
        }
        statsContent={
          <section className="space-y-5">
            <div className="text-xs text-muted flex items-center gap-1.5 flex-wrap">
              <Calendar size={11} className="text-accent"/>
              Stats sur la saison <strong className="text-ink">{saison?.nom ?? "—"}</strong>
              {equipe && <span className="text-faint">· {equipe.nom}</span>}
              {!entree && <span className="text-faint">· pas inscrit sur cette saison</span>}
              {entree && totaux.matchs === 0 && (
                <span className="text-faint">· pas encore joue de match</span>
              )}
            </div>
            {/* KPI stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Kpi label="Matchs joues" value={totaux.matchs} icon={<Calendar size={14}/>} />
              <Kpi label="Titularisations" value={totaux.titularisations} icon={<Target size={14}/>}/>
              <Kpi label="Minutes" value={totaux.minutes} suffix="min" icon={<Activity size={14}/>}/>
              <Kpi label="Buts" value={totaux.buts} icon={<Target size={14}/>}/>
              <Kpi label="Passes decisives" value={totaux.passesDecisives} icon={<Star size={14}/>}/>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Kpi label="Cartons jaunes" value={totaux.cartonsJaunes} icon={<span className="w-2.5 h-3 bg-amber rounded-sm"/>}/>
              <Kpi label="Cartons rouges" value={totaux.cartonsRouges} icon={<span className="w-2.5 h-3 bg-danger rounded-sm"/>}/>
              <Kpi
                label="Indice discipline"
                value={`${discipline}/100`}
                icon={<AlertTriangle size={14}/>}
                accent={
                  discipline >= 80 ? "accent"
                  : discipline >= 60 ? "amber"
                  : "danger"
                }
              />
            </div>

            {/* Terrain + derniers matchs */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-5">
                <TerrainPostes numerosFreq={totaux.numeros} />
              </div>
              <div className="col-span-12 md:col-span-7 panel p-5">
                <div className="h-section mb-3">Derniers matchs · {saison?.nom ?? "—"}</div>
                {matchsJoues.length === 0 ? (
                  <p className="text-sm text-muted py-4">
                    Aucune apparition en feuille de match sur cette saison.
                  </p>
                ) : (
                  <table className="table-fm">
                    <thead>
                      <tr>
                        <th>Journee</th><th>Adversaire</th><th>Score</th>
                        <th>Statut</th><th className="text-right">Min.</th><th>Faits</th>
                      </tr>
                    </thead>
                    <tbody>
                      {matchsJoues.map((m) => {
                        const adv = clubs.find((c) => c.id === m.adversaireId);
                        return (
                          <tr key={m.matchId}>
                            <td className="font-mono text-muted">{m.journee ?? "—"}</td>
                            <td>
                              <Link href={`/club/${m.adversaireId}`} className="font-semibold hover:text-accent">
                                {adv?.nom ?? m.adversaireId}
                              </Link>
                            </td>
                            <td>
                              <Link href={`/matchs/${m.matchId}`} className="font-mono font-semibold tabular-nums hover:text-accent">
                                {m.scoreEquipe}–{m.scoreAdversaire}
                              </Link>
                            </td>
                            <td>
                              <span className={`badge ${m.titulaire ? "badge-accent" : ""}`}>
                                {m.titulaire ? "Titulaire" : "Remplacant"}
                              </span>
                            </td>
                            <td className="text-right font-mono tabular-nums text-muted">{m.minutes}'</td>
                            <td className="text-xs whitespace-nowrap">
                              {m.buts > 0 && <span className="text-accent mr-1.5">{m.buts} but{m.buts > 1 ? "s" : ""}</span>}
                              {m.passesDecisives > 0 && <span className="text-sky mr-1.5">{m.passesDecisives} PD</span>}
                              {m.cartonsJaunes > 0 && <span className="text-amber mr-1.5">CJ</span>}
                              {m.cartonsRouges > 0 && <span className="text-danger">CR</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </section>
        }
        medicalContent={
          <section className="space-y-5">
            {/* SCORE FORME + RISQUE */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-4 panel p-5">
                <div className="h-section mb-3">Evolution du score de forme</div>
                {saisonActive ? (
                  <>
                    <Sparkline values={evolutionForme} width={500} height={120} color="rgb(var(--accent))"/>
                    <div className="text-[11px] text-faint mt-2">
                      Estimee depuis les dernieres seances et matchs.
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-muted py-4">
                    La forme est une mesure du moment : elle n'est suivie que sur la saison en cours.
                  </p>
                )}
              </div>
              <div className="col-span-12 md:col-span-4 panel p-5">
                <div className="h-section mb-3">Charge des seances · {saison?.nom ?? "—"}</div>
                {chargesRecentes.length === 0 ? (
                  <p className="text-sm text-muted py-4">
                    Aucune presence enregistree aux entrainements de cette saison.
                  </p>
                ) : (
                  <Sparkline values={chargesRecentes} width={500} height={120} color="rgb(var(--amber))"/>
                )}
              </div>
              <div className="col-span-12 md:col-span-4">
                <div className="grid grid-cols-2 gap-3">
                  <Mini icon={<Activity size={14}/>} label="Score forme"
                    value={saisonActive && j.scoreForme != null ? `${j.scoreForme}/100` : "—"}/>
                  <Mini icon={<AlertTriangle size={14}/>} label={saisonActive && j.acwr != null ? `Fatigue (ACWR ${j.acwr.toFixed(2)})` : "Fatigue"}
                    value={saisonActive && j.scoreFatigue != null ? `${j.scoreFatigue}/100` : "—"}/>
                  <Mini icon={<Activity size={14}/>} label="Charge 7j (UA-RPE)"
                    value={saisonActive && j.chargeAcute7j != null ? Math.round(j.chargeAcute7j) : "—"}/>
                  <Mini icon={<AlertTriangle size={14}/>} label="Blessures (toutes saisons)"
                    value={j.blessuresAnt ?? 0}/>
                  <Mini icon={<Dumbbell size={14}/>} label="Blessures actives"
                    value={blessures.filter((b: any) => {
                      const s = (b.statut ?? "").toLowerCase();
                      return !s.includes("retabli") && !s.includes("guerie") && !s.includes("termine");
                    }).length}/>
                </div>
              </div>
            </div>

            {/* SILHOUETTE + LISTE BLESSURES */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-5 panel p-5">
                <div className="h-section mb-3 flex items-center gap-2">
                  <AlertTriangle size={11} className="text-danger"/>
                  Zones touchees
                </div>
                <CorpsHumain blessures={blessures} height={360}/>
                <p className="text-[11px] text-faint text-center mt-2">
                  Rouge = blessure en cours, gris = anciennes blessures.
                </p>
              </div>
              <div className="col-span-12 md:col-span-7">
                <BlessuresEditeur
                  initialBlessures={blessures}
                  joueurs={[{ id: j.id, nom: j.nom, prenom: j.prenom }]}
                  joueurId={j.id}
                  titre="Historique des blessures"
                  compact
                />
              </div>
            </div>
          </section>
        }
        historiqueContent={
          <HistoriqueClub historique={historique} clubs={clubs} />
        }
      />
    </div>
  );
}

/* ----- sous-composants ----- */
function Card({ label, big }: { label: string; big: React.ReactNode }) {
  return (
    <div className="stat-tile flex flex-col items-center justify-center gap-2">
      <div className="stat-label">{label}</div>
      {big}
    </div>
  );
}
/** Placeholder d'une mesure sans valeur sur la saison consultee. */
function Indisponible({ pourquoi }: { pourquoi: string }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <div className="font-display text-3xl font-black text-faint">—</div>
      <div className="text-[10px] uppercase tracking-wider text-faint">{pourquoi}</div>
    </div>
  );
}
function Mini({ icon, label, value }: { icon: React.ReactNode; label: string; value: any }) {
  return (
    <div className="panel-inset px-4 py-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-faint">{icon}</span>
        <span className="stat-label">{label}</span>
      </div>
      <div className="font-display text-lg font-bold text-ink tabular-nums">{value}</div>
    </div>
  );
}
function Kpi({ label, value, suffix, icon, accent }: any) {
  // accent = "accent" | "amber" | "danger" | undefined -> couleur du gros chiffre
  const accentClass =
    accent === "accent" ? "text-accent"
    : accent === "amber" ? "text-amber"
    : accent === "danger" ? "text-danger"
    : "";
  return (
    <div className="stat-tile">
      <div className="flex items-center justify-between">
        <span className="stat-label">{label}</span>
        <span className="text-faint">{icon}</span>
      </div>
      <div className={`stat-value tabular-nums ${accentClass}`}>{value}</div>
      {suffix && <div className="stat-suffix">{suffix}</div>}
    </div>
  );
}
