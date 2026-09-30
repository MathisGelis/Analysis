// src/app/ia/page.tsx
//
// Hub IA : predictions de compo adverse, risque blessure, projection de
// resultat, suggestions tactiques. Les valeurs sont des estimations
// heuristiques pour la demo ; brancher un vrai modele dans
// supabase/functions/predict_*.ts en production.

import { JOUEURS, RAPPORT_NEUVILLE, CLASSEMENT_POULE_C, CLUBS } from "@/data/demo";
import { ClubBadge } from "@/components/ClubBadge";
import { Pitch } from "@/components/Pitch";
import { DonutStat } from "@/components/Charts";
import { BandeauDemo } from "@/components/BandeauDemo";
import { Brain, ChevronRight, Cpu, Sparkles, Zap } from "lucide-react";

export const metadata = { title: "Predictions IA · Foot Analytics" };

export default function IAPage() {
  const compoAttendue = RAPPORT_NEUVILLE.dernier11.slice(0, 11);

  // Probabilites de resultat (modele basique : difference de classement)
  const myRank = CLASSEMENT_POULE_C.find(l=>l.clubId==="chapo")!.rang;
  const advRank = CLASSEMENT_POULE_C.find(l=>l.clubId==="neuv")!.rang;
  // Plus le rang adverse est faible (1er), plus on perd
  const diff = myRank - advRank; // positif = adv mieux place
  const baseV = Math.max(8, 35 - diff*3);
  const baseN = 28 + Math.abs(diff)*1.5;
  const baseD = 100 - baseV - baseN;

  // Joueurs a risque
  const risque = JOUEURS
    .filter(j=>j.clubId==="chapo")
    .map(j => ({
      ...j,
      risque: Math.min(85, j.cartonsJaunes*5 + (j.minutes>1300?22:5) + (j.matchs>18?15:5)),
    }))
    .filter(j=>j.risque>40)
    .sort((a,b)=>b.risque-a.risque)
    .slice(0,5);

  return (
    <div className="space-y-6 fade-up">
      <header className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="h-section flex items-center gap-1.5"><Cpu size={11}/> Modeles predictifs</div>
          <h1 className="font-display text-2xl font-bold text-ink">Predictions IA</h1>
        </div>
        <span className="badge badge-sky"><Brain size={10}/> Modele v0.3 · heuristique</span>
      </header>

      <BandeauDemo>
        Prochain match, composition adverse et joueurs a risque proviennent d'un
        jeu d'exemple (Chaponnay - Neuville) et d'une heuristique simple, pas
        d'un modele entraine sur vos donnees.
      </BandeauDemo>

      {/* Prediction match */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-5 panel p-5">
          <div className="h-section mb-3">Prochain match · J22</div>
          <div className="flex items-center gap-3 mb-4">
            <ClubBadge clubId="chapo" size={36}/>
            <span className="font-display font-bold">Chaponnay</span>
            <span className="text-faint">vs</span>
            <span className="font-display font-bold">Neuville S/S 2</span>
            <ClubBadge clubId="neuv" size={36}/>
          </div>

          <div className="space-y-3">
            <ProbBar label="Victoire" value={Math.round(baseV)} color="rgb(var(--turf))"/>
            <ProbBar label="Match nul" value={Math.round(baseN)} color="rgb(var(--amber))"/>
            <ProbBar label="Defaite" value={Math.round(baseD)} color="rgb(var(--danger))"/>
          </div>

          <div className="mt-4 panel-inset p-3 border-l-2 border-sky">
            <div className="text-[10px] uppercase tracking-wider text-sky flex items-center gap-1.5">
              <Sparkles size={11}/> Score le plus probable
            </div>
            <div className="font-display text-3xl font-black text-ink mt-1">1 – 2</div>
            <p className="text-[12px] text-muted mt-1">
              Modele : forme recente Neuville (4V sur 5) + perf. domicile Chaponnay.
            </p>
          </div>
        </div>

        {/* Compo adverse predite */}
        <div className="col-span-12 lg:col-span-7">
          <div className="panel p-5">
            <div className="h-section mb-3">Compo adverse predite · {RAPPORT_NEUVILLE.dispositifAttendu}</div>
            <Pitch
              formation={RAPPORT_NEUVILLE.dispositifAttendu}
              joueurs={compoAttendue.map(c=>({
                numero: c.numero, nom: c.nom,
                capitaine: c.nom==="CHAFFURIN",
              }))}
              couleur="rgb(var(--sky))"
            />
            <p className="text-[11px] text-muted mt-3">
              Issu de l'analyse de la derniere feuille de match Neuville et du
              rapport scouting. Confiance estimee : <span className="text-turf font-semibold">78%</span>.
            </p>
          </div>
        </div>
      </section>

      {/* Risque blessure */}
      <section className="grid grid-cols-12 gap-4">
        <div className="col-span-12 lg:col-span-7 panel p-5">
          <div className="h-section mb-3">Joueurs a risque blessure</div>
          <table className="table-fm">
            <thead>
              <tr><th>Joueur</th><th>Mat.</th><th>Min.</th><th>Risque</th><th>Indicateur</th></tr>
            </thead>
            <tbody>
              {risque.map(j=>(
                <tr key={j.id}>
                  <td className="font-semibold">{j.prenom} {j.nom}</td>
                  <td className="tabular-nums">{j.matchs}</td>
                  <td className="tabular-nums text-muted">{j.minutes}'</td>
                  <td className={`font-display font-bold tabular-nums ${j.risque>=60?"text-danger":"text-amber"}`}>
                    {j.risque}%
                  </td>
                  <td>
                    <div className="w-32 h-1.5 bg-line rounded-full overflow-hidden">
                      <div className={`h-full ${j.risque>=60?"bg-danger":"bg-amber"}`}
                        style={{width:`${j.risque}%`}}/>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="col-span-12 lg:col-span-5 panel p-5">
          <div className="h-section mb-3">Confiance globale du modele</div>
          <div className="flex items-center justify-center py-4">
            <DonutStat value={78} max={100} size={150} stroke={12} label="confiance"/>
          </div>
          <p className="text-[12px] text-muted leading-relaxed">
            Le modele s'ameliore avec le volume de FMI importees. Apres 50 matchs
            collectes, la confiance attendue depasse 92%.
          </p>
        </div>
      </section>

      {/* Suggestions tactiques */}
      <section className="panel p-5">
        <div className="h-section mb-3 flex items-center gap-1.5">
          <Zap size={11} className="text-turf"/> Suggestions tactiques contextuelles
        </div>
        <ul className="space-y-3 text-sm">
          <li className="flex gap-3 panel-inset p-3 border-l-2 border-turf">
            <div className="text-turf">▸</div>
            <span><strong>Pressing decale a droite</strong> · Neuville construit principalement
              cote gauche (KHARKHACHE / GASPARD). Sur-orienter le bloc presse vers
              cette zone reduit les sorties de balle.</span>
          </li>
          <li className="flex gap-3 panel-inset p-3 border-l-2 border-amber">
            <div className="text-amber">▸</div>
            <span><strong>Mobiliser PAGLIARELLA + BERNARD au milieu</strong> · profil le plus
              en forme et capable d'enchainer les seances.</span>
          </li>
          <li className="flex gap-3 panel-inset p-3 border-l-2 border-sky">
            <div className="text-sky">▸</div>
            <span><strong>Coups de pied arretes</strong> · Neuville encaisse 1.18 but
              par match a domicile, dont 35% sur set-pieces selon les FMI analysees.</span>
          </li>
        </ul>
      </section>
    </div>
  );
}

function ProbBar({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-20 text-xs text-muted">{label}</div>
      <div className="flex-1 h-2 bg-line rounded-full overflow-hidden">
        <div className="h-full" style={{ width: `${value}%`, background: color }}/>
      </div>
      <div className="w-10 text-right font-mono font-bold tabular-nums">{value}%</div>
    </div>
  );
}
