"use client";
// src/features/calendrier/components/CalendrierFffPanneau.tsx
//
// Calendrier FFF de l'equipe : on colle l'adresse du fichier .ics que myFFF propose pour « ajouter les matchs au calendrier »
// (synchronisation quotidienne automatique, ou a la demande), ou on depose le fichier a la main : meme traitement. Les matchs a
// venir sont crees, ceux que la ligue decale sont mis a jour, ceux qui disparaissent sont signales (jamais supprimes).

import { useRef, useState } from "react";
import { CalendarSync, Check, FileUp, RefreshCw, TriangleAlert, X } from "lucide-react";

import { api, messageApi } from "@/shared/lib/api";
import { Modal } from "@/shared/ui/Modal";
import {
  adressePlausible, bilanFff, derniereSynchro, libelleLigne, notesFff, type RapportFff,
} from "@/features/calendrier/lib/calendrier-fff";

interface Props {
  equipe: { id: string; nom: string; calendrierUrl?: string | null; calendrierSynchroLe?: string | null };
  onClose: () => void;
  /** Appele apres une synchronisation : la page recharge matchs et equipes. */
  onSynchronise: () => void | Promise<void>;
}

export function CalendrierFffPanneau({ equipe, onClose, onSynchronise }: Props) {
  const [adresse, setAdresse] = useState(equipe.calendrierUrl ?? "");
  const [enregistree, setEnregistree] = useState<string | null>(equipe.calendrierUrl ?? null);
  const [synchroLe, setSynchroLe] = useState<string | null>(equipe.calendrierSynchroLe ?? null);
  const [occupe, setOccupe] = useState<null | "adresse" | "fichier" | "retrait">(null);
  const [erreur, setErreur] = useState<string | null>(null);
  const [rapport, setRapport] = useState<RapportFff | null>(null);
  const fichier = useRef<HTMLInputElement>(null);

  async function lancer<T>(quoi: "adresse" | "fichier" | "retrait", travail: () => Promise<T>): Promise<T | null> {
    setOccupe(quoi);
    setErreur(null);
    try {
      return await travail();
    } catch (e) {
      setErreur(messageApi(e, "Synchronisation impossible"));
      return null;
    } finally {
      setOccupe(null);
    }
  }

  async function apresSynchro(r: RapportFff | null) {
    if (!r) return;
    setRapport(r);
    setSynchroLe(new Date().toISOString());
    await onSynchronise();
  }

  const enregistrer = () => lancer("adresse", async () => {
    const sauvee = await api.definirCalendrierFff(equipe.id, adresse.trim());
    setEnregistree(sauvee.calendrierUrl);
    setAdresse(sauvee.calendrierUrl ?? "");
    await apresSynchro(await api.synchroniserCalendrierFff(equipe.id));
  });

  const actualiser = () => lancer("adresse", async () => apresSynchro(await api.synchroniserCalendrierFff(equipe.id)));

  const retirer = () => lancer("retrait", async () => {
    await api.definirCalendrierFff(equipe.id, null);
    setEnregistree(null);
    setAdresse("");
    setRapport(null);
    await onSynchronise();
  });

  const deposer = (f: File | undefined) => {
    if (!f) return;
    void lancer("fichier", async () => apresSynchro(await api.importerCalendrierFff(equipe.id, f))).finally(() => {
      if (fichier.current) fichier.current.value = "";
    });
  };

  const changee = adresse.trim() !== (enregistree ?? "");

  return (
    <Modal open onClose={onClose} maxWidth="max-w-xl">
      <div className="flex items-center gap-3 pb-4 mb-5 border-b border-line">
        <div className="w-10 h-10 rounded-lg grid place-items-center shrink-0 bg-accent/15"><CalendarSync size={18} className="text-accent" /></div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display text-lg font-bold text-ink leading-tight">Calendrier FFF</h2>
          <p className="text-xs text-muted mt-0.5 truncate">{equipe.nom}</p>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-md grid place-items-center hover:bg-line/40 text-faint hover:text-ink transition" title="Fermer" aria-label="Fermer">
          <X size={15} />
        </button>
      </div>

      <div className="space-y-5">
        <section className="space-y-2">
          <label htmlFor="cal-fff-adresse" className="text-[10px] uppercase tracking-[0.18em] text-faint font-semibold">Adresse du calendrier de l'équipe</label>
          <input
            id="cal-fff-adresse" className="inp w-full font-mono text-xs" value={adresse} spellCheck={false} autoComplete="off"
            placeholder="media.fff.fr/calendars/2026/eq/6701_SEM_4.ics" data-testid="cal-fff-adresse"
            onChange={(e) => setAdresse(e.target.value)}
          />
          <p className="text-xs text-muted">
            Dans myFFF, le bouton qui ajoute les matchs de l'équipe à ton calendrier donne cette adresse (elle peut commencer par
            <code className="mx-1">webcal://</code>). Les matchs à venir sont ajoutés, et l'application se met à jour toute seule chaque jour.
          </p>
          {adresse.trim() && !adressePlausible(adresse) && (
            <p className="text-xs text-amber" role="status">Cette adresse ne ressemble pas à un calendrier d'équipe de la FFF (media.fff.fr/calendars/.../eq/....ics).</p>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <button className="btn btn-accent" onClick={enregistrer} disabled={!!occupe || !adresse.trim() || !changee} data-testid="cal-fff-enregistrer">
              <Check size={14} /> {occupe === "adresse" && changee ? "Synchronisation..." : "Enregistrer et synchroniser"}
            </button>
            {enregistree && (
              <>
                <button className="btn" onClick={actualiser} disabled={!!occupe} data-testid="cal-fff-actualiser">
                  <RefreshCw size={14} className={occupe === "adresse" && !changee ? "animate-spin" : ""} /> Actualiser
                </button>
                <button className="btn btn-ghost text-xs" onClick={retirer} disabled={!!occupe}>Retirer l'adresse</button>
              </>
            )}
          </div>
          {enregistree && <p className="text-[11px] text-faint" data-testid="cal-fff-synchro">Dernière synchronisation : {derniereSynchro(synchroLe)}</p>}
        </section>

        <section className="space-y-2 border-t border-line pt-5">
          <div className="text-[10px] uppercase tracking-[0.18em] text-faint font-semibold">Ou déposer le fichier .ics</div>
          <p className="text-xs text-muted">Même traitement, sans que le serveur aille chercher quoi que ce soit : utile si l'adresse ne marche pas.</p>
          <label className={`btn cursor-pointer ${occupe ? "opacity-60 pointer-events-none" : ""}`}>
            <FileUp size={14} /> {occupe === "fichier" ? "Lecture..." : "Choisir un fichier"}
            <input ref={fichier} type="file" accept=".ics,text/calendar" className="hidden" disabled={!!occupe} data-testid="cal-fff-fichier"
              onChange={(e) => deposer(e.target.files?.[0])} />
          </label>
        </section>

        {erreur && <p role="alert" className="panel-inset border-l-2 border-danger p-3 text-sm text-danger" data-testid="cal-fff-erreur">{erreur}</p>}

        {rapport && <RapportAffiche rapport={rapport} />}
      </div>
    </Modal>
  );
}

function Liste({ titre, lignes, ton }: { titre: string; lignes: string[]; ton?: "amber" }) {
  if (!lignes.length) return null;
  return (
    <div>
      <div className={`text-[11px] font-semibold ${ton === "amber" ? "text-amber" : "text-ink"}`}>{titre}</div>
      <ul className="mt-1 space-y-0.5 text-xs text-muted list-disc pl-4 max-h-40 overflow-auto">
        {lignes.map((l, i) => <li key={i}>{l}</li>)}
      </ul>
    </div>
  );
}

function RapportAffiche({ rapport }: { rapport: RapportFff }) {
  return (
    <section className="panel-inset p-4 space-y-3" data-testid="cal-fff-rapport" aria-live="polite">
      <p className="text-sm font-semibold text-ink" data-testid="cal-fff-bilan">{bilanFff(rapport)}</p>
      <Liste titre="Ajoutés" lignes={rapport.crees.map(libelleLigne)} />
      <Liste titre="Modifiés par la ligue" lignes={rapport.modifies.map((m) => `${libelleLigne(m)} : ${m.avant} -> ${m.apres}`)} />
      {rapport.disparus.length > 0 && (
        <div className="flex gap-2">
          <TriangleAlert size={14} className="text-amber shrink-0 mt-0.5" aria-hidden />
          <Liste ton="amber" titre="Ne figurent plus au calendrier FFF (reportés ? annulés ?) : à vérifier, rien n'est supprimé"
            lignes={rapport.disparus.map(libelleLigne)} />
        </div>
      )}
      <Liste titre="À savoir" lignes={[...notesFff(rapport), ...rapport.avertissements]} />
    </section>
  );
}
