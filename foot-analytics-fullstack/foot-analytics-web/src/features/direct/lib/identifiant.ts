// src/features/direct/lib/identifiant.ts
//
// L'identifiant d'un evenement est fabrique sur l'appareil qui le saisit : c'est lui qui rend un envoi rejouable sans doublon.

export function nouvelId(): string {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID();
  // Page servie en http sur un reseau local : pas de randomUUID, mais getRandomValues existe.
  const o = new Uint8Array(16);
  c.getRandomValues(o);
  o[6] = (o[6] & 0x0f) | 0x40;
  o[8] = (o[8] & 0x3f) | 0x80;
  const h = Array.from(o, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
