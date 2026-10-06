// src/features/medical/components/MedicalPage.tsx
//
// MEDICAL : le resume des blessures de la saison choisie pour l'equipe choisie (voir lib/resume-blessures.ts) : combien de
// blessures, quels joueurs, quels endroits, quels mois, combien de jours manques, qui est indisponible en ce moment.
// SAISON-SENSITIVE : une blessure appartient a la saison ou elle commence (aout -> juillet), donc le resume se lit aussi sur
// une saison passee. La fatigue de l'effectif ne vit plus ici : elle se lit dans Effectif (tri par fatigue) et sur la fiche
// de chaque joueur. Le detail des blessures, avec leur saisie, reste en bas de page.

import Link from "next/link";
import { HeartPulse } from "lucide-react";

import { api } from "@/shared/lib/api";
import { resolveEquipePropre } from "@/features/equipes/lib/resolve-equipe-propre";

import { blessuresDeLaSaison, fenetreSaison, resumerBlessures } from "../lib/resume-blessures";
import { blessureEnCours } from "../lib/blessures";
import { BlessuresEditeur } from "./BlessuresEditeur";
import { BlessuresParMois, IndisponiblesDuMoment, JoueursTouches, Kpi, RepartitionBarres, Rechutes } from "./ResumeBlessuresView";

export default async function Medical() {
  const [equipes, saisons] = await Promise.all([api.equipes(), api.saisons()]);
  const { equipe, saison } = await resolveEquipePropre({ equipes, saisons });

  if (!equipe) {
    return (
      <div className="space-y-6 fade-up">
        <header>
          <div className="h-section">Medical</div>
          <h1 className="font-display text-2xl font-bold text-ink">Blessures de la saison</h1>
        </header>
        <section className="panel p-8 text-center">
          <div className="mb-2 text-sm text-muted">Aucune equipe selectionnee.</div>
          <p className="mx-auto max-w-sm text-xs text-faint">Choisissez une equipe dans le selecteur en bas a gauche pour voir ses blessures.</p>
        </section>
      </div>
    );
  }

  const [effectif, blessuresApi] = await Promise.all([api.effectifEquipe(equipe.id), api.blessures()]);
  const maintenant = Date.now();
  const saisonEnCours = saison?.actif === true;
  const noms = new Map<string, string>(effectif.filter((j: any) => j.id).map((j: any) => [j.id as string, `${j.prenom ?? ""} ${j.nom}`.trim()]));
  const blessures = saison
    ? blessuresDeLaSaison(blessuresApi as any[], new Set(noms.keys()), fenetreSaison(saison.anneeDebut), saisonEnCours)
    : [];
  const resume = saison ? resumerBlessures(blessures, saison.anneeDebut, maintenant, noms) : null;
  const indisponibles = saisonEnCours ? blessures.filter((b: any) => blessureEnCours(b)) : [];
  const libelleEquipe = `${equipe.nom}${equipe.competitionLibelle ? ` · ${equipe.competitionLibelle}` : ""}`;

  return (
    <div className="space-y-6 fade-up">
      <header>
        <div className="h-section">Medical</div>
        <h1 className="font-display text-2xl font-bold text-ink">{libelleEquipe}</h1>
        {saison && (
          <div className="mt-1 flex items-center gap-1.5 text-xs text-muted">
            <HeartPulse size={11} className="text-accent" aria-hidden />
            Resume des blessures de la saison <strong className="text-ink">{saison.nom}</strong>
            {!saisonEnCours && <span className="text-faint">· saison terminee</span>}
          </div>
        )}
      </header>

      {!saison || !resume ? (
        <section className="panel p-8 text-center">
          <HeartPulse size={22} className="mx-auto mb-2 text-muted" aria-hidden />
          <div className="text-sm text-muted">Aucune saison choisie : le resume porte sur une saison.</div>
        </section>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-5" aria-label="Chiffres cles">
            <Kpi testid="kpi-blessures" label="Blessures" valeur={resume.total} note={resume.total ? `${resume.retablies} retablie${resume.retablies > 1 ? "s" : ""}` : "sur la saison"} />
            <Kpi testid="kpi-joueurs" label="Joueurs touches" valeur={resume.joueursTouches} suffixe={effectif.length ? `/ ${effectif.length}` : undefined}
              note={effectif.length && resume.total ? `${Math.round((resume.joueursTouches / effectif.length) * 100)} % de l'effectif` : undefined} />
            <Kpi testid="kpi-jours" label="Jours manques" valeur={resume.joursManques} note="cumul sur la saison" />
            <Kpi testid="kpi-duree" label="Duree moyenne" valeur={resume.dureeMoyenne ?? "—"} suffixe={resume.dureeMoyenne !== null ? "j" : undefined}
              note={resume.plusLongue ? `la plus longue : ${resume.plusLongue.jours} j (${resume.plusLongue.localisation})` : "blessures terminees"} />
            <Kpi testid="kpi-en-cours" label={saisonEnCours ? "Indisponibles" : "Non cloturees"} valeur={resume.enCours} ton={resume.enCours > 0 ? (saisonEnCours ? "danger" : "amber") : "neutre"}
              note={saisonEnCours ? "en ce moment" : "sans date de retour"} />
          </section>

          {resume.total === 0 ? (
            <section className="panel p-8 text-center" data-testid="medical-vide">
              <HeartPulse size={22} className="mx-auto mb-2 text-muted" aria-hidden />
              <div className="mb-1 text-sm text-ink">Aucune blessure enregistree sur la saison {saison.nom}.</div>
              <p className="mx-auto max-w-md text-xs text-faint">
                {effectif.length === 0
                  ? "Cette equipe n'a pas d'effectif sur la saison : importez des feuilles de match ou ajoutez des joueurs."
                  : "Bonne nouvelle, ou rien n'a ete saisi : ajoutez une blessure ci-dessous pour suivre l'indisponibilite d'un joueur."}
              </p>
            </section>
          ) : (
            <>
              {saisonEnCours && (
                <Bloc titre="Indisponibles en ce moment" testid="indisponibles">
                  <IndisponiblesDuMoment blessures={indisponibles as any[]} noms={noms} maintenant={maintenant} />
                </Bloc>
              )}

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

          {/* Le detail, avec la saisie : ajouter, corriger, supprimer une blessure. */}
          <BlessuresEditeur joueurs={effectif as any} initialBlessures={blessures as any} titre={`Blessures de la saison ${saison.nom}`} />

          <p className="px-1 text-[11px] text-faint">
            La fatigue de l&apos;effectif (charge d&apos;entrainement et de match) se lit dans <Link href="/effectif" className="text-accent hover:underline">Effectif</Link> (tri par fatigue)
            et sur la fiche de chaque joueur.
          </p>
        </>
      )}
    </div>
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
