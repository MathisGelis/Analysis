// src/app/scouting/page.tsx
//
// Liste de scouting : un acces direct par club a son onglet "Rapport scouting".
// Affiche les clubs avec rapport finalise + ceux sans (a creer).

import Link from "next/link";
import { api } from "@/lib/api";
import { getOwnClubIdServer } from "@/lib/own-club";
import { ClubBadge } from "@/components/ClubBadge";
import { FileText, Plus } from "lucide-react";

export const metadata = { title: "Scouting · Foot Analytics" };

export default async function ScoutingList() {
  const CLUB_PROPRE_ID = getOwnClubIdServer();
  const [clubs, rapports] = await Promise.all([
    api.clubs(),
    api.rapports(),
  ]);

  const avecId = new Set(rapports.map((r) => r.clubId));
  const adversaires = clubs.filter((c) => c.id !== CLUB_PROPRE_ID);
  const aveRapport = adversaires.filter((c) => avecId.has(c.id));
  const sansRapport = adversaires.filter((c) => !avecId.has(c.id));

  return (
    <div className="space-y-6 fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="h-section">Rapports d'observation</div>
          <h1 className="font-display text-2xl font-bold text-ink">Scouting adversaires</h1>
        </div>
        <Link href="/import" className="btn btn-primary">
          <Plus size={14}/> Importer une FMI
        </Link>
      </header>

      {/* Avec rapport */}
      <section className="panel p-5">
        <div className="h-section mb-3">Rapports disponibles ({aveRapport.length})</div>
        {aveRapport.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">
            Aucun rapport finalise pour l'instant. Importez des feuilles de
            match pour generer automatiquement les rapports adversaires.
          </p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {aveRapport.map((c) => {
              const r = rapports.find((x) => x.clubId === c.id);
              return (
                <Link
                  key={c.id}
                  href={`/club/${c.id}/scouting`}
                  className="panel-inset p-4 hover:bg-line/40 transition flex items-start gap-3"
                >
                  <ClubBadge clubId={c.id} size={42}/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="badge badge-amber"><FileText size={10}/> Rapport</span>
                      {r?.date && <span className="badge">{r.date}</span>}
                    </div>
                    <div className="font-display text-sm font-bold text-ink mt-1 truncate">
                      {c.nom}
                    </div>
                    {r?.dispositifAttendu && (
                      <div className="text-[11px] text-muted mt-0.5">
                        Dispositif : <span className="text-turf font-semibold">{r.dispositifAttendu}</span>
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>

      {/* Sans rapport */}
      {sansRapport.length > 0 && (
        <section className="panel p-5">
          <div className="h-section mb-3">Clubs sans rapport ({sansRapport.length})</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {sansRapport.map((c) => (
              <Link
                key={c.id}
                href={`/club/${c.id}/scouting`}
                className="panel-inset p-3 flex items-center gap-3 hover:bg-line/40 transition"
              >
                <ClubBadge clubId={c.id} size={32}/>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{c.nom}</div>
                  <div className="text-[11px] text-turf">Voir / creer →</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
