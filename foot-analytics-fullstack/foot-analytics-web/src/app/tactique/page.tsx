// src/app/tactique/page.tsx
"use client";

import { useMemo, useState } from "react";
import { JOUEURS } from "@/data/demo";
import { Pitch } from "@/components/Pitch";
import { onzeProbable } from "@/lib/stats";
import { SaisonGuard, useLectureSeule } from "@/components/SaisonGuard";
import { BandeauDemo } from "@/components/BandeauDemo";
import { Lightbulb, Save, Sparkles } from "lucide-react";

const FORMATIONS = ["4-4-2","4-2-3-1","4-3-3","3-5-2","5-3-2","3-4-3"];

export default function Tactique() {
  return (
    <SaisonGuard libelle="La preparation tactique">
      <TactiqueContent/>
    </SaisonGuard>
  );
}

function TactiqueContent() {
  const lectureSeule = useLectureSeule();
  const [formation, setFormation] = useState("4-2-3-1");
  // Onze suggere (par defaut), modifiable individuellement
  const onzeDefault = useMemo(() => onzeProbable("chapo").map((j) => j.id), []);
  const [onze, setOnze] = useState<string[]>(onzeDefault);
  const dispo = JOUEURS.filter((j) => j.clubId === "chapo");

  const onzeJoueurs = onze
    .map((id) => dispo.find((j) => j.id === id))
    .filter(Boolean) as typeof dispo;

  function remplace(idx: number, newId: string) {
    setOnze((arr) => {
      const cp = [...arr];
      cp[idx] = newId;
      return cp;
    });
  }

  return (
    <div className="space-y-6 fade-up">
      <BandeauDemo>
        Les joueurs proposes viennent du jeu d'exemple, pas de l'effectif de
        l'equipe choisie, et « Enregistrer » ne sauvegarde pas encore la composition.
      </BandeauDemo>
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="h-section">Plan de jeu</div>
          <h1 className="font-display text-2xl font-bold text-ink">Tactique</h1>
        </div>
        <div className="flex items-center gap-2">
          <select value={formation} onChange={(e)=>setFormation(e.target.value)}
            className="btn">
            {FORMATIONS.map(f=><option key={f}>{f}</option>)}
          </select>
          <button onClick={()=>setOnze(onzeDefault)} className="btn">
            <Sparkles size={13}/> Onze suggere
          </button>
          <button className="btn btn-primary" disabled={lectureSeule}
            title={lectureSeule ? "Saison archivee : consultation seule" : undefined}>
            <Save size={13}/> Enregistrer
          </button>
        </div>
      </header>

      <section className="grid grid-cols-12 gap-4">
        {/* terrain */}
        <div className="col-span-12 lg:col-span-7">
          <Pitch
            formation={formation}
            joueurs={onzeJoueurs.map((j) => ({
              numero: j.numeroFavori ?? 0,
              nom: j.nom,
              capitaine: j.nom === "CHAFFURIN",
            }))}
            titre={`Composition · ${formation}`}
          />
        </div>

        {/* selection des joueurs par position */}
        <div className="col-span-12 lg:col-span-5 panel p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="h-section">11 de depart</div>
            <span className="badge badge-accent">{onzeJoueurs.length}/11</span>
          </div>
          <ol className="space-y-2">
            {onzeJoueurs.map((j, i) => (
              <li key={`${j.id}-${i}`} className="flex items-center gap-2">
                <span className="w-6 text-right font-mono text-xs text-faint">{i+1}.</span>
                <span className="badge w-12 justify-center">{j.poste}</span>
                <select
                  className="btn flex-1 text-xs"
                  value={j.id}
                  onChange={(e)=>remplace(i, e.target.value)}>
                  {dispo
                    .filter(x => x.poste === j.poste || onze.includes(x.id) === false)
                    .slice(0, 18)
                    .map(x=>(
                      <option key={x.id} value={x.id}>
                        #{x.numeroFavori ?? "?"} · {x.prenom} {x.nom}
                      </option>
                    ))}
                </select>
                <span className="text-xs tabular-nums text-accent w-7 text-right">
                  {j.noteMoyenne?.toFixed(1)}
                </span>
              </li>
            ))}
          </ol>

          <div className="mt-5 panel-inset p-3 border-l-2 border-accent">
            <div className="flex items-center gap-2 text-accent">
              <Lightbulb size={14}/>
              <span className="text-[10px] font-bold uppercase tracking-wider">Suggestion IA</span>
            </div>
            <p className="text-sm text-ink mt-1 leading-relaxed">
              Selon les statistiques saison et l'opposition Neuville (4-2-3-1), le
              dispositif 4-2-3-1 reduit le risque de transitions adverses. Coupler avec
              PAGLIARELLA + BERNARD au milieu pour stabiliser l'axe.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
