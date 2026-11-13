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
  "connexion.echec": "Échec de connexion",
  "connexion.verrouillage": "Compte verrouillé (échecs)",
  "session.rejeu": "Jeton rejoué : sessions révoquées",
  "session.deconnexion_partout": "Déconnexion de tous les appareils",
  "compte.creation": "Compte créé",
  "compte.modification": "Compte modifié",
  "compte.suppression": "Compte supprimé",
  "compte.desactivation": "Compte désactivé",
  "compte.reactivation": "Compte réactivé",
  "compte.desactivation_inactivite": "Compte désactivé (12 mois sans connexion)",
  "compte.mot_de_passe_reinitialise": "Mot de passe réinitialisé",
  "compte.mot_de_passe_change": "Mot de passe changé",
  "compte.cgu_acceptées": "Conditions d'utilisation acceptées",
  "medical.lecture": "Données médicales consultées",
  "medical.ecriture": "Données médicales modifiées",
  "export.pptx": "Export PowerPoint",
  "joueur.consultation_autre_club": "Fiche d'un joueur d'un autre club",
  "joueur.recherche_avancee": "Recherche avancée de joueurs",
  "fmi.import": "Import de feuille de match",
  "calendrier.synchronisation": "Synchronisation du calendrier FFF",
  "donnees.reinitialisation": "Données de démonstration rechargées",
  "alerte.consultations_massives": "ALERTE : consultations massives",
  "alerte.export_massif": "ALERTE : exports en série",
  "alerte.recherches_massives": "ALERTE : recherches avancées en série",
  "alerte.echecs_connexion": "ALERTE : échecs de connexion répétés",
};

const MOTIFS_ECHEC: Record<string, string> = {
  mot_de_passe: "mot de passe erroné",
  login_inconnu: "identifiant inconnu",
  verrouille: "compte verrouillé",
  compte_desactive: "compte désactivé",
  mot_de_passe_perime: "ancien mot de passe commun",
};

/** Filtres proposes : valeur envoyee a l'API (un prefixe suivi de * couvre une famille d'actions). */
export const CATEGORIES: { valeur: string; libelle: string }[] = [
  { valeur: "", libelle: "Tout" },
  { valeur: "alerte.*", libelle: "Alertes" },
  { valeur: "connexion.*", libelle: "Connexions" },
  { valeur: "compte.*", libelle: "Comptes" },
  { valeur: "medical.*", libelle: "Médical" },
  { valeur: "export.*", libelle: "Exports" },
  { valeur: "joueur.consultation_autre_club", libelle: "Fiches d'autres clubs" },
  { valeur: "joueur.recherche_avancee", libelle: "Recherches avancées" },
  { valeur: "fmi.*", libelle: "Imports FMI" },
  { valeur: "calendrier.*", libelle: "Calendriers FFF" },
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
  if (typeof d.resultats === "number") return `${d.resultats} joueur(s) trouvé(s)`;
  if (t.action === "calendrier.synchronisation" && typeof d.crees === "number") {
    return `${d.crees} ajouté(s), ${d.modifies ?? 0} modifié(s), ${d.disparus ?? 0} disparu(s) (${d.source === "fichier" ? "fichier déposé" : "adresse"})`;
  }
  if (typeof d.role === "string") return `rôle : ${d.role}`;
  return "";
}

/** "joueur:abc" -> { type: "joueur", id: "abc" } ; null si absent. */
export function lireCible(cible: string | null): { type: string; id: string } | null {
  if (!cible) return null;
  const i = cible.indexOf(":");
  return i < 0 ? { type: "", id: cible } : { type: cible.slice(0, i), id: cible.slice(i + 1) };
}
