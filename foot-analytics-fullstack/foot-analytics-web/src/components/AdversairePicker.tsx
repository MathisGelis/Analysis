"use client";
// src/components/AdversairePicker.tsx
//
// Choix de l'adversaire : un champ de recherche et, dessous, la liste des clubs (ma poule d'abord), avec leur ecusson.
// Un clic ou Entree choisit ; le club choisi s'affiche en carte avec un bouton "Changer". Un club absent de la
// liste se cree sur place (nom saisi), sauf s'il existe deja sous ce nom.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, Plus, Search, X } from "lucide-react";
import { ClubBadge } from "@/components/ClubBadge";
import { classerAdversaires, clubExistant, type ClubChoix } from "@/lib/adversaires";

interface Props {
  clubs: ClubChoix[];
  monClubId?: string | null;
  /** Ids des clubs de ma poule (proposes en premier). */
  suggeres?: Iterable<string>;
  valeur: ClubChoix | null;
  onChange: (club: ClubChoix | null) => void;
  /** Cree le club dont on donne le nom ; sans cette fonction, la creation n'est pas proposee. */
  onCreer?: (nom: string) => Promise<ClubChoix>;
}

export function AdversairePicker({ clubs, monClubId, suggeres, valeur, onChange, onCreer }: Props) {
  const idListe = useId();
  const [q, setQ] = useState("");
  const [actif, setActif] = useState(0);
  const [creation, setCreation] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const liste = useRef<HTMLDivElement>(null);

  const groupes = useMemo(
    () => classerAdversaires(clubs, { monClubId, suggeres, requete: q }),
    [clubs, monClubId, suggeres, q],
  );
  const aplati = useMemo(() => groupes.flatMap((g) => g.clubs), [groupes]);
  const nomSaisi = q.trim();
  const peutCreer = !!onCreer && nomSaisi.length >= 2 && !clubExistant(clubs, nomSaisi);

  useEffect(() => { setActif(0); }, [q]);
  useEffect(() => {
    liste.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`)?.scrollIntoView({ block: "nearest" });
  }, [actif]);

  function choisir(c: ClubChoix) { onChange(c); setQ(""); setErreur(null); }

  async function creer() {
    if (!onCreer || !peutCreer || creation) return;
    setCreation(true); setErreur(null);
    try { choisir(await onCreer(nomSaisi)); }
    catch (e) { setErreur((e as Error).message || "Creation impossible."); }
    finally { setCreation(false); }
  }

  function surTouche(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActif((i) => Math.min(aplati.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (aplati[actif]) choisir(aplati[actif]);
      else if (peutCreer) void creer();
    }
  }

  if (valeur) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-accent/40 bg-accent/[0.08] px-3 py-2.5" data-testid="adversaire-choisi">
        <ClubBadge clubId={valeur.id} size={34} />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-ink">{valeur.nom}</div>
          {valeur.ville && <div className="truncate text-xs text-muted">{valeur.ville}</div>}
        </div>
        <Check size={16} className="shrink-0 text-accent" aria-hidden />
        <button type="button" className="btn !px-3 !py-1.5 text-xs" onClick={() => onChange(null)}>Changer</button>
      </div>
    );
  }

  let indexGlobal = -1;
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
        <input
          value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={surTouche} autoFocus
          type="text" autoComplete="off" spellCheck={false}
          placeholder="Rechercher un club (nom ou ville)"
          aria-label="Rechercher l'adversaire" role="combobox" aria-expanded="true" aria-controls={idListe} aria-autocomplete="list"
          aria-activedescendant={aplati[actif] ? `${idListe}-${aplati[actif].id}` : undefined}
          className="inp !pl-9 !pr-9"
        />
        {q && (
          <button type="button" onClick={() => setQ("")} aria-label="Effacer la recherche"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-faint hover:text-ink"><X size={14} /></button>
        )}
      </div>

      <div ref={liste} id={idListe} role="listbox" aria-label="Clubs"
        className="max-h-56 overflow-y-auto rounded-xl border border-line bg-panel2/40 p-1.5">
        {groupes.length === 0 ? (
          <p className="px-3 py-5 text-center text-sm text-muted">
            {clubs.length === 0 ? "Aucun club en base." : `Aucun club ne correspond a "${nomSaisi}".`}
          </p>
        ) : groupes.map((g) => (
          <div key={g.cle} role="presentation">
            <div className="h-section px-2.5 pb-1 pt-2 first:pt-0.5">{g.titre}</div>
            {g.clubs.map((c) => {
              indexGlobal += 1;
              const i = indexGlobal;
              return (
                <button key={c.id} type="button" role="option" id={`${idListe}-${c.id}`} data-index={i} aria-selected={i === actif}
                  onClick={() => choisir(c)} onMouseMove={() => setActif(i)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left transition-colors ${i === actif ? "bg-accent/[0.13]" : ""}`}>
                  <ClubBadge clubId={c.id} size={26} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{c.nom}</span>
                    {c.ville && <span className="block truncate text-[11px] text-muted">{c.ville}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {peutCreer && (
        <button type="button" onClick={creer} disabled={creation}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-line2 px-3 py-2 text-left text-sm text-muted transition hover:border-accent/50 hover:text-ink disabled:opacity-60">
          <Plus size={14} className="shrink-0 text-accent" aria-hidden />
          <span className="min-w-0 flex-1 truncate">{creation ? "Creation..." : <>Club absent de la liste ? Creer « <strong className="text-ink">{nomSaisi}</strong> »</>}</span>
        </button>
      )}
      {erreur && <p className="text-xs text-danger" role="alert">{erreur}</p>}
    </div>
  );
}
