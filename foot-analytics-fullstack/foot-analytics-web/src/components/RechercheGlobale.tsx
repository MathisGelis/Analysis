"use client";
// src/components/RechercheGlobale.tsx
//
// Barre de RECHERCHE de la barre du haut : un vrai champ de saisie, dont les resultats s'affichent dessous.
// Elle ne cherche que des fiches (joueurs, entraineurs, clubs, arbitres) ; la navigation entre les pages est
// celle de la barre laterale, separee. Ctrl/Cmd + K (ou "/") place le curseur dans le champ.
//
// Clavier : fleches, Entree, Echap. Les clubs et arbitres sont charges au premier clic puis gardes en memoire ;
// les joueurs et entraineurs sont cherches cote serveur (recherche floue, apres une courte pause de frappe).

import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Award, Search, Shield, Users, UserCog, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { scoreRecherche } from "@/lib/recherche";
import { saisonPassee, type DerniereSaison } from "@/lib/parcours-joueur";
import { ClubBadge } from "@/components/ClubBadge";
import type { Club, Joueur } from "@/lib/types";

/** Evenement qui place le curseur dans la barre (raccourcis clavier de la coquille). */
export const EVENEMENT_RECHERCHE = "fa:recherche";

type Groupe = "Joueurs" | "Entraineurs" | "Clubs" | "Arbitres";
interface Resultat {
  id: string;
  groupe: Groupe;
  label: string;
  sous?: string;
  icone: LucideIcon;
  clubId?: string;
  score: number;
  href: string;
}

type JoueurTrouve = Joueur & { derniereSaison?: DerniereSaison | null };

// Clubs et arbitres, gardes entre deux recherches (une seule charge par session de page).
let cache: { clubs: Club[]; arbitres: any[] } | null = null;
const LIMITE_PAR_GROUPE = 5;
const ORDRE: Groupe[] = ["Joueurs", "Entraineurs", "Clubs", "Arbitres"];

export function RechercheGlobale() {
  const router = useRouter();
  const idListe = useId();
  const [q, setQ] = useState("");
  const [ouvert, setOuvert] = useState(false);
  const [mobile, setMobile] = useState(false);            // petit ecran : le champ prend toute la barre
  const [actif, setActif] = useState(0);
  const [donnees, setDonnees] = useState(cache);
  const [joueurs, setJoueurs] = useState<JoueurTrouve[]>([]);
  const [coachs, setCoachs] = useState<any[]>([]);
  const conteneur = useRef<HTMLDivElement>(null);
  const champ = useRef<HTMLInputElement>(null);
  const liste = useRef<HTMLDivElement>(null);
  const requete = useRef(0);
  const terme = q.trim();

  // Affiche le champ (petit ecran) et y pose le curseur, tout de suite : un rendu differe laisserait passer les
  // premieres lettres tapees, que la selection du texte existant viendrait ensuite ecraser.
  function activerChamp() {
    flushSync(() => { setMobile(true); setOuvert(true); });
    champ.current?.focus();
    champ.current?.select();
  }

  // Raccourcis clavier de la coquille.
  const activer = useRef(activerChamp);
  activer.current = activerChamp;
  useEffect(() => {
    const surRaccourci = () => activer.current();
    window.addEventListener(EVENEMENT_RECHERCHE, surRaccourci);
    return () => window.removeEventListener(EVENEMENT_RECHERCHE, surRaccourci);
  }, []);

  // Clubs et arbitres : charges au premier usage.
  useEffect(() => {
    if (!ouvert || cache) return;
    Promise.all([api.clubs().catch(() => []), api.arbitres().catch(() => [])]).then(([clubs, arbitres]) => {
      cache = { clubs, arbitres };
      setDonnees(cache);
    });
  }, [ouvert]);

  // Joueurs et entraineurs : recherche du serveur, apres une pause de frappe. Un numero de requete evite
  // qu'une reponse tardive ecrase une plus recente.
  useEffect(() => {
    if (terme.length < 2) { setJoueurs([]); setCoachs([]); return; }
    const n = ++requete.current;
    const minuteur = setTimeout(() => {
      api.searchJoueurs(terme).then((r) => { if (n === requete.current) setJoueurs(r as JoueurTrouve[]); }).catch(() => {});
      api.coachs(terme).then((r) => { if (n === requete.current) setCoachs(r); }).catch(() => {});
    }, 150);
    return () => clearTimeout(minuteur);
  }, [terme]);

  // Un clic en dehors ferme la liste.
  useEffect(() => {
    if (!ouvert) return;
    const dehors = (e: MouseEvent) => {
      if (!conteneur.current?.contains(e.target as Node)) { setOuvert(false); setMobile(false); }
    };
    document.addEventListener("mousedown", dehors);
    return () => document.removeEventListener("mousedown", dehors);
  }, [ouvert]);

  const resultats = useMemo<Resultat[]>(() => {
    if (terme.length < 2) return [];
    const out: Resultat[] = [];
    const nomClub = (id?: string | null) => donnees?.clubs.find((c) => c.id === id)?.nom;
    // L'ordre du serveur (pertinence) est conserve : score decroissant.
    joueurs.forEach((j, i) => out.push({
      id: `joueur:${j.id}`, groupe: "Joueurs", icone: Users, score: 1000 - i, href: `/joueur/${j.id}`,
      label: `${j.prenom ?? ""} ${j.nom}`.trim(),
      // Club le plus recent (calcule par le serveur sur les feuilles) et, hors saison en cours, la derniere saison connue.
      sous: [nomClub(j.clubId), j.poste, saisonPassee(j.derniereSaison)].filter(Boolean).join(" · "),
    }));
    coachs.forEach((c, i) => out.push({
      id: `coach:${c.id}`, groupe: "Entraineurs", icone: UserCog, score: 1000 - i, href: `/coachs/${c.id}`,
      label: `${c.prenom ?? ""} ${c.nom}`.trim(), sous: nomClub(c.clubId),
    }));
    for (const c of donnees?.clubs ?? []) {
      const score = scoreRecherche(terme, c.nom, c.ville);
      if (score > 0) out.push({ id: `club:${c.id}`, groupe: "Clubs", icone: Shield, clubId: c.id, score, href: `/club/${c.id}`, label: c.nom, sous: c.ville ?? undefined });
    }
    for (const a of donnees?.arbitres ?? []) {
      const score = scoreRecherche(terme, a.nom, a.prenom);
      if (score > 0) out.push({ id: `arbitre:${a.id}`, groupe: "Arbitres", icone: Award, score, href: `/arbitres/${a.id}`, label: `${a.prenom ? a.prenom + " " : ""}${a.nom}`.trim(), sous: a.profil ? `Profil ${a.profil}` : undefined });
    }
    return ORDRE.flatMap((g) => out.filter((r) => r.groupe === g).sort((a, b) => b.score - a.score).slice(0, LIMITE_PAR_GROUPE));
  }, [terme, donnees, joueurs, coachs]);

  useEffect(() => { setActif(0); }, [terme]);
  useEffect(() => {
    liste.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`)?.scrollIntoView({ block: "nearest" });
  }, [actif]);

  function fermer() { setOuvert(false); setMobile(false); champ.current?.blur(); }
  function ouvrir(r: Resultat) { setQ(""); fermer(); router.push(r.href); }

  function surTouche(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setOuvert(true); setActif((i) => Math.min(resultats.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter") { if (resultats[actif]) { e.preventDefault(); ouvrir(resultats[actif]); } }
    else if (e.key === "Escape") { e.preventDefault(); if (q) setQ(""); else fermer(); }
  }

  const affiche = ouvert && (terme.length >= 1);
  let groupeCourant = "";
  return (
    <>
      {/* Petit ecran : une icone ouvre la barre, qui prend alors toute la largeur. */}
      <button type="button" onClick={activerChamp}
        className="btn btn-ghost !p-2.5 sm:hidden" aria-label="Rechercher">
        <Search size={17} />
      </button>

      <div ref={conteneur}
        className={mobile
          ? "max-sm:fixed max-sm:inset-x-0 max-sm:top-0 max-sm:z-50 max-sm:border-b max-sm:border-line max-sm:bg-panel max-sm:p-2.5 sm:relative sm:ml-auto sm:w-full sm:max-w-md"
          : "max-sm:hidden sm:relative sm:ml-auto sm:w-full sm:max-w-md"}>
        <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted max-sm:left-6" aria-hidden />
        <input
          ref={champ} value={q} type="text" autoComplete="off" spellCheck={false} enterKeyHint="search"
          onChange={(e) => { setQ(e.target.value); setOuvert(true); }}
          onFocus={() => setOuvert(true)} onKeyDown={surTouche}
          placeholder="Rechercher un joueur, un club, un arbitre..."
          aria-label="Rechercher un joueur, un entraineur, un club ou un arbitre"
          role="combobox" aria-expanded={affiche} aria-controls={idListe} aria-autocomplete="list"
          aria-activedescendant={affiche && resultats[actif] ? `${idListe}-${resultats[actif].id}` : undefined}
          className="h-10 w-full rounded-xl border border-line bg-panel2/70 pl-10 pr-16 text-sm text-ink outline-none transition
            placeholder:text-faint hover:border-accent/50 focus:border-accent focus:bg-panel2"
        />
        <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1 max-sm:right-6">
          {q
            ? <button type="button" onClick={() => { setQ(""); champ.current?.focus(); }} className="rounded-md p-1 text-faint hover:text-ink" aria-label="Effacer la recherche"><X size={14} /></button>
            : <span className="hidden items-center gap-1 sm:flex" aria-hidden><kbd className="kbd">Ctrl</kbd><kbd className="kbd">K</kbd></span>}
          {mobile && <button type="button" onClick={fermer} className="rounded-md px-1.5 py-1 text-xs text-muted hover:text-ink sm:hidden">Fermer</button>}
        </div>

        {affiche && (
          <div ref={liste} id={idListe} role="listbox" aria-label="Resultats de la recherche"
            className="pop-in panel-pop absolute left-0 right-0 top-[calc(100%+8px)] z-50 max-h-[60vh] overflow-y-auto p-2 max-sm:left-2.5 max-sm:right-2.5">
            {terme.length < 2 ? (
              <div className="px-3 py-6 text-center text-sm text-muted">Tape au moins 2 lettres.</div>
            ) : resultats.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-muted">Rien ne correspond a "{q}".</div>
            ) : resultats.map((r, i) => {
              const entete = r.groupe !== groupeCourant;
              groupeCourant = r.groupe;
              const Icone = r.icone;
              return (
                <div key={r.id} role="presentation">
                  {entete && <div className="h-section px-3 pb-1 pt-3 first:pt-1">{r.groupe}</div>}
                  <button type="button" id={`${idListe}-${r.id}`} data-index={i} role="option" aria-selected={i === actif}
                    onClick={() => ouvrir(r)} onMouseMove={() => setActif(i)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition-colors ${i === actif ? "bg-accent/[0.13]" : ""}`}>
                    <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${i === actif ? "bg-accentstrong text-white" : "bg-panel2 text-muted"}`}>
                      {r.clubId ? <ClubBadge clubId={r.clubId} size={20} /> : <Icone size={15} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                      {r.sous && <span className="block truncate text-xs text-muted">{r.sous}</span>}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
