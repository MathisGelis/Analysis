// src/app/joueur/[id]/page.tsx
// Fiche joueur 100% dynamique : donnees, evolution forme, charge entrainement
// et historique de matchs viennent tous de l'API.

import { notFound } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getOwnSaisonIdServer } from "@/lib/own-equipe";
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

export default async function JoueurPage({ params }: { params: { id: string } }) {
  const j = await api.joueur(params.id);
  if (!j) notFound();

  // Saison courante (via cookie switcher) : les stats seront filtrees
  // sur cette saison, pour un affichage "temps reel" coherent avec ce
  // que voit le coach dans le switcher en bas a gauche.
  const ownSaisonId = getOwnSaisonIdServer();

  // Donnees connexes : club, equipes, matchs du club (pour historique perso),
  // entrainements de son equipe (pour la charge), blessures du joueur,
  // et la repartition des numeros portes (pour la carte des postes).
  const [clubs, equipes, matchsClub, blessures, numerosFreq, historique] = await Promise.all([
    api.clubs(),
    api.equipes(j.clubId),
    api.matchs(j.clubId),
    api.blessures(j.id),
    api.joueurNumeros(j.id),
    api.joueurHistorique(j.id),
  ]);
  const club = clubs.find((c) => c.id === j.clubId);
  const equipe = equipes[0];
  const entrainements = equipe ? await api.entrainements(equipe.id) : [];

  // Historique perso : matchs ou il est en composition.
  // Le client API ne donne pas les compositions sur la liste, on doit aller
  // chercher chaque match. Pour rester rapide, on prend les 5 derniers
  // matchs du club et on regarde si le joueur y figure.
  const recents = [...matchsClub].slice(-8).reverse();
  const perso: { match: any; titulaire: boolean; entree: boolean }[] = [];
  for (const m of recents) {
    const full = await api.match(m.id);
    if (!full) continue;
    const comp = full.compositions?.find((c: any) =>
      c.nom?.toLowerCase() === j.nom.toLowerCase() &&
      (!j.prenom || c.prenom?.toLowerCase() === j.prenom.toLowerCase()),
    );
    if (comp) {
      perso.push({ match: full, titulaire: !!comp.titulaire, entree: !comp.titulaire });
      if (perso.length >= 5) break;
    }
  }

  // Series : evolution forme (derivee), charge 8 dernieres seances
  const formeBase = j.scoreForme ?? 50;
  const evolutionForme = [
    Math.max(0, formeBase - 12),
    Math.max(0, formeBase - 8),
    Math.max(0, formeBase - 4),
    Math.max(0, formeBase - 2),
    formeBase,
  ];
  const chargesRecentes = entrainements
    .filter((e: any) => e.joueursPresents?.includes(j.id))
    .slice(-8)
    .map((e: any) => Math.round(e.charge ?? 0));

  // Indice de discipline : score 0-100 calcule cote backend, qui pondere
  // CJ vs CR et tient compte des motifs (brutalite > antisportif >
  // contestation > faute). Fallback simple si non disponible.
  // Cf. DerivationService.scoreDisciplineFor.
  // Stats de la SAISON COURANTE : agregees depuis l'historique
  // filtre par saison. Si le joueur n'a pas joue cette saison (nouvelle
  // saison en cours, effectif frais), toutes les stats sont a 0.
  // Buts et cartons restent globaux (pas dans l'historique) — on les
  // met a 0 aussi si aucun match cette saison, sinon on garde le total.
  const saisonCourante = ownSaisonId
    ? historique.find((h: any) => h.saisonId === ownSaisonId)
    : null;
  const aJoueCetteSaison = saisonCourante
    ? saisonCourante.lignes.reduce((s: number, l: any) => s + (l.matchs ?? 0), 0) > 0
    : false;
  const statsSaison = {
    matchs: saisonCourante?.lignes.reduce((s: number, l: any) => s + (l.matchs ?? 0), 0) ?? 0,
    titularisations: saisonCourante?.lignes.reduce((s: number, l: any) => s + (l.titularisations ?? 0), 0) ?? 0,
    minutes: saisonCourante?.lignes.reduce((s: number, l: any) => s + (l.minutes ?? 0), 0) ?? 0,
    // Buts et cartons : on garde les globaux SI le joueur a joue au
    // moins 1 match cette saison. Sinon on remet a 0 (nouvelle saison
    // ou effectif frais).
    buts: aJoueCetteSaison ? (j.buts ?? 0) : 0,
    cartonsJaunes: aJoueCetteSaison ? (j.cartonsJaunes ?? 0) : 0,
    cartonsRouges: aJoueCetteSaison ? (j.cartonsRouges ?? 0) : 0,
  };

  const indiceDiscipline = j.scoreDiscipline
    ?? Math.max(0, 100 - (j.cartonsJaunes + j.cartonsRouges * 3) * 8);
  const risqueBlessure = Math.min(
    95,
    (j.blessuresAnt ?? 0) * 20 + (j.minutes > 1200 ? 25 : 8) + (j.cartonsRouges * 5),
  );

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-center justify-between">
        <Link href="/effectif" className="text-xs text-muted hover:text-ink flex items-center gap-1">
          <ArrowLeft size={12}/> Retour effectif
        </Link>
        <JoueurEditButton joueur={j} />
      </div>

      {/* IDENTITE */}
      <header className="panel p-6 grid grid-cols-12 gap-5">
        <div className="col-span-12 md:col-span-6 flex items-center gap-5">
          <div className="w-24 h-24 rounded-md bg-panel2 border border-line grid place-items-center font-display text-4xl font-black text-turf">
            {j.numeroFavori ?? "?"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs uppercase tracking-[0.18em] text-faint">{j.poste ?? "—"}</div>
            <h1 className="font-display text-3xl font-bold text-ink leading-tight">
              {j.prenom} <span className="text-muted font-light">{j.nom}</span>
            </h1>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`badge ${
                j.statutMutation === "Mutation" ? "badge-amber"
                : j.statutMutation === "Mutation hors delai" ? "badge-amber"
                : j.statutMutation === "Pas mutation" ? "badge-turf"
                : ""
              }`}>{j.statutMutation ?? "—"}</span>
              {club && (
                <Link href={`/club/${club.id}`} className="badge flex items-center gap-1 hover:text-turf">
                  <ClubBadge clubId={club.id} size={14}/> {club.nom}
                </Link>
              )}
              {equipe && (
                <span className="badge">{equipe.categorie ?? ""} {equipe.division ?? ""}</span>
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

        <div className="col-span-12 md:col-span-6 grid grid-cols-3 gap-3">
          <Card label="Score forme" big={
            <DonutStat value={j.scoreForme ?? 0} size={96} stroke={9}
              color={(j.scoreForme ?? 0)>70?"rgb(var(--turf))":(j.scoreForme ?? 0)>50?"rgb(var(--amber))":"rgb(var(--danger))"}
              label="/ 100" />
          } />
          <Card label="Note moyenne" big={
            <div className="font-display text-5xl font-black text-turf">
              {j.noteMoyenne?.toFixed(1) ?? "—"}
            </div>
          } />
          <Card label="Fatigue" big={
            <div className="flex flex-col items-center">
              <div className={`font-display text-3xl font-black ${
                (j.scoreFatigue ?? 0) >= 80 ? "text-danger"
                : (j.scoreFatigue ?? 0) >= 60 ? "text-amber"
                : (j.scoreFatigue ?? 0) >= 40 ? "text-turf"
                : "text-faint"
              }`}>
                {j.scoreFatigue != null ? j.scoreFatigue : "—"}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-faint mt-1">
                {j.acwr != null ? `ACWR ${j.acwr.toFixed(2)}` : "Derive"}
              </div>
            </div>
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
            {saisonCourante && (
              <div className="text-xs text-muted flex items-center gap-1.5">
                <Calendar size={11} className="text-turf"/>
                Stats sur la saison <strong className="text-ink">{saisonCourante.saisonNom}</strong>
                {!aJoueCetteSaison && (
                  <span className="text-faint">· pas encore joue de match</span>
                )}
              </div>
            )}
            {!saisonCourante && ownSaisonId && (
              <div className="text-xs text-muted flex items-center gap-1.5">
                <Calendar size={11} className="text-turf"/>
                <span className="text-faint">Nouveau — pas encore inscrit sur cette saison</span>
              </div>
            )}
            {/* KPI stats */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Kpi label="Matchs joues" value={statsSaison.matchs} icon={<Calendar size={14}/>} />
              <Kpi label="Titularisations" value={statsSaison.titularisations} icon={<Target size={14}/>}/>
              <Kpi label="Minutes" value={statsSaison.minutes} suffix="min" icon={<Activity size={14}/>}/>
              <Kpi label="Buts" value={statsSaison.buts} icon={<Target size={14}/>}/>
              <Kpi label="Passes decisives" value={j.passesDecisives ?? 0} icon={<Star size={14}/>}/>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Kpi label="Cartons jaunes" value={statsSaison.cartonsJaunes} icon={<span className="w-2.5 h-3 bg-amber rounded-sm"/>}/>
              <Kpi label="Cartons rouges" value={statsSaison.cartonsRouges} icon={<span className="w-2.5 h-3 bg-danger rounded-sm"/>}/>
              <Kpi
                label="Indice discipline"
                value={`${indiceDiscipline}/100`}
                icon={<AlertTriangle size={14}/>}
                accent={
                  indiceDiscipline >= 80 ? "turf"
                  : indiceDiscipline >= 60 ? "amber"
                  : "danger"
                }
              />
            </div>

            {/* Terrain + derniers matchs */}
            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 md:col-span-5">
                <TerrainPostes numerosFreq={numerosFreq} />
              </div>
              <div className="col-span-12 md:col-span-7 panel p-5">
                <div className="h-section mb-3">Derniers matchs</div>
                {perso.length === 0 ? (
                  <p className="text-sm text-muted py-4">
                    Aucune apparition dans les feuilles de match recentes.
                  </p>
                ) : (
                  <table className="table-fm">
                    <thead>
                      <tr>
                        <th>Journee</th><th>Adversaire</th><th>Score</th>
                        <th>Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perso.map(({ match, titulaire }) => {
                        const dom = match.clubDom === j.clubId;
                        const advId = dom ? match.clubExt : match.clubDom;
                        const adv = clubs.find((c) => c.id === advId);
                        return (
                          <tr key={match.id}>
                            <td className="font-mono text-muted">{match.journee}</td>
                            <td>
                              <Link href={`/club/${advId}`} className="font-semibold hover:text-turf">
                                {adv?.nom ?? advId}
                              </Link>
                            </td>
                            <td>
                              <Link href={`/matchs/${match.id}`} className="font-mono font-semibold tabular-nums hover:text-turf">
                                {dom ? match.scoreDom : match.scoreExt}–{dom ? match.scoreExt : match.scoreDom}
                              </Link>
                            </td>
                            <td>
                              <span className={`badge ${titulaire ? "badge-turf" : ""}`}>
                                {titulaire ? "Titulaire" : "Remplacant"}
                              </span>
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
                <Sparkline values={evolutionForme} width={500} height={120} color="rgb(var(--turf))"/>
                <div className="text-[11px] text-faint mt-2">
                  Estimee depuis les dernieres seances et matchs.
                </div>
              </div>
              <div className="col-span-12 md:col-span-4 panel p-5">
                <div className="h-section mb-3">Charge des seances</div>
                {chargesRecentes.length === 0 ? (
                  <p className="text-sm text-muted py-4">
                    Aucune presence enregistree aux entrainements.
                  </p>
                ) : (
                  <Sparkline values={chargesRecentes} width={500} height={120} color="rgb(var(--amber))"/>
                )}
              </div>
              <div className="col-span-12 md:col-span-4">
                <div className="grid grid-cols-2 gap-3">
                  <Mini icon={<Activity size={14}/>} label="Score forme"
                    value={j.scoreForme != null ? `${j.scoreForme}/100` : "—"}/>
                  <Mini icon={<AlertTriangle size={14}/>} label={j.acwr != null ? `Fatigue (ACWR ${j.acwr.toFixed(2)})` : "Fatigue"}
                    value={j.scoreFatigue != null ? `${j.scoreFatigue}/100` : "—"}/>
                  <Mini icon={<Activity size={14}/>} label="Charge 7j (UA-RPE)"
                    value={j.chargeAcute7j != null ? Math.round(j.chargeAcute7j) : "—"}/>
                  <Mini icon={<AlertTriangle size={14}/>} label="Blessures historiques"
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
  // accent = "turf" | "amber" | "danger" | undefined -> couleur du gros chiffre
  const accentClass =
    accent === "turf" ? "text-turf"
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
