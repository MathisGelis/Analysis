"use client";

// src/features/analyse-jeu/components/JeuAdversaire.tsx
//
// Le jeu d'un adversaire dans le rapport pre-match : ce que NOS matchs contre lui ont montre (ses tirs, ses zones, ses buts, ses coups de
// pied arretes). Seulement ce que nous avons saisi nous-memes : si nous ne l'avons jamais saisi, le bloc le dit et ne montre rien d'autre.

import { useEffect, useState } from "react";

import { api, messageApi } from "@/shared/lib/api";
import { BarsChart } from "@/shared/ui/Charts";
import { Spinner } from "@/shared/ui/Spinner";

import { constatsAdversaire } from "../lib/lecture-adversaire";
import type { ReponseAdversaire } from "../lib/jeu-types";
import { CarteZones } from "./CarteZones";

const TRANCHES = ["0-15", "16-30", "31-45", "46-60", "61-75", "76-90+"];

export function JeuAdversaire({ equipeId, adversaireId, nom }: { equipeId: string; adversaireId: string; nom: string }) {
  const [r, setR] = useState<ReponseAdversaire | null>(null);
  const [erreur, setErreur] = useState<string | null>(null);
  useEffect(() => {
    let vivant = true;
    api.jeuAdversaire(equipeId, adversaireId).then((x) => { if (vivant) setR(x); }).catch((e) => { if (vivant) setErreur(messageApi(e, "Impossible de charger son jeu.")); });
    return () => { vivant = false; };
  }, [equipeId, adversaireId]);

  if (erreur) return <p role="alert" className="text-sm text-muted">{erreur}</p>;
  if (!r) return <div className="flex justify-center p-6" role="status" aria-label="Chargement du jeu de l'adversaire"><Spinner taille={18} /></div>;

  const { jeu } = r;
  if (r.matchsContreNous === 0) return <p className="text-sm text-muted">Nous n&apos;avons pas encore joué contre {nom} : nous ne savons rien de son jeu par nos propres saisies.</p>;
  if (!jeu.tirs) {
    return (
      <p className="text-sm text-muted">
        Nous avons joué {r.matchsContreNous} match{r.matchsContreNous > 1 ? "s" : ""} contre {nom}, mais aucun n&apos;a été saisi en direct : ses tirs et ses zones sont inconnus.
        {jeu.buts.matchsCouverts > 0 && <> Ses buts datés par la feuille de match : {jeu.buts.total.pour} marqué{jeu.buts.total.pour > 1 ? "s" : ""} contre nous.</>}
      </p>
    );
  }
  const t = jeu.tirs;
  const constats = constatsAdversaire(jeu, nom);
  return (
    <div className="space-y-4">
      <p className="text-[13px] text-muted">D&apos;après {t.matchs} match{t.matchs > 1 ? "s" : ""} saisi{t.matchs > 1 ? "s" : ""} contre lui (sur {r.matchsContreNous} joué{r.matchsContreNous > 1 ? "s" : ""}). Ces chiffres ne décrivent que ses matchs contre nous.</p>
      {constats.length > 0 && (
        <ul className="space-y-1.5" aria-label="À retenir sur son jeu">
          {constats.map((c) => <li key={c} className="panel-inset border-l-2 border-accent px-3 py-2 text-[13px] text-ink">{c}</li>)}
        </ul>
      )}
      <div className="grid grid-cols-3 gap-2 text-center">
        {[["Tirs par match", String(t.parMatch.pour)], ["Tirs cadrés", t.cadresPct.pour === null ? "–" : `${t.cadresPct.pour} %`], ["Conversion", t.conversion.pour === null ? "–" : `${t.conversion.pour} %`]].map(([l, v]) => (
          <div key={l} className="panel-inset p-3"><div className="text-[11px] uppercase tracking-wide text-muted">{l}</div><div className="font-display text-2xl font-bold text-accent">{v}</div></div>
        ))}
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <figure className="space-y-1.5">
          <figcaption className="text-xs font-semibold text-ink">Où {nom} tire (son attaque est en haut)</figcaption>
          <CarteZones carte={t.carte.pour} nom={`Carte des tirs de ${nom}`} />
        </figure>
        {jeu.buts.matchsCouverts > 0 && (
          <div>
            <h4 className="mb-1.5 text-xs font-semibold text-ink">Quand il marque et encaisse</h4>
            <BarsChart height={176} legend={["Marqués", "Encaissés"]} data={TRANCHES.map((label, i) => ({ label, a: jeu.buts.pour[i], b: jeu.buts.contre[i] }))} />
          </div>
        )}
      </div>
    </div>
  );
}
