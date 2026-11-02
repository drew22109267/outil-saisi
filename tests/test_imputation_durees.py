"""Durées de séjour inconnues : toutes les méthodes d'estimation, sur des séjours fictifs."""
import numpy as np
import pandas as pd
import pytest

from traitement.imputation import METHODES, estimer, tables_durees, valider_estimation


def sejours(n=400, graine=0):
    """La durée suit le prix (comme au registre) ; une part des prix et des âges n'est pas écrite."""
    r = np.random.default_rng(graine)
    nuits = r.integers(1, 10, n)
    prix = (nuits * 2500 + 2500).astype(float)
    prix[r.random(n) < 0.2] = np.nan
    age = [f"{a} ans" if r.random() > 0.1 else None for a in r.integers(0, 14, n)]
    return pd.DataFrame({"duree_nuits": nuits, "prix": prix, "age_texte": age, "sexe": r.choice(["M", "F"], n),
                         "ancien_nouveau": "N", "issue": "Sortie",
                         "entree": pd.date_range("2025-01-01", periods=n, freq="D")})


@pytest.mark.parametrize("methode", METHODES[1:])
def test_chaque_methode_donne_une_duree_et_une_fourchette(methode):
    s = sejours()
    e = estimer(s.iloc[300:], tables_durees(s.iloc[:300]), methode)
    assert len(e) == 100 and e["nuits"].notna().all()
    assert (e["nuits_q1"] <= e["nuits"]).all() and (e["nuits"] <= e["nuits_q3"]).all()
    assert (e["nuits"] >= 0).all()


def test_les_methodes_qui_lisent_le_prix_battent_la_mediane():
    v = valider_estimation(sejours())
    assert set(v.index) == set(METHODES[1:])
    for m in ("estimee", "knn", "regression", "em"):
        assert v.loc[m, "erreur_moyenne_nuits"] < v.loc["mediane", "erreur_moyenne_nuits"], m
