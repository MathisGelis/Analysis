// ESLint 10 (configuration "flat").
//
// Reprend ce que fournissait eslint-config-next (next/core-web-vitals), dont les plugins (eslint-plugin-react, jsx-a11y,
// import) ne declarent pas encore ESLint 10 : regles Next, regles des hooks React, equivalents maintenus des regles React
// courantes (@eslint-react), accessibilite JSX et export par defaut anonyme.
//
// jsx-a11y n'a pas encore de version ESLint 10 : il est charge via @eslint/compat, et sa dependance a eslint est alignee par
// "overrides" dans package.json (a retirer des que le plugin la declare).

import { fixupPluginRules } from "@eslint/compat";
import eslintReact from "@eslint-react/eslint-plugin";
import nextPlugin from "@next/eslint-plugin-next";
import importX from "eslint-plugin-import-x";
import jsxA11y from "eslint-plugin-jsx-a11y";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default [
  { ignores: [".next/**", ".next-e2e/**", "node_modules/**", "test-results/**", "next-env.d.ts"] },
  {
    files: ["**/*.{ts,tsx,mjs}"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
    },
    plugins: {
      "@next/next": nextPlugin,
      "@eslint-react": eslintReact.configs.all.plugins["@eslint-react"],
      "react-hooks": reactHooks,
      "jsx-a11y": fixupPluginRules(jsxA11y),
      "import-x": importX,
    },
    rules: {
      // Next.js : recommande + core web vitals.
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      // Hooks React.
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // React (equivalents de react/jsx-key, no-children-prop, jsx-no-comment-textnodes, no-danger-with-children...).
      // react/no-unescaped-entities reste desactive : l'apostrophe droite est partout dans le JSX francais.
      "@eslint-react/no-missing-key": "error",
      "@eslint-react/jsx-no-comment-textnodes": "error",
      "@eslint-react/jsx-no-children-prop": "error",
      "@eslint-react/dom-no-dangerously-set-innerhtml-with-children": "error",
      "@eslint-react/no-direct-mutation-state": "error",
      "@eslint-react/dom-no-find-dom-node": "error",
      "@eslint-react/dom-no-render-return-value": "error",

      // Accessibilite JSX (les memes regles que next/core-web-vitals).
      "jsx-a11y/alt-text": ["warn", { elements: ["img"], img: ["Image"] }],
      "jsx-a11y/aria-props": "warn",
      "jsx-a11y/aria-proptypes": "warn",
      "jsx-a11y/aria-unsupported-elements": "warn",
      "jsx-a11y/role-has-required-aria-props": "warn",
      "jsx-a11y/role-supports-aria-props": "warn",

      "import-x/no-anonymous-default-export": "warn",
    },
  },
];
