// src/lib/redirection.ts
//
// Validation des cibles de redirection ("?from=/matchs") : uniquement un
// chemin INTERNE. Sans ca, /login?from=https://site-malveillant.example
// renverrait l'utilisateur, une fois connecte, vers un site externe (open
// redirect, classique de l'hameconnage).

/** Renvoie `valeur` si c'est un chemin interne sur, sinon `defaut`. */
export function cheminInterne(valeur: string | null | undefined, defaut = "/"): string {
  if (!valeur) return defaut;
  // Doit commencer par un seul "/" : "//host" et "/\host" sont interpretes
  // comme des URL absolues par les navigateurs.
  if (!valeur.startsWith("/") || valeur.startsWith("//") || valeur.startsWith("/\\")) return defaut;
  // Pas de caracteres de controle (retour a la ligne : injection d'en-tete).
  if (/[\u0000-\u001f\u007f]/.test(valeur)) return defaut;
  return valeur;
}
