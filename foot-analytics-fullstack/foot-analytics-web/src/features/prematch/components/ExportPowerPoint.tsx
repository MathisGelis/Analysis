"use client";
// src/features/prematch/components/ExportPowerPoint.tsx
//
// "Exporter en PowerPoint" : le rapport d'avant-match au format de la presentation du staff. L'utilisateur choisit les
// pages a produire (par exemple sans la page convocation) ; les informations que le rapport ne connait pas (heure de
// convocation, surface du terrain, style de jeu...) restent des champs vides a completer dans PowerPoint.

import { useState } from "react";
import { Check, Download, Presentation } from "lucide-react";

import { api, messageApi } from "@/shared/lib/api";
import { useFeedback } from "@/shared/lib/feedback-context";
import { Modal } from "@/shared/ui/Modal";

import { basculerPage, pagesChoisies, pagesDuGroupe, resumeChoix, toutesLesPages, type PageExport } from "../lib/export-pptx";

export function ExportPowerPoint({
  equipeId, adversaireId, matchId, pages,
}: { equipeId: string; adversaireId: string; matchId: string | null; pages: PageExport[] }) {
  const { notifier } = useFeedback();
  const [ouvert, setOuvert] = useState(false);
  const [choix, setChoix] = useState(() => toutesLesPages(pages));
  const [occupe, setOccupe] = useState(false);

  if (pages.length === 0) return null;
  const voulues = pagesChoisies(pages, choix);

  async function telecharger() {
    setOccupe(true);
    try {
      const { fichier, nom } = await api.exporterPrematch(equipeId, adversaireId, matchId, voulues);
      const url = URL.createObjectURL(fichier);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nom;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
      notifier.succes(`${nom} : ${resumeChoix(pages, choix)}. Completez les champs vides dans PowerPoint.`);
      setOuvert(false);
    } catch (e) {
      notifier.erreur(`Export impossible : ${messageApi(e)}`);
    } finally {
      setOccupe(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} className="btn text-sm print:hidden">
        <Presentation size={14} aria-hidden /> Exporter en PowerPoint
      </button>
      <Modal open={ouvert} onClose={() => !occupe && setOuvert(false)} maxWidth="max-w-xl">
        <h2 className="font-display text-lg font-bold text-ink">Exporter en PowerPoint</h2>
        <p className="mt-1 text-sm text-muted">
          Choisissez les pages du rapport. Les pages du modele du staff gardent sa mise en page ; les pages d'analyse en
          reprennent le style pour les statistiques que le modele n'a pas la place d'accueillir. Ce que le rapport ne connait
          pas (convocation, terrain, style de jeu, ambiance...) reste vide : vous le completez dans PowerPoint.
        </p>

        <div className="mt-4 flex items-center justify-between gap-3 text-xs">
          <span className="text-muted" aria-live="polite">{resumeChoix(pages, choix)}</span>
          <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
            <button type="button" className="text-accent underline underline-offset-2" onClick={() => setChoix(toutesLesPages(pages))}>Tout cocher</button>
            <button type="button" className="text-accent underline underline-offset-2" onClick={() => setChoix(pagesDuGroupe(pages, "modele"))}>Modele seulement</button>
            <button type="button" className="text-accent underline underline-offset-2" onClick={() => setChoix(new Set())}>Tout decocher</button>
          </span>
        </div>

        <ul className="mt-2 max-h-[55vh] space-y-1.5 overflow-y-auto pr-1">
          {pages.map((p, i) => {
            const on = choix.has(p.id);
            return (
              <li key={p.id}>
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition-colors ${
                  on ? "border-accent/40 bg-accent/10" : "border-line hover:bg-line/40"}`}>
                  <input type="checkbox" className="mt-1" checked={on} onChange={() => setChoix((c) => basculerPage(c, p.id))} />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2 font-semibold text-ink">
                      <span className="font-mono text-xs text-faint">{i + 1}</span>
                      <span>{p.titre}</span>
                      {p.groupe === "analyse" && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Analyse</span>}
                    </span>
                    <span className="block text-xs text-muted">{p.contenu}</span>
                  </span>
                  {on && <Check size={14} className="mt-1 shrink-0 text-accent" aria-hidden />}
                </label>
              </li>
            );
          })}
        </ul>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button type="button" className="btn text-sm" onClick={() => setOuvert(false)} disabled={occupe}>Annuler</button>
          <button type="button" className="btn btn-primary text-sm" onClick={telecharger} disabled={occupe || voulues.length === 0}>
            <Download size={14} aria-hidden /> {occupe ? "Generation..." : `Telecharger (${resumeChoix(pages, choix)})`}
          </button>
        </div>
      </Modal>
    </>
  );
}
