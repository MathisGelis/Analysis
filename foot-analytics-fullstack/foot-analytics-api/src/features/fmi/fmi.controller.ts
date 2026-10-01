// src/features/fmi/fmi.controller.ts

import {
  BadRequestException, Controller, Post, Query, UploadedFile, UploadedFiles, UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";

import { FmiService } from "./fmi.service";

@Controller("fmi")
export class FmiController {
  constructor(private svc: FmiService) {}

  // POST /fmi/parse  (multipart, champ "file") -> dry-run, ne cree rien en base.
  // Utile pour diagnostiquer une FMI qui ne s'importe pas correctement :
  // retourne le JSON brut tel que le parser le voit, plus un diagnostic
  // sur les champs vitaux.
  @Post("parse")
  @UseInterceptors(FileInterceptor("file"))
  async parseDebug(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException("Aucun fichier recu (champ 'file').");
    const parsed = await (this.svc as any).parseBuffer(file.buffer, file.originalname);
    // Diagnostic : champs vitaux + compositions
    const diagnostic = {
      numero_match: parsed?.numero_match ?? null,
      date: parsed?.date ?? null,
      journee: parsed?.journee ?? null,
      equipe_recevante: parsed?.equipe_recevante ?? null,
      equipe_visiteuse: parsed?.equipe_visiteuse ?? null,
      score: (parsed?.score_recevant != null && parsed?.score_visiteur != null)
        ? `${parsed.score_recevant}-${parsed.score_visiteur}` : null,
      compo_recevante: parsed?.compo_recevante?.length ?? 0,
      compo_visiteuse: parsed?.compo_visiteuse?.length ?? 0,
      cartons: parsed?.cartons?.length ?? 0,
      cartonsVerts: parsed?.cartons_verts?.length ?? 0,
      buteurs: parsed?.buteurs?.length ?? 0,
      remplacements: parsed?.remplacements?.length ?? 0,
      officiels: parsed?.officiels?.length ?? 0,
      encadrement: parsed?.encadrement?.length ?? 0,
    };
    // Liste des problemes detectes
    const problemes: string[] = [];
    if (!diagnostic.equipe_recevante) problemes.push("equipe recevante non extraite");
    if (!diagnostic.equipe_visiteuse) problemes.push("equipe visiteuse non extraite");
    if (!diagnostic.score) problemes.push("score non extrait");
    if (!diagnostic.numero_match) problemes.push("numero FMI non extrait");
    if (diagnostic.compo_recevante + diagnostic.compo_visiteuse < 11) {
      problemes.push("compositions tres courtes — possible probleme d'extraction");
    }
    return { diagnostic, problemes, parsed_brut: parsed };
  }

  // POST /fmi/import?recompute=false  (multipart, champ "file")
  @Post("import")
  @UseInterceptors(FileInterceptor("file"))
  async import(
    @UploadedFile() file: Express.Multer.File,
    @Query("recompute") recompute?: string,
  ) {
    if (!file) throw new BadRequestException("Aucun fichier recu (champ 'file').");
    return this.svc.importPdf(file.buffer, file.originalname, recompute !== "false");
  }

  // POST /fmi/import-batch  (multipart, champ "files" repete) -> dossier complet
  @Post("import-batch")
  @UseInterceptors(FilesInterceptor("files", 1000))
  async importBatch(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) {
      throw new BadRequestException("Aucun fichier recu (champ 'files').");
    }
    return this.svc.importMany(
      files.map((f) => ({ buffer: f.buffer, originalname: f.originalname })),
    );
  }
}
