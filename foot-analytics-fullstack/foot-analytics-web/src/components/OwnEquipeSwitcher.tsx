"use client";
// src/components/OwnEquipeSwitcher.tsx
//
// Selecteur en bas a gauche de la sidebar. Permet au coach de :
//  1. choisir la saison (defaut: saison active)
//  2. choisir l'equipe (parmi celles de son club pour cette saison)
//
// La selection est persistee via cookies (ownEquipeId, ownSaisonId)
// et rafraichit l'app pour propager le filtrage cote classement,
// effectif, et tout endroit qui regarde useOwnEquipe().

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Check, Calendar } from "lucide-react";
import { api } from "@/lib/api";
import { useOwnClubId } from "@/lib/own-club-context";
import { useOwnEquipe } from "@/lib/own-equipe-context";
import { getCachedUser } from "@/lib/auth";

/**
 * Filtre les equipes selon les permissions de l'utilisateur.
 *
 * - Admin : voit tout, aucun filtre
 * - Sans clubId ni equipeIds : voit tout aussi (fallback permissif)
 * - Sinon : match par **empreinte** (clubId + categorie + competition
 *   libelle + poule) plutot que par ID pur. Ainsi, si le user a
 *   acces a "Seniors D2 Poule C" sur 25-26, il a automatiquement
 *   acces a "Seniors D2 Poule C" sur 26-27 (equipe clonee = meme
 *   empreinte). Sans ca, chaque nouveau clone avait un ID inconnu
 *   du JWT et etait masque.
 *
 * Fallback : on garde aussi le match par ID direct au cas ou une
 * equipe est autorisee mais avec une empreinte differente (rare).
 */
function filtrerEquipesAutorisees(equipes: any[], user: any): any[] {
  if (!user || user.role === "admin") return equipes;
  if (!Array.isArray(user.equipeIds) || user.equipeIds.length === 0) return equipes;

  const ids = new Set<string>(user.equipeIds);
  // Empreintes des equipes explicitement autorisees.
  const empreintes = new Set<string>(
    equipes
      .filter((e) => ids.has(e.id))
      .map((e) => `${e.clubId}|${e.categorie ?? ""}|${e.competitionLibelle ?? ""}|${e.poule ?? ""}`),
  );

  return equipes.filter((e) => {
    if (ids.has(e.id)) return true;
    const emp = `${e.clubId}|${e.categorie ?? ""}|${e.competitionLibelle ?? ""}|${e.poule ?? ""}`;
    return empreintes.has(emp);
  });
}

export function OwnEquipeSwitcher() {
  const router = useRouter();
  const ownClubId = useOwnClubId();
  const { equipeId, saisonId, setEquipe } = useOwnEquipe();

  const [saisons, setSaisons] = useState<any[]>([]);
  const [equipes, setEquipes] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [booted, setBooted] = useState(false);
  const [reimportState, setReimportState] = useState<"idle" | "loading" | "error">("idle");
  const [reimportError, setReimportError] = useState<string>("");
  const rootRef = useRef<HTMLDivElement | null>(null);

  // Click exterieur ferme le menu. On utilise mousedown plutot que click
  // pour fermer AVANT que le clic n'atteigne un autre bouton (sinon on
  // a un "double" effet : ferme + re-ouvre via le bouton trigger).
  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useEffect(() => {
    (async () => {
      const [s, e] = await Promise.all([api.saisons(), api.equipes(ownClubId)]);
      setSaisons(s);
      const user = getCachedUser();
      const equipesAutorisees = filtrerEquipesAutorisees(e, user);
      setEquipes(equipesAutorisees);

      // Auto-bootstrap pour l'admin apres un reseed : si aucune equipe
      // n'est trouvee pour le club courant (= cookie ownClubId pointe
      // vers un club inexistant, typiquement "chapo" hardcode en
      // fallback), on bascule sur le 1er club ayant des equipes.
      // Sans ca, le switcher reste vide et l'admin ne peut rien selectionner.
      if (equipesAutorisees.length === 0 && (user?.role === "admin" || !user?.clubId)) {
        try {
          const tousClubs = await api.clubs();
          for (const c of tousClubs) {
            const equipesDuClub = await api.equipes(c.id);
            if (equipesDuClub.length > 0) {
              // On a trouve un club valide -> on pose le cookie ownClubId
              // et on reload pour que tous les Server Components reprennent.
              await fetch("/api/own-club", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clubId: c.id }),
              });
              window.location.reload();
              return;
            }
          }
        } catch { /* silent */ }
      }

      // Diagnostic detaille pour comprendre le comportement au refresh.
      // eslint-disable-next-line no-console
      console.debug("[switcher] boot", {
        equipeIdCookie: equipeId,
        saisonIdCookie: saisonId,
        nbEquipesRecues: e.length,
        nbEquipesAutorisees: equipesAutorisees.length,
        role: user?.role ?? "unknown",
      });

      // GARANTIE : ne toucher a rien tant que le cookie pointe vers
      // une equipe reelle. Ceci evite les "flashs" de reselection au
      // refresh, qui pouvaient basculer sur une autre saison.
      const cookiePointeEquipeReelle = equipeId && equipesAutorisees.some((e: any) => e.id === equipeId);
      if (cookiePointeEquipeReelle) {
        // eslint-disable-next-line no-console
        console.debug("[switcher] cookie valide, on garde", equipeId);
        setBooted(true);
        return;
      }

      // Sinon (cookie null ou pointant vers une equipe supprimee) :
      // fallback sur la 1ere equipe de la SAISON ACTIVE (= en cours).
      // C'est le comportement demande : "l'equipe par defaut doit
      // etre celle de la saison en cours".
      if (equipesAutorisees.length > 0) {
        const active = s.find((x: any) => x.actif) ?? s[0];
        const candidates = equipesAutorisees.filter((eq: any) => eq.saisonId === active?.id);
        const first = candidates[0] ?? equipesAutorisees[0];
        if (first) {
          // eslint-disable-next-line no-console
          console.debug("[switcher] fallback auto-select", first.id, first.nom, "saison=", active?.nom);
          setEquipe(first.id, first.saisonId ?? active?.id ?? null);
          await persist(first.id, first.saisonId ?? active?.id ?? null);
        }
      }
      setBooted(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownClubId]);

  const persist = async (eid: string | null, sid: string | null) => {
    await fetch("/api/own-equipe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ equipeId: eid, saisonId: sid }),
    });
    router.refresh();
  };

  const onPickSaison = async (sid: string) => {
    // Quand on change de saison, on selectionne la 1ere equipe du club
    // pour cette saison ; si aucune, on met l'equipe a null mais on
    // garde la saison.
    const candidates = equipes.filter((e) => e.saisonId === sid);
    const first = candidates[0] ?? null;
    setEquipe(first?.id ?? null, sid);
    await persist(first?.id ?? null, sid);
  };
  const onPickEquipe = async (eid: string) => {
    const eq = equipes.find((e) => e.id === eid);
    setEquipe(eid, eq?.saisonId ?? saisonId);
    await persist(eid, eq?.saisonId ?? saisonId);
    setOpen(false);
  };

  /**
   * Clone les meta-equipes (sans joueurs) de la saison anterieure vers
   * la saison courante. Appelle POST /saisons/:id/auto-clone qui gere
   * la logique cote backend. Apres succes, on reload les equipes et
   * on selectionne la 1ere de la nouvelle saison.
   */
  const reimporterEquipesSaisonPrecedente = async (sid: string) => {
    setReimportState("loading");
    setReimportError("");
    try {
      // eslint-disable-next-line no-console
      console.debug("[reimport] appel autoCloneSaison", sid, "pour club", ownClubId);
      const result = await api.autoCloneSaison(sid, ownClubId);
      // eslint-disable-next-line no-console
      console.debug("[reimport] resultat backend", result);

      // Verifier explicitement le retour backend :
      // - result.creees > 0 -> succes reel
      // - result.existaient > 0 sans creees -> deja fait
      // - result.error -> erreur backend
      // - result.message -> cas informatif (pas de saison anterieure)
      if (result && (result as any).error) {
        setReimportState("error");
        setReimportError((result as any).error);
        return;
      }
      if (result && (result as any).message && (result as any).creees === 0) {
        setReimportState("error");
        setReimportError((result as any).message);
        return;
      }

      // Reload equipes
      const e = await api.equipes(ownClubId);
      const user = getCachedUser();
      const equipesAutorisees = filtrerEquipesAutorisees(e, user);
      // eslint-disable-next-line no-console
      console.debug("[reimport] api renvoie", e.length, "equipes | filtre laisse", equipesAutorisees.length);
      if (e.length > 0 && equipesAutorisees.length === 0) {
        // eslint-disable-next-line no-console
        console.warn("[reimport] toutes les equipes sont filtrees par les permissions !", { user });
      }
      setEquipes(equipesAutorisees);

      // Verifie qu'on a vraiment des equipes pour cette saison.
      const candidates = equipesAutorisees.filter((eq: any) => eq.saisonId === sid);
      if (candidates.length === 0) {
        setReimportState("error");
        setReimportError(
          "Aucune equipe importee. Verifie que la saison precedente a bien des equipes.",
        );
        return;
      }

      const first = candidates[0];
      setEquipe(first.id, sid);
      await persist(first.id, sid);
      // Force un router.refresh pour que TOUTES les pages Server
      // Components reflechissent le nouveau cookie ownEquipeId.
      router.refresh();
      setReimportState("idle");
      setOpen(false);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[reimport] erreur", err);
      setReimportState("error");
      setReimportError((err as Error).message || "Erreur inconnue");
    }
  };

  const equipeChoisie = equipes.find((e) => e.id === equipeId);
  const saisonChoisie = saisons.find((s) => s.id === saisonId)
    ?? saisons.find((s) => s.actif)
    ?? saisons[0];

  const equipesPourSaison = saisonChoisie
    ? equipes.filter((e) => e.saisonId === saisonChoisie.id)
    : equipes;

  return (
    <div className="relative" ref={rootRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full panel-inset px-3 py-2.5 text-left hover:border-turf/40 transition"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="text-[10px] uppercase tracking-[0.18em] text-faint flex items-center gap-1">
              <Calendar size={9} className="text-turf"/>
              {booted ? (saisonChoisie?.nom ?? "Aucune saison") : "…"}
            </div>
            <div className="font-display font-bold text-ink mt-0.5 truncate">
              {!booted
                ? <span className="text-muted">Chargement…</span>
                : (equipeChoisie?.nom ?? "Aucune equipe")}
            </div>
            {equipeChoisie?.competitionLibelle && (
              <div className="text-[10px] text-muted mt-0.5 truncate">
                {equipeChoisie.competitionLibelle}
              </div>
            )}
          </div>
          <ChevronDown size={14} className={`text-faint transition ${open ? "rotate-180" : ""}`}/>
        </div>
      </button>

      {open && (
        <div className="absolute bottom-full left-0 right-0 mb-2 panel p-3 shadow-xl border border-line z-30 max-h-[60vh] overflow-y-auto">
          {/* Saisons */}
          <div className="text-[10px] uppercase tracking-[0.18em] text-faint mb-2">Saison</div>
          <ul className="space-y-0.5 mb-3">
            {saisons.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => onPickSaison(s.id)}
                  className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between
                    ${s.id === saisonChoisie?.id ? "bg-turf/[0.10] text-turf font-semibold" : "hover:bg-line/40"}`}
                >
                  <span>{s.nom}{s.actif ? " ★" : ""}</span>
                  {s.id === saisonChoisie?.id && <Check size={11}/>}
                </button>
              </li>
            ))}
          </ul>

          {/* Equipes de la saison choisie */}
          <div className="text-[10px] uppercase tracking-[0.18em] text-faint mb-2">Equipe</div>
          {equipesPourSaison.length === 0 ? (
            <div className="px-2 py-2">
              <p className="text-xs text-faint mb-2">
                Aucune equipe sur cette saison.
              </p>
              {saisonChoisie && (
                <button
                  type="button"
                  onClick={() => reimporterEquipesSaisonPrecedente(saisonChoisie.id)}
                  disabled={reimportState === "loading"}
                  className="w-full text-xs px-2 py-1.5 rounded border border-line hover:border-turf/40 hover:bg-turf/[0.06] hover:text-turf text-muted transition disabled:opacity-50 disabled:cursor-wait"
                >
                  {reimportState === "loading"
                    ? "Import en cours…"
                    : "Reimporter les equipes de la saison precedente"}
                </button>
              )}
              {reimportState === "error" && (
                <div className="mt-2 text-[10px] text-danger px-2 py-1.5 rounded bg-danger/[0.08] border border-danger/30 leading-snug">
                  {reimportError}
                </div>
              )}
              <p className="text-[10px] text-faint mt-2 leading-relaxed">
                Ou importe une feuille FMI pour creer les equipes.
              </p>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {equipesPourSaison.map((e) => (
                <li key={e.id}>
                  <button
                    onClick={() => onPickEquipe(e.id)}
                    className={`w-full text-left px-2 py-1 rounded text-xs flex items-center justify-between
                      ${e.id === equipeId ? "bg-turf/[0.10] text-turf font-semibold" : "hover:bg-line/40"}`}
                  >
                    <span className="truncate">{e.nom}</span>
                    {e.id === equipeId && <Check size={11}/>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
