"use client";

// src/features/direct/components/TerrainCompo.tsx
//
// La compo visuelle du direct : les joueurs de notre equipe sur le terrain, a leur poste du moment (voir lib/compo-direct.ts). Sert partout
// ou l'on designe un joueur (tireur, passeur, fautif, carton, corner, sortant) et d'ecran de lecture dans l'onglet Compo. Un joueur expulse
// reste a son poste, grise, avec son carton rouge : il ne se choisit plus. Pas de banc ici : il n'apparait que pour choisir un entrant.

import { lignesDeFormation, type EtatCompo, type SlotCompo } from "../lib/compo-direct";

const COULEURS = { accent: "164 151 255", amber: "251 191 36", danger: "248 113 113", sky: "96 165 250" } as const;

export interface PosteTerrain { x: number; y: number }

/** Les postes dans l'ordre des slots : l'attaque en haut, le gardien en bas, chaque ligne repartie sur la largeur. */
export function postesDuDispositif(formation: string): PosteTerrain[] {
  const lignes = lignesDeFormation(formation) ?? [1, 4, 4, 2];
  const postes: PosteTerrain[] = [];
  lignes.forEach((nb, li) => {
    const y = lignes.length === 1 ? 50 : 90 - (li * 76) / (lignes.length - 1);
    for (let k = 0; k < nb; k++) postes.push({ x: ((k + 1) * 100) / (nb + 1), y });
  });
  return postes;
}

export interface TerrainCompoProps {
  formation: string;
  slots: SlotCompo[];
  /** Le joueur choisi (par identifiant) ou le poste choisi (par indice). */
  choisiId?: string | null;
  choisiIndex?: number | null;
  /** Texte au-dessus du joueur choisi (« Tireur », « Sort »...). */
  etiquette?: string;
  ton?: keyof typeof COULEURS;
  /** Postes que l'on ne peut pas choisir (en plus des expulses et des postes vides). */
  inactifs?: (index: number, slot: SlotCompo) => boolean;
  /** Postes cernes de bleu (ont change de poste). */
  deplaces?: ReadonlySet<number>;
  onChoisir?: (index: number, slot: SlotCompo) => void;
  titre?: string;
}

export function TerrainCompo({ formation, slots, choisiId, choisiIndex, etiquette, ton = "accent", inactifs, deplaces, onChoisir, titre = "Compo de l'équipe sur le terrain" }: TerrainCompoProps) {
  const postes = postesDuDispositif(formation);
  return (
    <div role="group" aria-label={titre} data-testid="terrain-compo"
      className="relative mx-auto h-[440px] w-full max-w-[358px] overflow-hidden rounded-2xl border-2"
      style={{ background: "rgb(var(--terrain))", borderColor: "rgb(var(--terrain-ligne))", backgroundImage: "repeating-linear-gradient(180deg, rgb(255 255 255 / .035) 0, rgb(255 255 255 / .035) 44px, transparent 44px, transparent 88px)" }}>
      <div aria-hidden className="absolute left-1/2 top-0 h-12 w-24 -translate-x-1/2 rounded-b-full border-2 border-t-0" style={{ borderColor: "rgb(var(--terrain-ligne))" }} />
      <div aria-hidden className="absolute bottom-0 left-[19%] h-[17%] w-[62%] border-2 border-b-0" style={{ borderColor: "rgb(var(--terrain-ligne))" }} />
      <div aria-hidden className="absolute bottom-0 left-[36%] h-[7%] w-[28%] border-2 border-b-0" style={{ borderColor: "rgb(var(--terrain-ligne))" }} />
      <span aria-hidden className="absolute left-2.5 top-2 text-[11px] font-semibold text-white/75">Attaque ↑</span>
      {slots.map((s, i) => {
        const p = postes[i];
        if (!p) return null;
        const choisi = choisiIndex !== undefined && choisiIndex !== null ? choisiIndex === i : !!s.joueur && !!choisiId && s.joueur.id === choisiId;
        const bloque = !s.joueur || s.expulse || !!inactifs?.(i, s);
        const interactif = !!onChoisir && !bloque;
        const anneau = choisi ? COULEURS[ton] : deplaces?.has(i) ? COULEURS.sky : null;
        const nom = s.joueur ? s.joueur.nom : "";
        const circle = (
          <span className="relative grid h-11 w-11 place-items-center rounded-full border-2 font-display text-[17px] font-bold text-white"
            style={{
              background: s.expulse ? "#2A2F3F" : "rgb(var(--surface-2))", borderColor: anneau ? `rgb(${anneau})` : s.expulse ? "#9AA3B8" : "rgb(255 255 255 / .9)",
              boxShadow: anneau ? `0 0 0 4px rgb(${anneau} / .4)` : undefined, opacity: s.expulse ? 0.7 : bloque && s.joueur ? 0.55 : 1,
            }}>
            {s.joueur ? s.joueur.numero ?? "–" : <span aria-hidden className="text-base text-white/60">+</span>}
            {choisi && etiquette && (
              <span className="absolute -top-[17px] left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-bold leading-tight" style={{ background: `rgb(${anneau})`, color: "#0B1020" }}>{etiquette}</span>
            )}
            {s.expulse && <span aria-hidden className="absolute -right-[7px] -top-[7px] h-[18px] w-[13px] rounded-[2px] border-[1.5px] border-white" style={{ background: "#E5252A" }} />}
          </span>
        );
        const label = s.joueur ? `${s.joueur.numero ?? "sans numéro"} ${s.joueur.nom}${s.expulse ? ", expulsé" : ""}${bloque && !s.expulse ? ", indisponible" : ""}` : "Poste vide";
        return (
          <div key={i} className="absolute flex w-[72px] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-[3px]" style={{ left: `${p.x}%`, top: `${p.y}%` }}>
            <button type="button" disabled={!interactif} aria-label={label} aria-pressed={onChoisir ? choisi : undefined} onClick={() => onChoisir?.(i, s)}
              className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:cursor-default">{circle}</button>
            <span className="max-w-[72px] truncate rounded-md px-1.5 py-0.5 text-[11px] font-semibold leading-tight text-white" style={{ background: "rgb(7 10 18 / .78)", textDecoration: s.expulse ? "line-through" : undefined }}>{nom || (s.joueur ? "" : "—")}</span>
          </div>
        );
      })}
    </div>
  );
}

/** Raccourci : le terrain d'un EtatCompo. */
export function TerrainDeLEtat({ etat, ...props }: { etat: EtatCompo } & Omit<TerrainCompoProps, "formation" | "slots">) {
  return <TerrainCompo formation={etat.formation} slots={etat.slots} {...props} />;
}
