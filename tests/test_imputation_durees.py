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
    s = sejours()
    s["statut"] = np.where(s["prix"].isna(), "inconnue", "observee")      # les « vrais manquants » : prix non écrit
    v = valider_estimation(s, tous=s, bootstrap=200, repetitions=3, min_entrainement=50)
    assert set(v.index.get_level_values("evaluation")) == {"croisee", "temporelle", "masquage"}
    for evaluation in ("croisee", "temporelle"):
        t = v.loc[evaluation]
        assert set(t.index) == set(METHODES[1:])
        for m in ("estimee", "knn", "regression", "em"):
            assert t.loc[m, "erreur_moyenne_nuits"] < t.loc["mediane", "erreur_moyenne_nuits"], (evaluation, m)
        assert t.loc["mediane", "p_wilcoxon"] < 0.05                     # la médiane est significativement moins bonne
        assert t.loc["mediane", "IC95_bas"] <= t.loc["mediane", "erreur_moyenne_nuits"] <= t.loc["mediane", "IC95_haut"]


def test_wilcoxon_connu():
    from traitement.imputation import _wilcoxon
    assert _wilcoxon(np.array([1.0] * 20)) < 1e-3                         # toujours plus mauvais : significatif
    d = np.array([1.0, -1.0] * 15)
    assert _wilcoxon(d) > 0.9                                              # symétrique : rien
