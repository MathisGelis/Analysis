// src/components/ClubTabs.tsx
"use client";

// Vue tabulaire d'un club : Vue d'ensemble, Effectif, Matchs, Rapport.
// Toutes les donnees sont recues en props (chargees cote serveur).
// Les noms de joueurs sont resolus en liens vers leur fiche si le joueur
// existe en base ; sinon affichage en clair.

import { useState } from "react";
import Link from "next/link";
import type { Club, Equipe, Joueur, Match, RapportScouting, LigneClassement, Issue } from "@/lib/types";
import { ClubBadge } from "@/components/ClubBadge";
import { BarsChart, FormeStrip, Sparkline } from "@/components/Charts";
import { Pitch } from "@/components/Pitch";
import {
  AlertTriangle, ArrowDownRight, ArrowUpRight, Check, FileText, Printer,
  Star, Users, X,
} from "lucide-react";

type Tab = "overview" | "effectif" | "matchs" | "scouting";

interface ResultatLigne {
  matchId: string; journee: string; lieu: "Domicile" | "Extérieur";
  adversaire: string; adversaireId: string;
  butsMarques: number; butsEncaisses: number;
}

interface Props {
  club: Club;
  equipe?: Equipe;
  ligne?: LigneClassement;
  /** Nombre d'equipes classees dans le championnat de `ligne`. */
  totalClasses?: number;
  bilan: {
    joues: number; v: number; n: number; d: number;
    bp: number; bc: number; diff?: number; pts?: number;
    bpMoy?: number; bcMoy?: number; forme: Issue[];
  };
  resultats: ResultatLigne[];
  joueurs: Joueur[];
  rapport?: RapportScouting | null;
  isMine: boolean;
  initialTab?: Tab;
  /** Nom de la saison selectionnee (affiche en sous-titre du header). */
  saisonNom?: string | null;
  /** Saison selectionnee = active (vs historique). */
  saisonActif?: boolean;
}

const TABS: { id: Tab; label: string; icon: any }[] = [
  { id: "overview", label: "Vue d'ensemble", icon: Star },
  { id: "effectif", label: "Effectif", icon: Users },
  { id: "matchs", label: "Matchs", icon: ArrowUpRight },
  { id: "scouting", label: "Rapport scouting", icon: FileText },
];

// Cherche un joueur correspondant au nom/club -> renvoie son id si trouve.
function findJoueurId(joueurs: Joueur[], nom: string, prenom?: string): string | undefined {
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const n = norm(nom);
  if (!n) return undefined;
  const p = prenom ? norm(prenom) : "";
  // 1) match exact nom + prenom
  if (p) {
    const exact = joueurs.find((j) => norm(j.nom) === n && norm(j.prenom ?? "") === p);
    if (exact) return exact.id;
  }
  // 2) match par nom de famille uniquement
  const byName = joueurs.find((j) => norm(j.nom) === n);
  if (byName) return byName.id;
  // 3) inclusion (gere les noms composes)
  return joueurs.find((j) => norm(j.nom).includes(n) || n.includes(norm(j.nom)))?.id;
}

// Composant local : nom de joueur clickable s'il existe en base.
function JoueurName({
  nom, prenom, joueurs, className = "",
}: { nom: string; prenom?: string; joueurs: Joueur[]; className?: string }) {
  const id = findJoueurId(joueurs, nom, prenom);
  const label = `${prenom ?? ""} ${nom}`.trim();
  if (!id) return <span className={className}>{label}</span>;
  return (
    <Link href={`/joueur/${id}`} className={`hover:text-turf ${className}`}>
      {label}
    </Link>
  );
}

export function ClubTabs({
  club, equipe, ligne, totalClasses, bilan, resultats, joueurs, rapport, isMine, initialTab,
  saisonNom, saisonActif,
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab ?? "overview");

  // KPIs deriveables pour TOUS les clubs (pas seulement neuv)
  const cumulCJ = joueurs.reduce((s, j) => s + j.cartonsJaunes, 0);
  const cumulCR = joueurs.reduce((s, j) => s + j.cartonsRouges, 0);

  return (
    <div className="space-y-6 fade-up">
      {/* ============= EN-TETE COMMUN A TOUS LES ONGLETS ============== */}
      <header className="panel p-6 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-turf/5 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-start gap-5 flex-wrap">
          <ClubBadge clubId={club.id} size={86} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-display text-3xl font-bold text-ink">{club.nom}</h1>
              {club.numeroFff && <span className="badge">FFF #{club.numeroFff}</span>}
              {isMine && <span className="badge badge-turf">Mon club</span>}
              {!isMine && rapport && <span className="badge badge-amber">Rapport scouting</span>}
              {saisonNom && (
                <span className={`badge ${saisonActif ? "badge-turf" : ""}`}>
                  Saison {saisonNom}{saisonActif ? " ★" : ""}
                </span>
              )}
            </div>
            {equipe && (
              <div className="text-xs text-muted mt-2">
                {equipe.categorie} · {equipe.division} · Poule {equipe.poule}
                {equipe.coach && <> · Coach {equipe.coach}</>}
                {equipe.formationDef && (
                  <> · Dispositif <span className="text-turf font-semibold">{equipe.formationDef}</span></>
                )}
              </div>
            )}
          </div>
          {ligne && (
            <div className="panel-inset px-5 py-3 text-center">
              <div className="h-section">Classement</div>
              <div className="font-display text-4xl font-black text-turf leading-none mt-1">
                {ligne.rang}<span className="text-xs text-muted font-medium">/{totalClasses ?? ligne.rang}</span>
              </div>
              <div className="text-xs text-muted mt-1">{ligne.pts} pts</div>
            </div>
          )}
        </div>

        {/* stats ligne */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mt-5 pt-5 border-t border-line relative">
          <Stat label="Joues" value={bilan.joues} />
          <Stat label="Victoires" value={bilan.v} accent="win" />
          <Stat label="Nuls" value={bilan.n} accent="draw" />
          <Stat label="Defaites" value={bilan.d} accent="loss" />
          <Stat label="BM / BC" value={`${bilan.bp} / ${bilan.bc}`} />
          <Stat label="Forme" value={<FormeStrip values={bilan.forme} />} />
        </div>
      </header>

      {/* ============= BARRE D'ONGLETS ============= */}
      <nav className="flex items-center gap-1 border-b border-line">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 -mb-px text-sm font-semibold transition ${
                active
                  ? "text-turf border-b-2 border-turf"
                  : "text-muted hover:text-ink border-b-2 border-transparent"
              }`}
            >
              <Icon size={13} />
              {t.label}
            </button>
          );
        })}
      </nav>

      {/* ============= PANELS ============= */}
      {tab === "overview" && <OverviewPanel
        bilan={bilan} resultats={resultats} joueurs={joueurs}
        rapport={rapport} equipe={equipe} cumulCJ={cumulCJ} cumulCR={cumulCR}
      />}
      {tab === "effectif" && <EffectifPanel joueurs={joueurs} isMine={isMine} />}
      {tab === "matchs" && <MatchsPanel resultats={resultats} clubId={club.id} />}
      {tab === "scouting" && <ScoutingPanel
        club={club} equipe={equipe} bilan={bilan} resultats={resultats}
        joueurs={joueurs} rapport={rapport} cumulCJ={cumulCJ} cumulCR={cumulCR}
      />}
    </div>
  );
}

/* ============================================================ */
/*                        PANEL : Vue d'ensemble                  */
/* ============================================================ */
function OverviewPanel({
  bilan, resultats, joueurs, rapport, equipe, cumulCJ, cumulCR,
}: any) {
  const topForme = [...joueurs]
    .filter((j: Joueur) => j.matchs >= 3)
    .sort((a: Joueur, b: Joueur) => (b.scoreForme ?? 0) - (a.scoreForme ?? 0))
    .slice(0, 5);
  const dernier5 = resultats.slice(-5);
  return (
    <div className="grid grid-cols-12 gap-4">
      {/* KPIs */}
      <div className="col-span-12 md:col-span-8 panel p-5">
        <div className="h-section mb-3">Performances · buts par journee</div>
        {resultats.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">
            Aucune feuille de match importee pour ce club. Importez via la page « Import FMI ».
          </p>
        ) : (
          <BarsChart
            data={resultats.map((r: ResultatLigne) => ({
              label: r.journee, a: r.butsMarques, b: r.butsEncaisses,
            }))}
            legend={["Marques", "Encaisses"]}
            height={210}
          />
        )}
      </div>

      <div className="col-span-12 md:col-span-4 panel p-5">
        <div className="h-section mb-3">Indicateurs</div>
        <div className="space-y-3">
          <Mini label="Buts / match" value={bilan.bpMoy != null ? bilan.bpMoy : (bilan.joues ? +(bilan.bp / bilan.joues).toFixed(2) : 0)} />
          <Mini label="Encaisses / match" value={bilan.bcMoy != null ? bilan.bcMoy : (bilan.joues ? +(bilan.bc / bilan.joues).toFixed(2) : 0)} />
          <Mini label="Difference" value={bilan.diff ?? bilan.bp - bilan.bc} accent={bilan.bp - bilan.bc >= 0 ? "win" : "loss"} />
          <Mini label="Cartons jaunes" value={cumulCJ} accent="amber" />
          <Mini label="Cartons rouges" value={cumulCR} accent="loss" />
          {equipe?.formationDef && (
            <Mini label="Dispositif" value={equipe.formationDef} accent="turf" />
          )}
        </div>
      </div>

      {/* dernier 5 resultats */}
      <div className="col-span-12 md:col-span-7 panel p-5">
        <div className="h-section mb-3">5 derniers resultats</div>
        {dernier5.length === 0 ? (
          <p className="text-sm text-muted py-4">Pas encore de resultat.</p>
        ) : (
          <table className="table-fm">
            <thead>
              <tr>
                <th>J</th><th>Lieu</th><th>Adversaire</th>
                <th>Score</th><th>Issue</th>
              </tr>
            </thead>
            <tbody>
              {dernier5.map((r: ResultatLigne) => {
                const issue = r.butsMarques > r.butsEncaisses ? "V"
                  : r.butsMarques === r.butsEncaisses ? "N" : "D";
                return (
                  <tr key={r.matchId}>
                    <td className="font-mono text-muted">{r.journee}</td>
                    <td><span className="badge">{r.lieu === "Domicile" ? "DOM" : "EXT"}</span></td>
                    <td>
                      <Link href={`/club/${r.adversaireId}`} className="font-semibold hover:text-turf">
                        {r.adversaire}
                      </Link>
                    </td>
                    <td>
                      <Link href={`/matchs/${r.matchId}`} className="font-mono font-semibold tabular-nums hover:text-turf">
                        {r.butsMarques}–{r.butsEncaisses}
                      </Link>
                    </td>
                    <td>
                      <span className={issue==="V"?"pill-v":issue==="N"?"pill-n":"pill-d"}>{issue}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* top forme */}
      <div className="col-span-12 md:col-span-5 panel p-5">
        <div className="h-section mb-3">Joueurs en forme</div>
        {topForme.length === 0 ? (
          <p className="text-sm text-muted py-4">Effectif vide ou pas assez de matchs.</p>
        ) : (
          <ul className="space-y-2">
            {topForme.map((j: Joueur) => (
              <li key={j.id} className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-md bg-panel2 border border-line grid place-items-center font-mono text-sm font-bold text-turf">
                  {j.numeroFavori ?? "?"}
                </div>
                <Link href={`/joueur/${j.id}`} className="flex-1 min-w-0 hover:text-turf">
                  <div className="text-sm font-semibold truncate">{j.prenom} {j.nom}</div>
                  <div className="text-[11px] text-muted">{j.poste} · {j.matchs} mat. · {j.minutes}'</div>
                </Link>
                <div className="flex items-center gap-2">
                  <div className="w-14 h-1.5 bg-line rounded-full overflow-hidden">
                    <div className="h-full bg-turf" style={{width: `${j.scoreForme ?? 0}%`}}/>
                  </div>
                  <span className="text-xs tabular-nums w-6">{j.scoreForme ?? 0}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/* ============================================================ */
/*                        PANEL : Effectif                       */
/* ============================================================ */
function EffectifPanel({ joueurs, isMine }: { joueurs: Joueur[]; isMine: boolean }) {
  const sorted = [...joueurs].sort((a, b) => b.matchs - a.matchs);
  if (sorted.length === 0) {
    return (
      <div className="panel p-8 text-center text-sm text-muted">
        Aucun joueur en base pour ce club. Les effectifs sont construits a
        partir des compositions des feuilles FMI importees.
      </div>
    );
  }
  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="h-section">Effectif complet ({sorted.length})</div>
        {!isMine && (
          <div className="text-[11px] text-faint italic">
            Mode scouting · temps de jeu non affiche (peu fiable depuis FMI)
          </div>
        )}
      </div>
      <table className="table-fm">
        <thead>
          <tr>
            <th>#</th><th>Joueur</th><th>Poste</th>
            <th className="text-center">Mat.</th><th className="text-center">Titu</th>
            {isMine && <th>Minutes</th>}
            <th>Note</th><th>Forme</th>
            <th className="text-center">CJ</th><th className="text-center">CR</th>
            <th>Statut</th><th>Postes joues</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((j) => (
            <tr key={j.id}>
              <td className="font-mono text-muted">{j.numeroFavori ?? "—"}</td>
              <td>
                <Link href={`/joueur/${j.id}`} className="font-semibold hover:text-turf">
                  {j.prenom} {j.nom}
                </Link>
              </td>
              <td><span className="badge">{j.poste ?? "—"}</span></td>
              <td className="text-center tabular-nums">{j.matchs}</td>
              <td className="text-center tabular-nums">{j.titularisations}</td>
              {isMine && <td className="tabular-nums text-muted">{j.minutes}'</td>}
              <td className="font-semibold text-turf tabular-nums">{j.noteMoyenne?.toFixed(1)}</td>
              <td>
                <div className="flex items-center gap-2">
                  <div className="w-12 h-1.5 bg-line rounded-full overflow-hidden">
                    <div className="h-full bg-turf" style={{width: `${j.scoreForme ?? 0}%`}}/>
                  </div>
                  <span className="text-xs text-muted tabular-nums w-6">{j.scoreForme ?? 0}</span>
                </div>
              </td>
              <td className="text-center text-amber font-mono">{j.cartonsJaunes || ""}</td>
              <td className="text-center text-danger font-mono">{j.cartonsRouges || ""}</td>
              <td>
                {j.statutMutation && (
                  <span className={`badge ${
                    j.statutMutation==="Mutation" ? "badge-amber"
                    : j.statutMutation==="Pas mutation" ? "badge-turf" : ""
                  }`}>{j.statutMutation}</span>
                )}
              </td>
              <td className="text-[10px] text-faint font-mono">{j.postes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/* ============================================================ */
/*                        PANEL : Matchs                          */
/* ============================================================ */
function MatchsPanel({ resultats, clubId }: { resultats: ResultatLigne[]; clubId: string }) {
  if (resultats.length === 0) {
    return (
      <div className="panel p-8 text-center text-sm text-muted">
        Aucun match en base pour ce club.
      </div>
    );
  }
  return (
    <section className="panel p-5">
      <div className="h-section mb-3">Historique complet ({resultats.length})</div>
      <table className="table-fm">
        <thead>
          <tr>
            <th>J</th><th>Lieu</th><th>Adversaire</th>
            <th>Score</th><th>Issue</th><th>Diff</th>
          </tr>
        </thead>
        <tbody>
          {resultats.map((r) => {
            const issue = r.butsMarques > r.butsEncaisses ? "V"
              : r.butsMarques === r.butsEncaisses ? "N" : "D";
            const diff = r.butsMarques - r.butsEncaisses;
            return (
              <tr key={r.matchId}>
                <td className="font-mono text-muted">{r.journee}</td>
                <td><span className="badge">{r.lieu === "Domicile" ? "DOM" : "EXT"}</span></td>
                <td>
                  <Link href={`/club/${r.adversaireId}`} className="font-semibold hover:text-turf">
                    {r.adversaire}
                  </Link>
                </td>
                <td>
                  <Link href={`/matchs/${r.matchId}`} className="font-mono font-semibold tabular-nums hover:text-turf">
                    {r.butsMarques}–{r.butsEncaisses}
                  </Link>
                </td>
                <td>
                  <span className={issue==="V"?"pill-v":issue==="N"?"pill-n":"pill-d"}>{issue}</span>
                </td>
                <td className={`text-right tabular-nums ${diff>=0?"text-win":"text-loss"}`}>
                  {diff>=0?"+":""}{diff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

/* ============================================================ */
/*                  PANEL : Rapport scouting                     */
/* ============================================================ */
function ScoutingPanel({
  club, equipe, bilan, resultats, joueurs, rapport, cumulCJ, cumulCR,
}: any) {
  // Bilan dom/ext auto-derive
  const dom = resultats.filter((r: ResultatLigne) => r.lieu === "Domicile");
  const ext = resultats.filter((r: ResultatLigne) => r.lieu === "Extérieur");
  const bilanDom = `${dom.filter((r: any) => r.butsMarques>r.butsEncaisses).length}V/${dom.filter((r: any) => r.butsMarques===r.butsEncaisses).length}N/${dom.filter((r: any) => r.butsMarques<r.butsEncaisses).length}D`;
  const bilanExt = `${ext.filter((r: any) => r.butsMarques>r.butsEncaisses).length}V/${ext.filter((r: any) => r.butsMarques===r.butsEncaisses).length}N/${ext.filter((r: any) => r.butsMarques<r.butsEncaisses).length}D`;

  const dispositif = rapport?.dispositifAttendu || equipe?.formationDef || "—";
  const dernier11 = rapport?.dernier11 ?? [];

  return (
    <div className="space-y-6">
      {/* Bandeau commentaires (si rapport) */}
      {rapport?.commentaires && (
        <div className="panel p-4 border-l-2 border-amber">
          <div className="h-section mb-1">Commentaires staff</div>
          <p className="text-sm text-ink leading-relaxed">{rapport.commentaires}</p>
          <div className="text-[10px] text-faint mt-2">
            Rapport du {rapport.date} · {rapport.auteur}
          </div>
        </div>
      )}

      {/* KPIs scouting */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Buts marques" value={bilan.bp} sub={`${(bilan.bp/Math.max(bilan.joues,1)).toFixed(2)} / match`}/>
        <Kpi label="Buts encaisses" value={bilan.bc} sub={`${(bilan.bc/Math.max(bilan.joues,1)).toFixed(2)} / match`}/>
        <Kpi label="Cartons jaunes" value={cumulCJ} sub="cumul saison" accent="amber"/>
        <Kpi label="Cartons rouges" value={cumulCR} sub="cumul saison" accent="loss"/>
      </section>

      {/* Dispositif + suspendus/cles */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-4 panel p-5">
          <div className="h-section mb-3">Dispositif attendu</div>
          <div className="font-display text-4xl font-black text-turf">{dispositif}</div>
          {rapport?.capitaine && (
            <div className="text-xs text-muted mt-2">
              Capitaine probable : <span className="text-ink font-semibold">{rapport.capitaine}</span>
            </div>
          )}

          {rapport?.joueursSuspendus?.length > 0 && (
            <>
              <div className="h-section mt-5 mb-2 flex items-center gap-1.5">
                <AlertTriangle size={11} className="text-danger"/> Suspendus
              </div>
              <ul className="space-y-1">
                {rapport.joueursSuspendus.map((s: string) => (
                  <li key={s} className="flex items-center gap-2 text-sm">
                    <X size={12} className="text-danger"/>
                    <JoueurName nom={s.split(" ").slice(0,-1).join(" ")} prenom={s.split(" ").slice(-1)[0]} joueurs={joueurs}/>
                  </li>
                ))}
              </ul>
            </>
          )}

          {rapport?.joueursCles?.length > 0 && (
            <>
              <div className="h-section mt-5 mb-2 flex items-center gap-1.5">
                <Star size={11} className="text-amber"/> Joueurs cles
              </div>
              <ul className="space-y-1">
                {rapport.joueursCles.map((s: string) => (
                  <li key={s} className="flex items-center gap-2 text-sm">
                    <Check size={12} className="text-turf"/>
                    <JoueurName nom={s.split(" ").slice(0,-1).join(" ")} prenom={s.split(" ").slice(-1)[0]} joueurs={joueurs}/>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {dernier11.length > 0 ? (
          <div className="col-span-12 lg:col-span-8">
            <Pitch
              formation={dispositif}
              joueurs={dernier11.slice(0,11).map((d: any) => ({
                numero: d.numero, nom: d.nom, capitaine: d.nom === rapport?.capitaine,
              }))}
              titre="Compo probable · derniere journee"
              couleur={club.couleur}
            />
          </div>
        ) : (
          <div className="col-span-12 lg:col-span-8 panel p-5 flex items-center justify-center">
            <p className="text-sm text-muted text-center">
              Pas de composition recente pour ce club.<br/>
              Importez une feuille FMI pour generer le dernier 11.
            </p>
          </div>
        )}
      </section>

      {/* Forces & faiblesses (uniquement si rapport) */}
      {(rapport?.forces?.length || rapport?.faiblesses?.length) && (
        <section className="grid grid-cols-12 gap-4">
          {rapport?.forces?.length > 0 && (
            <div className="col-span-12 md:col-span-6 panel p-5">
              <div className="h-section mb-3 flex items-center gap-1.5">
                <ArrowUpRight size={12} className="text-turf"/> Forces
              </div>
              <ul className="space-y-2.5">
                {rapport.forces.map((f: string) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <span className="w-1 h-1 mt-2 bg-turf rounded-full shrink-0"/>
                    <span className="text-ink">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {rapport?.faiblesses?.length > 0 && (
            <div className="col-span-12 md:col-span-6 panel p-5">
              <div className="h-section mb-3 flex items-center gap-1.5">
                <ArrowDownRight size={12} className="text-danger"/> Faiblesses
              </div>
              <ul className="space-y-2.5">
                {rapport.faiblesses.map((f: string) => (
                  <li key={f} className="flex items-start gap-2.5 text-sm">
                    <span className="w-1 h-1 mt-2 bg-danger rounded-full shrink-0"/>
                    <span className="text-ink">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {/* Bilan dom / ext */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-6 panel p-5">
          <div className="h-section mb-3">Bilan domicile ({dom.length} matchs)</div>
          <div className="font-display text-2xl font-bold">{bilanDom}</div>
        </div>
        <div className="col-span-12 md:col-span-6 panel p-5">
          <div className="h-section mb-3">Bilan exterieur ({ext.length} matchs)</div>
          <div className="font-display text-2xl font-bold">{bilanExt}</div>
        </div>
      </section>

      {/* Resultats par journee */}
      {resultats.length > 0 && (
        <section className="panel p-5">
          <div className="h-section mb-3">Resultats par journee</div>
          <BarsChart
            data={resultats.map((m: ResultatLigne) => ({
              label: m.journee, a: m.butsMarques, b: m.butsEncaisses,
            }))}
            legend={["Marques","Encaisses"]}
            height={200}
          />
        </section>
      )}

      {/* Dernier 11 detaille */}
      {dernier11.length > 0 && (
        <section className="panel p-5">
          <div className="h-section mb-3">Derniere composition</div>
          <table className="table-fm">
            <thead>
              <tr><th>#</th><th>Joueur</th><th>Role</th></tr>
            </thead>
            <tbody>
              {dernier11.map((d: any, i: number) => (
                <tr key={i}>
                  <td className="font-mono text-muted">{d.numero}</td>
                  <td className="font-semibold">
                    <JoueurName nom={d.nom} prenom={d.prenom} joueurs={joueurs}/>
                  </td>
                  <td>
                    {d.nom === rapport?.capitaine?.split(" ")[0] ? (
                      <span className="badge badge-amber">Capitaine</span>
                    ) : d.numero >= 12 ? (
                      <span className="badge">Remplacant</span>
                    ) : (
                      <span className="badge badge-turf">Titulaire</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

/* ----- petits sous-composants ----- */
function Stat({
  label, value, accent,
}: { label: string; value: React.ReactNode; accent?: "win"|"draw"|"loss" }) {
  const color =
    accent==="win"?"text-win":accent==="draw"?"text-draw":accent==="loss"?"text-loss":"text-ink";
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className={`font-display text-xl font-bold mt-1 ${color} tabular-nums`}>{value}</div>
    </div>
  );
}
function Mini({ label, value, accent }: { label: string; value: any; accent?: string }) {
  const c = accent === "amber" ? "text-amber"
    : accent === "loss" ? "text-loss"
    : accent === "win" ? "text-win"
    : accent === "turf" ? "text-turf" : "text-ink";
  return (
    <div className="flex items-center justify-between border-b border-line/60 pb-2 last:border-0">
      <span className="text-xs text-muted">{label}</span>
      <span className={`font-display font-bold tabular-nums ${c}`}>{value}</span>
    </div>
  );
}
function Kpi({ label, value, sub, accent }: any) {
  const c = accent==="amber"?"text-amber":accent==="loss"?"text-loss":"text-ink";
  return (
    <div className="stat-tile">
      <span className="stat-label">{label}</span>
      <div className={`stat-value tabular-nums ${c}`}>{value}</div>
      {sub && <div className="stat-suffix">{sub}</div>}
    </div>
  );
}
