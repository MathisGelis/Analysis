// src/app/matchs/[id]/page.tsx
//
// Page detail d'un match. Pour la FMI importee, on dispose des compositions
// completes des 2 equipes + toute la timeline (cartons, remplacements, blessures).

import { notFound } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { getOwnClubIdServer } from "@/lib/own-club";
import { ClubBadge } from "@/components/ClubBadge";
import { Pitch } from "@/components/Pitch";
import { PitchHeatmap } from "@/components/Charts";
import { ArbitresMatchBlock } from "@/components/ArbitresMatchBlock";
import { MatchActions } from "@/components/MatchActions";
import { PlanRealise } from "@/components/tactique/PlanRealise";
import {
  ArrowLeft, Calendar, Clock, ClipboardCheck, FileText, Goal, MapPin, Target, User, Users,
} from "lucide-react";
import type { EvenementMatch } from "@/lib/types";

/** Un match sans feuille n'a pas de score : le statut remplace le "resultat final". */
const LIBELLE_STATUT: Record<string, string> = { prevu: "A venir", a_venir: "A venir", reporte: "Reporte", annule: "Annule" };

export default async function MatchDetailPage({ params }: { params: { id: string } }) {
  const ownClubId = getOwnClubIdServer();
  const match = await api.match(params.id);
  if (!match) notFound();
  // Seuls les joueurs des deux clubs du match sont utiles : charger tout le fichier joueurs pesait
  // pres de 800 Ko a chaque ouverture de fiche.
  const [CLUBS, joueursDom, joueursExt, arbitresLiens, staffLiens] = await Promise.all([
    api.clubs(), api.joueurs(match.clubDom), api.joueurs(match.clubExt), api.arbitresForMatch(params.id),
    api.coachsForMatch(params.id),
  ]);
  const peutNoter = match.clubDom === ownClubId || match.clubExt === ownClubId;
  // Match de mon club pas encore joue : on propose le rapport de preparation contre l'adversaire.
  const statut: string = (match as any).statut ?? "joue";
  const aPreparer = peutNoter && ["prevu", "a_venir"].includes(statut);
  const adversaireId = match.clubDom === ownClubId ? match.clubExt : match.clubDom;
  // Plan prepare contre feuille jouee : seulement pour un match de mon club deja joue.
  const monEquipeId = match.clubDom === ownClubId ? match.equipeDomId : match.clubExt === ownClubId ? match.equipeExtId : null;
  const planRealise = peutNoter && monEquipeId && statut === "joue" ? await api.planContreRealise(monEquipeId, match.id) : null;

  // Le backend renvoie `compositions` avec un champ `cote` ('dom'|'ext').
  // Les donnees de demo exposent deja `compoDom`/`compoExt`. On normalise.
  const compoDom =
    (match as any).compoDom ??
    (match.compositions ?? []).filter((c: any) => c.cote === "dom");
  const compoExt =
    (match as any).compoExt ??
    (match.compositions ?? []).filter((c: any) => c.cote === "ext");
  const m = { ...match, compoDom, compoExt } as any;

  const fallbackClub = (id: string) => ({
    id, nom: id, abbr: (id || "?").slice(0, 3).toUpperCase(), couleur: "#5ab8ff",
  });
  const dom = CLUBS.find((c) => c.id === m.clubDom) ?? fallbackClub(m.clubDom);
  const ext = CLUBS.find((c) => c.id === m.clubExt) ?? fallbackClub(m.clubExt);

  // Carton(s) par joueur, pour affichage sur le terrain
  const cartonsParJoueur = new Map<string, "jaune" | "rouge">();
  for (const e of m.evenements ?? []) {
    if (e.type === "carton") {
      const prev = cartonsParJoueur.get(e.joueur);
      // si deja jaune et nouveau jaune -> rouge ; sinon prendre le plus severe
      const couleur = e.sousType as "jaune" | "rouge";
      const sev = couleur === "rouge" || prev === "jaune" ? "rouge" : "jaune";
      cartonsParJoueur.set(e.joueur, sev as any);
    }
  }

  const titulairesDom = (m.compoDom ?? []).filter((p: any) => p.titulaire);
  const titulairesExt = (m.compoExt ?? []).filter((p: any) => p.titulaire);

  // Arbitre principal : lien vers sa fiche quand la FMI l'a rattache a un arbitre.
  const arbitrePrincipal = (arbitresLiens as any[]).find(
    (l) => l.role === "principal" && l.arbitre?.id,
  )?.arbitre;

  // Libelles tolerants aux champs vides (FMI incomplete, match saisi a la main).
  const dispositif = (f?: string | null) => (f ? ` · ${f}` : "");
  const libelleCompetition = [m.competition, m.poule ? `Poule ${m.poule}` : null]
    .filter(Boolean).join(" · ") || "—";

  // Heatmap ILLUSTRATIVE (matrice fixe, pas calculee depuis les evenements)
  const heatmap = [
    [0,1,2,1],
    [1,2,4,3],
    [2,5,7,5],
    [1,3,5,4],
    [0,1,2,1],
  ];

  return (
    <div className="space-y-6 fade-up">
      <div className="flex items-center justify-between">
        <Link href="/matchs" className="text-xs text-muted hover:text-ink flex items-center gap-1">
          <ArrowLeft size={12}/> Retour aux matchs
        </Link>
        <div className="flex items-center gap-2">
          {aPreparer && (
            <Link href={`/rapports/prematch/${adversaireId}?matchId=${match.id}`} className="btn btn-primary text-xs">
              <Target size={12}/> Rapport pre-match
            </Link>
          )}
          <MatchActions match={match}/>
        </div>
      </div>

      {/* En-tete match */}
      <header className="panel p-6 relative overflow-hidden">
        <h1 className="sr-only">{dom.nom} contre {ext.nom}</h1>
        <div className="absolute -top-24 -right-24 w-80 h-80 bg-accent/5 rounded-full blur-3xl"/>
        <div className="relative flex items-center justify-between gap-6 flex-wrap">
          <Link href={`/club/${dom.id}`} className="flex items-center gap-3 flex-1 min-w-0 hover:text-accent">
            <ClubBadge clubId={dom.id} size={64}/>
            <div>
              <div className="font-display text-xl font-bold text-ink">{dom.nom}</div>
              <div className="text-[11px] text-faint uppercase tracking-wider">
                Recevant{dispositif(m.formationDom)}
              </div>
            </div>
          </Link>

          <div className="text-center px-4">
            <div className="text-[10px] uppercase tracking-[0.18em] text-faint mb-1">
              {LIBELLE_STATUT[statut] ?? "Resultat final"}
            </div>
            <div className="font-display text-6xl font-black text-ink tabular-nums leading-none">
              {LIBELLE_STATUT[statut]
                ? <span className="text-faint">VS</span>
                : <>{m.scoreDom}<span className="text-muted mx-3 font-light">–</span>{m.scoreExt}</>}
            </div>
            <div className="flex items-center justify-center gap-3 text-[11px] text-muted mt-3">
              <span className="flex items-center gap-1"><Calendar size={11}/>{m.date}</span>
              <span className="flex items-center gap-1"><Clock size={11}/>{m.heure}</span>
            </div>
          </div>

          <Link href={`/club/${ext.id}`} className="flex items-center gap-3 flex-1 min-w-0 justify-end hover:text-accent">
            <div className="text-right">
              <div className="font-display text-xl font-bold text-ink">{ext.nom}</div>
              <div className="text-[11px] text-faint uppercase tracking-wider">
                Visiteur{dispositif(m.formationExt)}
              </div>
            </div>
            <ClubBadge clubId={ext.id} size={64}/>
          </Link>
        </div>

        {/* meta sous le score */}
        <div className="relative grid grid-cols-2 md:grid-cols-4 gap-3 mt-5 pt-5 border-t border-line text-xs">
          <Meta icon={<MapPin size={12}/>} label="Terrain" value={m.terrain ?? "—"}/>
          <Meta icon={<User size={12}/>} label="Arbitre" value={
            arbitrePrincipal
              ? <Link href={`/arbitres/${arbitrePrincipal.id}`} className="hover:text-accent">{m.arbitre ?? arbitrePrincipal.nom}</Link>
              : (m.arbitre ?? "—")
          }/>
          <Meta icon={<FileText size={12}/>} label="N° FMI" value={m.numeroFmi ?? "—"}/>
          <Meta icon={<span className="text-accent">●</span>} label="Competition" value={libelleCompetition}/>
        </div>
      </header>

      {/* Compositions sur terrain */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 md:col-span-6">
          <Pitch
            formation={m.formationDom}
            joueurs={titulairesDom.map((p: any) => ({
              numero: p.numero,
              nom: p.nom,
              capitaine: p.capitaine,
              carton: cartonsParJoueur.get(`${p.nom} ${p.prenom}`),
            }))}
            titre={`${dom.nom} · titulaires`}
            couleur="rgb(var(--accent))"
            oriente="haut"
          />
        </div>
        <div className="col-span-12 md:col-span-6">
          <Pitch
            formation={m.formationExt}
            joueurs={titulairesExt.map((p: any) => ({
              numero: p.numero,
              nom: p.nom,
              capitaine: p.capitaine,
              carton: cartonsParJoueur.get(`${p.nom} ${p.prenom}`),
            }))}
            titre={`${ext.nom} · titulaires`}
            couleur="rgb(var(--sky))"
            oriente="bas"
          />
        </div>
      </section>

      {/* Plan de jeu prepare contre feuille de match */}
      {planRealise?.etat === "ok" && (
        <section className="panel p-5" aria-labelledby="plan-realise">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 id="plan-realise" className="h-section flex items-center gap-2"><ClipboardCheck size={11} className="text-accent"/>Plan contre realise</h2>
            <span className="text-[11px] text-faint">le onze prepare dans l'onglet Tactique, compare a la feuille de match</span>
          </div>
          <PlanRealise donnees={planRealise} />
        </section>
      )}
      {planRealise?.etat === "pas_de_plan" && (
        <p className="flex items-center gap-2 px-1 text-xs text-faint">
          <ClipboardCheck size={13} aria-hidden /> Aucun plan de jeu n'avait ete prepare pour ce match.
          <Link href="/tactique" className="text-accent hover:underline">Preparer le prochain</Link>
        </p>
      )}

      {/* Bancs */}
      <section className="grid grid-cols-12 gap-4">
        <BancCard club={dom} compo={m.compoDom!.filter((p: any) => !p.titulaire)} cartons={cartonsParJoueur}/>
        <BancCard club={ext} compo={m.compoExt!.filter((p: any) => !p.titulaire)} cartons={cartonsParJoueur}/>
      </section>

      {/* Timeline + heatmap */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7 panel p-5">
          <div className="h-section mb-3">Chronologie du match</div>
          <Timeline events={m.evenements ?? []} domNom={dom.abbr} extNom={ext.abbr}/>
        </div>
        <div className="col-span-12 lg:col-span-5 panel p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            Heatmap pression · zones du terrain
            <span className="badge badge-amber">Illustratif</span>
          </div>
          <PitchHeatmap matrix={heatmap}/>
          <p className="text-[11px] text-muted mt-2">
            Donnees illustratives : cette carte n'est pas calculee a partir du
            match. Elle sera derivee des evenements quand le module xT sera branche.
          </p>
        </div>
      </section>

      {/* Tableau complet compos */}
      <section className="grid grid-cols-12 gap-4">
        <CompoTable club={dom} compo={m.compoDom!}
          joueurs={joueursDom}
          cartons={cartonsParJoueur}/>
        <CompoTable club={ext} compo={m.compoExt!}
          joueurs={joueursExt}
          cartons={cartonsParJoueur}/>
      </section>

      <ArbitresMatchBlock liens={arbitresLiens as any} peutNoter={peutNoter}/>

      {/* Encadrement : educateurs / dirigeants releves sur la FMI */}
      {(staffLiens as any[]).length > 0 && (
        <section className="panel p-5">
          <div className="h-section mb-3 flex items-center gap-2">
            <Users size={11} className="text-accent"/> Encadrement
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {([["dom", dom], ["ext", ext]] as const).map(([cote, club]) => (
              <div key={cote}>
                <div className="text-[10px] uppercase tracking-wider text-faint mb-1">{club.nom}</div>
                <ul className="space-y-1 text-sm">
                  {(staffLiens as any[]).filter((l) => l.cote === cote).map((l) => (
                    <li key={l.id} className="flex items-center gap-2">
                      <span className="text-ink">{l.coach?.prenom} {l.coach?.nom}</span>
                      <span className="badge">{l.fonctions}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ---- sous-composants ---- */
function Meta({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 text-muted">
      <span className="text-faint">{icon}</span>
      <span className="text-faint uppercase tracking-wider text-[10px]">{label}</span>
      <span className="text-ink truncate">{value}</span>
    </div>
  );
}
function BancCard({ club, compo, cartons }: any) {
  return (
    <div className="col-span-12 md:col-span-6 panel p-5">
      <div className="flex items-center gap-2 mb-3">
        <ClubBadge clubId={club.id} size={20}/>
        <div className="h-section">Banc · {club.abbr}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {compo.map((p: any) => {
          const carton = cartons?.get(`${p.nom} ${p.prenom}`) as "jaune" | "rouge" | undefined;
          return (
            <span key={p.numero} className="badge inline-flex items-center gap-1.5">
              #{p.numero} {p.nom}
              {carton === "jaune" && (
                <span className="inline-block w-[6px] h-[9px] bg-amber rounded-[1px]"/>
              )}
              {carton === "rouge" && (
                <span className="inline-block w-[6px] h-[9px] bg-danger rounded-[1px]"/>
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}
function CompoTable({ club, compo, joueurs, cartons }: any) {
  const norm = (s: string) =>
    (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const findId = (nom: string, prenom?: string) => {
    const n = norm(nom);
    if (!n) return undefined;
    const p = prenom ? norm(prenom) : "";
    if (p) {
      const exact = joueurs.find((j: any) => norm(j.nom) === n && norm(j.prenom ?? "") === p);
      if (exact) return exact.id;
    }
    return joueurs.find((j: any) => norm(j.nom) === n)?.id;
  };
  return (
    <div className="col-span-12 md:col-span-6 panel p-5">
      <div className="flex items-center gap-2 mb-3">
        <ClubBadge clubId={club.id} size={20}/>
        <div className="h-section">Composition · {club.nom}</div>
      </div>
      <table className="table-fm">
        <thead>
          <tr><th>#</th><th>Joueur</th><th>Licence</th><th>Statut</th></tr>
        </thead>
        <tbody>
          {compo.map((p: any) => {
            const id = findId(p.nom, p.prenom);
            const carton = cartons?.get(`${p.nom} ${p.prenom}`) as "jaune" | "rouge" | undefined;
            return (
              <tr key={p.numero}>
                <td className="font-mono text-muted">{p.numero}</td>
                <td className="font-semibold">
                  <span className="inline-flex items-center gap-1.5">
                    {id ? (
                      <Link href={`/joueur/${id}`} className="hover:text-accent">
                        {p.prenom} {p.nom}
                      </Link>
                    ) : (
                      <>{p.prenom} {p.nom}</>
                    )}
                    {/* Icone carton : petit rectangle vertical jaune ou rouge */}
                    {carton === "jaune" && (
                      <span className="inline-block w-[7px] h-[10px] bg-amber rounded-[1px]"
                        title="Carton jaune"/>
                    )}
                    {carton === "rouge" && (
                      <span className="inline-block w-[7px] h-[10px] bg-danger rounded-[1px]"
                        title="Carton rouge"/>
                    )}
                    {p.capitaine && <span className="ml-1 badge badge-amber">C</span>}
                  </span>
                </td>
                <td className="text-[11px] font-mono text-faint">{p.licence}</td>
                <td>
                  <span className={`badge ${p.titulaire ? "badge-accent" : ""}`}>
                    {p.titulaire ? "Titulaire" : "Remplacant"}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Timeline({ events, domNom, extNom }: { events: EvenementMatch[]; domNom: string; extNom: string }) {
  // Ordre chronologique (minute puis temps additionnel) : l'ordre de stockage
  // suit les tableaux de la FMI (cartons, puis remplacements...), pas le match.
  const tries = [...events].sort(
    (a, b) => (a.minute ?? 0) - (b.minute ?? 0) || (a.arret ?? 0) - (b.arret ?? 0),
  );
  return (
    <ul className="space-y-3">
      {tries.map((e, i) => {
        const m = `${e.minute ?? "?"}${e.arret ? `+${e.arret}` : ""}'`;
        const side = e.equipe === "dom" ? "left" : "right";
        let icon: React.ReactNode = null;
        let color = "text-muted";
        let title = "";
        if (e.type === "carton") {
          icon = <span className={`w-2.5 h-3.5 rounded-sm ${e.sousType === "rouge" ? "bg-danger" : "bg-amber"}`}/>;
          color = e.sousType === "rouge" ? "text-danger" : "text-amber";
          title = `Carton ${e.sousType} · ${e.joueur}`;
        } else if (e.type === "carton_vert") {
          icon = <span className="w-2.5 h-3.5 rounded-sm bg-win"/>;
          color = "text-win";
          title = `Carton vert (fair-play) · ${e.joueur}`;
        } else if (e.type === "remplacement") {
          icon = <span className="inline-block text-sky">⇆</span>;
          color = "text-sky";
          title = `${e.joueur} → ${e.joueur2}`;
        } else if (e.type === "blessure") {
          icon = <span className="inline-block text-danger">+</span>;
          color = "text-danger";
          title = `Blessure · ${e.joueur} (${e.sousType})`;
        } else if (e.type === "but") {
          icon = <Goal size={14} className="text-accent"/>;
          color = "text-accent";
          title = `BUT · ${e.joueur}`;
        }
        return (
          <li key={i} className="flex items-center gap-4">
            <div className="w-12 text-right font-mono text-xs text-faint">{m}</div>
            <div className={`w-6 flex justify-center ${color}`}>{icon}</div>
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-faint">
                  {e.equipe === "dom" ? domNom : extNom}
                </span>
                <span className="text-sm text-ink">{title}</span>
              </div>
              {e.motif && (
                <div className="text-[11px] text-muted italic mt-0.5">"{e.motif}"</div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
