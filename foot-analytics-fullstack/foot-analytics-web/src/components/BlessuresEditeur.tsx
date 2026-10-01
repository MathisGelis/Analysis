"use client";
// src/components/BlessuresEditeur.tsx
//
// Liste editable de blessures, avec boutons ajouter / modifier / supprimer.
// Utilise depuis :
//  - l'onglet "Medical" d'une fiche joueur (joueurId fixe)
//  - la page /medical globale (toutes les blessures, joueurs varies)
//
// Garde son etat en memoire et se rafraichit apres chaque mutation.

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "@/lib/api";
import { BlessureModal } from "@/components/BlessureModal";
import { joursManques, blessureEnCours } from "@/lib/blessures";
import { AlertTriangle, Clock, Dumbbell, Pencil, Plus, Trash2 } from "lucide-react";
import { useFeedback } from "@/lib/feedback-context";

interface Blessure {
  id: string;
  joueurId: string;
  joueurNom?: string | null;
  localisation?: string | null;
  dateDebut?: string | null;
  retourEstime?: string | null;
  statut?: string | null;
  details?: string | null;
}

interface JoueurLite {
  id: string;
  nom: string;
  prenom?: string | null;
}

interface Props {
  initialBlessures: Blessure[];
  joueurs: JoueurLite[];
  joueurId?: string;        // si defini : verrouille les ajouts/edit sur ce joueur
  titre?: string;
  // Si true : affichage compact (sans colonne Joueur, utile dans l'onglet
  // medical d'une fiche joueur ou tout porte deja sur le meme joueur).
  compact?: boolean;
}

export function BlessuresEditeur({
  initialBlessures, joueurs, joueurId, titre = "Blessures", compact = false,
}: Props) {
  const { notifier, confirmer } = useFeedback();
  const router = useRouter();
  const [blessures, setBlessures] = useState<Blessure[]>(initialBlessures);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Blessure | undefined>();
  const [deleting, setDeleting] = useState<string | null>(null);

  const openCreate = () => { setEditing(undefined); setModalOpen(true); };
  const openEdit = (b: Blessure) => { setEditing(b); setModalOpen(true); };

  const reload = async () => {
    const list = await api.blessures(joueurId);
    setBlessures(list);
    router.refresh();
  };

  const confirmDelete = async (id: string) => {
    if (!(await confirmer({ titre: "Supprimer cette blessure ?", message: "Elle disparait de l'historique medical du joueur.", danger: true }))) return;
    setDeleting(id);
    try {
      await api.deleteBlessure(id);
      await reload();
      notifier.succes("Blessure supprimee.");
    } catch (e) {
      notifier.erreur("Suppression impossible : " + (e as Error).message);
    } finally {
      setDeleting(null);
    }
  };

  const joueurNom = (id: string) => {
    const j = joueurs.find((x) => x.id === id);
    if (!j) return id.slice(0, 6);
    return `${j.prenom ?? ""} ${j.nom}`.trim();
  };

  // Tri : en cours d'abord, puis date debut decroissante
  const sorted = blessures.slice().sort((a, b) => {
    const ea = blessureEnCours(a) ? 0 : 1;
    const eb = blessureEnCours(b) ? 0 : 1;
    if (ea !== eb) return ea - eb;
    return (b.dateDebut ?? "").localeCompare(a.dateDebut ?? "");
  });

  return (
    <section className="panel p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="h-section flex items-center gap-2">
          <AlertTriangle size={11} className="text-danger"/>
          {titre} ({blessures.length})
        </div>
        <button onClick={openCreate}
          className="btn text-xs flex items-center gap-1">
          <Plus size={11}/> Ajouter
        </button>
      </div>

      {blessures.length === 0 ? (
        <p className="text-sm text-muted py-6 text-center">
          Aucune blessure enregistree.
        </p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((b) => {
            const enCours = blessureEnCours(b);
            const jours = joursManques(b);
            const labelJours = enCours
              ? `En cours depuis ${jours} j`
              : `${jours} j manques`;
            return (
              <li key={b.id} className={`panel-inset p-3 flex items-start gap-3 ${
                enCours ? "border-l-2 border-l-danger" : ""
              }`}>
                <Dumbbell size={14} className={`mt-1 ${enCours ? "text-danger" : "text-faint"}`}/>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">{b.localisation ?? "Indeterminee"}</span>
                    <span className={`badge text-[10px] ${
                      enCours ? "badge-danger" : ""
                    }`}>{b.statut ?? "—"}</span>
                    {jours > 0 && (
                      <span className={`badge text-[10px] flex items-center gap-1 ${
                        enCours ? "badge-amber" : ""
                      }`}>
                        <Clock size={9}/> {labelJours}
                      </span>
                    )}
                    {!compact && (
                      <Link href={`/joueur/${b.joueurId}`}
                        className="text-[11px] text-muted hover:text-accent">
                        · {joueurNom(b.joueurId)}
                      </Link>
                    )}
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">
                    Du {b.dateDebut ?? "—"}
                    {b.retourEstime ? ` · Retour ${b.retourEstime}` : ""}
                  </div>
                  {b.details && (
                    <div className="text-[11px] text-faint mt-1 italic">
                      « {b.details} »
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => openEdit(b)} aria-label="Modifier la blessure" title="Modifier"
                    className="btn text-[10px] flex items-center gap-1">
                    <Pencil size={10}/>
                  </button>
                  <button onClick={() => confirmDelete(b.id)} aria-label="Supprimer la blessure" title="Supprimer"
                    disabled={deleting === b.id}
                    className="btn text-[10px] text-danger flex items-center gap-1">
                    <Trash2 size={10}/>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <BlessureModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={reload}
        blessure={editing}
        joueurs={joueurs}
        joueurId={joueurId}
      />
    </section>
  );
}
