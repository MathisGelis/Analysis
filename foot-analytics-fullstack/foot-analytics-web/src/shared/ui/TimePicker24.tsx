"use client";
// src/shared/ui/TimePicker24.tsx
//
// Selecteur d'heure custom : deux listes deroulantes maison (shared/ui/Select.tsx) cote-a-cote, format 24h avec
// minutes par tranche de 5 (00, 05, 10, ..., 55). Remplace les `<input type="time">` natifs dans toute l'app pour
// garantir une UX homogene sur tous les navigateurs (le rendu natif des time inputs varie beaucoup et sur certains
// OS reste en 12h malgre la locale), et sans menu dessine par le navigateur.
//
// Props :
//   value     : "HH:MM" ou "" (vide accepte)
//   onChange  : (next: string) => void   -> emet "HH:MM"
//   step      : minutes (defaut 5)
//   allowEmpty: si true, ajoute une option "—" pour vider la valeur
//   className : applique au conteneur
//   ariaLabel : prefixe des libelles d'accessibilite ("Heure" -> "Heure (heures)", "Heure (minutes)")

import { useMemo } from "react";

import { Select, type OptionSelect } from "./Select";

export function TimePicker24({
  value, onChange, step = 5, allowEmpty = false, className = "", ariaLabel = "Heure",
}: {
  value: string;
  onChange: (next: string) => void;
  step?: number;
  allowEmpty?: boolean;
  className?: string;
  ariaLabel?: string;
}) {
  // Decoupe la valeur "HH:MM" -> nombres ; null si vide ou invalide.
  const { h, m } = useMemo(() => {
    if (!value || !/^\d{1,2}:\d{1,2}$/.test(value)) return { h: null as number | null, m: null as number | null };
    const [hh, mm] = value.split(":").map((x) => parseInt(x, 10));
    return { h: isNaN(hh) ? null : hh, m: isNaN(mm) ? null : mm };
  }, [value]);

  const fmt = (n: number) => String(n).padStart(2, "0");
  const vide: OptionSelect[] = allowEmpty ? [{ valeur: "", libelle: "—" }] : [];
  const optionsHeures = useMemo<OptionSelect[]>(
    () => [...vide, ...Array.from({ length: 24 }, (_, i) => ({ valeur: String(i), libelle: fmt(i) }))],
    [allowEmpty], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const optionsMinutes = useMemo<OptionSelect[]>(() => {
    const arr: OptionSelect[] = [...vide];
    for (let i = 0; i < 60; i += step) arr.push({ valeur: String(i), libelle: fmt(i) });
    return arr;
  }, [step, allowEmpty]); // eslint-disable-line react-hooks/exhaustive-deps

  function emit(nextH: number | null, nextM: number | null) {
    if (nextH == null && nextM == null) { onChange(""); return; }
    // Si on a juste une valeur posee, on complete l'autre avec 0.
    const HH = fmt(nextH ?? 0);
    const MM = fmt(nextM ?? 0);
    onChange(`${HH}:${MM}`);
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <Select
        className="inp font-mono tabular-nums !w-[4.5rem]" ariaLabel={`${ariaLabel} (heures)`}
        valeur={h == null ? "" : String(h)} options={optionsHeures} recherche={false} largeurListe={72}
        placeholder="--" onChange={(v) => emit(v === "" ? null : +v, m)}
      />
      <span className="text-faint font-mono">:</span>
      <Select
        className="inp font-mono tabular-nums !w-[4.5rem]" ariaLabel={`${ariaLabel} (minutes)`}
        valeur={m == null ? "" : String(m)} options={optionsMinutes} recherche={false} largeurListe={72}
        placeholder="--" onChange={(v) => emit(h, v === "" ? null : +v)}
      />
    </div>
  );
}
