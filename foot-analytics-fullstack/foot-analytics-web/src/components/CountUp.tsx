"use client";
// src/components/CountUp.tsx
//
// Animation des chiffres au load : de 0 vers la valeur cible en ~700ms,
// easing out cubic. Utilise pour les KPI du dashboard (vibe scoreboard
// qui s'allume). Respecte prefers-reduced-motion.

import { useEffect, useRef, useState } from "react";

interface Props {
  value: number;
  /** Duree en ms (defaut 700) */
  duration?: number;
  /** Nombre de decimales (defaut 0) */
  decimals?: number;
  /** Suffixe optionnel (ex. "%", "min", "/100") */
  suffix?: string;
  /** Prefixe (ex. "+", "-") */
  prefix?: string;
  className?: string;
}

export function CountUp({
  value, duration = 700, decimals = 0, suffix, prefix, className,
}: Props) {
  const [display, setDisplay] = useState(0);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    // Reduced motion : saute direct a la valeur finale.
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setDisplay(value);
      return;
    }

    let raf: number;
    const start = performance.now();
    const from = 0;
    const delta = value - from;
    // Easing out cubic
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(1, elapsed / duration);
      setDisplay(from + delta * ease(t));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  const fmt = decimals === 0
    ? Math.round(display).toString()
    : display.toFixed(decimals);

  return (
    <span ref={ref} className={`tabular-nums ${className ?? ""}`}>
      {prefix}{fmt}{suffix}
    </span>
  );
}
