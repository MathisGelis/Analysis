// src/features/analyse-jeu/components/AnalysesHub.tsx
//
// Les analyses du Data Hub, une section par question : comment on se crée des occasions, comment on en concède, contre quels dispositifs
// on joue et avec quel résultat, comment l'équipe se comporte selon le score et dans le temps, son profil et sa tendance. Chaque graphique
// a sa lecture ; chaque lecture dit sur quel échantillon elle repose. Rien n'est affirmé sur trop peu de matchs.

import { AlertTriangle, CheckCircle2, Info, Lightbulb } from "lucide-react";

import type { AnalysesHub, ConstatHub, Fiabilite, OccasionsHub } from "../lib/data-hub-types";
import { nb, pc, signe } from "../lib/format-hub";
import { BarresH, BarresTranches, Camembert, CarteValeurs, Radar, couleurDe } from "./graphiques";
import { libelleFormation } from "@/shared/lib/formation";

const LIBELLE_FIABILITE: Record<Fiabilite, string> = { faible: "Indicatif (peu de matchs)", moyenne: "Fiabilité moyenne", bonne: "Fiabilité bonne" };
const POINTS: Record<Fiabilite, string> = { faible: "●○○", moyenne: "●●○", bonne: "●●●" };

function Bloc({ titre, aide, children, testid }: { titre: string; aide?: string; children: React.ReactNode; testid?: string }) {
  return (
    <section aria-label={titre} className="panel space-y-3 p-5" data-testid={testid}>
      <div><h3 className="h-section">{titre}</h3>{aide && <p className="mt-1 text-xs text-muted">{aide}</p>}</div>
      {children}
    </section>
  );
}

function Tuile({ libelle, valeur, detail }: { libelle: string; valeur: string | number; detail?: string }) {
  return (
    <div className="panel-inset p-3 text-center">
      <div className="text-[11px] uppercase tracking-wide text-muted">{libelle}</div>
      <div className="font-display text-2xl font-bold tabular-nums text-ink">{valeur}</div>
      {detail && <div className="text-[11px] text-faint">{detail}</div>}
    </div>
  );
}

/* ------------------------------------------------ lectures ------------------------------------------------ */
const ICONE = { bon: CheckCircle2, alerte: AlertTriangle, neutre: Info } as const;
const COULEUR_TON = { bon: "text-win", alerte: "text-amber", neutre: "text-muted" } as const;

export function Lectures({ constats, vide }: { constats: ConstatHub[]; vide?: string }) {
  if (constats.length === 0) return vide ? <p className="panel-inset p-3 text-[13px] text-muted">{vide}</p> : null;
  return (
    <ul className="space-y-2" aria-label="Lectures">
      {constats.map((c) => {
        const Icone = ICONE[c.ton];
        return (
          <li key={c.id} className="rounded-xl border border-l-4 border-line bg-surface px-3 py-2.5" data-testid="lecture-hub"
            style={{ borderLeftColor: c.ton === "bon" ? "rgb(var(--win))" : c.ton === "alerte" ? "rgb(var(--amber))" : "rgb(var(--line-strong))" }}>
            <div className="flex items-start gap-2">
              <Icone size={15} aria-hidden className={`mt-0.5 shrink-0 ${COULEUR_TON[c.ton]}`} />
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold text-ink">{c.titre}</div>
                <div className="text-[13px] text-muted">{c.detail}</div>
                {c.piste && <div className="mt-1 flex items-start gap-1.5 text-[13px] text-ink"><Lightbulb size={13} aria-hidden className="mt-0.5 shrink-0 text-accent" /><span>{c.piste}</span></div>}
              </div>
              <span className="shrink-0 whitespace-nowrap text-[11px] text-faint" title={LIBELLE_FIABILITE[c.fiabilite]}><span aria-hidden>{POINTS[c.fiabilite]}</span><span className="sr-only">{LIBELLE_FIABILITE[c.fiabilite]}</span></span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const NOMS_TRANCHES = ["0–15", "15–30", "30–45", "45–60", "60–75", "75–90"];

/* ------------------------------------------- création / concession ------------------------------------------- */
function Occasions({ o, cote, noms }: { o: OccasionsHub; cote: "creation" | "concession"; noms: Record<string, string> }) {
  const creation = cote === "creation";
  const xgZones = o.zones.xg;
  const totalXg = o.couloirs.reduce((s, c) => s + c.xg, 0);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Bloc titre={creation ? "D'où vient le danger qu'on crée" : "D'où vient le danger qu'on concède"} aide="xG estimé par zone, vu de notre équipe : notre but à défendre est en bas, celui qu'on attaque en haut.">
        <CarteValeurs valeurs={xgZones} nom={creation ? "xG créé par zone" : "xG concédé par zone"} />
        {o.zones.sansZone > 0 && <p className="text-[11px] text-faint">{o.zones.sansZone} tir{o.zones.sansZone > 1 ? "s" : ""} sans zone saisie.</p>}
        <BarresH titre="Par couloir" lignes={o.couloirs.map((c, i) => ({ libelle: c.nom === "axe" ? "Axe" : `Couloir ${c.nom}`, valeur: c.xg, texte: `${nb(c.xg, 2)} xG · ${totalXg > 0 ? Math.round((c.xg / totalXg) * 100) : 0} %`, couleur: couleurDe(i === 1 ? 0 : 1) }))} />
      </Bloc>
      <Bloc titre={creation ? "Comment on crée" : "Comment on concède"} aide="Famille de jeu d'après le contexte saisi sur chaque tir.">
        {o.familles.length === 0 ? <p className="text-sm text-muted">Aucun tir saisi.</p> : (
          <Camembert titre={creation ? "Tirs créés par famille de jeu" : "Tirs concédés par famille de jeu"} unite=" tirs" centre={`${o.tirs}`}
            parts={o.familles.map((f) => ({ libelle: f.famille, valeur: f.tirs, detail: `${f.buts} buts, ${nb(f.xg, 2)} xG` }))} />
        )}
        <div className="grid grid-cols-3 gap-3">
          <Tuile libelle={creation ? "xG créé" : "xG concédé"} valeur={nb(o.xg, 1)} detail={`${o.tirs} tirs · ${nb(o.tirs ? o.xg / o.tirs : null, 2)} par tir`} />
          <Tuile libelle="Buts" valeur={o.buts} detail={`${signe(o.buts - o.xg)} vs xG`} />
          <Tuile libelle="Grosses occasions" valeur={o.grosses.total} detail={`${o.grosses.marquees} marquée${o.grosses.marquees > 1 ? "s" : ""}`} />
        </div>
      </Bloc>
      <Bloc titre="Qualité des occasions" aide="Nombre de tirs par niveau de danger (xG) : beaucoup de tirs « très faibles » = beaucoup de volume, peu de menace.">
        <BarresH titre="Tirs par niveau de xG" lignes={o.qualite.map((q, i) => ({ libelle: q.nom, valeur: q.tirs, texte: `${q.tirs}`, couleur: couleurDe(i < 2 ? 5 : i === 2 ? 3 : 2) }))} />
      </Bloc>
      {creation && (
        <Bloc titre="Qui crée pour qui" aide="Les liens passeur → tireur les plus fréquents (joueurs désignés dans la saisie).">
          {o.reseau.length === 0 ? <p className="text-sm text-muted">Pas assez de passeurs désignés dans les tirs saisis.</p> : (
            <ul className="space-y-1.5" aria-label="Liens passeur vers tireur">
              {o.reseau.map((l) => (
                <li key={`${l.passeurId}-${l.tireurId}`} className="flex items-center justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate"><span className="text-sky">{noms[l.passeurId] ?? "Joueur"}</span> <span aria-hidden>→</span><span className="sr-only"> vers </span> <span className="font-semibold text-ink">{noms[l.tireurId] ?? "Joueur"}</span></span>
                  <span className="shrink-0 tabular-nums text-muted">{l.tirs} tir{l.tirs > 1 ? "s" : ""} · {l.buts} but{l.buts > 1 ? "s" : ""} · {nb(l.xg, 2)} xG</span>
                </li>
              ))}
            </ul>
          )}
        </Bloc>
      )}
    </div>
  );
}

export function SectionCreation({ a, noms }: { a: AnalysesHub; noms: Record<string, string> }) {
  if (a.matchsSaisis === 0) return <Vide />;
  return (
    <div className="space-y-4" data-testid="hub-creation">
      <Lectures constats={a.constats.filter((c) => c.domaine === "creation")} vide="Rien de saillant côté création pour l'instant : c'est bon signe, ou il manque encore de tirs saisis pour conclure." />
      <Occasions o={a.creation} cote="creation" noms={noms} />
    </div>
  );
}

export function SectionConcession({ a }: { a: AnalysesHub }) {
  if (a.matchsSaisis === 0) return <Vide />;
  const g = a.concession.gardien;
  return (
    <div className="space-y-4" data-testid="hub-concession">
      <Lectures constats={a.constats.filter((c) => c.domaine === "concession")} vide="Rien de saillant côté occasions concédées pour l'instant." />
      <Occasions o={a.concession} cote="concession" noms={{}} />
      {g && (
        <Bloc titre="Le gardien" aide="Buts évités = xG des tirs cadrés concédés moins buts encaissés : positif, le gardien sauve plus que prévu ; négatif, il encaisse plus que prévu.">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Tuile libelle="Tirs cadrés concédés" valeur={g.tirsCadres} />
            <Tuile libelle="Arrêts" valeur={g.arrets} detail={`${pc(g.tirsCadres ? Math.round((g.arrets / g.tirsCadres) * 100) : null)} des tirs cadrés`} />
            <Tuile libelle="Buts encaissés" valeur={g.butsEncaisses} detail={`${nb(g.xgCadres, 2)} xG cadré`} />
            <Tuile libelle="Buts évités" valeur={signe(g.butsEvites)} detail="estimation" />
          </div>
        </Bloc>
      )}
    </div>
  );
}

/* -------------------------------------------- dispositifs affrontés -------------------------------------------- */
export function SectionAdversaires({ a }: { a: AnalysesHub }) {
  const d = a.dispositifs;
  return (
    <div className="space-y-4" data-testid="hub-adversaires">
      <p className="panel-inset border-l-2 border-accent p-3 text-[13px] text-ink" role="status">
        Dispositif de l&apos;adversaire connu sur <strong>{d.couverture.avec} match{d.couverture.avec > 1 ? "s" : ""} sur {d.couverture.total}</strong> : seuls ceux saisis par le staff
        (fiche du match ou observation d&apos;après-match) comptent. Plus il y en a, plus la lecture est solide.
      </p>
      {d.lignes.length === 0 ? (
        <p className="panel-inset p-4 text-sm text-muted">Aucun dispositif adverse saisi. Renseigne-le sur la fiche du match, ou dans l&apos;onglet « Adversaire » de l&apos;après-match.</p>
      ) : (
        <>
          <Lectures constats={a.constats.filter((c) => c.domaine === "adversaires")} vide="Pas de dispositif qui sorte du lot (au moins 3 matchs contre le même sont nécessaires)." />
          <div className="grid gap-4 lg:grid-cols-2">
            <Bloc titre="Les dispositifs qu'on affronte">
              <Camembert titre="Matchs par dispositif adverse" unite=" matchs" parts={d.repartition.map((r) => ({ libelle: libelleFormation(r.formation), valeur: r.matchs }))} />
            </Bloc>
            <Bloc titre="Nos points contre chacun" aide="Points par match (3 pour une victoire, 1 pour un nul). Le nombre de matchs est indiqué : un seul match ne prouve rien.">
              <BarresH titre="Points par match selon le dispositif adverse" max={3}
                lignes={d.lignes.map((l, i) => ({ libelle: `${libelleFormation(l.formation)} · ${+l.matchs.toFixed(1)} match${l.matchs > 1 ? "s" : ""}`, valeur: l.ptsParMatch, texte: `${nb(l.ptsParMatch, 2)} pts · ${l.v}V ${l.n}N ${l.d}D`, couleur: l.ptsParMatch >= 2 ? "rgb(var(--win))" : l.ptsParMatch >= 1 ? "rgb(var(--amber))" : "rgb(var(--danger))", detail: `${LIBELLE_FIABILITE[l.fiabilite]}${i === 0 ? "" : ""}` }))} />
            </Bloc>
          </div>
          <Bloc titre="Leur efficacité contre nous" aide="Sur les matchs saisis en direct : ce que chaque dispositif nous crée et ce qu'on lui crée (xG), sa conversion, et s'il marque plus (ou moins) que ses occasions ne le disaient.">
            <div className="overflow-x-auto">
              <table className="table-fm">
                <thead><tr><th>Dispositif adverse</th><th className="text-center">Matchs</th><th className="text-right">xG créé / match</th><th className="text-right">xG concédé / match</th><th className="text-right max-sm:hidden">Écart xG</th><th className="text-right max-sm:hidden">Sa conversion</th><th className="text-right max-sm:hidden">Ses buts − xG</th></tr></thead>
                <tbody>
                  {d.lignes.map((l) => (
                    <tr key={l.formation}>
                      <td className="font-semibold text-ink">{libelleFormation(l.formation)}</td>
                      <td className="text-center tabular-nums">{l.matchs}{l.saisis < l.matchs && <span className="text-faint"> ({l.saisis} saisis)</span>}</td>
                      <td className="text-right tabular-nums text-accent">{l.saisis ? nb(l.xgPour / l.saisis, 2) : "–"}</td>
                      <td className="text-right tabular-nums text-sky">{l.saisis ? nb(l.xgContre / l.saisis, 2) : "–"}</td>
                      <td className={`text-right tabular-nums max-sm:hidden ${l.xgDiffParMatch === null ? "" : l.xgDiffParMatch >= 0 ? "text-win" : "text-loss"}`}>{l.xgDiffParMatch === null ? "–" : signe(l.xgDiffParMatch)}</td>
                      <td className="text-right tabular-nums max-sm:hidden">{pc(l.conversionAdv)}</td>
                      <td className="text-right tabular-nums max-sm:hidden">{l.butsAdvMoinsXg === null ? "–" : signe(l.butsAdvMoinsXg)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Bloc>
          {d.reponses.length > 0 && (
            <Bloc titre="Notre meilleure réponse" aide="Contre un dispositif affronté au moins deux fois : notre dispositif qui a rapporté le plus de points. Petit échantillon : une piste, pas une règle.">
              <ul className="space-y-1.5">
                {d.reponses.map((r) => <li key={r.adverse} className="flex items-center justify-between gap-2 text-sm"><span>Contre un <strong className="text-ink">{libelleFormation(r.adverse)}</strong> : notre <strong className="text-accent">{libelleFormation(r.nous)}</strong></span><span className="tabular-nums text-muted">{nb(r.ptsParMatch, 2)} pts · {r.matchs} match{r.matchs > 1 ? "s" : ""}</span></li>)}
              </ul>
            </Bloc>
          )}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------ score et rythme ------------------------------------------------ */
const LIBELLE_ETAT = { mene_par_adv: "Menés", egalite: "À égalité", mene: "En menant" } as const;

export function SectionRythme({ a }: { a: AnalysesHub }) {
  if (a.matchsSaisis === 0) return <Vide />;
  const etats = (["mene_par_adv", "egalite", "mene"] as const).map((k) => a.score.etats.find((e) => e.etat === k)!);
  const r = a.rythme;
  return (
    <div className="space-y-4" data-testid="hub-rythme">
      <Lectures constats={a.constats.filter((c) => c.domaine === "score" || c.domaine === "rythme")} vide="Rien de saillant sur le rythme ni sur la réaction au score pour l'instant." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloc titre="Selon le score du match" aide={`xG par 90 minutes selon que l'on est mené, à égalité ou qu'on mène. Reconstitué des buts datés de ${a.score.matchs} match${a.score.matchs > 1 ? "s" : ""} (les matchs dont les buts saisis ne donnent pas le score sont écartés).`}>
          {a.score.matchs === 0 ? <p className="text-sm text-muted">Aucun match dont les buts saisis donnent le score officiel.</p> : (
            <>
              <BarresTranches titre="xG par 90 minutes selon le score" noms={etats.map((e) => LIBELLE_ETAT[e.etat])} pour={etats.map((e) => e.xgPour90 ?? 0)} contre={etats.map((e) => e.xgContre90 ?? 0)} format={(x) => nb(x, 2)} legende={["Créé", "Concédé"]} />
              <p className="text-[11px] text-faint">Temps passé : {etats.map((e) => `${LIBELLE_ETAT[e.etat].toLowerCase()} ${e.minutes} min`).join(" · ")}. Un état sous 30 minutes cumulées n&apos;est pas chiffré.</p>
            </>
          )}
        </Bloc>
        <Bloc titre="Danger par tranche de 15 minutes" aide="xG créé et concédé : quand l'équipe est dangereuse, quand elle est exposée.">
          <BarresTranches titre="xG par tranche de 15 minutes" noms={NOMS_TRANCHES} pour={r.xgPour} contre={r.xgContre} format={(x) => nb(x, 1)} legende={["Créé", "Concédé"]} />
        </Bloc>
        <Bloc titre="Tirs par tranche de 15 minutes">
          <BarresTranches titre="Tirs par tranche de 15 minutes" noms={NOMS_TRANCHES} pour={r.tirsPour} contre={r.tirsContre} legende={["Nos tirs", "Tirs adverses"]} />
        </Bloc>
        <Bloc titre="Fautes et cartons par tranche" aide="Nos fautes et nos cartons : à quel moment l'équipe perd son calme ou sa lucidité.">
          <BarresTranches titre="Fautes et cartons par tranche de 15 minutes" noms={NOMS_TRANCHES} pour={r.fautes} contre={r.cartons.pour} legende={["Fautes", "Cartons"]} />
        </Bloc>
      </div>
    </div>
  );
}

/* ------------------------------------------------ profil et tendance ------------------------------------------------ */
export function SectionProfil({ a, noms }: { a: AnalysesHub; noms: Record<string, string> }) {
  const p = a.profil;
  const dep = a.dependances;
  const exploitable = p.recents >= 3;
  return (
    <div className="space-y-4" data-testid="hub-profil">
      <Lectures constats={a.constats.filter((c) => c.domaine === "profil")} vide="Pas de tendance ni de dépendance marquée pour l'instant." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Bloc titre="Profil de l'équipe : saison et 5 derniers matchs" aide="Chaque axe est ramené à 100 pour la saison ; au-delà de 100, les derniers matchs sont meilleurs (pour la défense et la discipline, moins de buts ou de cartons est « meilleur »).">
          {exploitable ? (
            <Radar titre="Profil des derniers matchs" axes={p.radar.map((r) => r.axe)} base={p.radar.map(() => 100)} recent={p.radar.map((r) => r.recent)} legende={["Saison", `${p.recents} derniers matchs`]} />
          ) : <p className="text-sm text-muted">Il faut au moins 3 matchs joués pour comparer avec la saison.</p>}
        </Bloc>
        <Bloc titre="Tendance, indicateur par indicateur">
          <div className="overflow-x-auto">
            <table className="table-fm">
              <thead><tr><th>Indicateur</th><th className="text-right">Saison</th><th className="text-right">{p.recents} derniers</th><th className="text-center"><span className="sr-only">Évolution</span></th></tr></thead>
              <tbody>
                {p.indicateurs.map((i) => {
                  const mieux = i.saison !== null && i.recent !== null && i.saison !== i.recent ? (i.recent > i.saison) === i.meilleurSiHaut : null;
                  return (
                    <tr key={i.cle}>
                      <td className="text-muted">{i.libelle}</td>
                      <td className="text-right tabular-nums">{i.saison === null ? "–" : i.unite === "%" ? `${i.saison} %` : nb(i.saison, 2)}</td>
                      <td className="text-right tabular-nums font-semibold text-ink">{i.recent === null ? "–" : i.unite === "%" ? `${i.recent} %` : nb(i.recent, 2)}</td>
                      <td className={`text-center ${mieux === null ? "text-faint" : mieux ? "text-win" : "text-loss"}`} aria-label={mieux === null ? "stable" : mieux ? "en progrès" : "en recul"}>{mieux === null ? "=" : mieux ? "▲" : "▼"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Bloc>
        <Bloc titre="Dépendances" aide="À qui et à quoi tient notre production offensive (au moins 5 buts saisis).">
          {!dep ? <p className="text-sm text-muted">Pas assez de buts saisis pour parler de dépendance.</p> : (
            <BarresH titre="Origine des buts" max={100} lignes={[
              ...(dep.buteur ? [{ libelle: `Meilleur buteur : ${noms[dep.buteur.joueurId] ?? "Joueur"}`, valeur: dep.buteur.part, texte: `${dep.buteur.part} % (${dep.buteur.buts}/${dep.buts})` }] : []),
              ...(dep.passeur ? [{ libelle: `Meilleur passeur : ${noms[dep.passeur.joueurId] ?? "Joueur"}`, valeur: dep.passeur.part, texte: `${dep.passeur.part} % des buts (${dep.passeur.passes})` }] : []),
              ...(dep.partCpa !== null ? [{ libelle: "Coups de pied arrêtés et penaltys", valeur: dep.partCpa, texte: `${dep.partCpa} %` }] : []),
              ...(dep.partTransition !== null ? [{ libelle: "Transitions", valeur: dep.partTransition, texte: `${dep.partTransition} %` }] : []),
            ]} />
          )}
        </Bloc>
      </div>
    </div>
  );
}

function Vide() {
  return <p className="panel-inset p-4 text-sm text-muted">Aucun match saisi en direct avec ces filtres : saisis un match depuis sa fiche (bouton Direct) pour débloquer ces analyses.</p>;
}

