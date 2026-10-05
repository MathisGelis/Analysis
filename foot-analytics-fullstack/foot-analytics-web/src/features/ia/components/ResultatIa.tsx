"use client";
// src/features/ia/components/ResultatIa.tsx
//
// Le resultat d'un entrainement : ce que l'IA a reussi (precision des compos, comparee a trois methodes simples), comment
// elle a progresse (courbe), ce qu'elle a appris (poids), si ses probabilites sont justes (calibration), ou elle se trompe,
// et les reglages retenus. Tout est mesure sur des matchs que l'IA n'avait pas encore vus au moment de les predire.

import { useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";

import {
  dureeFr, ecartPoints, LIBELLE_METHODE, LIBELLE_METHODE_COURT, libelleHyper, lignesDePoids, meilleureReference, METHODES, nombre, pct, verdict,
} from "@/features/ia/lib/ia-format";
import type { EntrainementDetail, Mesure, Methode } from "@/features/ia/lib/ia-types";

import { CalibrationIa } from "./CalibrationIa";
import { CourbeApprentissage } from "./CourbeApprentissage";
import { ErreursIa } from "./ErreursIa";
import { PoidsAppris } from "./PoidsAppris";

function Tuile({ label, valeur, aide, testid }: { label: string; valeur: string; aide?: string; testid?: string }) {
  return (
    <div className="stat-tile" data-testid={testid}>
      <div className="stat-label">{label}</div>
      <div className="stat-value mt-2 !text-[28px]">{valeur}</div>
      {aide && <div className="mt-1.5 text-xs text-muted">{aide}</div>}
    </div>
  );
}

function Bloc({ titre, aide, children, testid }: { titre: string; aide?: string; children: React.ReactNode; testid?: string }) {
  return (
    <section className="panel p-5" data-testid={testid} aria-label={titre}>
      <h2 className="font-display text-lg font-bold text-ink">{titre}</h2>
      {aide && <p className="mt-1 max-w-3xl text-xs text-muted">{aide}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function ResultatIa({ detail }: { detail: EntrainementDetail }) {
  const [mesure, setMesure] = useState<Mesure>("onze");
  const r = detail.resultat;
  if (!r) return null;

  const g = r.global;
  const ref = meilleureReference(g);
  const v = verdict(r);
  const lignesT = lignesDePoids(detail.catalogue.titularisation, r.poids.titularisation, detail.poidsInitiaux.titularisation);
  const lignesN = lignesDePoids(detail.catalogue.numeros, r.poids.numeros, detail.poidsInitiaux.numeros);
  const lignesS = lignesDePoids(detail.catalogue.systeme, r.poids.systeme, detail.poidsInitiaux.systeme);
  const meilleur = (cle: "onze" | "postes", source: typeof g): Methode | null => {
    const candidats = METHODES.filter((m) => source[m][cle] !== null);
    return candidats.length ? candidats.reduce((a, b) => ((source[b][cle] ?? 0) > (source[a][cle] ?? 0) ? b : a)) : null;
  };
  const nomSaison = (id: string) => r.saisons?.[id] ?? "Saison";
  const iconeVerdict = v.ton === "bon" ? CheckCircle2 : v.ton === "mauvais" ? AlertTriangle : Info;
  const Icone = iconeVerdict;

  return (
    <div className="space-y-6" data-testid="resultat-ia">
      <div className={`panel flex items-start gap-3 p-4 ${v.ton === "bon" ? "border-win/40" : v.ton === "mauvais" ? "border-danger/40" : ""}`} role="status" data-testid="verdict-ia">
        <Icone size={18} aria-hidden className={`mt-0.5 shrink-0 ${v.ton === "bon" ? "text-win" : v.ton === "mauvais" ? "text-danger" : "text-muted"}`} />
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">{v.texte}</p>
          <p className="mt-1 text-xs text-muted">
            Entraine en {dureeFr(r.dureeMs)} sur {r.donnees.feuilles} feuilles d'equipe ({r.donnees.etapes} semaines, {r.donnees.equipes} equipes
            {r.donnees.premiere && r.donnees.derniere ? `, du ${r.donnees.premiere} au ${r.donnees.derniere}` : ""}).
            Reglages retenus : {libelleHyper(r.hyper)}.
          </p>
          {r.alertes.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs text-amber">
              {r.alertes.map((a) => <li key={a}>{a}</li>)}
            </ul>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tuile testid="kpi-onze" label="Titulaires bien predits" valeur={pct(g.modele.onze)}
          aide={ref ? `${ecartPoints(g.modele.onze, ref.onze)} face au meilleur repere (${LIBELLE_METHODE[ref.methode].toLowerCase()})` : undefined} />
        <Tuile testid="kpi-postes" label="Postes exacts" valeur={pct(g.modele.postes)}
          aide={g.modele.nPostes > 0 ? `Sur ${g.modele.nPostes} feuilles aux numeros lisibles` : "Numeros non lisibles"} />
        <Tuile testid="kpi-parfaits" label="Onzes parfaits" valeur={`${g.modele.parfaits}`}
          aide={`sur ${g.modele.n} compositions predites`} />
        <Tuile testid="kpi-nouveaux" label="Joueurs jamais vus" valeur={pct(r.nouveaux)}
          aide="des titulaires reels etaient inconnus de leur equipe : imprevisibles" />
      </div>

      <Bloc titre="Comparaison avec des methodes simples" testid="comparaison-ia"
        aide="Sur exactement les memes matchs. 'Titulaires' : part des 11 titulaires reels predits. 'Postes' : part des 11 couples (numero, joueur) exacts.">
        <div className="overflow-x-auto">
          <table className="table-fm">
            <thead>
              <tr><th>Methode</th><th className="text-right">Titulaires</th><th className="text-right">Titulaires, dernieres semaines</th><th className="text-right">Postes</th><th className="text-right">Onzes parfaits</th></tr>
            </thead>
            <tbody>
              {METHODES.map((m) => (
                <tr key={m} className={m === "modele" ? "is-mine" : ""} data-testid={`methode-${m}`}>
                  <td className={m === "modele" ? "font-semibold text-ink" : "text-muted"}>{LIBELLE_METHODE[m]}</td>
                  <td className={`text-right font-mono ${meilleur("onze", g) === m ? "font-bold text-ink" : "text-muted"}`}>{pct(g[m].onze)}</td>
                  <td className={`text-right font-mono ${meilleur("onze", r.recent) === m ? "font-bold text-ink" : "text-muted"}`}>{pct(r.recent[m].onze)}</td>
                  <td className={`text-right font-mono ${meilleur("postes", g) === m ? "font-bold text-ink" : "text-muted"}`}>{pct(g[m].postes)}</td>
                  <td className="text-right font-mono text-muted">{g[m].parfaits}/{g[m].n}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloc>

      <Bloc titre="Courbe d'apprentissage" testid="courbe-ia"
        aide="Chaque semaine est predite avant d'etre decouverte, avec ce que l'IA avait appris des semaines precedentes. Plus la courbe de l'IA monte, plus elle apprend.">
        <div className="mb-3 flex gap-2" role="group" aria-label="Mesure affichee">
          {([["onze", "Titulaires predits"], ["postes", "Postes exacts"]] as const).map(([id, label]) => (
            <button key={id} type="button" aria-pressed={mesure === id} onClick={() => setMesure(id)}
              className={`btn text-xs ${mesure === id ? "btn-accent" : ""}`}>{label}</button>
          ))}
        </div>
        <CourbeApprentissage courbe={r.courbe} mesure={mesure} />
      </Bloc>

      {Object.keys(r.parSaison).length > 1 && (
        <Bloc titre="Par saison" aide="La precision de chaque methode, saison par saison (la premiere saison souffre du demarrage a froid).">
          <div className="overflow-x-auto">
            <table className="table-fm">
              <thead><tr><th>Saison</th><th className="text-right">Predictions</th>{METHODES.map((m) => <th key={m} className="text-right">{LIBELLE_METHODE_COURT[m]}</th>)}</tr></thead>
              <tbody>
                {Object.entries(r.parSaison).map(([id, notes]) => (
                  <tr key={id}>
                    <td className="font-semibold text-ink">{nomSaison(id)}</td>
                    <td className="text-right font-mono text-muted">{notes.modele.n}</td>
                    {METHODES.map((m) => <td key={m} className={`text-right font-mono ${meilleur("onze", notes) === m ? "font-bold text-ink" : "text-muted"}`}>{pct(notes[m].onze)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Bloc>
      )}

      <Bloc titre="Ce que l'IA a appris" testid="poids-ia"
        aide="Le poids de chaque indice dans sa decision. Elle part des reglages du moteur a regles et les corrige a chaque semaine, d'apres ses erreurs.">
        <div className="grid gap-8 lg:grid-cols-2">
          <PoidsAppris titre="Qui est titulaire ?" lignes={lignesT} />
          <div className="space-y-8">
            <PoidsAppris titre="Quel numero (quel poste) ?" lignes={lignesN} />
            {lignesS.length > 0 && <PoidsAppris titre="Quel dispositif ?" lignes={lignesS} />}
          </div>
        </div>
      </Bloc>

      <Bloc titre="Ses probabilites sont-elles justes ?" testid="calibration-ia"
        aide="Quand l'IA annonce 70 % de chances qu'un joueur commence, il commence bien environ 7 fois sur 10 ? Deux barres de meme hauteur : le modele est bien calibre.">
        <CalibrationIa bandes={r.calibration} />
      </Bloc>

      <Bloc titre="Dispositif (4-4-2, 4-3-3...)" testid="systeme-ia"
        aide="Appris seulement sur les matchs dont le staff a saisi le dispositif : la FMI ne le donne pas.">
        {r.systeme ? (
          <div className="overflow-x-auto">
            <table className="table-fm">
              <thead><tr><th>Methode</th><th className="text-right">Bon dispositif</th><th className="text-right">Dans les 3 premiers</th><th className="text-right">Bonne defense (a 4, a 3...)</th></tr></thead>
              <tbody>
                {([["modele", "Modele appris"], ["moteur", "Moteur a regles actuel"], ["dernier", "Dernier dispositif saisi"], ["frequent", "Le plus courant"]] as const).map(([k, label]) => (
                  <tr key={k}>
                    <td className={k === "modele" ? "font-semibold text-ink" : "text-muted"}>{label}</td>
                    <td className="text-right font-mono">{pct(r.systeme![k].top1)}</td>
                    <td className="text-right font-mono">{pct(r.systeme![k].top3)}</td>
                    <td className="text-right font-mono">{pct(r.systeme![k].defense)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-faint">Sur {r.systeme.n} matchs dont le dispositif est saisi.</p>
          </div>
        ) : (
          <p className="text-sm text-muted">Aucun dispositif saisi par le staff sur les matchs de la base : le modele de dispositif n'a rien pu apprendre. Saisissez les dispositifs sur les fiches de match pour l'entrainer.</p>
        )}
      </Bloc>

      <Bloc titre="Ou l'IA se trompe" testid="erreurs-ia"
        aide="Les erreurs notees pendant l'entrainement : les compositions les plus ratees, et les joueurs que l'IA a le plus de mal a lire.">
        <ErreursIa pires={r.pires} difficiles={r.difficiles} />
      </Bloc>

      <Bloc titre="Reglages essayes" testid="essais-ia"
        aide="Chaque combinaison a ete jouee sur toute la periode ; la perte mesure la justesse des probabilites (plus bas = mieux). Le meilleur est retenu.">
        <div className="overflow-x-auto">
          <table className="table-fm">
            <thead><tr><th>Historique relu</th><th className="text-right">Prudence</th><th className="text-right">Oubli</th><th className="text-right">Perte</th><th className="text-right">Titulaires</th></tr></thead>
            <tbody>
              {r.essais.map((e, i) => (
                <tr key={i} className={i === 0 ? "is-mine" : ""}>
                  <td className={i === 0 ? "font-semibold text-ink" : "text-muted"}>{e.hyper.fenetre} matchs{i === 0 ? " (retenu)" : ""}</td>
                  <td className="text-right font-mono text-muted">{nombre(e.hyper.l2, e.hyper.l2 < 1 ? 1 : 0)}</td>
                  <td className="text-right font-mono text-muted">{e.hyper.demiVie ? `${e.hyper.demiVie} sem.` : "aucun"}</td>
                  <td className="text-right font-mono">{nombre(e.perte, 3)}</td>
                  <td className="text-right font-mono">{pct(e.onze)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Bloc>

      <Bloc titre="Donnees utilisees" testid="donnees-ia">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-4">
          {([
            ["Matchs lus", r.donnees.matchsLus], ["Feuilles d'equipe", r.donnees.feuilles], ["Semaines", r.donnees.etapes], ["Equipes", r.donnees.equipes],
            ["Matchs sans date", r.donnees.ecartes.sansDate], ["Matchs sans feuille", r.donnees.ecartes.sansFeuille],
            ["Feuilles incompletes", r.donnees.ecartes.feuilleIncomplete], ["Premieres feuilles (sans historique)", r.sansHistorique],
          ] as const).map(([label, valeur]) => (
            <div key={label}><dt className="text-xs text-faint">{label}</dt><dd className="font-mono text-ink">{valeur}</dd></div>
          ))}
        </dl>
      </Bloc>
    </div>
  );
}
