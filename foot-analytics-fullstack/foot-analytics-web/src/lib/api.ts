// src/lib/api.ts
//
// Client d'acces au backend NestJS (foot-analytics-api).
// - L'URL de base vient de NEXT_PUBLIC_API_URL (def. http://localhost:4000/api).
// - Chaque lecture a un repli ("fallback") sur les donnees locales de demo
//   pour que l'app reste affichable meme si le backend n'est pas demarre.
// - Les mutations (POST/PATCH/DELETE) requierent le backend.

import {
  CLUBS as DEMO_CLUBS,
  JOUEURS as DEMO_JOUEURS,
  ALL_MATCHS as DEMO_MATCHS,
  MATCH_FMI as DEMO_MATCH_FMI,
  RAPPORT_NEUVILLE as DEMO_RAPPORT,
  CLASSEMENT_POULE_C as DEMO_CLASSEMENT,
} from "@/data/demo";
import type {
  Club, Joueur, Match, RapportScouting, LigneClassement,
} from "@/lib/types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

type Json = Record<string, any>;

/**
 * Recupere le JWT courant, peu importe le contexte d'execution :
 *  - Server Components / Route Handlers Next : depuis le cookie fa_token
 *    (importe `next/headers` dynamiquement pour ne pas crasher cote client)
 *  - Client Components / event handlers : depuis localStorage ("fa.token"
 *    pose par setSession() apres /auth/login)
 *
 * Renvoie undefined si pas de token (pre-login, anonyme...). L'appelant
 * decide ce qu'il en fait (header omis ou requete refusee).
 *
 * Cette fonction est partagee entre la fonction generique req() et les
 * methodes qui font un fetch direct (upload FormData : importFmi,
 * importFmiBatch). Sans ce token, les requetes sont rejetees avec 401
 * par le JwtAuthGuard global (cf. maj 37).
 */
async function getAuthToken(): Promise<string | undefined> {
  if (typeof window === "undefined") {
    try {
      const { cookies } = await import("next/headers");
      return cookies().get("fa_token")?.value;
    } catch { return undefined; /* hors context server component */ }
  }
  return localStorage.getItem("fa.token") ?? undefined;
}

async function req<T>(
  path: string,
  opts: RequestInit & { fallback?: T } = {},
): Promise<T> {
  const { fallback, ...init } = opts;
  try {
    const token = await getAuthToken();
    const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

    const res = await fetch(`${API_URL}${path}`, {
      // Lectures cote serveur Next : toujours frais (pas de cache fige).
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
        ...(init.headers ?? {}),
      },
      ...init,
    });
    if (!res.ok) throw new Error(`API ${res.status} sur ${path}`);
    // 204 (delete, ou explicit no-content) -> pas de corps
    if (res.status === 204) return undefined as T;
    // Corps vide (typique quand Nest retourne `null` directement) :
    // JSON.parse plante avec "Unexpected end of JSON input". On retourne
    // null explicite ou le fallback si defini.
    const text = await res.text();
    if (!text || !text.trim()) {
      return (fallback !== undefined ? fallback : null) as T;
    }
    return JSON.parse(text) as T;
  } catch (e) {
    if (fallback !== undefined) {
      if (typeof console !== "undefined") {
        console.warn(`[api] repli demo pour ${path} :`, (e as Error).message);
      }
      return fallback;
    }
    throw e;
  }
}

/* ----------------------------- LECTURES ---------------------------------- */

export const api = {
  // Clubs
  clubs: () => req<Club[]>("/clubs", { fallback: DEMO_CLUBS }),
  club: (id: string) =>
    req<Club | undefined>(`/clubs/${id}`, {
      fallback: DEMO_CLUBS.find((c) => c.id === id),
    }),

  // Equipes : voir la version enrichie plus bas (filtres saison + clubId).

  // Joueurs
  joueurs: (clubId?: string) =>
    req<Joueur[]>(`/joueurs${clubId ? `?clubId=${clubId}` : ""}`, {
      fallback: clubId
        ? DEMO_JOUEURS.filter((j) => j.clubId === clubId)
        : DEMO_JOUEURS,
    }),
  joueur: (id: string) =>
    req<Joueur | undefined>(`/joueurs/${id}`, {
      fallback: DEMO_JOUEURS.find((j) => j.id === id),
    }),

  /** Frequence des numeros de maillot portes par un joueur :
   *  { "6": 3, "8": 5 } -> 3 fois le 6 et 5 fois le 8. */
  joueurNumeros: (id: string) =>
    req<Record<string, number>>(`/joueurs/${id}/numeros`, { fallback: {} }),

  /** Historique du joueur par saison : [{saisonNom, lignes: [{ clubId, equipeNom, matchs, ... }]}]. */
  joueurHistorique: (id: string) =>
    req<any[]>(`/joueurs/${id}/historique`, { fallback: [] }),

  // Matchs
  matchs: (clubId?: string) =>
    req<Match[]>(`/matchs${clubId ? `?clubId=${clubId}` : ""}`, {
      fallback: DEMO_MATCHS,
    }),
  match: (id: string) =>
    req<Match | undefined>(`/matchs/${id}`, {
      fallback: id === "m-fmi" ? DEMO_MATCH_FMI : DEMO_MATCHS.find((m) => m.id === id),
    }),

  // Scouting
  rapports: (clubId?: string) =>
    req<RapportScouting[]>(`/scouting${clubId ? `?clubId=${clubId}` : ""}`, {
      fallback: [DEMO_RAPPORT],
    }),
  // Un club sans rapport renvoie un 404 -> on traite ca comme "pas de
  // rapport" (null), surtout pas comme une erreur qui casse la page club.
  rapportClub: (clubId: string) =>
    req<RapportScouting | null>(`/scouting/club/${clubId}`, {
      fallback: clubId === "neuv" ? (DEMO_RAPPORT as any) : (null as any),
    }),

  // Classement
  classement: () =>
    req<LigneClassement[]>("/classement", { fallback: DEMO_CLASSEMENT }),

  // Entrainements
  entrainements: (equipeId?: string) =>
    req<any[]>(`/entrainements${equipeId ? `?equipeId=${equipeId}` : ""}`, {
      fallback: [],
    }),

  // Blessures
  blessures: (joueurId?: string) =>
    req<any[]>(`/blessures${joueurId ? `?joueurId=${joueurId}` : ""}`, {
      fallback: [],
    }),

  // Stats agregees
  bilan: (clubId: string) =>
    req<any>(`/stats/bilan/${clubId}`, { fallback: null }),
  statsEffectif: (clubId: string) =>
    req<any>(`/stats/effectif/${clubId}`, { fallback: null }),

  /* ----------------------------- MUTATIONS ------------------------------- */
  // (necessitent le backend ; pas de fallback)

  updateJoueur: (id: string, body: Json) =>
    req<Joueur>(`/joueurs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  createJoueur: (body: Json) =>
    req<Joueur>("/joueurs", { method: "POST", body: JSON.stringify(body) }),
  deleteJoueur: (id: string) =>
    req<{ ok: boolean }>(`/joueurs/${id}`, { method: "DELETE" }),

  createEntrainement: (body: Json) =>
    req<any>("/entrainements", { method: "POST", body: JSON.stringify(body) }),
  updateEntrainement: (id: string, body: Json) =>
    req<any>(`/entrainements/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteEntrainement: (id: string) =>
    req<any>(`/entrainements/${id}`, { method: "DELETE" }),

  createBlessure: (body: Json) =>
    req<any>("/blessures", { method: "POST", body: JSON.stringify(body) }),
  updateBlessure: (id: string, body: Json) =>
    req<any>(`/blessures/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteBlessure: (id: string) =>
    req<any>(`/blessures/${id}`, { method: "DELETE" }),

  updateMatch: (id: string, body: Json) =>
    req<Match>(`/matchs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  createMatch: (body: Json) =>
    req<Match>("/matchs", { method: "POST", body: JSON.stringify(body) }),

  updateRapport: (id: string, body: Json) =>
    req<RapportScouting>(`/scouting/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  // Import FMI (upload multipart). On n'envoie pas de Content-Type :
  // le navigateur fixe la boundary multipart lui-meme.
  // recompute=false : on n'effectue pas la reconstruction effectifs/classement
  // a chaque fichier (utile en lot, on appelle rebuildDerivation() a la fin).
  importFmi: async (file: File, recompute = true) => {
    const fd = new FormData();
    fd.append("file", file);
    const q = recompute ? "" : "?recompute=false";
    // ATTENTION : on n'ajoute PAS de Content-Type manuel. Pour un upload
    // multipart/form-data, le browser le fait lui-meme avec le boundary
    // genere. Ajouter un Content-Type ici casserait l'upload.
    // Par contre on injecte le JWT, sinon le JwtAuthGuard global
    // (depuis maj 37) rejette en 401.
    const token = await getAuthToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${API_URL}/fmi/import${q}`, {
      method: "POST", body: fd, headers,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Import FMI echoue (${res.status}). ${txt}`);
    }
    return res.json();
  },

  // Import d'un lot complet (dossier) en une requete. Le backend importe puis
  // recalcule effectifs + classement une seule fois.
  importFmiBatch: async (files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    const token = await getAuthToken();
    const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
    const res = await fetch(`${API_URL}/fmi/import-batch`, {
      method: "POST", body: fd, headers,
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Import lot echoue (${res.status}). ${txt}`);
    }
    return res.json();
  },

  // Reconstruit manuellement effectifs (tous clubs) + classement.
  rebuildDerivation: () =>
    req<any>("/derivation/rebuild", { method: "POST" }),

  /* ---- Arbitres ---- */
  arbitres: () => req<any[]>("/arbitres", { fallback: [] }),
  arbitre: (id: string) => req<any>(`/arbitres/${id}`, { fallback: null }),
  arbitresForMatch: (matchId: string) =>
    req<any[]>(`/arbitres/match/${matchId}`, { fallback: [] }),
  createArbitre: (body: Json) =>
    req<any>("/arbitres", { method: "POST", body: JSON.stringify(body) }),
  linkArbitre: (body: Json) =>
    req<any>("/arbitres/link", { method: "POST", body: JSON.stringify(body) }),
  updateArbitreLink: (linkId: string, body: Json) =>
    req<any>(`/arbitres/link/${linkId}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteArbitreLink: (linkId: string) =>
    req<any>(`/arbitres/link/${linkId}`, { method: "DELETE" }),

  // Suppression de match (CRUD complet expose)
  deleteMatch: (id: string) =>
    req<{ ok: boolean }>(`/matchs/${id}`, { method: "DELETE" }),

  /* ---- Analyse equipe ---- */
  analyseClub: (clubId: string) =>
    req<any>(`/analyse/club/${clubId}`, { fallback: null }),

  /* ---- Saisons ---- */
  saisons: () => req<any[]>("/saisons", { fallback: [] }),
  saisonActive: () => req<any>("/saisons/active", { fallback: null }),
  activerSaison: (id: string) =>
    req<any>(`/saisons/${id}/activer`, { method: "PATCH" }),
  creerSaison: (body: { nom: string; anneeDebut: number; actif?: boolean }) =>
    req<any>("/saisons", { method: "POST", body: JSON.stringify(body) }),
  /** clubId optionnel : limite le clone aux equipes de ce club (sinon tous les clubs). */
  autoCloneSaison: (id: string, clubId?: string) =>
    req<any>(
      `/saisons/${id}/auto-clone${clubId ? `?clubId=${encodeURIComponent(clubId)}` : ""}`,
      { method: "POST" },
    ),

  /* ---- Equipes ---- */
  equipes: (filtres?: string | { clubId?: string; saisonId?: string }) => {
    const qs = new URLSearchParams();
    if (typeof filtres === "string") {
      if (filtres) qs.set("clubId", filtres);
    } else if (filtres) {
      if (filtres.clubId) qs.set("clubId", filtres.clubId);
      if (filtres.saisonId) qs.set("saisonId", filtres.saisonId);
    }
    const s = qs.toString();
    return req<any[]>(`/equipes${s ? `?${s}` : ""}`, { fallback: [] });
  },

  /** Effectif d'une equipe avec stats filtrees sur ses propres matchs
   *  (matchs, buts, cartons...) et scoreForme global (toutes equipes). */
  effectifEquipe: (equipeId: string) =>
    req<any[]>(`/joueurs/effectif?equipeId=${equipeId}`, { fallback: [] }),

  /* ---- Auth ---- */
  authLogin: (login: string, password: string) =>
    req<{ token: string; user: any }>("/auth/login", {
      method: "POST",
      body: JSON.stringify({ login, password }),
    }),
  authMe: () => req<any>("/auth/me"),
  authChangePassword: (oldPassword: string, newPassword: string) =>
    req<any>("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ oldPassword, newPassword }),
    }),

  /* ---- Utilisateurs (admin) ---- */
  utilisateurs: () => req<any[]>("/utilisateurs", { fallback: [] }),
  createUtilisateur: (body: Json) =>
    req<any>("/utilisateurs", { method: "POST", body: JSON.stringify(body) }),
  updateUtilisateur: (id: string, body: Json) =>
    req<any>(`/utilisateurs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteUtilisateur: (id: string) =>
    req<any>(`/utilisateurs/${id}`, { method: "DELETE" }),

  /* ---- Joueurs : recherche + attache + creation dans equipe ---- */
  /** Recherche un joueur par nom dans toute la base (au moins 2 lettres). */
  searchJoueurs: (q: string) =>
    req<any[]>(`/joueurs/search?q=${encodeURIComponent(q)}`, { fallback: [] }),
  /** Attache un joueur existant a une equipe. */
  attachJoueur: (equipeId: string, joueurId: string) =>
    req<any>(`/joueurs/equipe/${equipeId}/attach/${joueurId}`, { method: "POST" }),
  /** Detache un joueur d'une equipe (le joueur reste en base). */
  detachJoueur: (equipeId: string, joueurId: string) =>
    req<any>(`/joueurs/equipe/${equipeId}/attach/${joueurId}`, { method: "DELETE" }),
  /** Cree un joueur ET l'attache directement a l'equipe. */
  createJoueurDansEquipe: (equipeId: string, body: Json) =>
    req<any>(`/joueurs/equipe/${equipeId}/create`, {
      method: "POST", body: JSON.stringify(body),
    }),
  /** Stats joueurs DU CHAMPIONNAT (pas globales). */
  joueursChampionnat: (equipeId: string) =>
    req<any[]>(`/joueurs/championnat?equipeId=${equipeId}`, { fallback: [] }),

  /* ---- Equipes : clone saison ---- */
  /** Clone toutes les equipes d'un club d'une saison vers une autre. */
  cloneEquipesSaison: (body: { clubId: string; fromSaisonId: string; toSaisonId: string }) =>
    req<{ creees: number; existaient: number }>("/equipes/clone-saison", {
      method: "POST", body: JSON.stringify(body),
    }),
};
