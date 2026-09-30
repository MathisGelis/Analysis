"""Tests de non-regression du parser FMI (pdfplumber).

Lancer depuis foot-analytics-api/parser :
    pip install -r requirements-dev.txt
    pytest tests
"""
from __future__ import annotations

import re
from pathlib import Path

import pytest

import parse_fmi as p

PARSER_DIR = Path(__file__).resolve().parent.parent
FIXTURES = Path(__file__).resolve().parent / "fixtures"
REFERENCE = PARSER_DIR / "FMI_Neuville1.pdf"

# Toutes les feuilles disponibles : la reference + celles deposees dans fixtures/.
TOUS_LES_PDFS = [REFERENCE, *sorted(FIXTURES.glob("*.pdf"))]


@pytest.fixture(scope="module")
def neuville():
    return p.to_dict(p.parse_fmi(REFERENCE))


# --------------------------------------------------------------------------- #
#  Feuille de reference : valeurs exactes
# --------------------------------------------------------------------------- #
def test_fmi_neuville1_valeurs_exactes(neuville):
    d = neuville
    assert d["numero_match"] == "53415223"
    assert d["date"] == "18/01/2026"
    assert d["heure"] == "15:00"
    assert d["competition"] == "Seniors D2 / Phase Unique"
    assert d["poule"] == "C"
    assert d["terrain"] == "STADE JEAN OBOUSSIER 2"
    assert d["equipe_recevante"] == "Neuville S/S 2"
    assert d["equipe_visiteuse"] == "F.C. Meys Grezieu 1"
    assert (d["club_recevant_id"], d["club_visiteur_id"]) == ("504275", "560530")
    assert (d["score_recevant"], d["score_visiteur"]) == (2, 0)
    assert d["source_fichier"] == "FMI_Neuville1.pdf"


def test_fmi_neuville1_officiels_et_encadrement(neuville):
    roles = {o["role"]: o["nom_complet"] for o in neuville["officiels"]}
    assert roles["Arbitre centre"] == "FARGEOT Jeremy"
    assert roles["Arbitre assistant 1"] == "MEHIAOUI Karim"
    assert len(neuville["officiels"]) == 5
    cotes = sorted(s["equipe"] for s in neuville["encadrement"])
    assert cotes == ["recevante", "recevante", "visiteuse", "visiteuse"]


def test_fmi_neuville1_compositions(neuville):
    dom, ext = neuville["compo_recevante"], neuville["compo_visiteuse"]
    assert (len(dom), len(ext)) == (14, 13)
    assert sum(j["titulaire"] for j in dom) == 11
    assert sum(j["titulaire"] for j in ext) == 11
    assert [j["nom"] for j in dom if j["capitaine"]] == ["MANSOUR"]
    assert [j["nom"] for j in ext if j["capitaine"]] == ["VILLEMAGNE"]
    assert dom[0]["nom"] == "DRONEAU" and dom[0]["numero"] == 1


def test_fmi_neuville1_evenements(neuville):
    assert len(neuville["remplacements"]) == 5
    assert len(neuville["cartons"]) == 6
    assert len(neuville["blessures"]) == 1
    couleurs = sorted(c["couleur"] for c in neuville["cartons"])
    assert couleurs == ["jaune"] * 5 + ["rouge"]
    rouge = next(c for c in neuville["cartons"] if c["couleur"] == "rouge")
    assert rouge["joueur"] == "MANSOUR Abdamalek" and rouge["minute"] == 59
    assert neuville["blessures"][0]["localisation"] == "Cheville droite"
    # Temps additionnel : 90' + 3'
    additionnel = next(c for c in neuville["cartons"] if c["arret"] == 3)
    assert additionnel["minute"] == 90


def test_fmi_neuville1_score_sans_buteurs(neuville):
    """La FMI de reference affiche 2-0 mais son tableau BUTEURS est vide :
    le parser ne doit ni inventer de buteurs ni echouer. Le score vient de
    l'en-tete, jamais du nombre de buteurs."""
    assert neuville["score_recevant"] + neuville["score_visiteur"] == 2
    assert neuville["buteurs"] == []


# --------------------------------------------------------------------------- #
#  Invariants valables pour TOUTE feuille (reference + fixtures/*.pdf)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("pdf", TOUS_LES_PDFS, ids=lambda x: x.name)
def test_invariants_generiques(pdf):
    d = p.to_dict(p.parse_fmi(pdf))

    assert re.fullmatch(r"\d{6,10}", d["numero_match"] or ""), "numero de match illisible"
    assert re.fullmatch(r"\d{2}/\d{2}/\d{4}", d["date"] or ""), "date au format JJ/MM/AAAA"
    assert d["equipe_recevante"] and d["equipe_visiteuse"]
    assert d["equipe_recevante"] != d["equipe_visiteuse"]
    assert isinstance(d["score_recevant"], int) and isinstance(d["score_visiteur"], int)

    for cle in ("compo_recevante", "compo_visiteuse"):
        compo = d[cle]
        assert sum(j["titulaire"] for j in compo) == 11, f"{cle} : 11 titulaires attendus"
        licences = [j["licence"] for j in compo if j["licence"]]
        assert len(licences) == len(set(licences)), f"{cle} : licence en double"
        assert sum(j["capitaine"] for j in compo) <= 1, f"{cle} : plusieurs capitaines"

    for c in d["cartons"]:
        assert c["couleur"] in {"jaune", "rouge"}
        assert c["joueur"]
    for r in d["remplacements"]:
        assert r["equipe"] in {"recevante", "visiteuse"}
        assert r["minute"] is None or 0 <= r["minute"] <= 130


# --------------------------------------------------------------------------- #
#  Utilitaires
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize("libelle,attendu", [
    ("90' + 3'", (90, 3)),
    ("59' + 0'", (59, 0)),
    ("22'", (22, 0)),
    ("", (None, 0)),
    (None, (None, 0)),
])
def test_minute(libelle, attendu):
    assert p._minute(libelle) == attendu


@pytest.mark.parametrize("token,attendu", [
    ("10 - GASPARD Mael", ("GASPARD", "Mael", 10)),
    ("MANSOUR Abdamalek (Capitaine)", ("MANSOUR", "Abdamalek", None)),
    ("BEN KAHLA Eddy", ("BEN KAHLA", "Eddy", None)),
])
def test_split_name(token, attendu):
    assert p._split_name(token) == attendu


@pytest.mark.parametrize("motif,couleur", [
    ("Brutalité", "rouge"),
    ("Deuxième avertissement", "rouge"),
    ("Enfreindre avec persistance les Lois du Jeu", "jaune"),
    ("", "jaune"),
])
def test_couleur_carton(motif, couleur):
    assert p._card_color(motif) == couleur


def test_minute_pure_exclue_des_motifs():
    """Une cellule "22'" est une minute, pas un motif de carton."""
    assert p.MINUTE_LIKE_RE.match("22'")
    assert p.MINUTE_LIKE_RE.match("90' + 3'")
    assert not p.MINUTE_LIKE_RE.match("Contestation")
