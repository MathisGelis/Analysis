// src/components/DeleteMatchButton.tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api";
import { Trash2 } from "lucide-react";
import { useFeedback } from "@/lib/feedback-context";

export function DeleteMatchButton({
  matchId, label,
}: { matchId: string; label?: string }) {
  const { notifier, confirmer } = useFeedback();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function onClick(e: React.MouseEvent) {
    // Stop la propagation : ne pas declencher le <Link> parent eventuel.
    e.preventDefault();
    e.stopPropagation();
    if (!(await confirmer({
      titre: `Supprimer ce match${label ? ` (${label})` : ""} ?`,
      message: "Les compositions, evenements et liens arbitres seront aussi supprimes.",
      danger: true,
    }))) return;
    setBusy(true);
    try {
      await api.deleteMatch(matchId);
      await api.rebuildDerivation().catch(() => undefined);
      router.refresh();
    } catch (err) {
      notifier.erreur("Suppression impossible : " + (err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      className="btn text-xs"
      onClick={onClick}
      disabled={busy}
      title="Supprimer le match"
    >
      <Trash2 size={11}/>
    </button>
  );
}
