"use client";

// src/features/direct/components/InviterSaisisseur.tsx
//
// « Inviter un saisisseur » : le staff cree un lien a usage unique pour quelqu'un qui n'a pas de compte (un parent, un autre
// educateur). Le lien n'est montre qu'une fois : on le copie tout de suite. La liste dit qui a ouvert son lien et permet de couper l'acces.

import { useCallback, useEffect, useState } from "react";
import { Check, Copy, UserPlus } from "lucide-react";

import { api, messageApi } from "@/shared/lib/api";
import { Modal } from "@/shared/ui/Modal";

import type { InvitationVue } from "../lib/direct-types";

const DUREES: [number, string][] = [[3, "3 heures"], [12, "12 heures"], [24, "24 heures"], [48, "48 heures"]];
const ETAT: Record<InvitationVue["etat"], string> = { en_attente: "Lien pas encore ouvert", ouverte: "Connecté", expiree: "Expirée", revoquee: "Accès coupé" };

export function InviterSaisisseur({ matchId, disabled }: { matchId: string; disabled?: boolean }) {
  const [ouvert, setOuvert] = useState(false);
  const [liste, setListe] = useState<InvitationVue[]>([]);
  const [libelle, setLibelle] = useState("");
  const [duree, setDuree] = useState(12);
  const [chrono, setChrono] = useState(false);
  const [lien, setLien] = useState<string | null>(null);
  const [copie, setCopie] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [occupe, setOccupe] = useState(false);

  const charger = useCallback(async () => {
    try { setListe(await api.directInvitations(matchId)); } catch (e) { setErreur(messageApi(e, "Impossible de lire les invitations.")); }
  }, [matchId]);
  useEffect(() => { if (ouvert) void charger(); }, [ouvert, charger]);

  const creer = async () => {
    setOccupe(true); setErreur(null);
    try {
      const r = await api.directInviter(matchId, { libelle: libelle.trim(), peutChrono: chrono, dureeHeures: duree });
      setLien(`${window.location.origin}/saisie/${r.jeton}`);
      setLibelle(""); setChrono(false); setCopie(false);
      await charger();
    } catch (e) { setErreur(messageApi(e, "Impossible de créer l'invitation.")); }
    finally { setOccupe(false); }
  };
  const revoquer = async (id: string) => {
    try { await api.directRevoquer(matchId, id); await charger(); } catch (e) { setErreur(messageApi(e, "Impossible de couper l'accès.")); }
  };
  const copier = async () => {
    if (!lien) return;
    try { await navigator.clipboard.writeText(lien); setCopie(true); } catch { setErreur("Copie impossible : sélectionne le lien et copie-le à la main."); }
  };
  const fermer = () => { setOuvert(false); setLien(null); setErreur(null); };

  return (
    <>
      <button type="button" className="btn !h-11" disabled={disabled} onClick={() => setOuvert(true)}><UserPlus size={16} aria-hidden /> Inviter un saisisseur</button>
      {ouvert && (
        <Modal open onClose={fermer} maxWidth="max-w-md" titre="Inviter un saisisseur">
          <div className="space-y-4">
            <header>
              <h2 className="font-display text-lg font-bold text-ink">Inviter un saisisseur</h2>
              <p className="text-sm text-muted">Un lien à usage unique, sans compte : la personne saisit les événements de ce match, rien d&apos;autre dans l&apos;application.</p>
            </header>

            {lien ? (
              <div className="space-y-2 rounded-xl border border-accent bg-surface p-3" role="status">
                <p className="text-sm font-semibold text-ink">Lien créé : envoie-le maintenant.</p>
                <input readOnly value={lien} onFocus={(e) => e.currentTarget.select()} aria-label="Lien d'invitation" className="h-11 w-full rounded-xl border border-line bg-bg px-3 text-xs text-ink" />
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs text-muted">Il ne s&apos;ouvre que sur un seul appareil et ne sera plus jamais affiché.</p>
                  <button type="button" className="btn btn-primary shrink-0" onClick={() => void copier()}>{copie ? <><Check size={15} aria-hidden /> Copié</> : <><Copy size={15} aria-hidden /> Copier</>}</button>
                </div>
              </div>
            ) : (
              <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void creer(); }}>
                <label className="block text-sm font-semibold text-ink">Nom de la personne
                  <input value={libelle} onChange={(e) => setLibelle(e.target.value)} maxLength={60} required placeholder="Julie, maman de Léo…" className="mt-1 h-11 w-full rounded-xl border border-line bg-bg px-3 text-sm font-normal text-ink" />
                </label>
                <div role="group" aria-label="Durée de validité" className="space-y-1">
                  <span className="block text-sm font-semibold text-ink">Valable</span>
                  <div className="flex flex-wrap gap-2">
                    {DUREES.map(([h, l]) => (
                      <button key={h} type="button" aria-pressed={duree === h} onClick={() => setDuree(h)}
                        className={`btn !h-10 text-sm ${duree === h ? "!border-accent bg-accent/15 font-bold text-accent" : ""}`}>{l}</button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" checked={chrono} onChange={(e) => setChrono(e.target.checked)} className="h-5 w-5" /> Peut aussi piloter le chrono (coup d&apos;envoi, mi-temps, fin)
                </label>
                <button type="submit" className="btn btn-primary !h-11 w-full" disabled={occupe || !libelle.trim()}>Créer le lien</button>
              </form>
            )}

            {erreur && <p role="alert" className="text-sm text-danger">{erreur}</p>}

            <section aria-label="Invitations de ce match" className="space-y-1.5">
              <h3 className="text-sm font-semibold text-ink">Invitations de ce match</h3>
              {liste.length === 0 ? <p className="text-sm text-muted">Aucune pour l&apos;instant.</p> : (
                <ul className="space-y-1.5">
                  {liste.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-ink">{i.libelle}{i.peutChrono ? " · chrono" : ""}</span><span className="block text-xs text-muted">{ETAT[i.etat]}</span></span>
                      {(i.etat === "en_attente" || i.etat === "ouverte") && <button type="button" className="btn !h-9 text-xs" onClick={() => void revoquer(i.id)} aria-label={`Couper l'accès de ${i.libelle}`}>Couper l&apos;accès</button>}
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <div className="flex justify-end"><button type="button" className="btn" onClick={fermer}>Fermer</button></div>
          </div>
        </Modal>
      )}
    </>
  );
}
