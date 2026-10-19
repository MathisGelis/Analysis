#!/usr/bin/env bash
# Garde-fou RGPD : refuse tout fichier de donnees personnelles dans le depot.
#   scripts/verifier-depot.sh            -> verifie tous les fichiers suivis (CI)
#   scripts/verifier-depot.sh --indexes  -> verifie les fichiers prets a etre commites (hook pre-commit)
# Interdits : feuilles de match et PDF (sauf feuilles anonymisees des tests), bases SQLite, tableurs, dossiers Data/,
# fichiers .env. Les secrets dans le code sont cherches par gitleaks (job CI dedie).
set -euo pipefail

if [[ "${1:-}" == "--indexes" ]]; then
  fichiers=$(git diff --cached --name-only --diff-filter=ACMR)
else
  fichiers=$(git ls-files)
fi

interdits=$(printf '%s\n' "$fichiers" | grep -E '(^|/)Data/|\.([pP][dD][fF]|sqlite3?|db|csv|xlsx?)$|(^|/)\.env(\.[^/]*)?$' \
  | grep -vE '^foot-analytics-fullstack/foot-analytics-api/parser/tests/fixtures/[^/]+_anonyme\.pdf$' \
  | grep -vE '(^|/)\.env\.example$' || true)

if [[ -n "$interdits" ]]; then
  echo "Fichiers interdits dans le depot (donnees personnelles possibles) :" >&2
  printf '%s\n' "$interdits" | sed 's/^/  /' >&2
  echo "Retirez-les (git rm --cached) ; une feuille de match de test doit d'abord etre anonymisee (parser/outils/anonymiser_fmi.py)." >&2
  exit 1
fi
echo "Depot propre : aucun fichier de donnees personnelles suivi."
