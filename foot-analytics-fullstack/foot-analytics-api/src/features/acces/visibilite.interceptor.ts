// src/features/acces/visibilite.interceptor.ts

import { CallHandler, ExecutionContext, Injectable, NestInterceptor, StreamableFile } from "@nestjs/common";
import { map, Observable } from "rxjs";

import type { ContexteAcces } from "./contexte-acces";
import { filtrerReponse } from "./visibilite";

/**
 * Filet de securite de la matrice de visibilite (voir visibilite.ts) : sur toute reponse JSON d'une requete
 * authentifiee, un objet porteur d'un clubId qui n'est pas celui du compte perd ses champs prives (licence, date de
 * naissance, morphologie, sante, fatigue, commentaires). L'administrateur voit tout. Fichiers et flux : intacts.
 */
@Injectable()
export class VisibiliteInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    const acces = ctx.switchToHttp().getRequest()?.acces as ContexteAcces | undefined;
    return next.handle().pipe(map((corps) => {
      if (!acces || acces.admin || corps instanceof StreamableFile || Buffer.isBuffer(corps)) return corps;
      return filtrerReponse(corps, (clubId) => acces.gereClub(clubId));
    }));
  }
}
