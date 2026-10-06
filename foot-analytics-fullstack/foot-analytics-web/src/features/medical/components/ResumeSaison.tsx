// src/features/medical/components/ResumeSaison.tsx
//
// MEDICAL SUR UNE SAISON PRECEDENTE : le resume des blessures de la saison (voir lib/resume-blessures.ts) : combien de blessures,
// quels joueurs, quels endroits, quels mois, combien de jours manques. La fatigue est un instantane du moment (4 dernieres
// semaines) : elle n'existe que sur la saison en cours, donc n'apparait pas ici. Le detail des blessures, avec leur saisie
// (corriger un historique), reste en bas de page.

import { HeartPulse } from "lucide-react";

import type { Saison } from "@/shared/lib/types";

import { resumerBlessures } from "../lib/resume-blessures";
import { BlessuresEditeur } from "./BlessuresEditeur";
import { BlessuresParMois, JoueursTouches, Kpi, RepartitionBarres, Rechutes } from "./ResumeBlessuresView";

interface Props {
  saison: Saison;
  effectif: any[];
  blessures: any[];
  noms: Map<string, string>;
  maintenant: number;
}

export function ResumeSaison({ saison, effectif, blessures, noms, maintenant }: Props) {
  const resume = resumerBlessures(blessures, saison.anneeDebut, maintenant, noms);

  return (
    <>
      <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Chiffres cles">
        <Kpi testid="kpi-blessures" label="Blessures" valeur={resume.total} note={resume.total ? `${resume.retablies} retablie${resume.retablies > 1 ? "s" : ""}` : "sur la saison"} />
        <Kpi testid="kpi-joueurs" label="Joueurs touches" valeur={resume.joueursTouches} suffixe={effectif.length ? `/ ${effectif.length}` : undefined}
          note={effectif.length && resume.total ? `${Math.round((resume.joueursTouches / effectif.length) * 100)} % de l'effectif` : undefined} />
        <Kpi testid="kpi-jours" label="Jours manques" valeur={resume.joursManques} note="cumul sur la saison" />
        <Kpi testid="kpi-duree" label="Duree moyenne" valeur={resume.dureeMoyenne ?? "—"} suffixe={resume.dureeMoyenne !== null ? "j" : undefined}
          note={resume.plusLongue ? `la plus longue : ${resume.plusLongue.jours} j (${resume.plusLongue.localisation})` : "blessures terminees"} />
        <Kpi testid="kpi-en-cours" label="Non cloturees" valeur={resume.enCours} ton={resume.enCours > 0 ? "amber" : "neutre"} note="sans date de retour" />
      </section>

      {resume.total === 0 ? (
        <section className="panel p-8 text-center" data-testid="medical-vide">
          <HeartPulse size={22} className="mx-auto mb-2 text-muted" aria-hidden />
          <div className="mb-1 text-sm text-ink">Aucune blessure enregistree sur la saison {saison.nom}.</div>
          <p className="mx-auto max-w-md text-xs text-faint">
            {effectif.length === 0
              ? "Cette equipe n'a pas d'effectif sur la saison : importez des feuilles de match ou ajoutez des joueurs."
              : "Bonne nouvelle, ou rien n'a ete saisi : une blessure peut etre ajoutee ci-dessous."}
          </p>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Bloc titre="Ou" aide="nombre de blessures et jours manques par localisation" testid="par-localisation">
              <RepartitionBarres lignes={resume.parLocalisation} vide="Aucune localisation renseignee." />
              {resume.parGravite.length > 0 && (
                <p className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line pt-3 text-[11px] text-muted">
                  Gravite : {resume.parGravite.map((g) => <span key={g.cle} className="badge !text-[10px]">{g.libelle} · {g.n}</span>)}
                </p>
              )}
            </Bloc>
            <Bloc titre="Quand" aide="blessures par mois, d'aout a juillet" testid="par-mois">
              <BlessuresParMois mois={resume.parMois} />
            </Bloc>
          </div>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <Bloc titre="Les plus touches" aide="blessures et jours manques sur la saison" testid="joueurs-touches">
              <JoueursTouches joueurs={resume.parJoueur} />
            </Bloc>
            <Bloc titre="Rechutes" aide="meme joueur, meme endroit" testid="rechutes">
              <Rechutes rechutes={resume.rechutes} />
            </Bloc>
          </div>
        </>
      )}

      {/* Le detail, avec la saisie : corriger l'historique d'une blessure. */}
      <BlessuresEditeur joueurs={effectif as any} initialBlessures={blessures as any} titre={`Blessures de la saison ${saison.nom}`} />

      <p className="px-1 text-[11px] text-faint">
        La fatigue de l&apos;effectif (charge d&apos;entrainement et de match) n&apos;est suivie que sur la saison en cours : elle apparait sur cette page
        quand vous revenez a la saison en cours.
      </p>
    </>
  );
}

function Bloc({ titre, aide, children, testid }: { titre: string; aide?: string; children: React.ReactNode; testid?: string }) {
  return (
    <section className="panel p-5" data-testid={testid} aria-label={titre}>
      <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="h-section">{titre}</h2>
        {aide && <span className="text-[11px] text-faint">{aide}</span>}
      </div>
      {children}
    </section>
  );
}
