// src/features/audit/lib/journal.ts
//
// Journal d'audit (administration) : libelles des actions, categories de filtre et mise en forme (fonctions pures).

export interface TraceAudit {
  id: string;
  le: string;
  action: string;
  utilisateurId: string | null;
  role: string | null;
  clubId: string | null;
  cible: string | null;
  cibleClubId: string | null;
  details: Record<string, unknown> | null;
  ip: string | null;
}

export interface PageJournal { total: number; page: number; parPage: number; items: TraceAudit[] }

const LIBELLES: Record<string, string> = {
  "connexion.reussie": "Connexion",
  "connexion.echec": "Echec de connexion",
  "connexion.verrouillage": "Compte verrouille (echecs)",
  "session.rejeu": "Jeton rejoue : sessions revoquees",
  "session.deconnexion_partout": "Deconnexion de tous les appareils",
  "compte.creation": "Compte cree",
  "compte.modification": "Compte modifie",
  "compte.suppression": "Compte supprime",
  "compte.desactivation": "Compte desactive",
  "compte.reactivation": "Compte reactive",
  "compte.desactivation_inactivite": "Compte desactive (12 mois sans connexion)",
  "compte.mot_de_passe_reinitialise": "Mot de passe reinitialise",
  "compte.mot_de_passe_change": "Mot de passe change",
  "compte.cgu_acceptees": "Conditions d'utilisation acceptees",
  "medical.lecture": "Donnees medicales consultees",
  "medical.ecriture": "Donnees medicales modifiees",
  "export.pptx": "Export PowerPoint",
  "joueur.consultation_autre_club": "Fiche d'un joueur d'un autre club",
  "fmi.import": "Import de feuille de match",
  "donnees.reinitialisation": "Donnees de demonstration rechargees",
  "alerte.consultations_massives": "ALERTE : consultations massives",
  "alerte.export_massif": "ALERTE : exports en serie",
  "alerte.echecs_connexion": "ALERTE : echecs de connexion repetes",
};

const MOTIFS_ECHEC: Record<string, string> = {
  mot_de_passe: "mot de passe errone",
  login_inconnu: "identifiant inconnu",
  verrouille: "compte verrouille",
  compte_desactive: "compte desactive",
  mot_de_passe_perime: "ancien mot de passe commun",
};

/** Filtres proposes : valeur envoyee a l'API (un prefixe suivi de * couvre une famille d'actions). */
export const CATEGORIES: { valeur: string; libelle: string }[] = [
  { valeur: "", libelle: "Tout" },
  { valeur: "alerte.*", libelle: "Alertes" },
  { valeur: "connexion.*", libelle: "Connexions" },
  { valeur: "compte.*", libelle: "Comptes" },
  { valeur: "medical.*", libelle: "Medical" },
  { valeur: "export.*", libelle: "Exports" },
  { valeur: "joueur.consultation_autre_club", libelle: "Fiches d'autres clubs" },
  { valeur: "fmi.*", libelle: "Imports FMI" },
];

export function libelleAction(action: string): string {
  return LIBELLES[action] ?? action;
}

export const estAlerte = (action: string): boolean => action.startsWith("alerte.");

/** "16/10/2026 08:05" (heure de Paris). */
export function dateHeureJournal(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Les details lisibles d'une trace (motif d'echec, nombres d'une alerte...). */
export function resumeDetails(t: Pick<TraceAudit, "action" | "details">): string {
  const d = t.details ?? {};
  if (estAlerte(t.action) && typeof d.nombre === "number") return `${d.nombre} en ${d.fenetreMin} min (seuil ${d.seuil})`;
  if (typeof d.motif === "string") return MOTIFS_ECHEC[d.motif] ?? d.motif;
  if (Array.isArray(d.champs)) return `champs : ${d.champs.join(", ")}`;
  if (typeof d.pages === "number") return `${d.pages} page(s)`;
  if (typeof d.role === "string") return `role : ${d.role}`;
  return "";
}

/** "joueur:abc" -> { type: "joueur", id: "abc" } ; null si absent. */
export function lireCible(cible: string | null): { type: string; id: string } | null {
  if (!cible) return null;
  const i = cible.indexOf(":");
  return i < 0 ? { type: "", id: cible } : { type: cible.slice(0, i), id: cible.slice(i + 1) };
}
