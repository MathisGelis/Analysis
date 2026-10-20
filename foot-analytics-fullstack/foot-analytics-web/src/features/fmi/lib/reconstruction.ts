// src/features/fmi/lib/reconstruction.ts
//
// Reconstruction des effectifs et du classement en tache de fond : on la lance (POST /derivation/rebuild/tache), puis
// on relit son etat jusqu'a la fin. Une seule longue requete serait coupee au bout de 2 minutes par le relais Vercel
// -> API (502) alors que la reconstruction continue sur le serveur. Logique pure : les appels et l'attente sont injectes.

export interface ResultatReconstruction {
  ok?: boolean;
  joueurs?: number;
  classement?: number;
  [cle: string]: unknown;
}

export interface EtatReconstruction {
  id: string;
  statut: "en_cours" | "terminee" | "echec";
  resultat: ResultatReconstruction | null;
  erreur: string | null;
}

export interface OptionsSuivi {
  lancer: () => Promise<EtatReconstruction>;
  lire: (id: string) => Promise<EtatReconstruction>;
  attendre?: (ms: number) => Promise<void>;
  /** Intervalle entre deux lectures de l'etat. */
  intervalleMs?: number;
  /** Au-dela, on abandonne le suivi (la reconstruction, elle, continue sur le serveur). */
  delaiMaxMs?: number;
  maintenant?: () => number;
}

const pause = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Lance la reconstruction et rend son resultat quand elle est terminee ; une erreur si elle echoue ou tarde trop. */
export async function reconstruire(o: OptionsSuivi): Promise<ResultatReconstruction> {
  const attendre = o.attendre ?? pause;
  const intervalle = o.intervalleMs ?? 2_000;
  const delaiMax = o.delaiMaxMs ?? 15 * 60_000;
  const maintenant = o.maintenant ?? Date.now;
  const debut = maintenant();
  let etat = await o.lancer();
  while (etat.statut === "en_cours") {
    if (maintenant() - debut > delaiMax) {
      throw new Error("la reconstruction continue sur le serveur ; recharge la page dans quelques minutes");
    }
    await attendre(intervalle);
    etat = await o.lire(etat.id);
  }
  if (etat.statut === "echec") throw new Error(etat.erreur ?? "reconstruction echouee");
  return etat.resultat ?? {};
}
