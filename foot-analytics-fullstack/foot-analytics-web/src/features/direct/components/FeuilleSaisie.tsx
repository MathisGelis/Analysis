"use client";

// src/features/direct/components/FeuilleSaisie.tsx
//
// La feuille qui s'ouvre quand on touche une action : joueur, puis zone / resultat / contexte, puis « Enregistrer ». Le meme ecran
// sert a corriger un evenement deja saisi (on part alors du recapitulatif : chaque ligne ramene a son etape).

import { useState } from "react";
import { ChevronLeft, Minus, Plus, Trash2 } from "lucide-react";

import { Modal } from "@/shared/ui/Modal";

import {
  action, CONTEXTES_AUTRES, CONTEXTES_PRINCIPAUX, Etape, joueurLibelle, LIBELLE_RESULTAT, nomCadre, nomZone,
} from "../lib/actions";
import { libelleMinute } from "../lib/chrono";
import type { Cote, JoueurDirect } from "../lib/direct-types";
import { aUnCadre, manque, Saisie } from "../lib/saisie";
import type { EtatCompo } from "../lib/compo-direct";
import { ChoixJoueur } from "./ChoixJoueur";
import { CadreBut, TerrainZones } from "./TerrainZones";

type Vue = Etape | "passeur" | "recap";

export function FeuilleSaisie({
  saisie, onChange, joueurs, compo = null, nousCote, dureePeriodeMin, correction, onEnregistrer, onFermer, onSupprimer,
}: {
  saisie: Saisie; onChange: (s: Saisie) => void; joueurs: JoueurDirect[];
  /** La compo au moment de l'evenement : notre equipe se designe sur le terrain (sans banc) ; l'entrant d'un remplacement se prend sur le banc. */
  compo?: EtatCompo | null; nousCote: Cote; dureePeriodeMin: number;
  correction: boolean; onEnregistrer: () => void; onFermer: () => void; onSupprimer?: () => void;
}) {
  const def = action(saisie.actionId);
  const [indice, setIndice] = useState(0);
  const [vue, setVue] = useState<Vue>(correction ? "recap" : def.etapes[0]);
  const [plusDeContextes, setPlusDeContextes] = useState(false);
  const nous = saisie.cote === nousCote;
  const manquant = manque(saisie);
  const maj = (p: Partial<Saisie>) => onChange({ ...saisie, ...p });

  const etapes = def.etapes;
  const derniere = !correction && vue === etapes[etapes.length - 1];
  // Chaque frappe demande son passeur avant d'etre enregistree (« Sans passeur » en un geste).
  const enregistrer = () => { if (aPasseur && !passeurVu && nous) { setPasseurVu(true); setVue("passeur"); } else onEnregistrer(); };
  const suivant = () => { if (!derniere) { setIndice(indice + 1); setVue(etapes[indice + 1]); } };
  const precedent = () => { setIndice(Math.max(0, indice - 1)); setVue(etapes[Math.max(0, indice - 1)]); };
  const aPasseur = !!def.roleJoueur2 && !etapes.includes("joueur2");        // le passeur se demande sur tous les tirs, pas seulement sur un but
  const [passeurVu, setPasseurVu] = useState(correction);

  const segments: (string | null)[] = [null, ...etapes, ...(aPasseur && nous ? ["passeur"] : [])];
  const quiTire = joueurLibelle(saisie.joueurNumero, saisie.joueurNom);
  const titre = `${def.libelle} · ${vue !== "joueur" && quiTire ? quiTire : nous ? "notre équipe" : "adversaire"}`;
  const minuteTexte = `${libelleMinute(saisie.minute, saisie.periode, dureePeriodeMin)}'`;
  const peutRevenir = (!correction && indice > 0 && vue !== "passeur") || vue === "passeur" || (correction && vue !== "recap");
  const retour = () => { if (vue === "passeur") setVue("zone"); else if (correction) setVue("recap"); else precedent(); };
  const joueurPrincipal = { numero: saisie.joueurNumero, nom: saisie.joueurNom, id: saisie.joueurId };
  const joueurSecond = { numero: saisie.joueur2Numero, nom: saisie.joueur2Nom, id: saisie.joueur2Id };

  return (
    <Modal open onClose={onFermer} maxWidth="max-w-md" titre={correction ? `Modifier : ${def.libelle}` : titre}>
      <div className="space-y-4">
        <header className="flex items-center gap-3">
          {peutRevenir && (
            <button type="button" onClick={retour} aria-label={vue === "zone" ? "Retour au choix du joueur" : "Retour"} className="btn !h-11 !w-11 shrink-0 !p-0"><ChevronLeft size={20} aria-hidden /></button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-lg font-bold text-ink">{correction ? `Modifier : ${def.libelle.toLowerCase()}` : titre}</h2>
            <div className="text-xs text-muted">{correction ? "" : `${minuteTexte} · `}{saisie.periode === 1 ? "1re" : "2e"} période</div>
          </div>
          {correction && (
            <div className="flex items-center gap-1" role="group" aria-label="Minute de l'événement">
              <button type="button" aria-label="Une minute de moins" className="btn !h-11 !w-11 !p-0" onClick={() => maj({ minute: Math.max(0, saisie.minute - 1) })}><Minus size={16} aria-hidden /></button>
              <span className="grid h-11 min-w-[4rem] place-items-center rounded-xl border border-line bg-bg px-2 font-display text-lg font-bold tabular-nums">{minuteTexte}</span>
              <button type="button" aria-label="Une minute de plus" className="btn !h-11 !w-11 !p-0" onClick={() => maj({ minute: Math.min(200, saisie.minute + 1) })}><Plus size={16} aria-hidden /></button>
            </div>
          )}
        </header>

        {!correction && segments.length > 2 && (
          <div role="img" aria-label={`Étape ${vue === "passeur" ? segments.length : indice + 2} sur ${segments.length}`} className="flex gap-1.5">
            {segments.map((e, i) => <div key={e ?? "action"} className={`h-1.5 flex-1 rounded-full ${i <= (vue === "passeur" ? segments.length - 1 : indice + 1) ? "bg-accentstrong" : "bg-line"}`} />)}
          </div>
        )}

        {vue === "recap" && (
          <div className="space-y-2">
            <LigneRecap titre="Joueur" valeur={joueurLibelle(saisie.joueurNumero, saisie.joueurNom) || "Joueur inconnu"} onClick={() => setVue("joueur")} />
            {(etapes.includes("joueur2") || aPasseur || (def.roleJoueur2 && saisie.joueur2Numero !== null)) && (
              <LigneRecap titre={def.roleJoueur2 ?? "Second joueur"} valeur={joueurLibelle(saisie.joueur2Numero, saisie.joueur2Nom) || "Aucun"} onClick={() => setVue(etapes.includes("joueur2") ? "joueur2" : "passeur")} />
            )}
            {(def.resultats || def.terrain) && (
              <LigneRecap titre="Résultat, zone et contexte"
                valeur={[saisie.resultat ? LIBELLE_RESULTAT[saisie.resultat] : null, saisie.zoneTier !== null && saisie.zoneCouloir !== null ? nomZone(saisie.zoneTier, saisie.zoneCouloir) : null, saisie.zoneCadre !== null ? nomCadre(saisie.zoneCadre) : null, saisie.contextes.join(", ") || null].filter(Boolean).join(" · ") || "Non renseigné"}
                onClick={() => setVue("zone")} />
            )}
          </div>
        )}

        {(vue === "joueur" || vue === "joueur2" || vue === "passeur") && (
          <div>
            <div className="mb-2 text-sm font-semibold text-ink">{vue === "joueur" ? def.roleJoueur : vue === "passeur" ? "Qui a fait la passe ?" : def.roleJoueur2}</div>
            <ChoixJoueur
              // Le tireur, le fautif, le sortant, le passeur : sur le terrain. L'entrant d'un remplacement : sur le banc (la liste habituelle sans compo).
              joueurs={vue === "joueur" ? joueurs : compo && vue === "joueur2" && def.type === "remplacement" ? compo.banc : joueurs.filter((j) => j.id !== saisie.joueurId)} adversaire={!nous}
              compo={vue === "joueur2" && def.type === "remplacement" ? null : compo}
              inactifs={vue === "joueur" ? undefined : saisie.joueurId ? [saisie.joueurId] : undefined}
              etiquette={vue === "joueur" ? (def.type === "remplacement" ? "Sort" : undefined) : vue === "passeur" || vue === "joueur2" ? "Passeur" : undefined}
              choisi={vue === "joueur" ? joueurPrincipal : joueurSecond}
              aucunLibelle={vue === "passeur" ? "Sans passeur" : "Joueur inconnu"}
              onChoisir={(j) => maj(vue === "joueur"
                ? { joueurNumero: j.numero, joueurNom: j.nom, joueurId: j.id }
                : { joueur2Numero: j.numero, joueur2Nom: j.nom, joueur2Id: j.id })} />
          </div>
        )}

        {vue === "zone" && (
          <div className="space-y-4">
            {def.terrain && (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between gap-2">
                  <span className="text-sm font-semibold text-ink">{def.type === "tir" || def.type === "coup_franc" ? "D'où part le tir ?" : "Où ?"}</span>
                  {saisie.zoneTier !== null && saisie.zoneCouloir !== null && <span className="text-xs font-semibold text-accent">{nomZone(saisie.zoneTier, saisie.zoneCouloir).replace(" · ", " · ").toLowerCase().replace(/^./, (c) => c.toUpperCase())}</span>}
                </div>
                <TerrainZones tier={saisie.zoneTier} couloir={saisie.zoneCouloir} onChoisir={(t, c) => maj({ zoneTier: t, zoneCouloir: c })} />
              </div>
            )}
            {def.resultats && (
              <div>
                <div className="mb-1.5 text-sm font-semibold text-ink">Résultat{def.resultatObligatoire ? "" : " (facultatif)"}</div>
                <div className="flex flex-wrap gap-2">
                  {def.resultats.map((r) => (
                    <button key={r} type="button" aria-pressed={saisie.resultat === r}
                      onClick={() => maj({ resultat: saisie.resultat === r && !def.resultatObligatoire ? null : r, ...(aUnCadre(r) ? {} : { zoneCadre: null }) })}
                      className={`btn ${saisie.resultat === r ? (r === "but" ? "btn-primary" : "!border-accent text-accent") : ""}`}>{LIBELLE_RESULTAT[r]}</button>
                  ))}
                </div>
              </div>
            )}
            {def.terrain && aUnCadre(saisie.resultat) || ((aPasseur || (def.roleJoueur2 && saisie.resultat === "but")) && !etapes.includes("joueur2")) ? (
              <div className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
                {def.terrain && aUnCadre(saisie.resultat) && (
                  <div className="shrink-0">
                    <div className="mb-1 text-xs text-muted">Zone du cadre</div>
                    <CadreBut valeur={saisie.zoneCadre} onChoisir={(i) => maj({ zoneCadre: i })} />
                  </div>
                )}
                {(aPasseur || (def.roleJoueur2 && saisie.resultat === "but")) && !etapes.includes("joueur2") && (
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 text-xs text-muted">Passeur (facultatif)</div>
                    <button type="button" onClick={() => { setPasseurVu(true); setVue("passeur"); }} className="btn !h-11 w-full !justify-start truncate text-left">{joueurLibelle(saisie.joueur2Numero, saisie.joueur2Nom) || "Aucun"}</button>
                  </div>
                )}
              </div>
            ) : null}
            {def.contexte && (
              <div>
                <div className="mb-1.5 flex items-baseline justify-between"><span className="text-sm font-semibold text-ink">Contexte du tir</span><span className="text-xs text-muted">facultatif</span></div>
                <div className="flex flex-wrap gap-1.5">
                  {[...CONTEXTES_PRINCIPAUX, ...(plusDeContextes || saisie.contextes.some((c) => CONTEXTES_AUTRES.includes(c)) ? CONTEXTES_AUTRES : [])].map((c) => {
                    const actif = saisie.contextes.includes(c);
                    return (
                      <button key={c} type="button" aria-pressed={actif} onClick={() => maj({ contextes: actif ? saisie.contextes.filter((x) => x !== c) : [...saisie.contextes, c].slice(0, 6) })}
                        className={`btn !h-9 !rounded-full !px-3 text-[13px] ${actif ? "!border-accent bg-accent/15 text-accent" : ""}`}>{c}</button>
                    );
                  })}
                  {!plusDeContextes && !saisie.contextes.some((c) => CONTEXTES_AUTRES.includes(c)) && (
                    <button type="button" onClick={() => setPlusDeContextes(true)} className="btn !h-9 !rounded-full !px-3 text-[13px] text-muted">Autre…</button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {manquant && <p role="status" className="text-xs text-amber">{manquant}</p>}

        <footer className="space-y-2 border-t border-line pt-3">
          {correction && onSupprimer && vue === "recap" && (
            <button type="button" onClick={onSupprimer} className="btn w-full !border-danger/50 text-danger"><Trash2 size={15} aria-hidden /> Supprimer</button>
          )}
          {vue === "passeur" && correction ? (
            <button type="button" onClick={() => setVue("zone")} className="btn btn-primary !h-12 w-full text-base">Valider</button>
          ) : vue === "passeur" ? (
            <button type="button" disabled={!!manquant} onClick={onEnregistrer} className="btn btn-primary !h-13 w-full text-base disabled:opacity-50">
              {`Enregistrer ${saisie.resultat === "but" ? "le but" : def.libelle.toLowerCase()} · ${minuteTexte}`}
            </button>
          ) : !correction && !derniere ? (
            <div className="flex gap-2">
              {!manquant && <button type="button" onClick={enregistrer} className="btn !h-12">Enregistrer ainsi</button>}
              <button type="button" onClick={suivant} className="btn btn-primary !h-12 flex-1 text-base">Suivant</button>
            </div>
          ) : (
            <button type="button" disabled={!!manquant} onClick={enregistrer} className="btn btn-primary !h-13 w-full text-base disabled:opacity-50">
              {correction ? "Enregistrer" : `Enregistrer ${saisie.resultat === "but" ? "le but" : ""} · ${minuteTexte}`.replace("  ", " ")}
            </button>
          )}
        </footer>
      </div>
    </Modal>
  );
}

function LigneRecap({ titre, valeur, onClick }: { titre: string; valeur: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-surface px-3 py-2.5 text-left hover:bg-surface-2">
      <span className="text-xs text-muted">{titre}</span>
      <span className="min-w-0 truncate text-sm font-semibold text-ink">{valeur}</span>
    </button>
  );
}
