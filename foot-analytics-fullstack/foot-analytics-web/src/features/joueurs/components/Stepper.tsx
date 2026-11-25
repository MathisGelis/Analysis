// src/features/joueurs/components/Stepper.tsx

/* ---- Stepper compact (-) [N] (+) pour les stats editables en cellule. ---- */
export function Stepper({
  value, onChange, min = 0, max = 99, color = "accent",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number; max?: number;
  color?: "accent" | "sky";
}) {
  const c = color === "sky" ? "text-sky" : "text-accent";
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  return (
    <div className="inline-flex items-center gap-0.5">
      <button
        type="button"
        onClick={dec}
        className="w-5 h-5 grid place-items-center text-xs rounded border border-line bg-panel2 hover:bg-line/60 text-faint hover:text-ink"
        aria-label="diminuer"
      >−</button>
      <span className={`font-mono text-sm tabular-nums w-5 text-center ${value > 0 ? c : "text-faint"}`}>
        {value}
      </span>
      <button
        type="button"
        onClick={inc}
        className="w-5 h-5 grid place-items-center text-xs rounded border border-line bg-panel2 hover:bg-line/60 text-faint hover:text-ink"
        aria-label="augmenter"
      >+</button>
    </div>
  );
}
