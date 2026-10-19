"use client";
// src/features/recherche-joueurs/components/RechercheJoueursPage.tsx
//
// Recherche avancee de joueurs (scouting, recrutement) : « un attaquant qui a joue en U16 R2 la saison derniere et qui
// n'a pas de club cette saison ». Le formulaire est traduit en criteres (lib/recherche-joueurs.ts) et envoye en POST a
// l'API, qui cherche dans les feuilles de match importees, sans aucune donnee privee d'un club.
//
// Les criteres (identifiants et codes, jamais un nom) sont recopies dans l'URL : revenir d'une fiche joueur rouvre la
// meme recherche.

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Info, RotateCcw, Search, UserSearch } from "lucide-react";

import { api, messageApi } from "@/shared/lib/api";
import { Select, type OptionSelect } from "@/shared/ui/Select";
import { ClubBadge } from "@/features/clubs/components/ClubBadge";
import { useClubsParId } from "@/features/clubs/lib/clubs-context";

import {
  categoriesDe, changerSaison, depuisUrl, divisionsDe, formulaireInitial, libelleEquipe, libelleStatut, OPTIONS_MATCHS_MIN,
  OPTIONS_POSTE, OPTIONS_SITUATION, resumeCriteres, versCriteres, versUrl,
  type FormulaireRecherche, type OptionsRecherche, type ReponseRecherche, type ResultatRecherche, type SituationVoulue,
} from "../lib/recherche-joueurs";

export default function RechercheJoueursPage() {
  return (
    <Suspense fallback={null}>
      <Recherche />
    </Suspense>
  );
}

function Champ({ libelle, children }: { libelle: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="text-[11px] uppercase tracking-wider text-faint">{libelle}</span>
      {children}
    </label>
  );
}

function Recherche() {
  const params = useSearchParams();
  const clubs = useClubsParId();
  const [options, setOptions] = useState<OptionsRecherche | null>(null);
  const [form, setForm] = useState<FormulaireRecherche>(() => formulaireInitial(null));
  const [reponse, setReponse] = useState<{ form: FormulaireRecherche; donnees: ReponseRecherche } | null>(null);
  const [chargement, setChargement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  const nomClub = (id: string | null | undefined) => (id ? clubs.get(id)?.nom ?? null : null);

  async function lancer(f: FormulaireRecherche) {
    const criteres = versCriteres(f);
    if (!criteres) return;
    setChargement(true);
    setErreur(null);
    try {
      const donnees = await api.rechercheAvanceeJoueurs(criteres);
      setReponse({ form: f, donnees });
      // L'URL suit la recherche sans recharger la page (Next lit l'historique natif).
      const qs = versUrl(f);
      window.history.replaceState(null, "", `${window.location.pathname}${qs ? `?${qs}` : ""}`);
    } catch (e) {
      setErreur(messageApi(e, "Recherche impossible"));
    } finally {
      setChargement(false);
    }
  }

  // Options du formulaire, puis : la recherche de l'URL (retour d'une fiche joueur) est relancee ; sinon, les saisons
  // proposees par l'API (la precedente pour « a joue », l'actuelle pour la situation).
  useEffect(() => {
    let annule = false;
    api.optionsRechercheJoueurs()
      .then((o) => {
        if (annule) return;
        setOptions(o);
        const deLUrl = depuisUrl(new URLSearchParams(params.toString()), o);
        if (deLUrl) {
          setForm(deLUrl);
          void lancer(deLUrl);
        } else {
          setForm(formulaireInitial(o));
        }
      })
      .catch((e) => { if (!annule) setErreur(messageApi(e, "Recherche indisponible")); });
    return () => { annule = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const optionsSaisons: OptionSelect[] = useMemo(
    () => (options?.saisons ?? []).map((s) => ({ valeur: s.id, libelle: s.nom, detail: s.actuelle ? "saison actuelle" : undefined })),
    [options],
  );
  const optionsCategories: OptionSelect[] = useMemo(
    () => [{ valeur: "", libelle: "Toutes les categories" }, ...categoriesDe(options, form.saisonId).map((c) => ({ valeur: c, libelle: c }))],
    [options, form.saisonId],
  );
  const optionsDivisions: OptionSelect[] = useMemo(
    () => [{ valeur: "", libelle: "Toutes les divisions" }, ...divisionsDe(options, form.saisonId, form.categorie).map((d) => ({ valeur: d, libelle: d }))],
    [options, form.saisonId, form.categorie],
  );
  const optionsClubs: OptionSelect[] = useMemo(
    () => [{ valeur: "", libelle: "Tous les clubs" },
      ...[...clubs.values()].sort((a, b) => a.nom.localeCompare(b.nom)).map((c) => ({ valeur: c.id, libelle: c.nom }))],
    [clubs],
  );
  const optionsCibles: OptionSelect[] = useMemo(
    () => [{ valeur: "", libelle: "Aucune" }, ...optionsSaisons],
    [optionsSaisons],
  );

  const maj = (champ: Partial<FormulaireRecherche>) => setForm((f) => ({ ...f, ...champ }));
  const avecCible = !!reponse?.form.situationSaisonId;
  const nomSaison = (id: string) => options?.saisons.find((s) => s.id === id)?.nom ?? "";

  return (
    <div className="space-y-6 fade-up">
      <header>
        <div className="h-section flex items-center gap-2"><UserSearch size={11} className="text-accent" />Scouting · recrutement</div>
        <h1 className="font-display text-2xl font-bold text-ink">Recherche de joueurs</h1>
        <p className="mt-1 max-w-2xl text-xs text-muted">
          Par poste, niveau joue une saison et situation une autre saison : par exemple un attaquant qui a joue en U16 R2
          la saison derniere et qui n'a pas de club connu cette saison.
        </p>
      </header>

      <form
        className="panel p-5 space-y-5"
        onSubmit={(e) => { e.preventDefault(); void lancer(form); }}
        aria-label="Criteres de recherche"
      >
        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="h-section mb-2">Le joueur</legend>
          <Champ libelle="Poste">
            <Select ariaLabel="Poste" valeur={form.poste} options={OPTIONS_POSTE} onChange={(v) => maj({ poste: v })} data-testid="rj-poste" />
          </Champ>
          <Champ libelle="Matchs joues">
            <Select ariaLabel="Matchs joues minimum" valeur={form.minMatchs} options={OPTIONS_MATCHS_MIN} onChange={(v) => maj({ minMatchs: v })} />
          </Champ>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="h-section mb-2">A joue</legend>
          <Champ libelle="Saison">
            <Select ariaLabel="Saison jouee" valeur={form.saisonId} options={optionsSaisons} placeholder="Choisir une saison"
              onChange={(v) => setForm((f) => changerSaison(f, v, options))} data-testid="rj-saison" />
          </Champ>
          <Champ libelle="Categorie">
            <Select ariaLabel="Categorie" valeur={form.categorie} options={optionsCategories}
              onChange={(v) => setForm((f) => ({ ...f, categorie: v, division: divisionsDe(options, f.saisonId, v).includes(f.division) ? f.division : "" }))}
              data-testid="rj-categorie" />
          </Champ>
          <Champ libelle="Division">
            <Select ariaLabel="Division" valeur={form.division} options={optionsDivisions} onChange={(v) => maj({ division: v })} data-testid="rj-division" />
          </Champ>
          <Champ libelle="Club">
            <Select ariaLabel="Club" valeur={form.clubId} options={optionsClubs} recherche onChange={(v) => maj({ clubId: v })} />
          </Champ>
        </fieldset>

        <fieldset className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="h-section mb-2">Et sa situation</legend>
          <Champ libelle="Saison">
            <Select ariaLabel="Saison de la situation" valeur={form.situationSaisonId} options={optionsCibles}
              onChange={(v) => maj({ situationSaisonId: v, ...(v ? {} : { situation: "indifferent" as SituationVoulue }) })}
              data-testid="rj-cible" />
          </Champ>
          <Champ libelle="Situation">
            <Select ariaLabel="Situation" valeur={form.situation} options={OPTIONS_SITUATION} disabled={!form.situationSaisonId}
              onChange={(v) => maj({ situation: v as SituationVoulue })} data-testid="rj-situation" />
          </Champ>
        </fieldset>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" className="btn btn-primary text-sm" disabled={chargement || !form.saisonId} data-testid="rj-lancer">
            <Search size={14} /> {chargement ? "Recherche…" : "Rechercher"}
          </button>
          <button type="button" className="btn btn-ghost text-sm" onClick={() => setForm(formulaireInitial(options))}>
            <RotateCcw size={13} /> Reinitialiser
          </button>
        </div>

        <p className="panel-inset flex items-start gap-2 p-3 text-xs text-muted">
          <Info size={14} className="mt-0.5 shrink-0 text-sky" aria-hidden />
          <span>
            La recherche porte sur les feuilles de match importees dans l'application. « Sans club connu » veut dire : aucune
            feuille de match ni aucun effectif cette saison dans la base, pas une information de la Federation. Seules les
            donnees de championnat servent (jamais les donnees privees d'un club), et chaque recherche est tracee.
          </span>
        </p>
      </form>

      {erreur && <p role="alert" className="text-sm text-danger">{erreur}</p>}

      {reponse && (
        <section className="panel p-5 space-y-4" data-testid="rj-resultats" aria-live="polite">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-ink">
              {reponse.donnees.total} joueur{reponse.donnees.total > 1 ? "s" : ""}
            </h2>
            <span className="text-xs text-muted">{resumeCriteres(reponse.form, options, nomClub)}</span>
          </div>
          {reponse.donnees.total > reponse.donnees.resultats.length && (
            <p className="text-xs text-amber">
              Les {reponse.donnees.resultats.length} premiers (les plus utilises) sont affiches : affine les criteres pour voir les autres.
            </p>
          )}

          {reponse.donnees.resultats.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted">Aucun joueur ne correspond a ces criteres.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-fm table-fm-compact" data-testid="rj-table">
                <thead>
                  <tr>
                    <th>Joueur</th>
                    <th>Poste</th>
                    <th>Club · {nomSaison(reponse.form.saisonId)}</th>
                    <th className="text-right" title="Matchs joues">M</th>
                    <th className="text-right max-sm:hidden" title="Titularisations">Tit.</th>
                    <th className="text-right max-md:hidden">Min</th>
                    <th className="text-right">Buts</th>
                    {avecCible && <th>{nomSaison(reponse.form.situationSaisonId)}</th>}
                  </tr>
                </thead>
                <tbody>
                  {reponse.donnees.resultats.map((r) => <Ligne key={r.joueurId} r={r} avecCible={avecCible} nomClub={nomClub} />)}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function Ligne({ r, avecCible, nomClub }: {
  r: ResultatRecherche; avecCible: boolean; nomClub: (id: string | null | undefined) => string | null;
}) {
  const equipes = r.periode.equipes.map(libelleEquipe).join(", ");
  return (
    <tr>
      <td>
        <Link href={`/joueur/${r.joueurId}`} className="font-semibold text-ink hover:text-accent">
          {r.nom} {r.prenom ?? ""}
        </Link>
      </td>
      <td className="text-xs">
        {r.poste ?? "—"}
        {r.posteDeduit && <span className="ml-1 text-faint" title="Deduit des numeros portes">(n°)</span>}
      </td>
      <td>
        <div className="flex min-w-0 items-center gap-2">
          <ClubBadge clubId={r.periode.clubId} size={16} className="max-sm:hidden" />
          <span className="truncate text-xs">
            {nomClub(r.periode.clubId) ?? "Club inconnu"}
            {equipes && <span className="text-muted"> · {equipes}</span>}
          </span>
        </div>
      </td>
      <td className="text-right tabular-nums">{r.periode.matchs}</td>
      <td className="text-right tabular-nums max-sm:hidden">{r.periode.titularisations}</td>
      <td className="text-right tabular-nums max-md:hidden">{r.periode.minutes}</td>
      <td className="text-right tabular-nums">{r.periode.buts}</td>
      {avecCible && (
        <td className="text-xs">
          {!r.situation ? "—" : r.situation.statut === "sans_club" ? (
            <span className="badge badge-amber">{libelleStatut("sans_club")}</span>
          ) : (
            <span className="flex min-w-0 items-center gap-1.5">
              {r.situation.clubId && <ClubBadge clubId={r.situation.clubId} size={14} className="max-sm:hidden" />}
              <span className="truncate">
                {nomClub(r.situation.clubId) ?? libelleStatut(r.situation.statut)}
                {r.situation.equipe && <span className="text-muted"> · {libelleEquipe(r.situation.equipe)}</span>}
              </span>
            </span>
          )}
        </td>
      )}
    </tr>
  );
}
