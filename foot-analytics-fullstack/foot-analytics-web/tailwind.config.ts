import type { Config } from "tailwindcss";

/**
 * Theme Foot Analytics — "Soiree de match" : bleu nuit + accent violet, deux modes.
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
        panel3:     "rgb(var(--surface-3) / <alpha-value>)",
        line:       "rgb(var(--line) / <alpha-value>)",
        line2:      "rgb(var(--line-strong) / <alpha-value>)",

        ink:        "rgb(var(--ink) / <alpha-value>)",
        muted:      "rgb(var(--muted) / <alpha-value>)",
        faint:      "rgb(var(--faint) / <alpha-value>)",

        accent:       "rgb(var(--accent) / <alpha-value>)",
        accentdim:    "rgb(var(--accent-dim) / <alpha-value>)",
        accentdeep:   "rgb(var(--accent-deep) / <alpha-value>)",
        accentstrong: "rgb(var(--accent-strong) / <alpha-value>)",
        accent2:      "rgb(var(--accent-2) / <alpha-value>)",

        sky:        "rgb(var(--sky) / <alpha-value>)",
        amber:      "rgb(var(--amber) / <alpha-value>)",
        danger:     "rgb(var(--danger) / <alpha-value>)",

        win:        "rgb(var(--win) / <alpha-value>)",
        draw:       "rgb(var(--draw) / <alpha-value>)",
        loss:       "rgb(var(--loss) / <alpha-value>)",
      },
      fontFamily: {
        display: ['"Bricolage Grotesque Variable"', '"Instrument Sans Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        body:    ['"Instrument Sans Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono:    ['"JetBrains Mono Variable"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        xl2: "14px",
        xl3: "18px",
        xl4: "24px",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
        pop:   "var(--shadow-pop)",
        glow:  "var(--glow-accent)",
      },
      transitionTimingFunction: {
        smooth: "cubic-bezier(.2,.8,.2,1)",
      },
    },
  },
  plugins: [],
};
export default config;
