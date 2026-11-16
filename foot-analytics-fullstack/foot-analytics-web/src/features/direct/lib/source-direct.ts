// src/features/direct/lib/source-direct.ts
//
// D'ou viennent les donnees du direct et ou partent les saisies : le staff (compte connecte, via le relais de l'application) ou
// un saisisseur invite (session de son lien). L'ecran est le meme ; seul le canal change. Un invite n'a ni cloture, ni reouverture.

import { api, ApiError } from "@/shared/lib/api";

import type { ActionChrono, EtatDirect, EvenementDirect, SaisieEvenement } from "./direct-types";

export interface SourceDirect {
  /** Cle de la file d'envoi gardee sur l'appareil (un match). */
  cle: string;
  charger(): Promise<EtatDirect>;
  chrono(action: ActionChrono, minute?: number): Promise<EtatDirect>;
  enregistrer(e: SaisieEvenement): Promise<EvenementDirect>;
  supprimer(id: string): Promise<void>;
  /** Absents pour un invite. */
  cloturer?(): Promise<EtatDirect>;
  rouvrir?(): Promise<EtatDirect>;
}

export const sourceStaff = (matchId: string): SourceDirect => ({
  cle: matchId,
  charger: () => api.direct(matchId),
  chrono: (a, m) => api.directChrono(matchId, a, m),
  enregistrer: (e) => api.directEnregistrer(matchId, e),
  supprimer: (id) => api.directSupprimer(matchId, id),
  cloturer: () => api.directCloturer(matchId),
  rouvrir: () => api.directRouvrir(matchId),
});

const RELAIS_SAISIE = "/api/backend/saisie";

/** Un appel d'invite : sa session dans l'en-tete Invite (le relais de l'application ne met JAMAIS de jeton de compte ici). */
export async function appelInvite<T>(session: string | null, chemin: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${RELAIS_SAISIE}${chemin}`, {
    ...init, cache: "no-store",
    headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Invite ${session}` } : {}), ...(init.headers ?? {}) },
  });
  const texte = await res.text();
  let corps: unknown = null;
  try { corps = texte ? JSON.parse(texte) : null; } catch { corps = texte; }
  if (!res.ok) throw new ApiError(res.status, chemin, corps);
  return corps as T;
}

export const sourceInvite = (session: string, matchId: string): SourceDirect => ({
  cle: matchId,
  charger: () => appelInvite<EtatDirect>(session, "/etat"),
  chrono: (action, minute) => appelInvite<EtatDirect>(session, "/chrono", { method: "POST", body: JSON.stringify({ action, ...(minute === undefined ? {} : { minute }) }) }),
  enregistrer: (e) => {
    const { id, ...corps } = e;
    return appelInvite<EvenementDirect>(session, `/evenements/${id}`, { method: "PUT", body: JSON.stringify(corps) });
  },
  supprimer: async (id) => { await appelInvite<void>(session, `/evenements/${id}`, { method: "DELETE" }); },
});

/* ---- La session d'un invite, gardee sur son appareil ---- */
export interface SessionInvite { session: string; matchId: string; libelle: string; peutChrono: boolean; expireLe: string }
const CLE_SESSION = "fa.invite.session";

export function lireSessionInvite(): SessionInvite | null {
  try {
    const brut = window.localStorage.getItem(CLE_SESSION);
    if (!brut) return null;
    const s = JSON.parse(brut) as SessionInvite;
    return s && typeof s.session === "string" && typeof s.matchId === "string" && Date.parse(s.expireLe) > Date.now() ? s : null;
  } catch { return null; }
}
export function garderSessionInvite(s: SessionInvite): void { try { window.localStorage.setItem(CLE_SESSION, JSON.stringify(s)); } catch { /* stockage refuse */ } }
export function oublierSessionInvite(): void { try { window.localStorage.removeItem(CLE_SESSION); } catch { /* rien */ } }
