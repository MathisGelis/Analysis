"use client";
// src/components/TimePicker24.tsx
//
// Selecteur d'heure custom : deux selects cote-a-cote, format 24h avec
// minutes par tranche de 5 (00, 05, 10, ..., 55). Remplace les
// `<input type="time">` natifs dans toute l'app pour garantir une UX
// homogene sur tous les navigateurs (le rendu natif des time inputs
// varie beaucoup et sur certains OS reste en 12h malgre la locale).
//
// Props :
//   value     : "HH:MM" ou "" (vide accepte)
//   onChange  : (next: string) => void   -> emet "HH:MM"
//   step      : minutes (defaut 5)
//   allowEmpty: si true, ajoute une option "—" pour vider la valeur
//   className : applique au conteneur

import { useMemo } from "react";

export function TimePicker24({
  value, onChange, step = 5, allowEmpty = false, className = "",
}: {
  value: string;
  onChange: (next: string) => void;
  step?: number;
  allowEmpty?: boolean;
  className?: string;
}) {
  // Decoupe la valeur "HH:MM" -> nombres ; null si vide ou invalide.
  const { h, m } = useMemo(() => {
    if (!value || !/^\d{1,2}:\d{1,2}$/.test(value)) return { h: null as number | null, m: null as number | null };
    const [hh, mm] = value.split(":").map((x) => parseInt(x, 10));
    return { h: isNaN(hh) ? null : hh, m: isNaN(mm) ? null : mm };
  }, [value]);

  const heures = Array.from({ length: 24 }, (_, i) => i);
  const minutes = useMemo(() => {
    const arr: number[] = [];
    for (let i = 0; i < 60; i += step) arr.push(i);
    return arr;
  }, [step]);

  const fmt = (n: number) => String(n).padStart(2, "0");

  function emit(nextH: number | null, nextM: number | null) {
    if (nextH == null && nextM == null) { onChange(""); return; }
    // Si on a juste une valeur posee, on complete l'autre avec 0.
    const HH = fmt(nextH ?? 0);
    const MM = fmt(nextM ?? 0);
    onChange(`${HH}:${MM}`);
  }

  return (
    <div className={`flex items-center gap-1 ${className}`}>
      <select
        className="inp font-mono tabular-nums !w-16 text-center"
        value={h == null ? "" : String(h)}
        onChange={(e) => emit(e.target.value === "" ? null : +e.target.value, m)}
      >
        {allowEmpty && <option value="">—</option>}
        {heures.map((hh) => (
          <option key={hh} value={hh}>{fmt(hh)}</option>
        ))}
      </select>
      <span className="text-faint font-mono">:</span>
      <select
        className="inp font-mono tabular-nums !w-16 text-center"
        value={m == null ? "" : String(m)}
        onChange={(e) => emit(h, e.target.value === "" ? null : +e.target.value)}
      >
        {allowEmpty && <option value="">—</option>}
        {minutes.map((mm) => (
          <option key={mm} value={mm}>{fmt(mm)}</option>
        ))}
      </select>
    </div>
  );
}
