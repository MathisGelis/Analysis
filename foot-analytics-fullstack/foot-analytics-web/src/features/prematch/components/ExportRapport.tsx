"use client";
// src/features/prematch/components/ExportRapport.tsx
//
// Le bouton unique "Exporter" du rapport d'avant-match. Le PDF est tire du PowerPoint par le serveur : les deux formats
// affichent exactement les memes pages, avec les memes informations. L'apercu est ce PDF, regenere a chaque changement
// de pages ; le telechargement donne le fichier du format choisi (PDF ou PowerPoint). Les informations que le rapport
// ne connait pas (convocation, terrain, style de jeu...) restent des champs vides a completer dans PowerPoint.

import { useEffect, useState } from "react";
import { Check, Download, Loader2, Upload } from "lucide-react";

import { api, messageApi } from "@/shared/lib/api";
import { useFeedback } from "@/shared/lib/feedback-context";
import { Modal } from "@/shared/ui/Modal";

import { basculerPage, pagesChoisies, pagesDuGroupe, resumeChoix, toutesLesPages, type PageExport } from "../lib/export-pptx";

type Format = "pdf" | "pptx";
const LIBELLE: Record<Format, string> = { pdf: "PDF", pptx: "PowerPoint" };

export function ExportRapport({
  equipeId, adversaireId, matchId, pages,
}: { equipeId: string; adversaireId: string; matchId: string | null; pages: PageExport[] }) {
  const { notifier } = useFeedback();
  const [ouvert, setOuvert] = useState(false);
  const [format, setFormat] = useState<Format>("pdf");
  const [choix, setChoix] = useState(() => toutesLesPages(pages));
  const [occupe, setOccupe] = useState(false);
  const [apercu, setApercu] = useState<{ url: string; erreur?: undefined } | { url?: undefined; erreur: string } | null>(null);
  const voulues = pagesChoisies(pages, choix);
  const cle = voulues.join(",");

  // Apercu : le PDF des pages cochees. Demande apres une courte pause pour ne pas generer a chaque case cochee.
  useEffect(() => {
    if (!ouvert || voulues.length === 0) return;
    let actif = true;
    let url: string | null = null;
    setApercu(null);
    const minuteur = setTimeout(async () => {
      try {
        const { fichier } = await api.exporterPrematch(equipeId, adversaireId, matchId, voulues, "pdf", true);
        if (!actif) return;
        url = URL.createObjectURL(fichier);
        setApercu({ url });
      } catch (e) {
        if (actif) setApercu({ erreur: messageApi(e) });
      }
    }, 500);
    return () => { actif = false; clearTimeout(minuteur); if (url) URL.revokeObjectURL(url); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ouvert, cle, equipeId, adversaireId, matchId]);

  if (pages.length === 0) return null;

  async function telecharger() {
    setOccupe(true);
    try {
      const { fichier, nom } = await api.exporterPrematch(equipeId, adversaireId, matchId, voulues, format);
      const url = URL.createObjectURL(fichier);
      const lien = document.createElement("a");
      lien.href = url;
      lien.download = nom;
      document.body.appendChild(lien);
      lien.click();
      lien.remove();
      URL.revokeObjectURL(url);
      notifier.succes(`${nom} : ${resumeChoix(pages, choix)}.`);
      setOuvert(false);
    } catch (e) {
      notifier.erreur(`Export impossible : ${messageApi(e)}`);
    } finally {
      setOccupe(false);
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} className="btn btn-primary text-sm print:hidden">
        <Upload size={14} aria-hidden /> Exporter
      </button>
      <Modal open={ouvert} onClose={() => !occupe && setOuvert(false)} maxWidth="max-w-5xl">
        <h2 className="font-display text-lg font-bold text-ink">Exporter le rapport</h2>
        <p className="mt-1 text-sm text-muted">
          Le PDF et le PowerPoint sont identiques : l'aperçu montre exactement ce que vous obtiendrez dans les deux formats.
        </p>

        <div className="mt-4 grid gap-5 md:grid-cols-[19rem_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Format</div>
            <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label="Format">
              {(["pdf", "pptx"] as const).map((f) => (
                <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}
                  className={`h-11 rounded-xl border text-sm font-semibold transition-colors ${
                    format === f ? "border-accent bg-accent/10 text-accent" : "border-line bg-surface-2 text-ink hover:bg-line/40"}`}>
                  {LIBELLE[f]}
                </button>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3 text-xs">
              <span className="font-semibold uppercase tracking-wide text-muted" aria-live="polite">Pages · {resumeChoix(pages, choix)}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <button type="button" className="text-accent underline underline-offset-2" onClick={() => setChoix(toutesLesPages(pages))}>Tout cocher</button>
              <button type="button" className="text-accent underline underline-offset-2" onClick={() => setChoix(pagesDuGroupe(pages, "modele"))}>Modèle seulement</button>
              <button type="button" className="text-accent underline underline-offset-2" onClick={() => setChoix(new Set())}>Tout décocher</button>
            </div>
            <ul className="mt-2 max-h-[48vh] space-y-1.5 overflow-y-auto pr-1">
              {pages.map((p, i) => {
                const on = choix.has(p.id);
                return (
                  <li key={p.id}>
                    <label className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-sm transition-colors ${
                      on ? "border-accent/40 bg-accent/10" : "border-line hover:bg-line/40"}`}>
                      <input type="checkbox" checked={on} onChange={() => setChoix((c) => basculerPage(c, p.id))} />
                      <span className="font-mono text-xs text-faint">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate font-semibold text-ink">{p.titre}</span>
                      {p.groupe === "analyse" && <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent">Analyse</span>}
                      {on && <Check size={14} className="shrink-0 text-accent" aria-hidden />}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">Aperçu</div>
            <div className="mt-2 h-[58vh] overflow-hidden rounded-xl border border-line bg-surface-2">
              {voulues.length === 0 ? (
                <p className="grid h-full place-items-center p-6 text-center text-sm text-muted">Cochez au moins une page.</p>
              ) : apercu?.url ? (
                <iframe title="Aperçu de l'export" src={apercu.url} className="h-full w-full" />
              ) : apercu?.erreur ? (
                <p role="alert" className="grid h-full place-items-center p-6 text-center text-sm text-danger">Aperçu indisponible : {apercu.erreur}</p>
              ) : (
                <p role="status" className="grid h-full place-items-center p-6 text-center text-sm text-muted">
                  <span className="inline-flex items-center gap-2"><Loader2 size={16} className="animate-spin" aria-hidden /> Génération de l'aperçu...</span>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
          <button type="button" className="btn text-sm" onClick={() => setOuvert(false)} disabled={occupe}>Annuler</button>
          <button type="button" className="btn btn-primary text-sm" onClick={telecharger} disabled={occupe || voulues.length === 0}>
            <Download size={14} aria-hidden /> {occupe ? "Génération..." : `Télécharger le ${LIBELLE[format]}`}
          </button>
        </div>
      </Modal>
    </>
  );
}
