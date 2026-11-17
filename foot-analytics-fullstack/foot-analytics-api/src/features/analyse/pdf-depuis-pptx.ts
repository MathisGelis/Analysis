// src/features/analyse/pdf-depuis-pptx.ts
//
// Le PDF du rapport est tire du PowerPoint (LibreOffice) : les deux formats affichent exactement les memes pages,
// avec les memes informations. Une seule conversion a la fois (LibreOffice n'aime pas les instances en parallele).

import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ServiceUnavailableException } from "@nestjs/common";

const DELAI_MS = 90_000;
let file: Promise<unknown> = Promise.resolve();

function lancer(dossier: string, entree: string): Promise<void> {
  const soffice = process.env.SOFFICE_BIN || "soffice";
  return new Promise((resolve, reject) => {
    execFile(
      soffice,
      [`-env:UserInstallation=file://${join(dossier, "profil")}`, "--headless", "--norestore", "--convert-to", "pdf", "--outdir", dossier, entree],
      { timeout: DELAI_MS, env: { ...process.env, HOME: dossier } },
      (erreur) => (erreur ? reject(erreur) : resolve()),
    );
  });
}

export function pdfDepuisPptx(pptx: Uint8Array): Promise<Uint8Array> {
  const travail = file.then(async () => {
    const dossier = await mkdtemp(join(tmpdir(), "rapport-"));
    try {
      const entree = join(dossier, "rapport.pptx");
      await writeFile(entree, pptx);
      await lancer(dossier, entree);
      return new Uint8Array(await readFile(join(dossier, "rapport.pdf")));
    } catch {
      throw new ServiceUnavailableException("Le PDF n'a pas pu être généré. Réessayez, ou exportez en PowerPoint.");
    } finally {
      await rm(dossier, { recursive: true, force: true });
    }
  });
  file = travail.catch(() => undefined);
  return travail;
}
