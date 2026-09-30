"use client";
// src/components/CommandPalette.tsx
//
// Palette de commandes (Cmd/Ctrl + K) : un seul champ pour aller a une page,
// un club, un joueur, un arbitre, ou lancer une action (changer de theme...).
// Clavier d'abord : fleches, Entree, Echap. Les donnees (clubs, joueurs,
// arbitres) sont chargees a la premiere ouverture puis gardees en memoire.

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, Moon, Search, Sun, Users, Shield, Award, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api } from "@/lib/api";
import { useOwnClubId } from "@/lib/own-club-context";
import { useTheme } from "@/lib/theme-context";
import { construireNavigation } from "@/lib/navigation";
import { scoreRecherche } from "@/lib/recherche";
import { ClubBadge } from "@/components/ClubBadge";
import type { Club, Joueur } from "@/lib/types";

interface Resultat {
  id: string;
  groupe: "Pages" | "Actions" | "Clubs" | "Joueurs" | "Arbitres";
  label: string;
  sous?: string;
  icone?: LucideIcon;
  clubId?: string;
  score: number;
  action: () => void;
}

// Clubs et arbitres, gardes entre deux ouvertures (une seule charge par session de page).
// Les joueurs, eux, sont cherches cote serveur (recherche floue) : les charger tous
// pesait de plus en plus lourd et ne tolerait aucune faute de frappe.
let cache: { clubs: Club[]; arbitres: any[] } | null = null;
const LIMITE_PAR_GROUPE = 6;

export function CommandPalette({ ouverte, onFermer }: { ouverte: boolean; onFermer: () => void }) {
  const router = useRouter();
  const ownClubId = useOwnClubId();
  const { theme, toggle } = useTheme();
  const [q, setQ] = useState("");
  const [actif, setActif] = useState(0);
  const [donnees, setDonnees] = useState(cache);
  const listeRef = useRef<HTMLDivElement>(null);
  const champRef = useRef<HTMLInputElement>(null);

  // Charge les donnees a la premiere ouverture.
  useEffect(() => {
    if (!ouverte || cache) return;
    Promise.all([api.clubs().catch(() => []), api.arbitres().catch(() => [])]).then(([clubs, arbitres]) => {
      cache = { clubs, arbitres };
      setDonnees(cache);
    });
  }, [ouverte]);

  // Joueurs : recherche floue du serveur, apres une courte pause de frappe. Un numero de
  // requete evite qu'une reponse tardive ecrase une plus recente.
  const [joueurs, setJoueurs] = useState<Joueur[]>([]);
  const requete = useRef(0);
  useEffect(() => {
    const terme = q.trim();
    if (!ouverte || terme.length < 2) { setJoueurs([]); return; }
    const n = ++requete.current;
    const minuteur = setTimeout(() => {
      api.searchJoueurs(terme).then((r) => { if (n === requete.current) setJoueurs(r as Joueur[]); }).catch(() => {});
    }, 150);
    return () => clearTimeout(minuteur);
  }, [q, ouverte]);

  // Remise a zero et focus a chaque ouverture ; le defilement de la page est verrouille.
  useEffect(() => {
    if (!ouverte) return;
    setQ(""); setActif(0);
    const avant = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    requestAnimationFrame(() => champRef.current?.focus());
    return () => { document.body.style.overflow = avant; };
  }, [ouverte]);

  const aller = (href: string) => () => { onFermer(); router.push(href); };

  const resultats = useMemo<Resultat[]>(() => {
    const out: Resultat[] = [];
    const ajouter = (r: Omit<Resultat, "score">, score: number) => { if (!q.trim() || score > 0) out.push({ ...r, score }); };

    for (const sec of construireNavigation(ownClubId || null)) {
      for (const it of sec.items) {
        ajouter({ id: `page:${it.href}:${it.label}`, groupe: "Pages", label: it.label, sous: sec.section, icone: it.icon, action: aller(it.href) },
          scoreRecherche(q, it.label, it.motsCles, sec.section));
      }
    }
    ajouter({
      id: "action:theme", groupe: "Actions", icone: theme === "dark" ? Sun : Moon,
      label: theme === "dark" ? "Passer en mode jour" : "Passer en mode nuit", sous: "Apparence",
      action: () => { onFermer(); toggle(); },
    }, scoreRecherche(q, "theme mode apparence sombre clair nuit jour"));
    ajouter({
      id: "action:saisons", groupe: "Actions", icone: Zap, label: "Gerer les saisons", sous: "Creer, activer, fusionner les equipes",
      action: aller("/saisons"),
    }, scoreRecherche(q, "saisons gerer activer fusionner equipes"));

    if (q.trim().length >= 2 && donnees) {
      for (const c of donnees.clubs) {
        ajouter({ id: `club:${c.id}`, groupe: "Clubs", label: c.nom, sous: c.ville ?? undefined, icone: Shield, clubId: c.id, action: aller(`/club/${c.id}`) },
          scoreRecherche(q, c.nom, c.ville));
      }
      // L'ordre du serveur (pertinence) est conserve : score decroissant.
      joueurs.forEach((j, i) => {
        const clubNom = donnees.clubs.find((c) => c.id === j.clubId)?.nom;
        ajouter({ id: `joueur:${j.id}`, groupe: "Joueurs", label: `${j.prenom ?? ""} ${j.nom}`.trim(),
          sous: [clubNom, j.poste].filter(Boolean).join(" · "), icone: Users, action: aller(`/joueur/${j.id}`) },
          1000 - i);
      });
      for (const a of donnees.arbitres) {
        ajouter({ id: `arbitre:${a.id}`, groupe: "Arbitres", label: `${a.prenom ? a.prenom + " " : ""}${a.nom}`.trim(),
          sous: a.profil ? `Profil ${a.profil}` : undefined, icone: Award, action: aller(`/arbitres/${a.id}`) },
          scoreRecherche(q, a.nom, a.prenom));
      }
    }

    // Ordre des groupes fixe ; a l'interieur, meilleur score d'abord, limite par groupe.
    const ordre: Resultat["groupe"][] = q.trim() ? ["Joueurs", "Clubs", "Pages", "Actions", "Arbitres"] : ["Pages", "Actions"];
    return ordre.flatMap((g) =>
      out.filter((r) => r.groupe === g).sort((a, b) => b.score - a.score).slice(0, q.trim() ? LIMITE_PAR_GROUPE : 99));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, donnees, joueurs, ownClubId, theme]);

  // Garde la selection dans les bornes et visible.
  useEffect(() => { setActif(0); }, [q]);
  useEffect(() => {
    listeRef.current?.querySelector<HTMLElement>(`[data-index="${actif}"]`)?.scrollIntoView({ block: "nearest" });
  }, [actif]);

  // Clavier ecoute sur la fenetre tant que la palette est ouverte : Echap et les fleches
  // marchent meme avant que le champ ait pris le focus.
  useEffect(() => {
    if (!ouverte) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setActif((i) => Math.min(resultats.length - 1, i + 1)); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setActif((i) => Math.max(0, i - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); resultats[actif]?.action(); }
      else if (e.key === "Escape") { e.preventDefault(); onFermer(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [ouverte, resultats, actif, onFermer]);

  if (!ouverte || typeof window === "undefined") return null;

  let groupeCourant = "";
  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-start justify-center px-4 pt-[12vh] print:hidden" role="presentation">
      <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onFermer} aria-hidden="true" />
      <div
        role="dialog" aria-modal="true" aria-label="Palette de commandes"
        className="pop-in glass panel-pop relative w-full max-w-xl overflow-hidden"
      >
        <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
          <Search size={18} className="text-accent shrink-0" />
          <input
            ref={champRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Aller a une page, un club, un joueur, un arbitre..."
            className="flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
            role="combobox" aria-expanded="true" aria-controls="palette-liste"
            aria-activedescendant={resultats[actif] ? `palette-${resultats[actif].id}` : undefined}
            autoComplete="off" spellCheck={false}
          />
          <kbd className="kbd">Echap</kbd>
        </div>

        <div ref={listeRef} id="palette-liste" role="listbox" className="max-h-[52vh] overflow-y-auto p-2">
          {resultats.length === 0 && (
            <div className="px-4 py-10 text-center text-sm text-muted">
              {q.trim().length < 2 ? "Tape au moins 2 lettres pour chercher un joueur ou un club." : `Rien ne correspond a "${q}".`}
            </div>
          )}
          {resultats.map((r, i) => {
            const entete = r.groupe !== groupeCourant;
            groupeCourant = r.groupe;
            const Icone = r.icone;
            return (
              <div key={r.id}>
                {entete && <div className="h-section px-3 pb-1 pt-3">{r.groupe}</div>}
                <button
                  id={`palette-${r.id}`} data-index={i} role="option" aria-selected={i === actif}
                  onClick={r.action} onMouseMove={() => setActif(i)}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors
                    ${i === actif ? "bg-accent/[0.13]" : ""}`}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${i === actif ? "bg-accentstrong text-white" : "bg-panel2 text-muted"}`}>
                    {r.clubId ? <ClubBadge clubId={r.clubId} size={20} /> : Icone ? <Icone size={15} /> : null}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-ink">{r.label}</span>
                    {r.sous && <span className="block truncate text-xs text-muted">{r.sous}</span>}
                  </span>
                  {i === actif && <CornerDownLeft size={14} className="text-accent shrink-0" aria-hidden="true" />}
                </button>
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-4 border-t border-line px-4 py-2.5 text-[11px] text-faint">
          <span className="flex items-center gap-1.5"><kbd className="kbd">↑</kbd><kbd className="kbd">↓</kbd> naviguer</span>
          <span className="flex items-center gap-1.5"><kbd className="kbd">↵</kbd> ouvrir</span>
          <span className="ml-auto hidden sm:block">{resultats.length} resultat{resultats.length > 1 ? "s" : ""}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
}
