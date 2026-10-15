"""Reports, capacité variable et kappa de Cohen : cas vérifiables à la main."""
import pandas as pd
import pytest

from traitement.chargement import preparer_sejours
from traitement.doublons import reperer_reports, retirer_reports_confirmes
from traitement.indicateurs import indicateurs
from traitement.occupation import reconstituer_occupation
from traitement.qualite_saisie import kappa_cohen


def test_reports_reperes_et_fusionnes():
    df = pd.DataFrame({
        "service_code": "PED", "sexe": ["M", "M", "F"], "quartier": ["Biyem", "Biyem", None], "age_mois": [48, 48, 12],
        "ancien_nouveau": ["Nouveau", "Ancien", "Ancien"],
        "date_entree": pd.to_datetime(["2026-01-25", "2026-01-25", "2026-01-10"]),
        "date_enregistrement": pd.to_datetime(["2026-01-25", "2026-02-01", "2026-02-01"]),
        "date_sortie": pd.to_datetime([None, "2026-02-03", None]), "duree_jours": [None, 9, None],
        "issue": [None, "Sortie", None], "sortie_calculee": [False, False, False]})
    r = reperer_reports(df, "PED").set_index("ligne")
    assert r.loc[1, "classement"] == "report confirmé" and r.loc[1, "origine"] == 0
    assert r.loc[2, "classement"] == "sans origine"                     # entré avant le début de la saisie : gardé
    fusion, n = retirer_reports_confirmes(df, r.reset_index())
    assert n == 1 and 1 not in fusion.index and fusion.loc[0, "date_sortie"] == pd.Timestamp("2026-02-03")


def test_capacite_variable():
    # 1 séjour : présent du 1er au 4 (sortie le 5). 2 lits du 1er au 2, puis 4 lits.
    df = pd.DataFrame({"service_code": ["PED"], "date_entree": pd.to_datetime(["2026-01-01"]),
                       "date_sortie": pd.to_datetime(["2026-01-05"]), "duree_jours": [4], "issue": ["Sortie"],
                       "sortie_calculee": [False]})
    s, _ = preparer_sejours(df, "PED", "2026-01-05")
    lits = pd.Series([2, 4], index=pd.to_datetime(["2026-01-01", "2026-01-03"]))
    occ = reconstituer_occupation(s, "2026-01-05", lits=lits)
    assert occ["lits"].tolist() == [2, 2, 4, 4]
    t = indicateurs(occ, s).loc["Total"]
    assert t["TOM_%"] == round(100 * 4 / (2 + 2 + 4 + 4), 1)             # JH / Σ lits du jour


def test_kappa_cohen():
    assert kappa_cohen(["M", "F", "M", "F"], ["M", "F", "M", "F"]) == 1.0
    assert kappa_cohen(["M", "M", "F", "F"], ["M", "F", "M", "F"]) == pytest.approx(0.0)   # pas mieux que le hasard
