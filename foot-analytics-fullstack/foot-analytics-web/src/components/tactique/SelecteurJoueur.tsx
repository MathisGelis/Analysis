// src/components/tactique/SelecteurJoueur.tsx
//
// Liste deroulante de joueurs pour un poste ou le banc : ceux de la ligne du poste d'abord, les autres
// ensuite. Un joueur indisponible, ou dont le choix ferait depasser la regle des mutes, est grise avec
// sa raison : on ne peut pas composer une feuille non conforme par erreur.

import { forwardRef, useMemo } from "react";
import type { OptionJoueur } from "@/lib/composition";
import { categorieMutation, SIGLE_CATEGORIE } from "@/lib/mutations";
import { LIBELLE_NIVEAU, niveauFatigue } from "@/lib/fatigue";
import { Select, type OptionSelect } from "@/components/Select";

export function libelleJoueur(j: OptionJoueur["joueur"]): string {
  const sigle = SIGLE_CATEGORIE[categorieMutation(j.statutMutation)];
  const niveau = niveauFatigue(j.scoreFatigue);
  return [
    `${j.numeroFavori != null ? `#${j.numeroFavori} ` : ""}${j.prenom ?? ""} ${j.nom}`.replace(/\s+/g, " ").trim(),
    j.poste ?? "?",
    sigle ? `[${sigle}]` : null,
    niveau === "charge" || niveau === "surcharge" ? `fatigue ${LIBELLE_NIVEAU[niveau].toLowerCase()}` : null,
    j.enReprise ? "reprise" : null,
  ].filter(Boolean).join(" · ");
}

export const SelecteurJoueur = forwardRef<HTMLButtonElement, {
  valeur: string;
  options: OptionJoueur[];
  onChange: (id: string) => void;
  disabled?: boolean;
  /** Libelle de l'entree vide ("— Vide —", "Ajouter un remplacant..."). */
  vide: string;
  ariaLabel: string;
  groupePoste?: string;
}>(function SelecteurJoueur({ valeur, options, onChange, disabled, vide, ariaLabel, groupePoste }, ref) {
  const liste = useMemo<OptionSelect[]>(() => {
    const duPoste = options.filter((o) => o.groupe === "poste");
    const autres = options.filter((o) => o.groupe === "autres");
    const titrePoste = groupePoste ? `Sur ce poste (${groupePoste})` : "Meme ligne";
    const titreAutres = duPoste.length > 0 || groupePoste ? "Autres postes" : "Effectif";
    const enOption = (o: OptionJoueur, groupe: string): OptionSelect => ({
      valeur: o.joueur.id, libelle: libelleJoueur(o.joueur), groupe, desactive: o.refus !== null, detail: o.refus ?? undefined,
    });
    return [
      { valeur: "", libelle: vide },
      ...duPoste.map((o) => enOption(o, titrePoste)),
      ...autres.map((o) => enOption(o, titreAutres)),
    ];
  }, [options, vide, groupePoste]);
  return (
    <Select ref={ref} className="inp min-w-0 flex-1 text-xs" ariaLabel={ariaLabel} valeur={valeur} disabled={disabled}
      options={liste} onChange={onChange} largeurListe={340} />
  );
});
