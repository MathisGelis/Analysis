"use client";
// src/components/SaisonsManager.tsx
//
// Tableau des saisons : creer, activer, lister. Les actions appellent
// le backend puis font un refresh router.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { Calendar, Check, Plus, Star } from "lucide-react";

interface Props {
  saisons: any[];
  equipes: any[];
}

export function SaisonsManager({ saisons, equipes }: Props) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [nom, setNom] = useState("");
  const [anneeDebut, setAnneeDebut] = useState<string>(
    String(new Date().getFullYear()),
  );
  const [busy, setBusy] = useState(false);

  const equipesParSaison = (saisonId: string) =>
    equipes.filter((e) => e.saisonId === saisonId);

  const onActiver = async (id: string) => {
    setBusy(true);
    try { await api.activerSaison(id); router.refresh(); }
    finally { setBusy(false); }
  };
  const onCreer = async () => {
    if (!nom.trim()) return;
    setBusy(true);
    try {
      await api.creerSaison({
        nom: nom.trim(), anneeDebut: parseInt(anneeDebut, 10) || new Date().getFullYear(),
        actif: false,
      });
      setNom(""); setCreating(false); router.refresh();
    } finally { setBusy(false); }
  };

  return (
    <section className="space-y-4">
      <div className="panel p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="h-section flex items-center gap-2">
            <Calendar size={11} className="text-turf"/>
            Saisons enregistrees ({saisons.length})
          </div>
          <button
            className="btn text-xs"
            onClick={() => setCreating((c) => !c)}
          >
            <Plus size={12}/> Nouvelle saison
          </button>
        </div>

        {creating && (
          <div className="panel-inset p-3 mb-4 flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-faint">Nom</span>
              <input
                className="inp text-sm"
                placeholder="2026-2027"
                value={nom}
                onChange={(e) => setNom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs">
              <span className="text-faint">Annee de debut</span>
              <input
                className="inp text-sm w-28"
                type="number"
                value={anneeDebut}
                onChange={(e) => setAnneeDebut(e.target.value)}
              />
            </label>
            <button
              className="btn btn-primary text-xs"
              onClick={onCreer} disabled={busy || !nom.trim()}
            >
              Creer
            </button>
            <button className="btn text-xs" onClick={() => setCreating(false)}>
              Annuler
            </button>
          </div>
        )}

        {saisons.length === 0 ? (
          <p className="text-sm text-muted text-center py-6">
            Aucune saison enregistree. Importez des FMI : une saison sera
            creee automatiquement depuis la date des matchs.
          </p>
        ) : (
          <table className="table-fm">
            <thead>
              <tr>
                <th>Saison</th>
                <th>Statut</th>
                <th className="text-center">Annee debut</th>
                <th className="text-center">Equipes</th>
                <th className="text-right"></th>
              </tr>
            </thead>
            <tbody>
              {saisons.map((s) => (
                <tr key={s.id} className={s.actif ? "is-mine" : ""}>
                  <td className="font-display font-bold">
                    {s.actif && <Star size={11} className="inline text-turf mr-1.5"/>}
                    {s.nom}
                  </td>
                  <td>
                    <span className={`badge text-[10px] ${
                      s.statut === "en_cours" ? "badge-turf"
                      : s.statut === "terminee" ? "" : "badge-amber"
                    }`}>{s.statut}</span>
                  </td>
                  <td className="text-center tabular-nums">{s.anneeDebut}</td>
                  <td className="text-center tabular-nums">
                    {equipesParSaison(s.id).length}
                  </td>
                  <td className="text-right">
                    {s.actif ? (
                      <span className="text-xs text-turf flex items-center justify-end gap-1">
                        <Check size={11}/> Active
                      </span>
                    ) : (
                      <button
                        className="btn text-xs"
                        disabled={busy}
                        onClick={() => onActiver(s.id)}
                      >
                        Activer
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Liste des equipes par saison */}
      {saisons.length > 0 && (
        <div className="panel p-5">
          <div className="h-section mb-3">Equipes par saison</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {saisons.map((s) => {
              const equ = equipesParSaison(s.id);
              return (
                <div key={s.id} className="panel-inset p-3">
                  <div className="font-display font-bold mb-2">
                    {s.nom} {s.actif && <Star size={10} className="inline text-turf"/>}
                  </div>
                  {equ.length === 0 ? (
                    <p className="text-xs text-faint">Aucune equipe rattachee.</p>
                  ) : (
                    <ul className="space-y-1">
                      {equ.map((e: any) => (
                        <li key={e.id} className="text-xs flex items-center justify-between gap-2">
                          <span className="font-semibold">{e.nom}</span>
                          <span className="text-faint">{e.competitionLibelle ?? "—"}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
