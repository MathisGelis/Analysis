// src/modules/fmi/fmi.module.ts
//
// Import des feuilles de match FFF (FMI).
// Flux : upload PDF -> execution de parser/parse_fmi.py (Python) ->
//        normalisation -> creation du Match + compositions + evenements.
// Apres import, les effectifs (tous clubs) et le classement sont recalcules
// automatiquement a partir des matchs (sauf si recompute=false, utile pour
// les gros lots ou l'on recalcule une seule fois a la fin).

import {
  BadRequestException, Controller, Injectable, Logger, Module, Post, Query,
  UploadedFile, UploadedFiles, UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FileInterceptor, FilesInterceptor } from "@nestjs/platform-express";
import { execFile } from "child_process";
import { promisify } from "util";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { MatchsModule, MatchsService } from "../matchs/matchs.module";
import { ClubsModule, ClubsService } from "../clubs/clubs.module";
import { DerivationModule, DerivationService } from "../derivation/derivation.module";
import { ArbitresModule, ArbitresService } from "../arbitres/arbitres.module";
import { CoachsModule, CoachsService } from "../coachs/coachs.module";
import { EquipesModule, EquipesService } from "../equipes/equipes.module";
import { SaisonsModule, SaisonsService } from "../saisons/saisons.module";

// Normalise une chaine pour comparaison (NFD + lowercase + trim).
function norm(s?: string | null): string {
  return (s ?? "").toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim();
}

const execFileAsync = promisify(execFile);

@Injectable()
export class FmiService {
  private readonly log = new Logger("FMI");

  constructor(
    private cfg: ConfigService,
    private matchs: MatchsService,
    private clubs: ClubsService,
    private derivation: DerivationService,
    private arbitres: ArbitresService,
    private coachs: CoachsService,
    private equipes: EquipesService,
    private saisons: SaisonsService,
  ) {}

  /** Execute le parser Python sur un buffer PDF et renvoie le JSON parse. */
  async parseBuffer(buffer: Buffer, filename: string): Promise<any> {
    const python = this.cfg.get<string>("PYTHON_BIN", "python3");
    const parser = this.cfg.get<string>("FMI_PARSER_PATH", "parser/parse_fmi.py");
    const dir = await mkdtemp(join(tmpdir(), "fmi-"));
    const pdfPath = join(dir, filename.replace(/[^\w.\-]/g, "_") || "feuille.pdf");
    try {
      await writeFile(pdfPath, buffer);
      const { stdout } = await execFileAsync(python, [parser, pdfPath], {
        maxBuffer: 1024 * 1024 * 20,
      });
      return JSON.parse(stdout);
    } catch (e: any) {
      this.log.error(`Echec parsing FMI: ${e.message}`);
      throw new BadRequestException(
        "Impossible de parser ce PDF. Verifiez qu'il s'agit bien d'une FMI FFF " +
        "et que Python + pdfplumber sont installes (voir parser/requirements.txt).",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /**
   * Parse en **batch** plusieurs PDF en UN seul lancement Python.
   *
   * Le startup de Python + import de pdfplumber coute ~230ms par appel ;
   * sur un import de 220 FMI on economise donc ~50s rien qu'en startup.
   * Le parser sait deja gerer un dossier via --batch.
   */
  async parseBuffersBatch(
    files: { buffer: Buffer; originalname: string }[],
  ): Promise<{ originalname: string; parsed: any | null; error?: string }[]> {
    if (files.length === 0) return [];
    const python = this.cfg.get<string>("PYTHON_BIN", "python3");
    const parser = this.cfg.get<string>("FMI_PARSER_PATH", "parser/parse_fmi.py");
    const dir = await mkdtemp(join(tmpdir(), "fmi-batch-"));
    const inDir = join(dir, "in");
    const outDir = join(dir, "out");
    const { mkdir, readFile, readdir } = await import("fs/promises");
    await mkdir(inDir, { recursive: true });
    await mkdir(outDir, { recursive: true });

    // Mapping nom-sur-disque -> nom d'origine (pour la reconciliation).
    // On numerote pour eviter les collisions et caracteres exotiques.
    const mapping = new Map<string, string>();
    try {
      await Promise.all(files.map(async (f, i) => {
        const safe = `f${i.toString().padStart(4, "0")}_${
          f.originalname.replace(/[^\w.\-]/g, "_") || "feuille.pdf"
        }`;
        mapping.set(safe, f.originalname);
        await writeFile(join(inDir, safe), f.buffer);
      }));

      // Lancement unique : python parse_fmi.py --batch <inDir> --output <outDir>
      await execFileAsync(python, [parser, inDir, "--batch", "--output", outDir], {
        maxBuffer: 1024 * 1024 * 100,  // jusqu'a 100MB de stdout (pour les logs)
      });

      // Lecture des JSON produits.
      const jsons = await readdir(outDir);
      const byStem = new Map<string, string>();   // stem -> jsonFilename
      for (const j of jsons) {
        if (j.endsWith(".json")) byStem.set(j.replace(/\.json$/, ""), j);
      }
      const results: { originalname: string; parsed: any | null; error?: string }[] = [];
      for (const [safe, original] of mapping.entries()) {
        const stem = safe.replace(/\.pdf$/i, "");
        const jsonFile = byStem.get(stem);
        if (!jsonFile) {
          results.push({
            originalname: original, parsed: null,
            error: "Parser n'a pas produit de JSON pour ce fichier",
          });
          continue;
        }
        try {
          const content = await readFile(join(outDir, jsonFile), "utf-8");
          results.push({ originalname: original, parsed: JSON.parse(content) });
        } catch (e: any) {
          results.push({ originalname: original, parsed: null, error: e.message });
        }
      }
      return results;
    } catch (e: any) {
      this.log.error(`Echec parsing batch FMI: ${e.message}`);
      throw new BadRequestException(
        "Impossible de parser ces PDF en batch. Verifiez Python + pdfplumber.",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  /** Trouve un club par nom approximatif, ou en cree un nouveau.
   *  La comparaison est stricte : egalite apres normalisation (suppression
   *  des accents, casse, ponctuation, suffixes "FC"/"AS"/"US"...). On NE
   *  fait PAS de includes() large, sinon "Neuville 1" et "Neuville 2"
   *  fusionneraient — ce qui faussait les classements.
   *
   *  Si `cache` est fourni, on l'utilise pour eviter de re-faire findAll
   *  a chaque appel (utile pour les imports en lot).
   */
  /**
   * Strip le suffixe d'equipe (1, 2, 21, B, II...) du nom de club pour
   * obtenir le vrai nom du club FFF. "O. Lyon Sud 21" -> "O. Lyon Sud".
   *
   * Ces suffixes designent l'**equipe** (1ere, 2eme, U20=21) et non un
   * club distinct. Le numero FFF est unique pour un meme club.
   */
  private stripEquipeSuffixe(nom: string): string {
    return nom.trim()
      .replace(/\s+(?:\d{1,2}|[Bb]|II|III)$/u, "")
      .trim();
  }

  /** Trouve un club par numero FFF (clef forte) puis par nom normalise.
   *  Le numero FFF est partage entre toutes les equipes d'un meme club,
   *  contrairement au nom qui inclut souvent le suffixe d'equipe
   *  ("O. Lyon Sud 1", "O. Lyon Sud 2", "O. Lyon Sud 21" = meme club 520061).
   */
  private async resolveClub(
    nom: string,
    cache?: { clubsByCleanedName: Map<string, string>; clubsByFff: Map<string, string>; clean: (s: string) => string },
    numeroFff?: string,
  ): Promise<string> {
    // 1) Si numero FFF dispo : match strict en priorite.
    if (numeroFff) {
      if (cache) {
        const byFff = cache.clubsByFff.get(numeroFff);
        if (byFff) return byFff;
      } else {
        const found = await this.clubs.findAll();
        const hit = found.find((c) => (c as any).numeroFff === numeroFff);
        if (hit) return hit.id;
      }
    }

    // 2) Sinon par nom normalise (sans suffixe d'equipe).
    const reservePrefixes = /\b(fc|as|us|ol|rc|sc|sa|cs|cm|fa|fcm|fco|club|football)\b/g;
    const clean = cache?.clean ?? ((s: string) =>
      this.stripEquipeSuffixe(s)
        .toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,;:!?'"`/\\()]/g, " ")
        .replace(reservePrefixes, " ")
        .replace(/\s+/g, " ")
        .trim());
    const target = clean(nom);
    if (!target) {
      throw new BadRequestException(`Nom de club vide : "${nom}"`);
    }
    if (cache) {
      const cached = cache.clubsByCleanedName.get(target);
      if (cached) {
        // Met a jour le numero FFF du club s'il n'en a pas encore.
        if (numeroFff) {
          const existingFff = cache.clubsByFff.get(numeroFff);
          if (!existingFff) {
            await this.clubs.update(cached, { numeroFff } as any);
            cache.clubsByFff.set(numeroFff, cached);
          }
        }
        return cached;
      }
    } else {
      const clubs = await this.clubs.findAll();
      const hit = clubs.find((c) => clean(c.nom) === target);
      if (hit) {
        if (numeroFff && !(hit as any).numeroFff) {
          await this.clubs.update(hit.id, { numeroFff } as any);
        }
        return hit.id;
      }
    }

    // 3) Aucun match : creer le club avec nom propre (sans suffixe).
    const nomPropre = this.stripEquipeSuffixe(nom.trim());
    const created = await this.clubs.create({
      nom: nomPropre || nom.trim(),
      abbr: (nomPropre || nom).slice(0, 3).toUpperCase(),
      numeroFff: numeroFff ?? undefined,
    } as any);
    if (cache) {
      cache.clubsByCleanedName.set(target, created.id);
      if (numeroFff) cache.clubsByFff.set(numeroFff, created.id);
    }
    return created.id;
  }

  /** Construit le cache de clubs au debut d'un batch d'import. */
  private async buildClubCache() {
    const clubs = await this.clubs.findAll();
    const reservePrefixes = /\b(fc|as|us|ol|rc|sc|sa|cs|cm|fa|fcm|fco|club|football)\b/g;
    const clean = (s: string) =>
      this.stripEquipeSuffixe(s)
        .toLowerCase().normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[.,;:!?'"`/\\()]/g, " ")
        .replace(reservePrefixes, " ")
        .replace(/\s+/g, " ")
        .trim();
    const clubsByCleanedName = new Map<string, string>();
    const clubsByFff = new Map<string, string>();
    for (const c of clubs) {
      clubsByCleanedName.set(clean(c.nom), c.id);
      if ((c as any).numeroFff) clubsByFff.set((c as any).numeroFff, c.id);
    }
    return { clubsByCleanedName, clubsByFff, clean };
  }

  /** Transforme le JSON du parser en Match + compositions + evenements.
   *  Valide les champs vitaux uniquement : equipes + score + numero FMI.
   *  Les compositions absentes ou incompletes ne bloquent pas l'import
   *  (le match compte pour le classement meme sans compo). */
  async importParsed(
    parsed: any,
    cache?: { clubsByCleanedName: Map<string, string>; clubsByFff: Map<string, string>; clean: (s: string) => string },
    rapport: { avertissements: string[] } = { avertissements: [] },
  ) {
    const erreurs: string[] = [];
    if (!parsed?.equipe_recevante?.trim()) erreurs.push("equipe recevante manquante");
    if (!parsed?.equipe_visiteuse?.trim()) erreurs.push("equipe visiteuse manquante");
    if (parsed?.score_recevant == null || parsed?.score_visiteur == null) {
      erreurs.push("score manquant");
    }
    if (!parsed?.numero_match) {
      erreurs.push("numero FMI manquant");
    }
    if (erreurs.length) {
      throw new BadRequestException(
        `FMI invalide ou illisible : ${erreurs.join(", ")}. ` +
        "Aucun match n'a ete cree.",
      );
    }
    // Compositions trop courtes : on accepte l'import (le match compte pour
    // le classement) mais on le signale dans le rapport de la feuille.
    const compoCount = (parsed?.compo_recevante?.length ?? 0)
      + (parsed?.compo_visiteuse?.length ?? 0);
    if (compoCount < 11) {
      rapport.avertissements.push(
        `compositions incompletes (${compoCount} joueur(s) releves) : effectifs et statistiques partiels`,
      );
    }

    const clubDom = await this.resolveClub(parsed.equipe_recevante, cache, parsed.club_recevant_id ?? undefined);
    const clubExt = await this.resolveClub(parsed.equipe_visiteuse, cache, parsed.club_visiteur_id ?? undefined);

    // Saison : on tente de la deduire de la date du match. Si la date
    // est absente, on retombe sur la saison active (ou null si aucune).
    let saisonId: string | null = null;
    try {
      const saison = parsed.date
        ? await this.saisons.ensureForDate(parsed.date)
        : await this.saisons.findActive();
      saisonId = saison?.id ?? null;
    } catch (e: any) {
      this.log.warn(`Saison non deduite (${parsed.date}) : ${e.message}`);
    }
    if (!saisonId) {
      rapport.avertissements.push("saison non determinee : le match n'est rattache a aucune saison");
    }

    // Equipes precises : on cree/recupere une equipe par (club,
    // competition, poule, saison). Deux equipes du meme club mais en
    // competitions differentes (Seniors D2 vs U20 R2) seront donc bien
    // distinctes dans la base.
    let equipeDomId: string | null = null;
    let equipeExtId: string | null = null;
    try {
      const eqDom = await this.equipes.upsertForFmi({
        clubId: clubDom, competitionLibelle: parsed.competition ?? null,
        poule: parsed.poule ?? null, saisonId,
      });
      const eqExt = await this.equipes.upsertForFmi({
        clubId: clubExt, competitionLibelle: parsed.competition ?? null,
        poule: parsed.poule ?? null, saisonId,
      });
      equipeDomId = eqDom.id;
      equipeExtId = eqExt.id;
    } catch (e: any) {
      // Non bloquant pour l'import, mais un match sans equipe n'apparait ni
      // dans un effectif ni dans un championnat : on le dit explicitement
      // (cette erreur etait auparavant avalee sans aucune trace).
      this.log.error(`Rattachement des equipes impossible (FMI ${parsed.numero_match}) : ${e.message}`);
      rapport.avertissements.push(
        `equipes non rattachees (${e.message}) : le match n'apparaitra pas dans les effectifs ni le championnat`,
      );
    }

    // Detection de cote pour les evenements : on compare le nom d'equipe
    // present dans l'evenement (string libre du parser) au nom recevant
    // vs visiteur. Plus fiable que la regex hardcodee precedente.
    const recevNorm = norm(parsed.equipe_recevante);
    const isRecev = (s?: string) => {
      if (!s) return false;
      const e = norm(s);
      return e === "recevante" || e === "recev"
        || recevNorm.includes(e) || e.includes(recevNorm);
    };

    const compositions = [
      ...(parsed.compo_recevante ?? []).map((p: any) => ({
        cote: "dom", numero: p.numero, nom: p.nom, prenom: p.prenom,
        licence: p.licence, titulaire: p.titulaire, capitaine: p.capitaine,
      })),
      ...(parsed.compo_visiteuse ?? []).map((p: any) => ({
        cote: "ext", numero: p.numero, nom: p.nom, prenom: p.prenom,
        licence: p.licence, titulaire: p.titulaire, capitaine: p.capitaine,
      })),
    ];

    const evenements: any[] = [];
    for (const c of parsed.cartons ?? []) {
      evenements.push({
        type: "carton", sousType: c.couleur, motif: c.motif,
        minute: c.minute, arret: c.arret ?? 0, joueur: c.joueur,
        equipe: isRecev(c.equipe) ? "dom" : "ext",
      });
    }
    for (const s of parsed.remplacements ?? []) {
      evenements.push({
        type: "remplacement", minute: s.minute, arret: s.arret ?? 0,
        joueur: s.sortant_nom, joueur2: s.entrant_nom,
        equipe: isRecev(s.equipe) ? "dom" : "ext",
      });
    }
    for (const b of parsed.blessures ?? []) {
      evenements.push({
        type: "blessure", sousType: b.localisation, minute: b.minute,
        arret: b.arret ?? 0, joueur: b.joueur,
        equipe: isRecev(b.equipe) ? "dom" : "ext",
      });
    }
    for (const g of parsed.buteurs ?? []) {
      evenements.push({
        type: "but", minute: g.minute, arret: g.arret ?? 0, joueur: g.buteur,
        joueur2: g.passeur, equipe: isRecev(g.equipe) ? "dom" : "ext",
      });
    }

    const arbitre =
      (parsed.officiels ?? []).find((o: any) =>
        /centre/i.test(o.role ?? ""))?.nom_complet ?? null;

    const payload = {
      numeroFmi: parsed.numero_match,
      journee: parsed.journee ?? "—",
      date: parsed.date,
      heure: parsed.heure,
      competition: parsed.competition,
      poule: parsed.poule,
      terrain: parsed.terrain,
      clubDom, clubExt,
      equipeDomId, equipeExtId,
      saisonId,
      scoreDom: parsed.score_recevant,
      scoreExt: parsed.score_visiteur,
      arbitre,
      formationDom: "4-4-2",
      formationExt: "4-2-3-1",
      statut: "joue",
      compositions,
      evenements,
    };

    let savedMatch: any;
    // Upsert : si un match avec ce numero FMI existe deja, on le met a jour
    // (re-import d'une meme feuille) plutot que de violer la contrainte unique.
    if (payload.numeroFmi) {
      const existing = await this.matchs.findByNumeroFmi(payload.numeroFmi);
      if (existing) {
        savedMatch = await this.matchs.update(existing.id, payload as any);
        (savedMatch as any).__reimport = true;
      }
    }
    if (!savedMatch) {
      savedMatch = await this.matchs.create(payload as any);
      (savedMatch as any).__reimport = false;
    }

    // Roles connus FFF : un seul "principal" par match (le central). Les
    // delegues ne sont PAS des arbitres principaux meme s'ils ont "principal"
    // dans leur libelle.
    let principalAffecte = false;
    let assistantsRestants = 2;
    for (const o of (parsed.officiels ?? [])) {
      const nom = (o.nom_complet ?? "").trim();
      if (!nom) continue;
      // Libelle normalise (sans accents) : la FMI ecrit "Délégué principal",
      // qu'un test sur "delegue" ne reconnaissait pas.
      const roleSrc = norm(o.role);
      // On ignore les delegues / observateurs (pas des arbitres).
      if (/delegue|observateur/.test(roleSrc)) continue;

      let role: string;
      if (!principalAffecte && /arbitre.*(centre|principal)|centre|arbitre.*central/.test(roleSrc)) {
        role = "principal";
        principalAffecte = true;
      } else if (/assistant\s*1|1.*assistant/.test(roleSrc)) {
        role = "assistant1";
      } else if (/assistant\s*2|2.*assistant/.test(roleSrc)) {
        role = "assistant2";
      } else if (/4|quatri/.test(roleSrc)) {
        role = "4e";
      } else if (/assistant|touche/.test(roleSrc)) {
        role = assistantsRestants === 2 ? "assistant1" : "assistant2";
        assistantsRestants--;
      } else {
        role = "autre";
      }
      try {
        const arb = await this.arbitres.upsertByNomComplet(nom);
        const existingLinks = await this.arbitres.listForMatch(savedMatch.id);
        const dup = existingLinks.find(
          (l) => l.arbitreId === arb.id && l.role === role,
        );
        if (!dup) {
          await this.arbitres.addToMatch({
            matchId: savedMatch.id, arbitreId: arb.id, role,
          });
        }
      } catch (e: any) {
        this.log.warn(`Arbitre "${nom}" non enregistre (FMI ${parsed.numero_match}) : ${e.message}`);
        rapport.avertissements.push(`arbitre "${nom}" non enregistre`);
      }
    }

    // Encadrement (staff sur le banc) : on cree un coach et un staff_match
    // par membre. On filtre cote derivation pour ignorer les DR
    // (delegues de rencontre).
    for (const s of (parsed.encadrement ?? [])) {
      const nomComplet = (s.nom_complet ?? "").trim();
      if (!nomComplet) continue;
      const fonctions = (s.fonction ?? "").trim();
      const coteCoach: "dom" | "ext" = s.equipe === "recevante" ? "dom" : "ext";
      const clubCoach = coteCoach === "dom" ? clubDom : clubExt;
      try {
        const coach = await this.coachs.upsert(nomComplet, s.licence, clubCoach);
        // Anti-doublon (re-import) : on ne recree pas le lien s'il existe deja.
        const existing = await this.coachs.listForMatch(savedMatch.id);
        const dup = existing.find(
          (l) => l.coachId === coach.id && l.cote === coteCoach,
        );
        if (!dup) {
          await this.coachs.addToMatch({
            matchId: savedMatch.id, coachId: coach.id,
            cote: coteCoach, fonctions,
          });
        }
      } catch (e: any) {
        // Un coach mal parse ne doit pas faire echouer l'import.
        this.log.warn(`Encadrant "${nomComplet}" non enregistre (FMI ${parsed.numero_match}) : ${e.message}`);
        rapport.avertissements.push(`encadrant "${nomComplet}" non enregistre`);
      }
    }

    return savedMatch;
  }

  private resume(match: any) {
    return {
      score: `${match.scoreDom}-${match.scoreExt}`,
      titulaires: match.compositions?.filter((c: any) => c.titulaire).length ?? 0,
      evenements: match.evenements?.length ?? 0,
    };
  }

  /** Import d'une seule feuille. recompute=true -> derive effectifs+classement. */
  async importPdf(buffer: Buffer, filename: string, recompute = true) {
    const parsed = await this.parseBuffer(buffer, filename);
    const rapport = { avertissements: [] as string[] };
    const match = await this.importParsed(parsed, undefined, rapport);
    if (recompute) await this.derivation.rebuildAll();
    return {
      ok: true,
      reimport: (match as any).__reimport === true,
      matchId: match.id,
      numeroFmi: match.numeroFmi,
      resume: this.resume(match),
      avertissements: rapport.avertissements,
      match,
    };
  }

  /**
   * Import d'un lot de feuilles : on parse en batch (1 seul Python), puis on
   * importe tout en base, puis on recalcule UNE fois a la fin.
   *
   * Renvoie un RAPPORT PAR FICHIER, jamais une exception globale pour un
   * fichier defaillant :
   *   { fichier, ok, statut: "importe" | "mis_a_jour" | "echec",
   *     code (si echec) : "parse_impossible" | "fmi_invalide" | "erreur_interne",
   *     erreur (si echec), avertissements: string[], matchId, numeroFmi, resume }
   */
  async importMany(files: { buffer: Buffer; originalname: string }[]) {
    // Phase 1 : parsing en batch. Un seul lancement Python pour tous les
    // fichiers -> on economise N * 230ms de startup pdfplumber.
    const parsedResults = await this.parseBuffersBatch(files);

    // Phase 2 : pre-charge le cache des clubs (evite N findAll en base).
    const cache = await this.buildClubCache();

    // Phase 3 : insertion sequentielle en base avec cache partage.
    const results: RapportFichierFmi[] = [];
    const vusDansLeLot = new Map<string, string>();   // numero FMI -> 1er fichier
    for (const pr of parsedResults) {
      if (!pr.parsed) {
        results.push({
          fichier: pr.originalname, ok: false, statut: "echec",
          code: "parse_impossible", erreur: pr.error ?? "Fichier illisible",
          avertissements: [],
        });
        continue;
      }
      const rapport = { avertissements: [] as string[] };
      const numero: string | undefined = pr.parsed.numero_match;
      if (numero && vusDansLeLot.has(numero)) {
        rapport.avertissements.push(
          `meme numero FMI (${numero}) que ${vusDansLeLot.get(numero)} : doublon dans le lot, le match est mis a jour`,
        );
      } else if (numero) {
        vusDansLeLot.set(numero, pr.originalname);
      }
      try {
        const match = await this.importParsed(pr.parsed, cache, rapport);
        const reimport = (match as any).__reimport === true;
        results.push({
          fichier: pr.originalname, ok: true,
          statut: reimport ? "mis_a_jour" : "importe",
          reimport, matchId: match.id, numeroFmi: match.numeroFmi,
          resume: this.resume(match), avertissements: rapport.avertissements,
        });
      } catch (e: any) {
        results.push({
          fichier: pr.originalname, ok: false, statut: "echec",
          code: e instanceof BadRequestException ? "fmi_invalide" : "erreur_interne",
          erreur: e.message, avertissements: rapport.avertissements,
        });
      }
    }

    // Phase 4 : une seule reconstruction a la fin. Son echec ne doit pas
    // masquer le rapport : les matchs sont deja en base.
    let derive: { joueurs?: number; classement?: number; erreur?: string };
    try {
      derive = await this.derivation.rebuildAll();
    } catch (e: any) {
      this.log.error(`Reconstruction effectifs/classement echouee apres import : ${e.message}`);
      derive = { erreur: e.message };
    }

    const importes = results.filter((r) => r.statut === "importe").length;
    const misAJour = results.filter((r) => r.statut === "mis_a_jour").length;
    const echecs = results.filter((r) => r.statut === "echec").length;
    return {
      ok: echecs === 0 && !derive.erreur,
      // `importes` = feuilles traitees avec succes (nouvelles + mises a jour),
      // nom historique lu par l'ecran d'import.
      importes: importes + misAJour,
      nouveaux: importes,
      mis_a_jour: misAJour,
      echecs,
      avec_avertissements: results.filter((r) => r.avertissements.length > 0).length,
      total: files.length,
      derive,
      resultats: results,
    };
  }
}

/** Rapport d'import d'une feuille dans un lot. */
export interface RapportFichierFmi {
  fichier: string;
  ok: boolean;
  statut: "importe" | "mis_a_jour" | "echec";
  code?: "parse_impossible" | "fmi_invalide" | "erreur_interne";
  erreur?: string;
  reimport?: boolean;
  matchId?: string;
  numeroFmi?: string;
  resume?: { score: string; titulaires: number; evenements: number };
  avertissements: string[];
}

@Controller("fmi")
class FmiController {
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

@Module({
  imports: [MatchsModule, ClubsModule, DerivationModule, ArbitresModule, CoachsModule, EquipesModule, SaisonsModule],
  controllers: [FmiController],
  providers: [FmiService],
})
export class FmiModule {}
