// src/features/auth/avant-changement.decorator.ts

import { SetMetadata } from "@nestjs/common";

/**
 * @AvantNouveauMotDePasse() : route ouverte a un compte qui n'a pas encore remplace son mot de passe temporaire
 * (profil, changement de mot de passe, deconnexion). Toutes les autres lui repondent 403 MOT_DE_PASSE_A_CHANGER :
 * le mot de passe temporaire ne sert qu'a en choisir un nouveau.
 */
export const AVANT_CHANGEMENT_KEY = "avantNouveauMotDePasse";
export const AvantNouveauMotDePasse = () => SetMetadata(AVANT_CHANGEMENT_KEY, true);
