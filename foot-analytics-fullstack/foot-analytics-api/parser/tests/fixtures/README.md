# PDFs de reference du parser FMI

Deposer ici les feuilles de match (FMI) qui servent de non-regression. Chaque
`*.pdf` present est automatiquement parse par `test_invariants_generiques`
(structure attendue d'une FMI valide) ; aucun autre changement de code n'est
necessaire.

Feuilles prevues (a copier depuis la machine du coach) :

| Fichier | Saison | Cas couvert |
|---|---|---|
| `FMI53415246.pdf`, `FMI53415257.pdf`, `FMI53415264.pdf`, `FMI53415269.pdf` | 25-26 | matchs de la saison en cours |
| `TEST_SR2.pdf` | ? | Seniors R2 |
| `TEST_U20R2.pdf` | ? | U20 R2 (autre categorie) |
| `TEST2024-2025.pdf` | 24-25 | ancienne saison, retrocompatibilite |

`FMI_Neuville1.pdf` (deja dans `parser/`) est la feuille de reference dont les
valeurs exactes sont verifiees dans `test_fmi_neuville1_valeurs_exactes`.

Pour figer les valeurs d'un nouveau PDF, ajouter un test dedie sur le modele
de `test_fmi_neuville1_valeurs_exactes` (pas de snapshot JSON global : il
casserait a chaque evolution volontaire du format de sortie).
