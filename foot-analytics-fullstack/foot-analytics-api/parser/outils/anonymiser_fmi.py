"""Fabrique une feuille de match (FMI) de reference ANONYMISEE a partir d'une vraie.

Les noms, prenoms et numeros de licence de toutes les personnes (joueurs, staff, officiels) sont remplaces par des
valeurs fictives deterministes de meme longueur ; les signatures manuscrites (images) sont effacees ; les metadonnees
du PDF sont videes. La mise en page (tableaux, icones de cartons) est conservee : le parseur lit le PDF anonymise
exactement comme l'original. Sert a garder des tests de non-regression sans donnee personnelle dans le depot.

Outil de developpement (non utilise en production) :
    pip install pymupdf pdfplumber
    python outils/anonymiser_fmi.py <fmi_reelle.pdf> <sortie_anonyme.pdf>

Le script echoue si un seul nom ou numero de licence d'origine reste lisible dans le PDF produit.
"""
from __future__ import annotations

import hashlib
import re
import sys
from pathlib import Path

import pymupdf

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import parse_fmi as p  # noqa: E402

CONSONNES = "BDFGKLMNPRSTVZ"
VOYELLES = "AEIOU"
TAILLE_SIGNATURE = 150  # px : les signatures manuscrites sont des images d'environ 237 x 280


def _graine(mot: str) -> int:
    return int(hashlib.sha256(mot.encode()).hexdigest(), 16)


def pseudo_mot(mot: str) -> str:
    """Mot fictif prononcable, de meme longueur, deterministe (meme mot reel -> meme mot fictif)."""
    g = _graine(mot)
    lettres = []
    for i in range(len(mot)):
        alphabet = CONSONNES if i % 2 == 0 else VOYELLES
        lettres.append(alphabet[g % len(alphabet)])
        g //= len(alphabet)
    faux = "".join(lettres)
    return faux if mot.isupper() else faux.capitalize()


def pseudo_licence(licence: str) -> str:
    """Licence fictive : prefixe 99 (jamais attribue), suite deterministe de meme longueur."""
    g = str(_graine(licence))
    return ("99" + g)[: len(licence)]


def jetons_personnels(d: dict) -> tuple[set[str], set[str]]:
    """(mots de noms et prenoms, licences) de toutes les personnes citees dans la feuille."""
    noms: list[str] = []
    licences: set[str] = set()
    for cote in ("compo_recevante", "compo_visiteuse"):
        for j in d[cote]:
            noms += [j.get("nom") or "", j.get("prenom") or ""]
            licences.add(j.get("licence") or "")
    for o in d["officiels"] + d["encadrement"]:
        noms.append(o.get("nom_complet") or "")
        licences.add(o.get("licence") or "")
    for r in d["remplacements"]:
        noms += [r.get("sortant_nom") or "", r.get("entrant_nom") or ""]
        licences |= {r.get("sortant_licence") or "", r.get("entrant_licence") or ""}
    for e in d["cartons"] + d.get("cartons_verts", []) + d["blessures"] + d["buteurs"]:
        noms.append(e.get("joueur") or e.get("nom") or "")
        licences.add(e.get("licence") or "")
    mots = {m for n in noms for m in re.findall(r"[A-Za-zÀ-ÿ'-]+", n) if len(m) > 1}
    return mots, {l for l in licences if l}


def anonymiser(source: Path, cible: Path) -> dict[str, str]:
    reel = p.to_dict(p.parse_fmi(source))
    mots, licences = jetons_personnels(reel)
    table = {m: pseudo_mot(m) for m in mots} | {l: pseudo_licence(l) for l in licences}
    motif = re.compile(r"\b(" + "|".join(sorted(map(re.escape, table), key=len, reverse=True)) + r")\b")

    doc = pymupdf.open(source)
    for page in doc:
        a_reecrire = []
        for bloc in page.get_text("dict")["blocks"]:
            for ligne in bloc.get("lines", []):
                for span in ligne["spans"]:
                    nouveau = motif.sub(lambda m: table[m.group(0)], span["text"])
                    if nouveau != span["text"]:
                        a_reecrire.append((span, nouveau))
        for span, _ in a_reecrire:
            page.add_redact_annot(pymupdf.Rect(span["bbox"]))
        # Signatures manuscrites : grandes images effacees (les petites icones de cartons, lues par le parseur, restent).
        for img in page.get_images(full=True):
            if img[2] >= TAILLE_SIGNATURE or img[3] >= TAILLE_SIGNATURE:
                for rect in page.get_image_rects(img[0]):
                    if rect.y0 > 400 or page.number > 0:   # zone signatures (le logo FFF du haut de page est conserve)
                        page.add_redact_annot(rect)
        page.apply_redactions(images=pymupdf.PDF_REDACT_IMAGE_REMOVE, graphics=pymupdf.PDF_REDACT_LINE_ART_NONE)
        for span, nouveau in a_reecrire:
            couleur = tuple(((span["color"] >> s) & 255) / 255 for s in (16, 8, 0))
            page.insert_text(span["origin"], nouveau, fontsize=span["size"] * 0.92, fontname="helv", color=couleur)

    doc.set_metadata({})
    doc.del_xml_metadata()
    doc.save(cible, garbage=4, deflate=True, clean=True)

    # Verification : plus aucune donnee d'origine lisible.
    texte = " ".join(pg.get_text() for pg in pymupdf.open(cible))
    restes = sorted({t for t in table if re.search(r"\b" + re.escape(t) + r"\b", texte)})
    if restes:
        raise SystemExit(f"Donnees d'origine encore presentes : {restes}")
    return table


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    t = anonymiser(Path(sys.argv[1]), Path(sys.argv[2]))
    print(f"{len(t)} jetons remplaces -> {sys.argv[2]}")
