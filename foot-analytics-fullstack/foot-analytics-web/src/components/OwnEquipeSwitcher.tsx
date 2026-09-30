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
import { debug } from "@/lib/debug";
import { filtrerEquipesAutorisees } from "@/lib/empreinte-equipe";
import { selectionValide } from "@/lib/selection-equipe";

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
  const reparationFaite = useRef(false);

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

  // Chargement des saisons et des equipes autorisees. AUCUNE selection
  // automatique ici : au demarrage, c'est le middleware qui pose les
  // cookies ownEquipeId / ownSaisonId ; le switcher se contente d'afficher
  // l'etat et de reagir aux choix de l'utilisateur.
  useEffect(() => {
    (async () => {
      const [s, e] = await Promise.all([api.saisons(), api.equipes(ownClubId)]);
      const user = getCachedUser();
      const equipesAutorisees = filtrerEquipesAutorisees(e, user);
      setSaisons(s);
      setEquipes(equipesAutorisees);
      debug("[switcher] charge", {
        equipeIdCookie: equipeId,
        saisonIdCookie: saisonId,
        nbEquipesRecues: e.length,
        nbEquipesAutorisees: equipesAutorisees.length,
        role: user?.role ?? "unknown",
      });
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
    // Changer de saison ne doit jamais laisser la selection vide. Le club a des
    // equipes cette saison : on prend l'equivalent de l'equipe actuelle (meme
    // categorie), sinon la premiere. Il n'en a pas : on reimporte celles de la
    // saison precedente ; si cela echoue on RESTE sur la selection actuelle et on
    // affiche l'erreur.
    if (!equipes.some((e) => e.saisonId === sid)) {
      await reimporterEquipesSaisonPrecedente(sid);
      return;
    }
    setReimportState("idle");
    const choix = selectionValide({ equipes, saisons, equipeId, saisonId: sid });
    if (!choix.equipe) return;
    setEquipe(choix.equipe.id, choix.saisonId);
    await persist(choix.equipe.id, choix.saisonId);
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
      debug("[reimport] appel autoCloneSaison", sid, "pour club", ownClubId);
      const result = await api.autoCloneSaison(sid, ownClubId);
      debug("[reimport] resultat backend", result);

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
      debug("[reimport] api renvoie", e.length, "equipes | filtre laisse", equipesAutorisees.length);
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

  // Selection AFFICHEE : toujours valide tant que le club a une equipe. Un cookie
  // perime (equipe fusionnee ou supprimee, autre club) ne donne plus "Aucune
  // equipe" : on affiche la selection corrigee, et on la reecrit ci-dessous.
  const selection = booted ? selectionValide({ equipes, saisons, equipeId, saisonId }) : null;
  const equipeChoisie = selection?.equipe ?? null;
  const saisonChoisie = saisons.find((s) => s.id === (selection?.saisonId ?? saisonId))
    ?? saisons.find((s) => s.actif)
    ?? saisons[0];

  // Auto-reparation : le middleware corrige deja les cookies a chaque navigation ;
  // ceci rattrape les cas survenus entre deux verifications (fusion d'equipes en
  // cours de session). Une seule tentative, pour ne jamais boucler.
  useEffect(() => {
    if (!selection?.corrigee || !selection.equipe || reparationFaite.current) return;
    reparationFaite.current = true;
    debug("[switcher] selection perimee corrigee", { equipeId, saisonId }, "->", selection.equipe.id);
    setEquipe(selection.equipe.id, selection.saisonId);
    void persist(selection.equipe.id, selection.saisonId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection?.corrigee, selection?.equipe?.id, selection?.saisonId]);

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
        <div role="dialog" aria-label="Choix de la saison et de l'equipe" className="absolute bottom-full left-0 right-0 mb-2 panel p-3 shadow-xl border border-line z-30 max-h-[60vh] overflow-y-auto">
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
          {reimportState === "loading" && (
            <p className="text-[10px] text-faint mb-3 px-2">Import des equipes de la saison…</p>
          )}
          {reimportState === "error" && equipesPourSaison.length > 0 && (
            <div className="mb-3 text-[10px] text-danger px-2 py-1.5 rounded bg-danger/[0.08] border border-danger/30 leading-snug">
              Saison inchangee : {reimportError}
            </div>
          )}

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
                      ${e.id === equipeChoisie?.id ? "bg-turf/[0.10] text-turf font-semibold" : "hover:bg-line/40"}`}
                  >
                    <span className="truncate">{e.nom}</span>
                    {e.id === equipeChoisie?.id && <Check size={11}/>}
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
