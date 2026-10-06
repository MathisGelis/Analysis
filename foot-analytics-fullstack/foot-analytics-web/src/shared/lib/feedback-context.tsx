"use client";
// src/shared/lib/feedback-context.tsx
//
// Retours a l'utilisateur sans bloquer la page : notifications (toasts) et
// confirmations. Remplace alert() et confirm() du navigateur, qui figent tout
// l'ecran, ne suivent pas le theme et sont illisibles sur mobile.
//
//   const { notifier, confirmer } = useFeedback();
//   notifier.erreur("Suppression impossible");
//   if (!(await confirmer({ titre: "Supprimer ?", danger: true }))) return;

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Info, X } from "lucide-react";

import { Modal } from "@/shared/ui/Modal";

type Ton = "succes" | "erreur" | "info";
interface Toast { id: number; ton: Ton; message: string }

export interface OptionsConfirmation {
  titre: string;
  message?: string;
  libelleConfirmer?: string;
  /** Action destructive : bouton rouge. */
  danger?: boolean;
}

interface Feedback {
  notifier: {
    succes: (message: string) => void;
    erreur: (message: string) => void;
    info: (message: string) => void;
  };
  confirmer: (options: OptionsConfirmation) => Promise<boolean>;
}

const Ctx = createContext<Feedback | null>(null);

// Duree d'affichage : une erreur reste plus longtemps, il faut le temps de la lire.
const DUREE_MS: Record<Ton, number> = { succes: 3500, info: 4500, erreur: 8000 };

export function FeedbackProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmation, setConfirmation] = useState<(OptionsConfirmation & { resoudre: (ok: boolean) => void }) | null>(null);
  const compteur = useRef(0);

  const retirer = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const ajouter = useCallback((ton: Ton, message: string) => {
    const id = ++compteur.current;
    setToasts((t) => [...t.slice(-3), { id, ton, message }]);      // 4 notifications au plus
    setTimeout(() => retirer(id), DUREE_MS[ton]);
  }, [retirer]);

  const valeur = useMemo<Feedback>(() => ({
    notifier: {
      succes: (m) => ajouter("succes", m),
      erreur: (m) => ajouter("erreur", m),
      info: (m) => ajouter("info", m),
    },
    confirmer: (options) => new Promise<boolean>((resoudre) => setConfirmation({ ...options, resoudre })),
  }), [ajouter]);

  const repondre = (ok: boolean) => { confirmation?.resoudre(ok); setConfirmation(null); };

  return (
    <Ctx.Provider value={valeur}>
      {children}

      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-80 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:items-end"
        aria-live="polite">
        {toasts.map((t) => <Notification key={t.id} toast={t} onFermer={() => retirer(t.id)} />)}
      </div>

      <Modal open={!!confirmation} onClose={() => repondre(false)} maxWidth="max-w-md">
        {confirmation && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${confirmation.danger ? "bg-danger/12 text-danger" : "bg-accent/12 text-accent"}`}>
                <AlertTriangle size={18} />
              </span>
              <div>
                <h2 className="font-display text-lg font-bold text-ink">{confirmation.titre}</h2>
                {confirmation.message && <p className="mt-1 text-sm leading-relaxed text-muted">{confirmation.message}</p>}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn" onClick={() => repondre(false)} autoFocus>Annuler</button>
              <button
                className={`btn ${confirmation.danger ? "border-transparent! !bg-danger text-[rgb(var(--bg))]!" : "btn-accent"}`}
                onClick={() => repondre(true)}
              >
                {confirmation.libelleConfirmer ?? (confirmation.danger ? "Supprimer" : "Confirmer")}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </Ctx.Provider>
  );
}

function Notification({ toast, onFermer }: { toast: Toast; onFermer: () => void }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const r = requestAnimationFrame(() => setVisible(true)); return () => cancelAnimationFrame(r); }, []);
  const style = toast.ton === "erreur"
    ? { Icone: AlertTriangle, classe: "text-danger bg-danger/12" }
    : toast.ton === "succes"
      ? { Icone: Check, classe: "text-win bg-win/12" }
      : { Icone: Info, classe: "text-accent bg-accent/12" };
  return (
    <div
      role={toast.ton === "erreur" ? "alert" : "status"}
      className={`pointer-events-auto glass panel-pop flex w-full max-w-sm items-start gap-3 !rounded-2xl p-3.5 transition-all duration-300
        ${visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"}`}
    >
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${style.classe}`}><style.Icone size={16} /></span>
      <p className="flex-1 pt-1 text-sm leading-snug text-ink">{toast.message}</p>
      <button onClick={onFermer} className="btn btn-ghost !p-1.5" aria-label="Fermer la notification"><X size={14} /></button>
    </div>
  );
}

export function useFeedback(): Feedback {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useFeedback doit etre utilise dans <FeedbackProvider>");
  return ctx;
}
