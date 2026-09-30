import type { Config } from "tailwindcss";

/**
 * Theme Foot Analytics — Football Manager + chaud, deux modes.
 *
 * Toutes les couleurs sont liees a des CSS variables definies dans
 * globals.css. Le switch dark/light est gere par l'attribut
 * `data-theme` sur <html>, qui repointe les variables — pas besoin
 * du `darkMode` de Tailwind ici (on n'utilise pas les classes `dark:`).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        base:       "rgb(var(--bg) / <alpha-value>)",
        panel:      "rgb(var(--surface) / <alpha-value>)",
        panel2:     "rgb(var(--surface-2) / <alpha-value>)",
        line:       "rgb(var(--line) / <alpha-value>)",
        line2:      "rgb(var(--line-strong) / <alpha-value>)",

        ink:        "rgb(var(--ink) / <alpha-value>)",
        muted:      "rgb(var(--muted) / <alpha-value>)",
        faint:      "rgb(var(--faint) / <alpha-value>)",

        turf:       "rgb(var(--turf) / <alpha-value>)",
        turfdim:    "rgb(var(--turf-dim) / <alpha-value>)",
        turfdeep:   "rgb(var(--turf-deep) / <alpha-value>)",

        sky:        "rgb(var(--sky) / <alpha-value>)",
        amber:      "rgb(var(--amber) / <alpha-value>)",
        danger:     "rgb(var(--danger) / <alpha-value>)",

        win:        "rgb(var(--win) / <alpha-value>)",
        draw:       "rgb(var(--draw) / <alpha-value>)",
        loss:       "rgb(var(--loss) / <alpha-value>)",
      },
      fontFamily: {
        display: ["Geist", "system-ui", "sans-serif"],
        body:    ["Inter", "system-ui", "sans-serif"],
        mono:    ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl2: "12px",
        xl3: "14px",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        pop:   "var(--shadow-pop)",
        glow:  "0 0 0 1px rgb(var(--turf) / .3), 0 0 28px -8px rgb(var(--turf) / .4)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(.4,0,.2,1)",
      },
    },
  },
  plugins: [],
};
export default config;
