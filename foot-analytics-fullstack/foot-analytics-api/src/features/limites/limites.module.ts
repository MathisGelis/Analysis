// src/features/limites/limites.module.ts
//
// Limitation de debit (anti force brute, anti extraction), en memoire (une seule instance d'API) :
//   - requetes        : par compte authentifie (sinon par IP), toutes routes confondues : LIMITE_REQUETES_MINUTE (300) ;
//   - connexion-ip    : POST /auth/login par adresse IP : LIMITE_CONNEXIONS_MINUTE (10 par minute) ;
//   - connexion-login : POST /auth/login par login vise : LIMITE_CONNEXIONS_LOGIN (10 par quart d'heure).
// S'y ajoute le verrouillage du compte apres 5 echecs consecutifs (AuthService). Depassement : 429.
//
// Le garde (LimiteurGuard) est declare en APP_GUARD APRES l'authentification, pour connaitre le compte.

import { ExecutionContext, Injectable, Module, SetMetadata } from "@nestjs/common";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";

import { ipClient } from "./ip-client";

export const LIMITE_CONNEXION_KEY = "limiteConnexion";
/** Marque la route de connexion : les limites "connexion-*" ne s'appliquent qu'a elle. */
export const LimiteConnexion = () => SetMetadata(LIMITE_CONNEXION_KEY, true);

const estConnexion = (ctx: ExecutionContext) => Reflect.getMetadata(LIMITE_CONNEXION_KEY, ctx.getHandler()) === true;
const nombre = (valeur: string | undefined, defaut: number) => {
  const n = Number(valeur);
  return Number.isFinite(n) && n > 0 ? n : defaut;
};
// Une seule cle par limite et par suivi : un compte a le meme budget sur toutes les routes (sinon, une cle par route).
const cleGlobale = (_ctx: ExecutionContext, suivi: string, nom: string) => `${nom}:${suivi}`;

@Injectable()
export class LimiteurGuard extends ThrottlerGuard {}

@Module({
  imports: [
    ThrottlerModule.forRoot({
      errorMessage: "Trop de requetes : patiente un instant avant de reessayer.",
      throttlers: [
        {
          name: "requetes", ttl: 60_000, limit: nombre(process.env.LIMITE_REQUETES_MINUTE, 300),
          getTracker: (req) => (req.user?.sub ? `compte:${req.user.sub}` : `ip:${ipClient(req)}`),
          generateKey: cleGlobale,
        },
        {
          name: "connexion-ip", ttl: 60_000, limit: nombre(process.env.LIMITE_CONNEXIONS_MINUTE, 10),
          getTracker: (req) => ipClient(req), generateKey: cleGlobale, skipIf: (ctx) => !estConnexion(ctx),
        },
        {
          name: "connexion-login", ttl: 15 * 60_000, limit: nombre(process.env.LIMITE_CONNEXIONS_LOGIN, 10),
          getTracker: (req) => String(req.body?.login ?? "").trim().toUpperCase().slice(0, 64),
          generateKey: cleGlobale, skipIf: (ctx) => !estConnexion(ctx),
        },
      ],
    }),
  ],
  providers: [LimiteurGuard],
  exports: [LimiteurGuard],
})
export class LimitesModule {}
