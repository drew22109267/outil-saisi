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
        assert set(METHODES[1:]) <= set(t.index)
        assert {"knn k=1", "knn k=15", "knn k=51"} <= set(t.index)            # balayage de k
        assert {"knn (mise à l'échelle robuste)", "regression (sans logarithme)", "em (sans logarithme)"} <= set(t.index)
        for m in ("estimee", "knn", "regression", "em"):
            assert t.loc[m, "erreur_moyenne_nuits"] < t.loc["mediane", "erreur_moyenne_nuits"], (evaluation, m)
        assert t.loc["mediane", "p_wilcoxon"] < 0.05                     # la médiane est significativement moins bonne
        assert t.loc["mediane", "IC95_bas"] <= t.loc["mediane", "erreur_moyenne_nuits"] <= t.loc["mediane", "IC95_haut"]


def test_k_choisi_par_validation_croisee():
    from traitement.imputation import K_GRILLE, ModeleDuree
    m = ModeleDuree("knn").ajuster(sejours())
    assert m.k in K_GRILLE and m.erreurs_k[m.k] == min(m.erreurs_k.values())
    assert m.k > 1                                                         # un seul voisin : trop instable


def test_wilcoxon_connu():
    from traitement.imputation import _wilcoxon
    assert _wilcoxon(np.array([1.0] * 20)) < 1e-3                         # toujours plus mauvais : significatif
    d = np.array([1.0, -1.0] * 15)
    assert _wilcoxon(d) > 0.9                                              # symétrique : rien


@pytest.mark.parametrize("options", [dict(echelle="robuste"), dict(log=False)])
def test_variantes_de_pretraitement(options):
    from traitement.imputation import ModeleDuree
    s = sejours()
    for m in ("knn", "regression", "em", "acp_iterative"):
        e = ModeleDuree(m, **options).ajuster(s.iloc[:300]).predire(s.iloc[300:])
        assert len(e) == 100 and (e["nuits"] >= 0).all() and (e["nuits_q1"] <= e["nuits"]).all()


@pytest.mark.parametrize("methode", ["regression", "em", "acp_iterative", "softimpute"])
def test_reglage_choisi_par_validation_croisee(methode):
    from traitement.imputation import ModeleDuree
    m = ModeleDuree(methode).ajuster(sejours())
    assert m.erreurs_reglage is not None and m.reglage in m.erreurs_reglage
    assert m.erreurs_reglage[m.reglage] == min(m.erreurs_reglage.values())


@pytest.mark.parametrize("methode", ["knn", "regression", "em", "acp_iterative", "softimpute"])
def test_estimation_bornee_par_les_durees_connues(methode):
    from traitement.imputation import ModeleDuree
    s = sejours()
    test = s.iloc[300:].copy()
    test["prix"] = 1e9                                   # prix absurde : la durée estimée ne doit pas exploser
    e = ModeleDuree(methode).ajuster(s.iloc[:300]).predire(test)
    assert e["nuits_q3"].max() <= s.iloc[:300]["duree_nuits"].max()
