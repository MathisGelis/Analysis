import { ReconstructionTacheService } from "@/features/derivation/reconstruction-tache.service";

/** Une reconstruction qu'on termine a la main. */
function fausseDerivation() {
  const appels: { finir: (r?: unknown) => void; echouer: (e: Error) => void }[] = [];
  const derivation = {
    rebuildAll: () => new Promise((finir, echouer) => appels.push({ finir: (r) => finir(r ?? { ok: true, joueurs: 3, classement: 2 }), echouer })),
  };
  return { derivation, appels };
}
const attendre = () => new Promise((r) => setImmediate(r));

describe("reconstruction en tache de fond", () => {
  it("rend la main tout de suite, puis l'etat passe a terminee avec le resultat", async () => {
    const { derivation, appels } = fausseDerivation();
    const taches = new ReconstructionTacheService(derivation as any);
    const t = taches.lancer();
    expect(t).toMatchObject({ statut: "en_cours", resultat: null });
    appels[0].finir();
    await attendre();
    expect(taches.etat(t.id)).toMatchObject({ statut: "terminee", resultat: { joueurs: 3, classement: 2 }, erreur: null });
    expect(taches.etat(t.id)!.fin).not.toBeNull();
    expect(taches.etat("inconnue")).toBeNull();
  });

  it("une demande pendant la reconstruction la rejoint, et la relance UNE fois a la fin (feuilles importees entre-temps)", async () => {
    const { derivation, appels } = fausseDerivation();
    const taches = new ReconstructionTacheService(derivation as any);
    const t = taches.lancer();
    expect(taches.lancer().id).toBe(t.id);
    expect(taches.lancer().id).toBe(t.id);
    appels[0].finir();
    await attendre();
    expect(appels).toHaveLength(2);                      // relancee une seule fois, malgre deux demandes
    expect(taches.etat(t.id)!.statut).toBe("en_cours");
    appels[1].finir({ ok: true, joueurs: 4, classement: 2 });
    await attendre();
    expect(taches.etat(t.id)).toMatchObject({ statut: "terminee", resultat: { joueurs: 4 } });
    // Une nouvelle demande apres la fin : une nouvelle tache.
    expect(taches.lancer().id).not.toBe(t.id);
  });

  it("un echec est rapporte avec son message, et n'empeche pas d'en relancer une", async () => {
    const { derivation, appels } = fausseDerivation();
    const taches = new ReconstructionTacheService(derivation as any);
    const t = taches.lancer();
    appels[0].echouer(new Error("base injoignable"));
    await attendre();
    expect(taches.etat(t.id)).toMatchObject({ statut: "echec", erreur: "base injoignable" });
    expect(taches.lancer().statut).toBe("en_cours");
  });
});
