// src/features/limites/ip-client.ts
//
// Adresse IP du client, pour la limitation de debit. Le navigateur ne parle jamais a l'API directement : ses requetes
// passent par le serveur Next (BFF), si bien que l'API voit l'adresse du serveur Next, la meme pour tout le monde.
// Le BFF transmet donc l'adresse reelle dans X-FA-Client-Ip, accompagnee du secret partage BFF_SECRET (X-FA-Bff) :
// sans ce secret, l'en-tete est ignore (n'importe qui pourrait sinon s'inventer une adresse pour contourner les
// limites). A defaut, l'adresse vue par Express (req.ip, qui suit TRUST_PROXY derriere un proxy).

import { timingSafeEqual } from "node:crypto";

function egaux(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function ipClient(req: { headers?: Record<string, unknown>; ip?: string }, secret = process.env.BFF_SECRET): string {
  const fourni = req.headers?.["x-fa-bff"];
  const ip = req.headers?.["x-fa-client-ip"];
  if (secret && typeof fourni === "string" && egaux(fourni, secret) && typeof ip === "string" && ip.trim()) {
    return ip.trim().slice(0, 64);
  }
  return req.ip ?? "inconnue";
}

/** Valeur de `trust proxy` pour Express d'apres TRUST_PROXY : un nombre de proxys, "true", ou rien (defaut). */
export function confianceProxy(valeur = process.env.TRUST_PROXY): boolean | number {
  const v = (valeur ?? "").trim().toLowerCase();
  if (!v || v === "false" || v === "0") return false;
  if (v === "true") return true;
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : false;
}
