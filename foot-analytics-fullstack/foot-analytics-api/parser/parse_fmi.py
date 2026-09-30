#!/usr/bin/env python3
"""
parse_fmi.py — Parseur de Feuille de Match Informatisee (FMI / FFF).

Lit un PDF de feuille de match du District (gabarit FFF standard) et en
extrait des donnees structurees, prêtes a etre inserees dans Supabase.

Usage
-----
    python parse_fmi.py feuille.pdf                  # -> JSON sur stdout
    python parse_fmi.py feuille.pdf -o sortie.json   # -> fichier JSON
    python parse_fmi.py dossier/ --batch -o out/     # -> tout un dossier

Dependances : pdfplumber  (voir requirements.txt)

Donnees extraites
-----------------
  * metadonnees      : numero, date, heure, competition, poule, terrain, score
  * officiels        : arbitres + delegues (role, nom, licence)
  * encadrement      : staff sur le banc (educateurs / dirigeants)
  * compositions     : titulaires (1-11) + remplacants des 2 equipes
  * remplacements    : entrant / sortant + minute
  * discipline       : cartons (equipe, joueur, motif, couleur estimee, minute)
  * blessures        : equipe, joueur, localisation, minute
  * buteurs          : equipe, buteur, type, passeur, minute

Le parseur s'appuie sur `pdfplumber.extract_tables()` : le gabarit FMI est
entierement constitue de tableaux bordes, ce qui rend l'extraction fiable.
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field, asdict
from pathlib import Path

try:
    import pdfplumber
except ImportError:
    sys.exit("Module 'pdfplumber' manquant. Lancez : pip install -r requirements.txt")


LICENSE_RE = re.compile(r"^\d{8,10}$")
MINUTE_RE = re.compile(r"(\d+)'?\s*\+\s*(\d+)")
# Detection d'une cellule qui ressemble a une minute pure ("22'", "22",
# "22' + 0'", "+ 0'"). Utilisee pour exclure ces cellules du parsing des
# motifs (sinon "22'" peut etre pris pour un motif de carton).
MINUTE_LIKE_RE = re.compile(r"^\s*\+?\s*\d{1,3}\s*'?\s*(?:\+\s*\d+\s*'?)?\s*$")
NUM_NAME_RE = re.compile(r"^\s*(\d{1,2})\s*-?\s*(.+)$")

# Motifs entrainant typiquement un carton ROUGE (heuristique — le texte FMI
# ne porte pas la couleur, seulement une icone). A defaut : jaune.
RED_KEYWORDS = (
    "brutalite", "brutalité", "crachat", "voie de fait", "geste obscene",
    "geste obscène", "propos grossier", "anéantit", "aneantit",
    "deuxieme avertissement", "deuxième avertissement", "injurieux",
)


# --------------------------------------------------------------------------- #
#  Modeles de donnees
# --------------------------------------------------------------------------- #
@dataclass
class Player:
    numero: int | None
    nom: str
    prenom: str
    licence: str | None
    titulaire: bool
    capitaine: bool = False


@dataclass
class Official:
    role: str
    nom_complet: str
    licence: str | None


@dataclass
class StaffMember:
    nom_complet: str
    licence: str | None
    fonction: str            # E = educateur, D = dirigeant, DR = delegue...
    equipe: str = ""         # "recevante" | "visiteuse"


@dataclass
class Substitution:
    equipe: str              # "recevante" | "visiteuse"
    sortant_licence: str | None
    sortant_nom: str
    entrant_licence: str | None
    entrant_nom: str
    minute: int | None
    arret: int = 0


@dataclass
class Card:
    equipe: str
    licence: str | None
    joueur: str
    numero: int | None
    motif: str
    couleur: str             # "jaune" | "rouge"
    minute: int | None
    arret: int = 0


@dataclass
class Injury:
    equipe: str
    licence: str | None
    joueur: str
    numero: int | None
    localisation: str
    complement: str
    minute: int | None
    arret: int = 0


@dataclass
class Goal:
    equipe: str
    licence: str | None
    buteur: str
    numero: int | None
    type_but: str
    action: str
    passeur: str | None
    minute: int | None
    arret: int = 0


@dataclass
class MatchSheet:
    numero_match: str | None = None
    numero_affaire: str | None = None
    date: str | None = None
    heure: str | None = None
    competition: str | None = None
    journee: str | None = None
    poule: str | None = None
    terrain: str | None = None
    equipe_recevante: str | None = None
    equipe_visiteuse: str | None = None
    club_recevant_id: str | None = None
    club_visiteur_id: str | None = None
    score_recevant: int | None = None
    score_visiteur: int | None = None
    officiels: list[Official] = field(default_factory=list)
    encadrement: list[StaffMember] = field(default_factory=list)
    compo_recevante: list[Player] = field(default_factory=list)
    compo_visiteuse: list[Player] = field(default_factory=list)
    remplacements: list[Substitution] = field(default_factory=list)
    cartons: list[Card] = field(default_factory=list)
    blessures: list[Injury] = field(default_factory=list)
    buteurs: list[Goal] = field(default_factory=list)
    source_fichier: str | None = None


# --------------------------------------------------------------------------- #
#  Utilitaires
# --------------------------------------------------------------------------- #
def _clean(cell) -> str:
    return (cell or "").replace("\n", " ").strip()


def _minute(label: str) -> tuple[int | None, int]:
    """ "90' + 3'" -> (90, 3) ; "59' + 0'" -> (59, 0). """
    if not label:
        return None, 0
    m = MINUTE_RE.search(label)
    if m:
        return int(m.group(1)), int(m.group(2))
    m = re.search(r"(\d+)", label)
    return (int(m.group(1)), 0) if m else (None, 0)


def _split_name(token: str) -> tuple[str, str, int | None]:
    """
    "10 - GASPARD Mael" -> ("GASPARD", "Mael", 10)
    "MANSOUR Abdamalek (Capitaine)" -> ("MANSOUR", "Abdamalek", None)
    """
    numero = None
    m = NUM_NAME_RE.match(token or "")
    if m:
        numero = int(m.group(1))
        token = m.group(2)
    token = (token or "").replace("(Capitaine)", "").strip()
    parts = token.split()
    nom = [p for p in parts if p and p == p.upper() and any(c.isalpha() for c in p)]
    prenom = [p for p in parts if p not in nom]
    if not nom and parts:                       # secours
        return parts[0], " ".join(parts[1:]), numero
    return " ".join(nom), " ".join(prenom), numero


def _card_color(motif: str) -> str:
    low = (motif or "").lower()
    return "rouge" if any(k in low for k in RED_KEYWORDS) else "jaune"


def _header_text(table) -> str:
    return " | ".join(_clean(c) for c in (table[0] if table else []))


# --------------------------------------------------------------------------- #
#  Parsing des sections
# --------------------------------------------------------------------------- #
def _parse_meta(table, ms: MatchSheet):
    for row in table:
        c0 = _clean(row[0])
        if c0.startswith("Date"):
            m = re.search(r"([0-9/]{8,10})\s*([0-9hH:]+)?", c0)
            if m:
                ms.date = m.group(1)
                ms.heure = (m.group(2) or "").replace("h", ":").strip(":") or None
        elif c0.startswith("Comp"):
            m = re.search(r":\s*(.+)", c0)
            if m:
                val = m.group(1)
                mp = re.search(r"Poule\s*([A-Z0-9]+)", val)
                if mp:
                    ms.poule = mp.group(1)
                val = re.sub(r"[\s/]*Poule.*$", "", val)
                ms.competition = val.strip(" /")
                # Journee : "J3" ou "Journee 3" dans le libelle competition.
                mj = re.search(r"J(?:ourn[ée]e)?\s*0?(\d{1,2})", val, re.I)
                if mj:
                    ms.journee = mj.group(1)
            if len(row) > 3:
                ms.equipe_recevante = _clean(row[1]) or ms.equipe_recevante
                ms.equipe_visiteuse = _clean(row[3]) or ms.equipe_visiteuse
        elif c0.startswith("Terrain"):
            m = re.search(r":\s*(.+)", c0)
            if m:
                ms.terrain = m.group(1).strip()
        # Score : on cherche "Resultat" et on prend les cellules
        # numeriques de la ligne (logique d'origine, qui marchait sur les
        # vraies FMI). On evite la concatenation qui attrape des nombres
        # parasites (numero de match, journee, heure...).
        if any("sultat" in _clean(c) for c in row):     # ligne du score
            nums = [_clean(c) for c in row if _clean(c).isdigit()]
            if len(nums) >= 2:
                ms.score_recevant = int(nums[0])
                ms.score_visiteur = int(nums[1])


def _parse_officials(table, ms: MatchSheet):
    for row in table:
        cells = [_clean(c) for c in row]
        for base in (0, 3):
            if len(cells) >= base + 3:
                role, nom, lic = cells[base], cells[base + 1], cells[base + 2]
                if role and lic and LICENSE_RE.match(lic):
                    ms.officiels.append(Official(role, nom, lic))


def _parse_staff(table, ms: MatchSheet, forced_side: str | None = None):
    for row in table:
        cells = [_clean(c) for c in row]
        for base in (0, 3):
            if len(cells) >= base + 3:
                nom, lic, fonc = cells[base], cells[base + 1], cells[base + 2]
                if nom and lic and LICENSE_RE.match(lic):
                    # Si force par bbox, on respecte ; sinon base 0 = recevante.
                    cote = forced_side or ("recevante" if base == 0 else "visiteuse")
                    ms.encadrement.append(StaffMember(nom, lic, fonc, cote))


def _scan_lineup_row(cells: list[str]) -> list[tuple[int, str, str, int]]:
    """Trouve les triplettes (numero, nom, licence) d'une ligne de composition.
    Renvoie egalement l'index de la cellule licence pour pouvoir distinguer
    la colonne d'origine (recevante a gauche, visiteuse a droite)."""
    found = []
    for i, c in enumerate(cells):
        if LICENSE_RE.match(c):
            num_cell = cells[i - 2] if i >= 2 else ""
            name_cell = cells[i - 1] if i >= 1 else ""
            if num_cell.isdigit() and name_cell:
                found.append((int(num_cell), name_cell, c, i))
    return found


def _parse_lineup(table, ms: MatchSheet, titulaire: bool,
                  forced_side: str | None = None):
    # Si forced_side est fourni (= le sous-tableau ne couvre que la moitie
    # gauche ou droite de la page), tous les joueurs de ce tableau sont
    # forcement de ce cote — typiquement les sections REMPLACANTS qui
    # n'ont des joueurs que dans une colonne. Sinon, on utilise la
    # position de la cellule dans la ligne (compo principale a 2 colonnes).
    for row in table:
        cells = [_clean(c) for c in row]
        n = len(cells)
        if n == 0:
            continue
        milieu = n / 2
        for (num, name, lic, idx_cell) in _scan_lineup_row(cells):
            nom, prenom, _ = _split_name(name)
            if forced_side == "recevante":
                target = ms.compo_recevante
            elif forced_side == "visiteuse":
                target = ms.compo_visiteuse
            else:
                target = ms.compo_recevante if idx_cell < milieu else ms.compo_visiteuse
            target.append(Player(numero=num, nom=nom, prenom=prenom,
                                  licence=lic, titulaire=titulaire,
                                  capitaine="Capitaine" in name))


def _parse_subs(table, ms: MatchSheet):
    for row in table:
        cells = [_clean(c) for c in row]
        for base, equipe in ((0, "recevante"), (6, "visiteuse")):
            seg = cells[base:base + 6]
            if len(seg) < 6:
                continue
            sort_lic, sort_nom, _sep, ent_lic, ent_nom, mlabel = seg
            if not (LICENSE_RE.match(sort_lic) and LICENSE_RE.match(ent_lic)):
                continue
            mn, ar = _minute(mlabel)
            ms.remplacements.append(Substitution(
                equipe=equipe,
                sortant_licence=sort_lic, sortant_nom=sort_nom,
                entrant_licence=ent_lic, entrant_nom=ent_nom,
                minute=mn, arret=ar))


def _find_minute(cells):
    for c in cells:
        if MINUTE_RE.search(c) or (c and "+" in c):
            return _minute(c)
    return None, 0


def _parse_discipline(table, ms: MatchSheet):
    for row in table[1:]:
        cells = [_clean(c) for c in row]
        if len(cells) < 4 or not cells[1] or not LICENSE_RE.match(cells[1]):
            continue
        equipe, lic, joueur = cells[0], cells[1], cells[2]
        # Pour trouver le motif on prend la 1ere cellule qui :
        # - est non vide
        # - n'est pas une minute pure ("22'" ou "22' + 0'")
        # - n'est pas une couleur de carton (cellule vide entre)
        motif = next((c for c in cells[3:]
                      if c and not MINUTE_LIKE_RE.match(c)), "")
        mn, ar = _find_minute(cells)
        nom, prenom, num = _split_name(joueur)
        ms.cartons.append(Card(
            equipe=equipe, licence=lic, joueur=f"{nom} {prenom}".strip(),
            numero=num, motif=motif, couleur=_card_color(motif),
            minute=mn, arret=ar))


def _parse_injuries(table, ms: MatchSheet):
    for row in table[1:]:
        cells = [_clean(c) for c in row]
        if len(cells) < 4 or not cells[1] or not LICENSE_RE.match(cells[1]):
            continue
        equipe, lic, joueur, localisation = cells[0], cells[1], cells[2], cells[3]
        complement = cells[4] if len(cells) > 4 else ""
        mn, ar = _find_minute(cells)
        nom, prenom, num = _split_name(joueur)
        ms.blessures.append(Injury(
            equipe=equipe, licence=lic, joueur=f"{nom} {prenom}".strip(),
            numero=num, localisation=localisation, complement=complement,
            minute=mn, arret=ar))


def _parse_scorers(table, ms: MatchSheet):
    for row in table[1:]:
        cells = [_clean(c) for c in row]
        if len(cells) < 3 or not cells[1] or not LICENSE_RE.match(cells[1]):
            continue
        equipe, lic, joueur = cells[0], cells[1], cells[2]
        type_but = cells[3] if len(cells) > 3 else ""
        action = cells[4] if len(cells) > 4 else ""
        passeur = cells[5] if len(cells) > 5 else ""
        mn, ar = _find_minute(cells)
        nom, prenom, num = _split_name(joueur)
        ms.buteurs.append(Goal(
            equipe=equipe, licence=lic, buteur=f"{nom} {prenom}".strip(),
            numero=num, type_but=type_but, action=action,
            passeur=passeur or None, minute=mn, arret=ar))


# --------------------------------------------------------------------------- #
#  Pipeline principal
# --------------------------------------------------------------------------- #
def parse_fmi(pdf_path: str | Path) -> MatchSheet:
    pdf_path = Path(pdf_path)
    ms = MatchSheet(source_fichier=pdf_path.name)

    with pdfplumber.open(pdf_path) as pdf:
        # On extrait le texte de la page 0 UNE seule fois et on le
        # reutilise pour le numero de match ET pour les ids de club
        # (perf : extract_text est l'operation la plus couteuse de
        # pdfplumber, donc on evite de l'appeler deux fois).
        page0_text = pdf.pages[0].extract_text() or ""
        m = re.search(r"Match\s*N[°ºo]\s*(\d+)\s*\((\d+)\)", page0_text)
        if m:
            ms.numero_match, ms.numero_affaire = m.group(1), m.group(2)

        seen_titulaires = False
        for page in pdf.pages:
            page_width = page.width
            for tbl in page.find_tables():
                table = tbl.extract()
                if not table:
                    continue
                # Determine si le tableau est entierement a gauche, a droite,
                # ou s'etend sur toute la largeur. Si c'est un sous-tableau
                # cote gauche ou droite uniquement, on force le cote pour la
                # composition (utile pour la section REMPLACANTS qui peut
                # n'avoir des joueurs que d'un cote).
                bx0, _bt, bx1, _bb = tbl.bbox
                bcenter = (bx0 + bx1) / 2
                bwidth = bx1 - bx0
                forced_side: str | None = None
                if bwidth < page_width * 0.6:
                    forced_side = "recevante" if bcenter < page_width / 2 else "visiteuse"

                head_txt = _header_text(table).lower()
                flat = " ".join(_clean(c) for r in table for c in r).lower()

                if "date :" in flat and "résultat" in flat:
                    _parse_meta(table, ms)
                elif "arbitre centre" in flat:
                    _parse_officials(table, ms)
                elif "motif" in head_txt:
                    _parse_discipline(table, ms)
                elif "localisation" in head_txt:
                    _parse_injuries(table, ms)
                elif "type but" in head_txt:
                    _parse_scorers(table, ms)
                elif ("n° licence" in flat and "min (+)" in flat
                      and "motif" not in flat and "localisation" not in flat
                      and "type but" not in flat):
                    _parse_subs(table, ms)
                else:
                    triplets = [t for r in table
                                for t in _scan_lineup_row([_clean(c) for c in r])]
                    if len(triplets) >= 2:
                        first_num = triplets[0][0]
                        titulaire = first_num <= 11
                        _parse_lineup(table, ms, titulaire, forced_side)
                        seen_titulaires = seen_titulaires or titulaire
                    elif ("e/dr" in flat and "signature" not in flat
                          and any(LICENSE_RE.match(_clean(c))
                                  for r in table for c in r)):
                        _parse_staff(table, ms, forced_side)

        # Ids de club : on reutilise le texte deja extrait (cache).
        clubs = re.findall(r"-\s*(\d{6})\b", page0_text)
        if clubs:
            ms.club_recevant_id = clubs[0]
        if len(clubs) > 1:
            ms.club_visiteur_id = clubs[1]

    by_lic = {p.licence: f"{p.nom} {p.prenom}".strip()
              for p in ms.compo_recevante + ms.compo_visiteuse if p.licence}
    for s in ms.remplacements:
        s.sortant_nom = by_lic.get(s.sortant_licence) or _split_name(s.sortant_nom)[0]
        s.entrant_nom = by_lic.get(s.entrant_licence) or _split_name(s.entrant_nom)[0]

    return ms


def to_dict(ms: MatchSheet) -> dict:
    return asdict(ms)


def _process_one_pdf(args: tuple[Path, Path]) -> tuple[str, str | None]:
    """Parse un PDF et ecrit son JSON. Top-level pour etre picklable
    par multiprocessing.ProcessPoolExecutor."""
    pdf_path, out_dir = args
    try:
        ms = parse_fmi(pdf_path)
        (out_dir / f"{pdf_path.stem}.json").write_text(
            json.dumps(to_dict(ms), ensure_ascii=False, indent=2))
        return (pdf_path.name, None)
    except Exception as exc:                       # noqa: BLE001
        return (pdf_path.name, str(exc))


def main():
    ap = argparse.ArgumentParser(description="Parseur de Feuille de Match FFF")
    ap.add_argument("input", help="fichier PDF ou dossier (avec --batch)")
    ap.add_argument("-o", "--output", help="fichier / dossier de sortie")
    ap.add_argument("--batch", action="store_true",
                    help="traiter tous les .pdf d'un dossier")
    args = ap.parse_args()

    src = Path(args.input)
    if args.batch:
        out_dir = Path(args.output or "out")
        out_dir.mkdir(exist_ok=True, parents=True)
        pdfs = sorted(src.glob("*.pdf"))

        # Parallelisation : 1 process par CPU disponible (cap a 8 pour
        # eviter trop de pression memoire). pdfplumber/pdfminer est
        # CPU-bound (parsing pur Python).
        import os
        from concurrent.futures import ProcessPoolExecutor
        n_workers = min(8, max(1, os.cpu_count() or 1))
        tasks = [(p, out_dir) for p in pdfs]
        # Sequentiel si un seul PDF ou un seul CPU.
        if len(pdfs) <= 1 or n_workers <= 1:
            for task in tasks:
                name, err = _process_one_pdf(task)
                if err:
                    print(f"ERR  {name} : {err}", file=sys.stderr)
                else:
                    print(f"OK   {name}")
        else:
            with ProcessPoolExecutor(max_workers=n_workers) as ex:
                for name, err in ex.map(_process_one_pdf, tasks):
                    if err:
                        print(f"ERR  {name} : {err}", file=sys.stderr)
                    else:
                        print(f"OK   {name}")
        print(f"\n{len(pdfs)} feuille(s) traitee(s) -> {out_dir}/")
    else:
        ms = parse_fmi(src)
        payload = json.dumps(to_dict(ms), ensure_ascii=False, indent=2)
        if args.output:
            Path(args.output).write_text(payload)
            print(f"Ecrit -> {args.output}")
        else:
            print(payload)


if __name__ == "__main__":
    main()
