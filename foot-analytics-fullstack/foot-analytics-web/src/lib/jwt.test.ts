import { describe, expect, it } from "vitest";
import { decoderPayloadJwt } from "./jwt";

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");

describe("decoderPayloadJwt", () => {
  it("decode le payload, accents compris (UTF-8)", () => {
    const token = `${b64url({ alg: "HS256" })}.${b64url({ login: "ÉLODIE", role: "admin", exp: 123 })}.sig`;
    expect(decoderPayloadJwt(token)).toMatchObject({ login: "ÉLODIE", role: "admin", exp: 123 });
  });
  it("renvoie null pour un jeton mal forme", () => {
    expect(decoderPayloadJwt("abc")).toBeNull();
    expect(decoderPayloadJwt("a.@@@.c")).toBeNull();
    expect(decoderPayloadJwt("")).toBeNull();
  });
});
