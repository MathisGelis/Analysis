// src/features/fmi/components/ImportPage.tsx
"use client";

// Import des feuilles de match FFF (FMI).
// Deux facons de choisir : des fichiers (glisse-depose ou selection) ou un dossier entier. Dans les deux cas les feuilles
// partent UNE PAR UNE (POST /api/fmi/import?recompute=false, le backend execute le parseur Python parse_fmi.py), puis
// effectifs et classement sont reconstruits une fois, en tache de fond suivie jusqu'a la fin. Un seul envoi de tout le
// dossier, ou une reconstruction attendue d'une traite, depasserait les 2 minutes du relais Vercel -> API (502).

import { useRef, useState } from "react";
import Link from "next/link";
import {
  Check, CloudUpload, File as FileIcon, FilesIcon, FileText, FolderUp,
  RefreshCw, X,
} from "lucide-react";

import { api } from "@/shared/lib/api";

type Status = "queued" | "parsing" | "ok" | "error";
interface UploadItem {
  name: string;
  size: number;
  status: Status;
  matchId?: string;
  resume?: { score: string; titulaires: number; evenements: number };
  reimport?: boolean;
  error?: string;
  /** Raison de l'echec cote backend (parse_impossible | fmi_invalide | erreur_interne). */
  code?: string;
  /** Points d'attention : import reussi mais donnees partielles. */
  avertissements?: string[];
}

const LIBELLE_ECHEC: Record<string, string> = {
  parse_impossible: "PDF illisible",
  fmi_invalide: "FMI invalide",
  erreur_interne: "Erreur d'import",
};

export default function ImportPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [derive, setDerive] = useState<string | null>(null);
  const [progression, setProgression] = useState<string | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files));
  }
  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(Array.from(e.target.files));
  }

  // Import un par un (sans recalcul a chaque fichier), puis une seule reconstruction.
  async function handleFiles(files: File[]) {
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return;
    setBusy(true);
    setDerive(null);

    // place les fichiers en file d'attente
    setItems((cur) => [
      ...cur,
      ...pdfs.map((f) => ({ name: f.name, size: f.size, status: "parsing" as Status })),
    ]);

    let nouveaux = 0, misAJour = 0, echecs = 0;
    for (const [n, file] of pdfs.entries()) {
      setProgression(`Import ${n + 1}/${pdfs.length}…`);
      try {
        const res = await api.importFmi(file, false); // pas de recalcul a chaque fichier
        if (res.reimport) misAJour++; else nouveaux++;
        setItems((cur) =>
          cur.map((c) =>
            c.name === file.name && c.status === "parsing"
              ? {
                  ...c, status: "ok", matchId: res.matchId, resume: res.resume,
                  reimport: res.reimport, avertissements: res.avertissements,
                }
              : c,
          ),
        );
      } catch (err) {
        echecs++;
        setItems((cur) =>
          cur.map((c) =>
            c.name === file.name && c.status === "parsing"
              ? { ...c, status: "error", error: (err as Error).message }
              : c,
          ),
        );
      }
    }

    // reconstruction unique des effectifs + classement
    const bilan = `${pdfs.length} feuille(s) : ${nouveaux} nouvelle(s), ${misAJour} mise(s) a jour, ${echecs} echec(s).`;
    setProgression("Reconstruction des effectifs et du classement…");
    try {
      const d = await api.rebuildDerivation();
      setDerive(`${bilan} Effectifs et classement reconstruits (${d.joueurs} joueurs, ${d.classement} equipes).`);
    } catch (e) {
      setDerive(`${bilan} Reconstruction effectifs/classement : ${(e as Error).message}. Relance "Recalculer effectifs + classement".`);
    }
    setProgression(null);
    setBusy(false);
  }

  // Dossier complet : les memes envois un par un.
  async function onPickFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    await handleFiles(files);
    if (folderInput.current) folderInput.current.value = "";
  }

  async function rebuildNow() {
    setBusy(true);
    setProgression("Reconstruction des effectifs et du classement…");
    try {
      const d = await api.rebuildDerivation();
      setDerive(`Reconstruit : ${d.joueurs} joueurs, ${d.classement} equipes.`);
    } catch (e) {
      setDerive("Reconstruction impossible : " + (e as Error).message);
    }
    setProgression(null);
    setBusy(false);
  }

  return (
    <div className="space-y-6 fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="h-section">Feuilles de match FFF</div>
          <h1 className="font-display text-2xl font-bold text-ink">Import FMI</h1>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn text-xs" onClick={rebuildNow} disabled={busy}>
            <RefreshCw size={12} /> Recalculer effectifs + classement
          </button>
        </div>
      </header>

      {/* Zone d'upload : fichiers OU dossier */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fichiers */}
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={onDrop}
          className="panel p-8 border-dashed border-2 border-line hover:border-accent/60 transition text-center"
        >
          <CloudUpload size={32} className="text-accent mx-auto mb-2" strokeWidth={1.4} />
          <div className="font-display font-bold text-ink">Fichiers PDF</div>
          <p className="text-xs text-muted mt-1 mb-3">
            Glissez-deposez, ou selectionnez une ou plusieurs feuilles
          </p>
          <label className="btn btn-primary cursor-pointer">
            <FileIcon size={14} /> Choisir des fichiers
            <input type="file" accept=".pdf" multiple onChange={onPickFiles} className="hidden" disabled={busy} />
          </label>
        </div>

        {/* Dossier */}
        <div className="panel p-8 border-dashed border-2 border-line hover:border-sky/60 transition text-center">
          <FolderUp size={32} className="text-sky mx-auto mb-2" strokeWidth={1.4} />
          <div className="font-display font-bold text-ink">Dossier complet</div>
          <p className="text-xs text-muted mt-1 mb-3">
            Selectionnez le dossier de la saison : tous les .pdf seront importes
          </p>
          <label className="btn cursor-pointer">
            <FilesIcon size={14} /> Choisir un dossier
            {/* webkitdirectory : selection d'un repertoire entier */}
            <input
              ref={folderInput}
              type="file"
              accept=".pdf"
              multiple
              onChange={onPickFolder}
              className="hidden"
              disabled={busy}
              {...({ webkitdirectory: "", directory: "" } as any)}
            />
          </label>
        </div>
      </div>

      {progression && (
        <p className="panel-inset flex items-center gap-2 p-3 text-sm text-ink" role="status" data-testid="import-progression">
          <RefreshCw size={14} className="animate-spin text-accent" aria-hidden /> {progression}
        </p>
      )}

      {derive && (
        <div className="panel-inset p-3 border-l-2 border-accent text-sm text-ink">
          {derive}
        </div>
      )}

      {/* Liste fichiers */}
      <section className="panel p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="h-section">Fichiers traites</div>
          <span className="text-xs text-muted">
            {items.filter((i) => i.status === "ok").length}/{items.length} importes
          </span>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted py-6 text-center">
            Aucun import pour l'instant. Choisissez des fichiers ou un dossier ci-dessus.
          </p>
        ) : (
          <ul className="space-y-2 max-h-[480px] overflow-auto">
            {items.map((it, i) => (
              <li key={i} className="panel-inset p-3 flex items-center gap-3">
                <FileText size={18} className="text-faint shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-ink truncate">{it.name}</div>
                  <div className="text-[11px] text-muted">
                    {(it.size / 1024).toFixed(1)} ko
                    {it.resume && (
                      <> · score {it.resume.score} · {it.resume.titulaires} titulaires · {it.resume.evenements} evts</>
                    )}
                    {it.error && (
                      <span className="text-danger">
                        {" · "}{it.code && LIBELLE_ECHEC[it.code] ? `${LIBELLE_ECHEC[it.code]} : ` : ""}{it.error}
                      </span>
                    )}
                  </div>
                  {it.avertissements && it.avertissements.length > 0 && (
                    <ul className="mt-1 text-[11px] text-amber list-disc pl-4">
                      {it.avertissements.map((a, k) => <li key={k}>{a}</li>)}
                    </ul>
                  )}
                </div>
                {it.status === "parsing" && (
                  <span className="badge badge-sky">
                    <span className="w-2 h-2 rounded-full bg-sky animate-pulse" /> Traitement
                  </span>
                )}
                {it.status === "ok" && (
                  <>
                    <span className="badge badge-accent">
                      <Check size={10} /> {it.reimport ? "Mis a jour" : "Importe"}
                    </span>
                    {it.matchId && (
                      <Link href={`/matchs/${it.matchId}`} className="btn text-xs">Voir</Link>
                    )}
                  </>
                )}
                {it.status === "error" && (
                  <span className="badge badge-danger"><X size={10} /> Echec</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
