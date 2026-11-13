import { describe, expect, it } from "vitest";

import { dateHeureJournal, estAlerte, libelleAction, lireCible, resumeDetails } from "@/features/audit/lib/journal";

describe("journal d'audit (mise en forme)", () => {
  it("libelle connu, sinon l'action brute", () => {
    expect(libelleAction("connexion.echec")).toBe("Échec de connexion");
    expect(libelleAction("inconnue.x")).toBe("inconnue.x");
    expect(estAlerte("alerte.export_massif")).toBe(true);
    expect(estAlerte("export.pptx")).toBe(false);
  });

  it("détails : motif d'échec, nombres d'alerte, champs modifiés", () => {
    expect(resumeDetails({ action: "connexion.echec", details: { motif: "login_inconnu" } })).toBe("identifiant inconnu");
    expect(resumeDetails({ action: "alerte.consultations_massives", details: { nombre: 60, fenetreMin: 10, seuil: 60 } }))
      .toBe("60 en 10 min (seuil 60)");
    expect(resumeDetails({ action: "compte.modification", details: { champs: ["prenom", "equipeIds"] } })).toBe("champs : prenom, equipeIds");
    expect(resumeDetails({ action: "joueur.recherche_avancee", details: { saisonId: "s25", resultats: 7 } })).toBe("7 joueur(s) trouvé(s)");
    expect(libelleAction("alerte.recherches_massives")).toBe("ALERTE : recherches avancées en série");
    expect(resumeDetails({ action: "calendrier.synchronisation", details: { source: "fichier", crees: 5, modifies: 1, disparus: 0 } }))
      .toBe("5 ajouté(s), 1 modifié(s), 0 disparu(s) (fichier déposé)");
    expect(libelleAction("calendrier.synchronisation")).toBe("Synchronisation du calendrier FFF");
    expect(resumeDetails({ action: "connexion.reussie", details: null })).toBe("");
  });

  it("date a l'heure de Paris ; cible lue", () => {
    expect(dateHeureJournal("2026-10-16T06:05:00.000Z")).toBe("16/10/2026 08:05");
    expect(lireCible("joueur:abc-1")).toEqual({ type: "joueur", id: "abc-1" });
    expect(lireCible(null)).toBeNull();
  });
});
