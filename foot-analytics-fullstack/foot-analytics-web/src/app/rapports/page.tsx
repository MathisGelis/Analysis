// src/app/rapports/page.tsx
//
// Generateur de rapports : pre-match, post-match, mensuel, individuel. Chaque
// rapport sera exporte en PDF (binding a brancher cote serveur, par exemple
// via un endpoint Next /api/rapports/[id]/pdf).

import Link from "next/link";
import { api } from "@/lib/api";
import { getOwnClubIdServer } from "@/lib/own-club";
import { getOwnSaisonIdServer } from "@/lib/own-equipe";
import { clubsDeLaSaison } from "@/lib/clubs-saison";
import { resolveEquipePropre } from "@/lib/resolve-equipe-propre";
import { ClubBadge } from "@/components/ClubBadge";
import { BandeauDemo } from "@/components/BandeauDemo";
import { DynamiquePoule } from "@/components/analyse/DynamiquePoule";
import { Download, Eye, FileText, Mail, Printer, BarChart3, TrendingUp } from "lucide-react";

const RAPPORTS = [
  { id:"prematch-j22", type:"Pre-match", titre:"Pre-match J22 · vs Neuville S/S 2",  date:"26/01/2026", auteur:"Auto",          statut:"Pret" },
  { id:"postmatch-j21",type:"Post-match",titre:"Post-match J21 · vs Meys Grezieu",   date:"19/01/2026", auteur:"L. Martin",     statut:"Pret" },
  { id:"mensuel-jan",  type:"Mensuel",   titre:"Bilan mensuel · Janvier 2026",       date:"01/02/2026", auteur:"Auto",          statut:"Brouillon" },
  { id:"forme-eff",    type:"Effectif",  titre:"Etat de forme effectif",             date:"22/01/2026", auteur:"Staff sportif", statut:"Pret" },
  { id:"scoutneuv",    type:"Scouting",  titre:"Rapport scouting · Neuville S/S 2",  date:"15/01/2026", auteur:"Staff Chaponnay", statut:"Pret", href:"/club/neuv/scouting" },
];

export const metadata = { title: "Rapports · Foot Analytics" };

export default async function Rapports() {
  // Selecteur d'analyse equipe : mon club en premier, puis les autres
  // par ordre alphabetique.
  const ownClubId = getOwnClubIdServer();
  const [clubs, saisons, equipes, matchs] = await Promise.all([api.clubs(), api.saisons(), api.equipes(), api.matchs()]);
  const saison = saisons.find((s: any) => s.id === getOwnSaisonIdServer())
    ?? saisons.find((s: any) => s.actif) ?? null;
  // Dynamique du championnat de mon equipe : qui monte, qui recule.
  const { equipe: maEquipe } = await resolveEquipePropre({ equipes, saisons, matchs });
  const poule = maEquipe ? await api.dynamiquePoule(maEquipe.id) : null;
  const monClub = clubs.find((c) => c.id === ownClubId);
  // Uniquement les clubs qui ont une equipe sur la saison choisie.
  const autres = clubsDeLaSaison(clubs, equipes, saison?.id ?? null, ownClubId);

  return (
    <div className="space-y-6 fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="h-section">Generation automatique et manuelle</div>
          <h1 className="font-display text-2xl font-bold text-ink">Rapports</h1>
        </div>
      </header>

      {/* Dynamique de la poule */}
      {poule && poule.equipes.length > 0 && (
        <section className="panel p-5">
          <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="h-section flex items-center gap-2"><TrendingUp size={11} className="text-accent"/>Dynamique de la poule</h2>
            <span className="text-[11px] text-faint">
              {[poule.competition, poule.poule ? `poule ${poule.poule}` : null, saison ? saison.nom : null].filter(Boolean).join(" · ")}
            </span>
          </div>
          <DynamiquePoule poule={poule} equipeId={maEquipe?.id ?? null} />
        </section>
      )}

      {/* Analyse d'equipe — selecteur de club */}
      <section className="panel p-5">
        <div className="flex items-center gap-2 mb-3">
          <BarChart3 size={14} className="text-accent"/>
          <div className="h-section">Rapport d'analyse d'equipe</div>
        </div>
        <p className="text-xs text-muted mb-4">
          Generation automatique d'un rapport detaille : scores danger / chaos,
          joueurs cles, impact de chaque joueur, stabilite par ligne, compo
          probable, combinaisons gagnantes, timing des changements.
        </p>

        {monClub && (
          <Link
            href={`/rapports/equipe/${monClub.id}`}
            className="panel-inset p-4 flex items-center gap-4 border-l-2 border-accent hover:bg-line/40 transition mb-3"
          >
            <ClubBadge clubId={monClub.id} size={44}/>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider text-accent font-bold">
                Mon equipe
              </div>
              <div className="font-display font-bold text-ink truncate">
                {monClub.nom}
              </div>
            </div>
            <FileText size={14} className="text-accent"/>
          </Link>
        )}

        <div className="text-[11px] text-faint uppercase tracking-wider mb-2">
          Autres equipes{saison ? ` · ${saison.nom}` : ""} ({autres.length})
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {autres.map((c) => (
            <Link
              key={c.id}
              href={`/rapports/equipe/${c.id}`}
              className="panel-inset px-3 py-2 flex items-center gap-3 hover:bg-line/40 transition"
            >
              <ClubBadge clubId={c.id} size={24}/>
              <span className="text-sm truncate flex-1">{c.nom}</span>
              <FileText size={11} className="text-faint"/>
            </Link>
          ))}
        </div>
      </section>

      {/* Modeles disponibles : la generation n'est pas encore branchee */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <ModeleCard
          titre="Pre-match"
          desc="Compo probable adverse, dispositif suggere, points cles, contre-strategies."
          icon={<FileText size={18} className="text-accent"/>}
        />
        <ModeleCard
          titre="Post-match"
          desc="Resume FMI : cartons, remplacements, blessures, notes individuelles."
          icon={<FileText size={18} className="text-amber"/>}
        />
        <ModeleCard
          titre="Bilan periodique"
          desc="Mensuel ou trimestriel : performances, discipline, charge, blessures."
          icon={<FileText size={18} className="text-sky"/>}
        />
      </section>

      {/* Liste rapports existants */}
      <section className="panel p-5">
        <div className="h-section mb-3">Rapports recents</div>
        <div className="mb-4">
          <BandeauDemo>
            Cette liste est un exemple (rapports fictifs, boutons inactifs).
            Seule l'analyse d'equipe ci-dessus est generee a partir de vos
            feuilles de match.
          </BandeauDemo>
        </div>
        <table className="table-fm">
          <thead>
            <tr>
              <th>Type</th><th>Titre</th><th>Date</th><th>Auteur</th><th>Statut</th><th className="text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {RAPPORTS.map(r=>(
              <tr key={r.id}>
                <td><span className="badge">{r.type}</span></td>
                <td className="font-semibold">{r.titre}</td>
                <td className="text-xs text-muted font-mono">{r.date}</td>
                <td className="text-sm text-muted">{r.auteur}</td>
                <td>
                  <span className={`badge ${r.statut==="Pret"?"badge-accent":"badge-amber"}`}>
                    {r.statut}
                  </span>
                </td>
                <td>
                  <div className="flex items-center gap-1 justify-end">
                    {r.href ? (
                      <Link className="btn text-xs" href={r.href}>
                        <Eye size={11}/> Voir
                      </Link>
                    ) : (
                      <button className="btn text-xs"><Eye size={11}/> Voir</button>
                    )}
                    <button className="btn text-xs"><Download size={11}/> PDF</button>
                    <button className="btn text-xs"><Mail size={11}/> Envoyer</button>
                    <button className="btn text-xs"><Printer size={11}/></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ModeleCard({titre, desc, icon}:{titre:string;desc:string;icon:React.ReactNode}){
  return (
    <div className="panel p-5">
      <div className="flex items-center gap-2">
        {icon}
        <div className="h-section">{titre}</div>
      </div>
      <p className="text-sm text-muted mt-2 leading-relaxed">{desc}</p>
      <button className="btn w-full mt-4 justify-center text-xs" disabled
        title="La generation de ce rapport n'est pas encore disponible">
        Bientot disponible
      </button>
    </div>
  );
}
