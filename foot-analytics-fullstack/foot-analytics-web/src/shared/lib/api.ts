// src/shared/lib/api.ts
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
} from "@/shared/data/demo";
import type { DynamiquePoule } from "@/features/analyse/lib/analyse-types";
import type { RapportPrematch } from "@/features/prematch/lib/prematch-types";
import { nomFichier, type PageExport } from "@/features/prematch/lib/export-pptx";
import type { SituationClub } from "@/features/analyse/lib/situation-types";
import type { PlanContreRealise } from "@/features/tactique/lib/plan-realise-types";
import type { FicheCoach } from "@/features/coachs/lib/fiche-coach-types";
import type { EntrainementDetail, EntrainementResume, EtatIa, ModeleListe } from "@/features/ia/lib/ia-types";

import type {
  Club, HistoriqueSaison, Joueur, LigneClassement, Match, MatchJoue, RapportScouting, TactiquePlan,
} from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

type Json = Record<string, any>;

/**
 * Erreur HTTP de l'API. `corps` contient le JSON renvoye par Nest quand il y
 * en a un (ex. { code: "BLESSURE_CHEVAUCHANTE", conflits: [...] } sur un 409),
 * pour que l'UI puisse reagir autrement que par un message generique.
 */
export class ApiError extends Error {
  constructor(
    readonly statut: number,
    readonly chemin: string,
    readonly corps: any = null,
  ) {
    super(`API ${statut} sur ${chemin}`);
    this.name = "ApiError";
  }
}

/**
 * Message a montrer a l'utilisateur pour une erreur d'appel : la raison donnee par l'API (ex. "Ce match est deja
 * programme a cette date") quand il y en a une, sinon le message technique.
 */
export function messageApi(e: unknown, defaut = "Erreur"): string {
  if (e instanceof ApiError) {
    const m = e.corps?.message;
    const texte = Array.isArray(m) ? m.join(" ; ") : typeof m === "string" ? m : "";
    if (texte) return texte;
  }
  return (e as Error)?.message || defaut;
}

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
 * Utilisee par authHeaders(), donc par fetchApi() : lectures JSON comme
 * uploads FormData. Sans ce token, les requetes sont rejetees avec 401
 * par le JwtAuthGuard global.
 */
async function getAuthToken(): Promise<string | undefined> {
  if (typeof window === "undefined") {
    try {
      const { cookies } = await import("next/headers");
      return (await cookies()).get("fa_token")?.value;
    } catch { return undefined; /* hors context server component */ }
  }
  return localStorage.getItem("fa.token") ?? undefined;
}

/** En-tetes d'authentification (vide si pas de token). */
async function authHeaders(): Promise<Record<string, string>> {
  const token = await getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Appel HTTP brut vers l'API : URL de base, JWT, cache desactive.
 * Renvoie la Response telle quelle (le statut est a la charge de l'appelant).
 *
 * Content-Type JSON par defaut, sauf pour un FormData : le navigateur doit
 * fixer lui-meme la boundary multipart, un Content-Type manuel casserait
 * l'upload.
 */
async function fetchApi(path: string, init: RequestInit = {}): Promise<Response> {
  const estFormData = typeof FormData !== "undefined" && init.body instanceof FormData;
  return fetch(`${API_URL}${path}`, {
    // Lectures cote serveur Next : toujours frais (pas de cache fige).
    cache: "no-store",
    ...init,
    headers: {
      ...(estFormData ? {} : { "Content-Type": "application/json" }),
      ...(await authHeaders()),
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    },
  });
}

/**
 * Lit le corps d'une reponse OK. Gere les cas sans JSON :
 *  - 204 (delete, no-content) -> undefined
 *  - corps vide (Nest qui renvoie `null` directement) -> `vide` (null par defaut)
 */
async function parseJson<T>(res: Response, vide: T | null = null): Promise<T> {
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  if (!text || !text.trim()) return vide as T;
  return JSON.parse(text) as T;
}

async function req<T>(
  path: string,
  opts: RequestInit & { fallback?: T } = {},
): Promise<T> {
  const { fallback, ...init } = opts;
  try {
    const res = await fetchApi(path, init);
    if (!res.ok) {
      const corps = await res.json().catch(() => null);
      throw new ApiError(res.status, path, corps);
    }
    return await parseJson<T>(res, fallback !== undefined ? fallback : null);
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

/** Upload multipart : erreur detaillee (statut + corps) si le backend refuse. */
async function uploadApi<T>(path: string, fd: FormData, libelle: string): Promise<T> {
  const res = await fetchApi(path, { method: "POST", body: fd });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`${libelle} echoue (${res.status}). ${txt}`);
  }
  return res.json() as Promise<T>;
}

/* ----------------------------- LECTURES ---------------------------------- */

export const api = {
  // Clubs
  clubs: () => req<Club[]>("/clubs", { fallback: DEMO_CLUBS }),
  /** Cree un club (un adversaire absent de la base). */
  createClub: (body: { nom: string; ville?: string }) =>
    req<Club>("/clubs", { method: "POST", body: JSON.stringify(body) }),
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

  /** Parcours du joueur par saison, avec ses stats (buts, passes, cartons...)
   *  par equipe et en total de saison. */
  joueurHistorique: (id: string) =>
    req<HistoriqueSaison[]>(`/joueurs/${id}/historique`, { fallback: [] }),

  /** Derniers matchs joues (feuille personnelle), restreints a une saison. */
  joueurMatchs: (id: string, saisonId?: string | null, limite = 8) => {
    const qs = new URLSearchParams({ limite: String(limite) });
    if (saisonId) qs.set("saisonId", saisonId);
    return req<MatchJoue[]>(`/joueurs/${id}/matchs?${qs}`, { fallback: [] });
  },

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
  /** Rapports de scouting, restreints a une saison quand `saisonId` est donne
   *  (un rapport est un document date : il appartient a la saison de sa date). */
  rapports: (clubId?: string, saisonId?: string | null) => {
    const qs = new URLSearchParams();
    if (clubId) qs.set("clubId", clubId);
    if (saisonId) qs.set("saisonId", saisonId);
    const s = qs.toString();
    return req<RapportScouting[]>(`/scouting${s ? `?${s}` : ""}`, {
      fallback: saisonId ? [] : [DEMO_RAPPORT],
    });
  },
  // Un club sans rapport renvoie un 404 -> on traite ca comme "pas de
  // rapport" (null), surtout pas comme une erreur qui casse la page club.
  rapportClub: (clubId: string, saisonId?: string | null) =>
    req<RapportScouting | null>(
      `/scouting/club/${clubId}${saisonId ? `?saisonId=${saisonId}` : ""}`, {
        fallback: clubId === "neuv" && !saisonId ? (DEMO_RAPPORT as any) : (null as any),
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
  bilan: (clubId: string, portee: { equipeId?: string | null; saisonId?: string | null } = {}) => {
    const qs = new URLSearchParams();
    if (portee.equipeId) qs.set("equipeId", portee.equipeId);
    if (portee.saisonId) qs.set("saisonId", portee.saisonId);
    const s = qs.toString();
    return req<any>(`/stats/bilan/${clubId}${s ? `?${s}` : ""}`, { fallback: null });
  },

  /* ----------------------------- MUTATIONS ------------------------------- */
  // (necessitent le backend ; pas de fallback)

  updateJoueur: (id: string, body: Json) =>
    req<Joueur>(`/joueurs/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  createJoueur: (body: Json) =>
    req<Joueur>("/joueurs", { method: "POST", body: JSON.stringify(body) }),
  /** Buts / passes saisis a la main pour CETTE equipe (donc cette saison) ;
   *  `null` efface la saisie et revient au calcul depuis les feuilles. */
  definirStatEquipe: (joueurId: string, equipeId: string,
    body: { buts?: number | null; passesDecisives?: number | null }) =>
    req<any>(`/joueurs/${joueurId}/stats-equipe/${equipeId}`, {
      method: "PUT", body: JSON.stringify(body),
    }),
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
  importFmi: (file: File, recompute = true) => {
    const fd = new FormData();
    fd.append("file", file);
    return uploadApi<any>(`/fmi/import${recompute ? "" : "?recompute=false"}`, fd, "Import FMI");
  },

  // Import d'un lot complet (dossier) en une requete. Le backend importe puis
  // recalcule effectifs + classement une seule fois.
  importFmiBatch: (files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return uploadApi<any>("/fmi/import-batch", fd, "Import lot");
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

  /* ---- Encadrement (coachs) d'un match ---- */
  coachsForMatch: (matchId: string) =>
    req<any[]>(`/coachs/match/${matchId}`, { fallback: [] }),
  /** Recherche d'entraineurs par nom (tous clubs) ; le club renvoye est le plus recent. */
  coachs: (q: string) => req<{ id: string; nom: string; prenom?: string | null; clubId?: string | null }[]>(
    `/coachs/recherche?q=${encodeURIComponent(q)}`, { fallback: [] }),
  /** Fiche d'un entraineur : bilan (sur une saison, sinon toute la carriere), par saison, parcours, matchs. */
  ficheCoach: (id: string, saisonId?: string | null) =>
    req<FicheCoach | null>(`/coachs/${id}/fiche${saisonId ? `?saisonId=${saisonId}` : ""}`, { fallback: null }),

  /* ---- Analyse equipe ---- */
  /** Rapport d'analyse d'un club, restreint a une equipe (donc une saison) ou a une saison. */
  analyseClub: (clubId: string, portee: { equipeId?: string | null; saisonId?: string | null } = {}) => {
    const qs = new URLSearchParams();
    if (portee.equipeId) qs.set("equipeId", portee.equipeId);
    if (portee.saisonId) qs.set("saisonId", portee.saisonId);
    const s = qs.toString();
    return req<any>(`/analyse/club/${clubId}${s ? `?${s}` : ""}`, { fallback: null });
  },
  /** Dynamique de toutes les equipes du championnat de l'equipe donnee (forme, series, sens). */
  dynamiquePoule: (equipeId: string) =>
    req<DynamiquePoule | null>(`/analyse/poule?equipeId=${equipeId}`, { fallback: null }),

  /** Dispositif joue (d'apres les matchs renseignes) et dernier onze d'un club, ou d'une de ses equipes. */
  situationClub: (clubId: string, portee: { equipeId?: string | null; saisonId?: string | null } = {}) => {
    const qs = new URLSearchParams();
    if (portee.equipeId) qs.set("equipeId", portee.equipeId);
    if (portee.saisonId) qs.set("saisonId", portee.saisonId);
    return req<SituationClub | null>(`/analyse/club/${clubId}/situation${qs.size ? `?${qs}` : ""}`, { fallback: null });
  },

  /** Rapport pre-match : mon equipe contre un club adverse (match optionnel, sinon le prochain programme). */
  prematch: (equipeId: string, adversaireId: string, matchId?: string | null) => {
    const qs = new URLSearchParams({ equipeId, adversaireId });
    if (matchId) qs.set("matchId", matchId);
    return req<RapportPrematch | null>(`/analyse/prematch?${qs}`, { fallback: null });
  },

  /** Les pages du rapport d'avant-match en PowerPoint (pour proposer le choix) ; vide si l'API ne repond pas. */
  pagesPrematch: () => req<PageExport[]>("/analyse/prematch/pages", { fallback: [] }),

  /** Rapport pre-match en PowerPoint (`.pptx`), limite aux pages `pages` : le fichier et le nom que propose le serveur. */
  exporterPrematch: async (equipeId: string, adversaireId: string, matchId: string | null, pages: string[]) => {
    const qs = new URLSearchParams({ equipeId, adversaireId, pages: pages.join(",") });
    if (matchId) qs.set("matchId", matchId);
    const chemin = `/analyse/prematch/export?${qs}`;
    const res = await fetchApi(chemin);
    if (!res.ok) throw new ApiError(res.status, chemin, await res.json().catch(() => null));
    return { fichier: await res.blob(), nom: nomFichier(res.headers.get("Content-Disposition")) };
  },

  /* ---- IA : entrainement et modeles de prediction (administrateur) ---- */
  iaEtat: () => req<EtatIa>("/ia/etat"),
  iaEntrainements: () => req<EntrainementResume[]>("/ia/entrainements"),
  iaEntrainement: (id: string) => req<EntrainementDetail>(`/ia/entrainements/${id}`),
  /** Progression et statut sans le resultat detaille : fait pour etre interroge chaque seconde. */
  iaResume: (id: string) => req<EntrainementResume>(`/ia/entrainements/${id}/resume`),
  iaLancer: (body: { optimiser?: boolean; saisonIds?: string[] }) =>
    req<EntrainementResume>("/ia/entrainements", { method: "POST", body: JSON.stringify(body) }),
  iaAnnuler: (id: string) => req<EntrainementResume>(`/ia/entrainements/${id}/annuler`, { method: "POST" }),
  iaModeles: () => req<ModeleListe[]>("/ia/modeles"),
  iaActiver: (id: string) => req<void>(`/ia/modeles/${id}/activer`, { method: "POST" }),
  iaDesactiver: () => req<void>("/ia/modeles/desactiver", { method: "POST" }),
  iaSupprimerModele: (id: string) => req<void>(`/ia/modeles/${id}`, { method: "DELETE" }),

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
   *  (matchs, buts, cartons...) et fatigue globale (toutes equipes). */
  effectifEquipe: (equipeId: string) =>
    req<any[]>(`/joueurs/effectif?equipeId=${equipeId}`, { fallback: [] }),

  /* ---- Tactique ---- */
  /** Plan de jeu de l'equipe (pour un match, ou plan courant) ; null s'il n'y en a pas. */
  tactique: (equipeId: string, matchId?: string | null) => {
    const qs = new URLSearchParams({ equipeId });
    if (matchId) qs.set("matchId", matchId);
    return req<TactiquePlan | null>(`/tactiques?${qs}`, { fallback: null });
  },
  /** Plan prepare contre feuille de match jouee : pour `matchId`, sinon le dernier match joue qui avait un plan. */
  planContreRealise: (equipeId: string, matchId?: string | null) => {
    const qs = new URLSearchParams({ equipeId });
    if (matchId) qs.set("matchId", matchId);
    return req<PlanContreRealise | null>(`/tactiques/comparaison?${qs}`, { fallback: null });
  },
  /** Enregistre le plan. Refus 422 (code REGLE_MUTATIONS) si plus de 6 mutes dont 2 hors delai. */
  enregistrerTactique: (plan: {
    equipeId: string; matchId?: string | null; formation: string; titulaires: (string | null)[];
    remplacants: string[]; capitaineId?: string | null; notes?: string | null;
  }) => req<TactiquePlan>("/tactiques", { method: "PUT", body: JSON.stringify(plan) }),
  supprimerTactique: (equipeId: string, matchId?: string | null) => {
    const qs = new URLSearchParams({ equipeId });
    if (matchId) qs.set("matchId", matchId);
    return req<{ ok: boolean; supprime: boolean }>(`/tactiques?${qs}`, { method: "DELETE" });
  },

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

  /** Admin : clones provisoires de la saison precedente devenus doublons de la vraie
   *  equipe. Simulation par defaut (`appliquer` = true pour fusionner). null si non admin. */
  reconcilierEquipes: (appliquer = false) =>
    req<any>(`/equipes/maintenance/reconcilier${appliquer ? "?appliquer=true" : ""}`, {
      method: "POST", fallback: null,
    }),

  /* ---- Equipes : clone saison ---- */
  /** Clone toutes les equipes d'un club d'une saison vers une autre. */
  cloneEquipesSaison: (body: { clubId: string; fromSaisonId: string; toSaisonId: string }) =>
    req<{ creees: number; existaient: number }>("/equipes/clone-saison", {
      method: "POST", body: JSON.stringify(body),
    }),
};
