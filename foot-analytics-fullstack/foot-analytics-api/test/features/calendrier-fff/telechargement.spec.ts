import { CalendrierInjoignable, telechargerCalendrier } from "@/features/calendrier-fff/adresse-calendrier";

const ADRESSE = "https://media.fff.fr/calendars/2026/eq/6701_SEM_4.ics";

describe("telechargerCalendrier", () => {
  afterEach(() => jest.restoreAllMocks());

  it("une adresse qui n'est pas deja normalisee ne declenche aucun appel reseau", async () => {
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    for (const a of ["http://media.fff.fr/calendars/2026/eq/a.ics", "https://evil.example/calendars/2026/eq/a.ics", "media.fff.fr/calendars/2026/eq/a.ics"]) {
      await expect(telechargerCalendrier(a)).rejects.toThrow(CalendrierInjoignable);
    }
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ne suit aucune redirection (le serveur ne quitte pas media.fff.fr), avec un delai borne", async () => {
    let init: RequestInit | undefined;
    jest.spyOn(globalThis, "fetch").mockImplementation(async (_u: any, i?: any) => { init = i; return new Response("BEGIN:VCALENDAR\nEND:VCALENDAR"); });
    await expect(telechargerCalendrier(ADRESSE)).resolves.toContain("BEGIN:VCALENDAR");
    expect(init).toMatchObject({ redirect: "error" });
    expect(init?.signal).toBeDefined();
  });

  it("refus lisibles : redirection (erreur reseau), fichier trop gros annonce ou reel, reponse qui n'est pas un calendrier", async () => {
    const spy = jest.spyOn(globalThis, "fetch");
    spy.mockRejectedValueOnce(new TypeError("redirect mode is set to error"));
    await expect(telechargerCalendrier(ADRESSE)).rejects.toThrow(/injoignable/);
    spy.mockResolvedValueOnce(new Response("BEGIN:VCALENDAR", { headers: { "content-length": "5000000" } }));
    await expect(telechargerCalendrier(ADRESSE)).rejects.toThrow(/trop volumineux/);
    spy.mockResolvedValueOnce(new Response(`BEGIN:VCALENDAR${"x".repeat(1_000_001)}`));
    await expect(telechargerCalendrier(ADRESSE)).rejects.toThrow(/trop volumineux/);
    spy.mockResolvedValueOnce(new Response("<html></html>"));
    await expect(telechargerCalendrier(ADRESSE)).rejects.toThrow(/n'est pas un calendrier/);
    spy.mockResolvedValueOnce(new Response("", { status: 403 }));
    await expect(telechargerCalendrier(ADRESSE)).rejects.toThrow(/refuse la demande \(403\)/);
  });
});
