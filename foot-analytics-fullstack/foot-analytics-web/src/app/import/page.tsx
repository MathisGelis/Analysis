// src/app/import/page.tsx
"use client";

// Import des feuilles de match FFF (FMI).
// Deux modes :
//   - Fichiers : glisse-depose ou selection de PDF (import un par un, avec
//     reconstruction effectifs/classement a la fin du lot).
//   - Dossier : selection d'un repertoire complet (tous les .pdf sont envoyes
//     au backend, qui importe puis recalcule effectifs + classement une fois).
// Le PDF est traite par le backend (POST /api/fmi/import[-batch]) qui execute
// le parseur Python parse_fmi.py.

import { useRef, useState } from "react";
import Link from "next/link";
import { api } from "@/lib/api";
import {
  Check, CloudUpload, File as FileIcon, FilesIcon, FileText, FolderUp,
  RefreshCw, X,
} from "lucide-react";

type Status = "queued" | "parsing" | "ok" | "error";
interface UploadItem {
  name: string;
  size: number;
  status: Status;
  matchId?: string;
  resume?: { score: string; titulaires: number; evenements: number };
  reimport?: boolean;
  error?: string;
}

export default function ImportPage() {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [derive, setDerive] = useState<string | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    handleFiles(Array.from(e.dataTransfer.files));
  }
  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files) handleFiles(Array.from(e.target.files));
  }

  // Import "fichiers" : un par un (recompute=false), puis une reconstruction.
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

    for (const file of pdfs) {
      try {
        const res = await api.importFmi(file, false); // pas de recalcul a chaque fichier
        setItems((cur) =>
          cur.map((c) =>
            c.name === file.name && c.status === "parsing"
              ? { ...c, status: "ok", matchId: res.matchId, resume: res.resume, reimport: res.reimport }
              : c,
          ),
        );
      } catch (err) {
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
    try {
      const d = await api.rebuildDerivation();
      setDerive(`Effectifs et classement reconstruits (${d.joueurs} joueurs, ${d.classement} equipes).`);
    } catch {
      setDerive("Import termine. (Reconstruction effectifs/classement indisponible : backend ?)");
    }
    setBusy(false);
  }

  // Import "dossier" : tout le repertoire en une requete (import-batch).
  async function onPickFolder(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    const pdfs = files.filter((f) => f.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) return;
    setBusy(true);
    setDerive(null);
    setItems((cur) => [
      ...cur,
      ...pdfs.map((f) => ({ name: f.name, size: f.size, status: "parsing" as Status })),
    ]);
    try {
      const res = await api.importFmiBatch(pdfs);
      const byName = new Map<string, any>(res.resultats.map((r: any) => [r.fichier, r]));
      setItems((cur) =>
        cur.map((c) => {
          if (c.status !== "parsing") return c;
          const r = byName.get(c.name);
          if (!r) return c;
          return r.ok
            ? { ...c, status: "ok", matchId: r.matchId, resume: r.resume, reimport: r.reimport }
            : { ...c, status: "error", error: r.erreur };
        }),
      );
      setDerive(`Dossier importe : ${res.importes}/${res.total} feuilles. ` +
        `Effectifs (${res.derive.joueurs} joueurs) et classement (${res.derive.classement} equipes) reconstruits.`);
    } catch (err) {
      setItems((cur) =>
        cur.map((c) => (c.status === "parsing" ? { ...c, status: "error", error: (err as Error).message } : c)));
    }
    setBusy(false);
    if (folderInput.current) folderInput.current.value = "";
  }

  async function rebuildNow() {
    setBusy(true);
    try {
      const d = await api.rebuildDerivation();
      setDerive(`Reconstruit : ${d.joueurs} joueurs, ${d.classement} equipes.`);
    } catch (e) {
      setDerive("Reconstruction impossible : " + (e as Error).message);
    }
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
          <span className="badge badge-turf">Parseur natif · pdfplumber</span>
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
          className="panel p-8 border-dashed border-2 border-line hover:border-turf/60 transition text-center"
        >
          <CloudUpload size={32} className="text-turf mx-auto mb-2" strokeWidth={1.4} />
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

      {derive && (
        <div className="panel-inset p-3 border-l-2 border-turf text-sm text-ink">
          {derive}
        </div>
      )}

      {/* Pipeline */}
      <section className="panel p-5">
        <div className="h-section mb-3">Pipeline d'import</div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Step n="1" titre="Upload" desc="PDF (fichiers) ou dossier entier de la saison." />
          <Step n="2" titre="Parsing" desc="Le backend execute parse_fmi.py (pdfplumber)." />
          <Step n="3" titre="Match" desc="Creation match + compositions + evenements." />
          <Step n="4" titre="Effectifs" desc="Les joueurs de tous les clubs sont derives des compos." />
          <Step n="5" titre="Classement" desc="Recalcule a partir de tous les scores." />
        </div>
      </section>

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
                    {it.error && <span className="text-danger"> · {it.error}</span>}
                  </div>
                </div>
                {it.status === "parsing" && (
                  <span className="badge badge-sky">
                    <span className="w-2 h-2 rounded-full bg-sky animate-pulse" /> Traitement
                  </span>
                )}
                {it.status === "ok" && (
                  <>
                    <span className="badge badge-turf">
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

      <section className="panel-inset p-4 text-xs text-muted leading-relaxed">
        <strong className="text-ink">Cote backend :</strong> l'import cree le match avec
        ses compositions et evenements, puis <strong className="text-ink">derive
        l'effectif de tous les clubs</strong> a partir des feuilles et
        <strong className="text-ink"> recalcule le classement</strong>. Une feuille
        deja presente (meme numero FMI) est mise a jour, pas dupliquee.
      </section>
    </div>
  );
}

function Step({ n, titre, desc }: { n: string; titre: string; desc: string }) {
  return (
    <div className="panel-inset p-4">
      <div className="font-display text-2xl font-black text-turf">{n}</div>
      <div className="font-display font-bold text-ink mt-1">{titre}</div>
      <p className="text-[11px] text-muted mt-1 leading-relaxed">{desc}</p>
    </div>
  );
}
