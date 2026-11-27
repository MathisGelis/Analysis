// src/features/analyse-jeu/rapport-apres-match.ts
//
// LE RAPPORT D'APRES-MATCH EN POWERPOINT (et en PDF via LibreOffice) : resume du match, statistiques comparees, buts par tranche, carte des tirs,
// compo et mouvements (remplacements, rouges, changements de systeme), lectures du jeu et bilan de l'entraineur. Tout vient de ce qui a ete
// saisi en direct et en apres-match ; une section sans donnee n'est pas fabriquee. Le fichier est pret a envoyer au staff ou aux joueurs.

import PptxGenJS from "pptxgenjs";

import { libelleFormation } from "@/features/matchs/systeme";

import type { ResumeMatch } from "./stats-jeu";

export interface ContenuApresMatch {
  nomNous: string; nomEux: string; date: string | null; competition: string | null; journee: string | null;
  resume: ResumeMatch;
  compo: { formation: string; titulaires: { numero: number | null; nom: string }[] } | null;
  /** Remplacements, rouges et changements de systeme de notre equipe, dans l'ordre du match. */
  mouvements: { minute: string; texte: string }[];
  bilan: { positifs: string | null; aTravailler: string | null; bilan: string | null } | null;
}

const COULEURS = { fond: "0E1320", titre: "1C253C", texte: "0B1020", clair: "F0F3FA", accent: "6552F0", adverse: "22A6E6", bon: "0F9D6B", alerte: "C0392B", gris: "5C6885", terrain: "1F5A3A", ligne: "7FB896" } as const;
const POLICE = "Calibri";
const LARGEUR = 13.33, HAUTEUR = 7.5;

/** Un fichier .pptx (octets) : une page par sujet, sans page vide. */
export async function construireRapportApresMatch(c: ContenuApresMatch): Promise<Uint8Array> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.title = `${c.nomNous} - ${c.nomEux} : rapport d'après-match`;
  const r = c.resume;
  const entete = (slide: PptxGenJS.Slide, titre: string) => {
    slide.background = { color: "FFFFFF" };
    slide.addShape("rect", { x: 0, y: 0, w: LARGEUR, h: 0.9, fill: { color: COULEURS.fond }, line: { color: COULEURS.fond } });
    slide.addText(titre, { x: 0.5, y: 0.1, w: LARGEUR - 1, h: 0.7, fontFace: POLICE, fontSize: 24, bold: true, color: COULEURS.clair, isTextBox: true });
    slide.addText(`${c.nomNous} – ${c.nomEux}`, { x: 0.5, y: HAUTEUR - 0.45, w: 8, h: 0.3, fontFace: POLICE, fontSize: 11, color: COULEURS.gris, isTextBox: true });
  };

  // 1. Couverture : le score.
  const couverture = pres.addSlide();
  couverture.background = { color: COULEURS.fond };
  couverture.addText("Rapport d'après-match", { x: 0.7, y: 0.8, w: LARGEUR - 1.4, h: 0.6, fontFace: POLICE, fontSize: 22, color: COULEURS.clair, isTextBox: true });
  couverture.addText(`${c.nomNous}  ${r.score.nous} – ${r.score.eux}  ${c.nomEux}`, { x: 0.7, y: 2.4, w: LARGEUR - 1.4, h: 1.4, fontFace: POLICE, fontSize: 44, bold: true, color: "FFFFFF", align: "center", isTextBox: true });
  couverture.addText([c.competition, c.journee, c.date].filter(Boolean).join(" · "), { x: 0.7, y: 4.1, w: LARGEUR - 1.4, h: 0.5, fontFace: POLICE, fontSize: 18, color: "98A4BD", align: "center", isTextBox: true });

  // 2. Statistiques comparees.
  if (r.stats.length > 0) {
    const s = pres.addSlide();
    entete(s, "Statistiques du match");
    const tete = [c.nomNous, "", c.nomEux].map((t, i) => ({ text: t, options: { bold: true, color: "FFFFFF", fill: { color: COULEURS.titre }, align: (i === 0 ? "right" : i === 2 ? "left" : "center") as "right" | "left" | "center" } }));
    const lignes = r.stats.map((l) => [
      { text: String(l.nous), options: { align: "right" as const, bold: l.nous > l.eux, color: COULEURS.accent } },
      { text: l.libelle, options: { align: "center" as const, color: COULEURS.texte } },
      { text: String(l.eux), options: { align: "left" as const, bold: l.eux > l.nous, color: COULEURS.adverse } },
    ]);
    s.addTable([tete, ...lignes], { x: 1.5, y: 1.2, w: LARGEUR - 3, colW: [4, 3.33, 4], fontFace: POLICE, fontSize: 16, rowH: 0.4, border: { type: "solid", color: "E0E5F0", pt: 0.5 } });
  }

  // 3. Buts par tranche de 15 minutes.
  if (r.tranches.length > 0 && r.butsSource !== "aucune") {
    const s = pres.addSlide();
    entete(s, "Buts par tranche de 15 minutes");
    const noms = r.tranches.map((t) => t.nom);
    s.addChart("bar", [{ name: c.nomNous, labels: noms, values: r.tranches.map((t) => t.nous) }, { name: c.nomEux, labels: noms, values: r.tranches.map((t) => t.eux) }], {
      x: 0.7, y: 1.2, w: LARGEUR - 1.4, h: 5.4, barDir: "col", barGrouping: "clustered", chartColors: [COULEURS.accent, COULEURS.adverse], showLegend: true, legendPos: "b", legendFontFace: POLICE, legendFontSize: 14,
      showValue: true, dataLabelFontFace: POLICE, dataLabelFontSize: 14, catAxisLabelFontFace: POLICE, catAxisLabelFontSize: 14, valAxisLabelFontFace: POLICE, valAxisLabelFontSize: 12, valAxisMinVal: 0, valAxisMajorUnit: 1,
    });
  }

  // 4. Carte des tirs : les notres (terrain vu de dessus, l'attaque en haut).
  const tirs = r.tirsDetail.nous.filter((t) => t.tier !== null && t.couloir !== null);
  if (tirs.length > 0) {
    const s = pres.addSlide();
    entete(s, `Nos tirs (${r.tirsDetail.nous.length}) et nos buts`);
    const X = 3.9, Y = 1.15, L = 5.5, H = 5.7;
    s.addShape("rect", { x: X, y: Y, w: L, h: H, fill: { color: COULEURS.terrain }, line: { color: COULEURS.ligne, width: 2 } });
    s.addShape("rect", { x: X + L * 0.19, y: Y, w: L * 0.62, h: H * 0.17, fill: { color: COULEURS.terrain }, line: { color: COULEURS.ligne, width: 1.5 } });
    for (const [i, t] of tirs.entries()) {
      const but = t.resultat === "but";
      // Une zone du terrain : 3 tiers (0 = offensif, en haut) x 5 couloirs (0 = gauche) ; le tir se place au centre de sa zone, decale pour ne pas se superposer.
      const cx = X + ((t.couloir as number) + 0.5) * (L / 5) + (((i * 37) % 11) - 5) * 0.035;
      const cy = Y + ((t.tier as number) + 0.5) * (H / 3) * 0.9 + (((i * 53) % 11) - 5) * 0.035;
      const d = but ? 0.34 : 0.24;
      s.addShape("ellipse", { x: cx - d / 2, y: cy - d / 2, w: d, h: d, fill: { color: but ? "FFD23F" : "FFFFFF", transparency: but ? 0 : 35 }, line: { color: but ? "000000" : "FFFFFF", width: 1 } });
    }
    s.addText([{ text: "● ", options: { color: "FFD23F" } }, { text: "but   ", options: { color: COULEURS.texte } }, { text: "○ ", options: { color: COULEURS.gris } }, { text: "autre tir", options: { color: COULEURS.texte } }],
      { x: X, y: Y + H + 0.02, w: L, h: 0.3, fontFace: POLICE, fontSize: 12, align: "center", isTextBox: true });
    const cad = r.tirsDetail.nous.filter((t) => ["but", "cadre", "arrete"].includes(t.resultat)).length;
    s.addText([
      { text: `${r.tirsDetail.nous.length} tirs`, options: { bold: true, breakLine: true } }, { text: `${cad} cadrés`, options: { breakLine: true } },
      { text: `${r.tirsDetail.nous.filter((t) => t.resultat === "but").length} buts`, options: { breakLine: true } }, { text: `xG ${r.tirsDetail.nous.reduce((x, t) => x + t.xg, 0).toFixed(2)}` },
    ], { x: 9.8, y: 2, w: 3, h: 2, fontFace: POLICE, fontSize: 20, color: COULEURS.texte, valign: "top", isTextBox: true });
  }

  // 5. Compo et mouvements.
  if (c.compo || c.mouvements.length > 0) {
    const s = pres.addSlide();
    entete(s, c.compo ? `Compo de départ · ${libelleFormation(c.compo.formation)}` : "Mouvements");
    if (c.compo) {
      s.addText(c.compo.titulaires.map((j, i) => ({ text: `${j.numero ?? "–"}  ${j.nom}`, options: { breakLine: i < c.compo!.titulaires.length - 1 } })), { x: 0.7, y: 1.2, w: 5.5, h: 5.4, fontFace: POLICE, fontSize: 18, color: COULEURS.texte, valign: "top", isTextBox: true });
    }
    if (c.mouvements.length > 0) {
      s.addText("Mouvements", { x: 6.8, y: 1.15, w: 5.8, h: 0.4, fontFace: POLICE, fontSize: 18, bold: true, color: COULEURS.accent, isTextBox: true });
      s.addText(c.mouvements.map((m, i) => ({ text: `${m.minute}'  ${m.texte}`, options: { breakLine: i < c.mouvements.length - 1 } })), { x: 6.8, y: 1.6, w: 5.8, h: 5, fontFace: POLICE, fontSize: 16, color: COULEURS.texte, valign: "top", paraSpaceAfter: 6, isTextBox: true });
    }
  }

  // 6. Lectures du jeu (constats) et bilan de l'entraineur.
  if (r.constats.length > 0) {
    const s = pres.addSlide();
    entete(s, "Ce que le match dit");
    s.addText(r.constats.slice(0, 6).flatMap((k, i, l) => [
      { text: k.titre, options: { bold: true, color: k.ton === "bon" ? COULEURS.bon : k.ton === "alerte" ? COULEURS.alerte : COULEURS.texte, breakLine: true } },
      { text: k.detail, options: { color: COULEURS.gris, breakLine: i < l.length - 1 } },
    ]), { x: 0.7, y: 1.2, w: LARGEUR - 1.4, h: 5.6, fontFace: POLICE, fontSize: 16, valign: "top", paraSpaceAfter: 8, isTextBox: true });
  }
  const b = c.bilan;
  if (b && (b.positifs || b.aTravailler || b.bilan)) {
    const s = pres.addSlide();
    entete(s, "Bilan de l'entraîneur");
    const bloc = (titre: string, texte: string | null, x: number, couleur: string) => texte && s.addText([{ text: titre, options: { bold: true, color: couleur, breakLine: true } }, { text: texte, options: { color: COULEURS.texte } }],
      { x, y: 1.2, w: 5.9, h: 5.4, fontFace: POLICE, fontSize: 16, valign: "top", paraSpaceAfter: 8, isTextBox: true });
    bloc("Ce qui a marché", b.positifs, 0.6, COULEURS.bon);
    bloc("À travailler", b.aTravailler, 6.8, COULEURS.alerte);
    if (b.bilan) s.addText(b.bilan, { x: 0.6, y: 5.6, w: LARGEUR - 1.2, h: 1.3, fontFace: POLICE, fontSize: 14, italic: true, color: COULEURS.gris, valign: "top", isTextBox: true });
  }

  const sortie = (await pres.write({ outputType: "uint8array" })) as Uint8Array;
  return sortie;
}
