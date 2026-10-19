"use client";
// src/features/audit/components/JournalPage.tsx
//
// Journal d'audit (administrateur) : connexions, gestion des comptes, donnees medicales, exports, fiches de joueurs
// d'autres clubs, imports ; les alertes en tete de page. Lecture seule : aucune trace ne se modifie ni ne s'efface
// (purge automatique apres 12 mois).

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ChevronLeft, ChevronRight, ScrollText } from "lucide-react";

import { api, messageApi } from "@/shared/lib/api";
import { AdminOnglets } from "@/shared/ui/AdminOnglets";
import { Select } from "@/shared/ui/Select";
import { useUtilisateur } from "@/features/auth/lib/session-context";
import { useClubsParId } from "@/features/clubs/lib/clubs-context";
import {
  CATEGORIES, dateHeureJournal, estAlerte, libelleAction, lireCible, resumeDetails, type PageJournal,
} from "@/features/audit/lib/journal";

const PAR_PAGE = 50;

export default function JournalPage() {
  const router = useRouter();
  const moi = useUtilisateur();
  const clubs = useClubsParId();
  const [categorie, setCategorie] = useState("");
  const [page, setPage] = useState(1);
  const [donnees, setDonnees] = useState<PageJournal | null>(null);
  const [alertes, setAlertes] = useState<PageJournal | null>(null);
  const [comptes, setComptes] = useState<Map<string, string>>(new Map());
  const [erreur, setErreur] = useState<string | null>(null);

  useEffect(() => {
    if (moi && moi.role !== "admin") router.replace("/");
  }, [moi, router]);

  // Identifiants -> logins, pour lire le journal (qui ne stocke que des identifiants).
  useEffect(() => {
    api.utilisateurs().then((us) => setComptes(new Map(us.map((u: any) => [u.id, u.login])))).catch(() => {});
    api.journalAudit({ action: "alerte.*", parPage: 5 }).then(setAlertes).catch(() => {});
  }, []);

  const charger = useCallback(async () => {
    setErreur(null);
    try {
      setDonnees(await api.journalAudit({ action: categorie || undefined, page, parPage: PAR_PAGE }));
    } catch (e) {
      setErreur(messageApi(e, "Journal indisponible"));
    }
  }, [categorie, page]);
  useEffect(() => { void charger(); }, [charger]);

  const nbPages = useMemo(() => (donnees ? Math.max(1, Math.ceil(donnees.total / donnees.parPage)) : 1), [donnees]);
  const nomCompte = (id: string | null) => (id ? comptes.get(id) ?? `${id.slice(0, 8)}…` : "Systeme");
  const nomClub = (id: string | null) => (id ? clubs.get(id)?.nom ?? "—" : "—");

  return (
    <div className="space-y-6 fade-up">
      <header>
        <div className="h-section flex items-center gap-2"><ScrollText size={11} className="text-accent"/>Administration</div>
        <h1 className="font-display text-2xl font-bold text-ink">Journal d'audit</h1>
        <p className="mt-1 max-w-2xl text-xs text-muted">
          Connexions, gestion des comptes, donnees medicales, exports et fiches de joueurs d'autres clubs. Les traces ne
          se modifient pas et sont effacees automatiquement apres 12 mois. Elles ne contiennent ni nom ni donnee medicale.
        </p>
      </header>

      <AdminOnglets />

      {alertes && alertes.total > 0 && (
        <section className="panel border-l-2 border-danger p-4" data-testid="alertes-journal">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-danger">
            <AlertTriangle size={14}/> {alertes.total} alerte{alertes.total > 1 ? "s" : ""}
          </div>
          <ul className="space-y-1 text-xs text-muted">
            {alertes.items.map((a) => (
              <li key={a.id}>
                <span className="text-ink">{dateHeureJournal(a.le)}</span> · {libelleAction(a.action)}
                {a.utilisateurId ? ` · ${nomCompte(a.utilisateurId)}` : ""} · {resumeDetails(a)}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="panel p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <label className="block w-full max-w-xs">
            <span className="text-[11px] uppercase tracking-wider text-faint">Afficher</span>
            <Select
              ariaLabel="Categorie d'evenements"
              valeur={categorie}
              onChange={(v) => { setCategorie(v); setPage(1); }}
              options={CATEGORIES}
            />
          </label>
          {donnees && <span className="text-xs text-muted tabular-nums">{donnees.total} trace(s)</span>}
        </div>

        {erreur && <p role="alert" className="text-sm text-danger">{erreur}</p>}
        {!donnees && !erreur && <p className="text-sm text-muted">Chargement…</p>}
        {donnees && donnees.items.length === 0 && <p className="py-6 text-center text-sm text-muted">Aucune trace.</p>}
        {donnees && donnees.items.length > 0 && (
          <div className="overflow-x-auto">
            <table className="table-fm table-fm-compact" data-testid="table-journal">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Evenement</th>
                  <th>Compte</th>
                  <th className="max-sm:hidden">Cible</th>
                  <th className="max-sm:hidden">Club vise</th>
                  <th className="max-md:hidden">Details</th>
                  <th className="max-md:hidden">Adresse</th>
                </tr>
              </thead>
              <tbody>
                {donnees.items.map((t) => {
                  const cible = lireCible(t.cible);
                  return (
                    <tr key={t.id} className={estAlerte(t.action) ? "text-danger" : undefined}>
                      <td className="whitespace-nowrap tabular-nums text-xs">{dateHeureJournal(t.le)}</td>
                      <td className="text-xs font-semibold">{libelleAction(t.action)}</td>
                      <td className="font-mono text-xs">{nomCompte(t.utilisateurId)}</td>
                      <td className="max-sm:hidden text-xs text-muted">
                        {cible ? (cible.type === "utilisateur" ? nomCompte(cible.id) : `${cible.type} ${cible.id.slice(0, 8)}`) : "—"}
                      </td>
                      <td className="max-sm:hidden text-xs text-muted">{nomClub(t.cibleClubId)}</td>
                      <td className="max-md:hidden text-xs text-muted">{resumeDetails(t)}</td>
                      <td className="max-md:hidden font-mono text-[11px] text-faint">{t.ip ?? ""}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {nbPages > 1 && (
          <nav className="flex items-center justify-center gap-3" aria-label="Pagination du journal">
            <button className="btn text-xs" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={12}/> Precedent
            </button>
            <span className="text-xs tabular-nums text-muted">Page {page} / {nbPages}</span>
            <button className="btn text-xs" disabled={page >= nbPages} onClick={() => setPage(page + 1)}>
              Suivant <ChevronRight size={12}/>
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}
