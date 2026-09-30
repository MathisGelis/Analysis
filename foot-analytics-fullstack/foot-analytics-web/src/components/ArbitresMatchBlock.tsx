// src/components/ArbitresMatchBlock.tsx
"use client";

// Bloc affiche sur la fiche match : liste des arbitres avec leur role,
// editable (note) UNIQUEMENT si l'un des deux clubs du match est mien.
// La note est PATCHee directement sur l'association arbitre-match.

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import { Award, Save, Star } from "lucide-react";

const ROLE_LIBELLE: Record<string, string> = {
  principal: "Arbitre principal",
  assistant1: "Assistant 1",
  assistant2: "Assistant 2",
  "4e": "4e officiel",
  autre: "Autre",
};

interface Lien {
  id: string;
  arbitreId: string;
  role: string;
  note: number | null;
  arbitre: { id: string; nom: string; prenom?: string; profil?: string | null };
}

export function ArbitresMatchBlock({
  liens, peutNoter,
}: {
  liens: Lien[];
  peutNoter: boolean;
}) {
  const [local, setLocal] = useState<Lien[]>(liens);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);

  // Trier : principal, assistant1, assistant2, 4e, autre
  const order = ["principal", "assistant1", "assistant2", "4e", "autre"];
  const sorted = [...local].sort(
    (a, b) => order.indexOf(a.role) - order.indexOf(b.role),
  );

  async function saveNote(linkId: string) {
    const raw = drafts[linkId];
    const v = raw === "" ? null : Number(raw);
    if (v != null && (isNaN(v) || v < 0 || v > 10)) {
      alert("La note doit etre comprise entre 0 et 10.");
      return;
    }
    setSavingId(linkId);
    try {
      const updated = await api.updateArbitreLink(linkId, { note: v });
      setLocal((arr) => arr.map((l) => l.id === linkId ? { ...l, note: updated.note } : l));
      setDrafts((d) => { const n = { ...d }; delete n[linkId]; return n; });
    } catch (e) {
      alert("Echec de la sauvegarde : " + (e as Error).message);
    } finally {
      setSavingId(null);
    }
  }

  return (
    <section className="panel p-5">
      <div className="h-section mb-3 flex items-center gap-2">
        <Award size={11} className="text-turf"/>
        Arbitres ({sorted.length})
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-muted py-2">Aucun arbitre enregistre sur ce match.</p>
      ) : (
        <table className="table-fm">
          <thead>
            <tr>
              <th>Fonction</th>
              <th>Nom</th>
              <th>Profil</th>
              <th>Note</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((l) => {
              const drafted = drafts[l.id];
              const currentVal = drafted !== undefined
                ? drafted
                : l.note != null ? String(l.note) : "";
              return (
                <tr key={l.id}>
                  <td className="text-xs uppercase tracking-wider text-muted">
                    {ROLE_LIBELLE[l.role] ?? l.role}
                  </td>
                  <td>
                    <Link href={`/arbitres/${l.arbitre.id}`} className="font-semibold hover:text-turf">
                      {l.arbitre.prenom ? <span className="text-faint mr-1">{l.arbitre.prenom}</span> : null}
                      {l.arbitre.nom}
                    </Link>
                  </td>
                  <td>
                    {l.arbitre.profil ? (
                      <span className={`badge ${
                        l.arbitre.profil === "Strict" ? "badge-danger"
                        : l.arbitre.profil === "Permissif" ? "badge-turf"
                        : "badge-amber"
                      }`}>{l.arbitre.profil}</span>
                    ) : <span className="text-faint text-xs">—</span>}
                  </td>
                  <td>
                    {peutNoter ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="number" min={0} max={10} step={0.5}
                          className="inp !py-1 !px-2 text-xs w-20"
                          value={currentVal}
                          placeholder="—"
                          onChange={(e) => setDrafts((d) => ({ ...d, [l.id]: e.target.value }))}
                        />
                        {drafted !== undefined && (
                          <button
                            className="btn text-xs"
                            onClick={() => saveNote(l.id)}
                            disabled={savingId === l.id}
                          >
                            <Save size={11}/>
                            {savingId === l.id ? "…" : "OK"}
                          </button>
                        )}
                      </div>
                    ) : l.note != null ? (
                      <span className="font-display font-bold text-turf tabular-nums flex items-center gap-1">
                        <Star size={11}/> {l.note}
                      </span>
                    ) : (
                      <span className="text-faint text-xs">non notee</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {!peutNoter && sorted.length > 0 && (
        <p className="text-[11px] text-faint mt-3 italic">
          Les notes ne sont saisissables que sur les matchs impliquant votre club.
        </p>
      )}
    </section>
  );
}
