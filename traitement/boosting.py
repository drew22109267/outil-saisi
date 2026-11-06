r"""
XGBoost (Chen et Guestrin, 2016) écrit à la main en numpy, perte carrée, pour estimer les durées inconnues
(traitement.imputation, méthodes « xgboost » et « hybride »). Le même algorithme, en torch, sert au triage et
aux lits (nera-modele, svr/concurrents.py) ; il est réécrit ici pour que l'outil ne dépende pas du modèle.

Une somme d'arbres  F(x) = F₀ + η Σ_m f_m(x),  F₀ = moyenne de y. À l'étape m, avec les résidus de la perte
carrée g_i = F(x_i) − y_i (dérivée première) et h_i = 1 (dérivée seconde), l'arbre minimise
    Σ_i [g_i f(x_i) + ½ h_i f(x_i)²] + γ T + ½ λ Σ_feuilles w².
Feuille de sommes G, H :  w* = −G/(H + λ).  Coupure gardée si
    gain = ½ [G_G²/(H_G + λ) + G_D²/(H_D + λ) − G²/(H + λ)] − γ > 0,
et chaque côté garde H ≥ min_hessien (ici : au moins `min_feuille` séjours, puisque h = 1).

Cases vides (prix ou âge non écrits) : comme XGBoost, chaque coupure apprend une DIRECTION PAR DÉFAUT. Les
séjours dont la variable manque sont essayés à gauche puis à droite, et l'on garde le côté de plus grand gain.
Aucune imputation préalable : l'absence d'une valeur peut elle-même renseigner sur la durée.
"""
from __future__ import annotations

import numpy as np


class ArbreXGB:
    """Arbre du second ordre, stocké en tableaux : variable (−1 = feuille), seuil, côté des manquants, valeur."""

    def __init__(self, profondeur: int, lam: float, gamma: float, min_feuille: int):
        self.prof, self.lam, self.gamma, self.min_feuille = profondeur, lam, gamma, min_feuille

    def _coupure(self, X, g):
        """Toutes les variables à la fois : tri par colonne (cases vides en dernier), cumuls de g, deux directions."""
        n, p = X.shape
        if n < 2 * self.min_feuille:
            return 0.0, -1, 0.0, True
        G, H = g.sum(), float(n)
        base = G * G / (H + self.lam)
        ordre = np.argsort(X, axis=0, kind="stable")                    # numpy range les NaN à la fin
        xs, gs = np.take_along_axis(X, ordre, 0), g[ordre]
        ecrits = (~np.isnan(X)).sum(0)                                  # séjours où la variable est écrite
        cum = np.cumsum(np.where(np.isnan(xs), 0.0, gs), axis=0)
        Gc, Hc = cum[:-1], np.arange(1, n, dtype=float)[:, None]       # k + 1 premiers séjours écrits à gauche
        Gm, Hm = G - cum[-1], n - ecrits                                # les séjours sans valeur
        k = np.arange(n - 1)[:, None]
        possible = (k + 1 < ecrits) & (xs[1:] - xs[:-1] > 1e-9)
        meilleur = (0.0, -1, 0.0, True)                                 # (gain, variable, seuil, manquants à gauche)
        for gauche_m in (True, False):
            GG, HG = Gc + (Gm if gauche_m else 0.0), Hc + (Hm if gauche_m else 0.0)
            GD, HD = G - GG, H - HG
            with np.errstate(invalid="ignore", divide="ignore"):            # positions impossibles, masquées ensuite
                gain = 0.5 * (GG ** 2 / (HG + self.lam) + GD ** 2 / (HD + self.lam) - base) - self.gamma
            gain = np.where(possible & (HG >= self.min_feuille) & (HD >= self.min_feuille), gain, -np.inf)
            i = int(np.argmax(gain))
            ligne, j = divmod(i, p)
            if gain[ligne, j] > meilleur[0]:
                meilleur = (float(gain[ligne, j]), j, float((xs[ligne, j] + xs[ligne + 1, j]) / 2), gauche_m)
        return meilleur

    def construire(self, X, g) -> "ArbreXGB":
        self.var, self.seuil, self.manq_g, self.gauche, self.droite, self.valeur = [], [], [], [], [], []
        pile = [(np.arange(len(g)), 0, None, None)]
        while pile:
            idx, prof, parent, cote = pile.pop()
            noeud = len(self.var)
            if parent is not None:
                (self.gauche if cote == "g" else self.droite)[parent] = noeud
            gain, j, s, mg = self._coupure(X[idx], g[idx]) if prof < self.prof else (0.0, -1, 0.0, True)
            if j >= 0:
                x = X[idx, j]
                va_g = np.where(np.isnan(x), mg, x <= s)
                if va_g.all() or not va_g.any():
                    j = -1
            self.var.append(j)
            self.seuil.append(s)
            self.manq_g.append(mg)
            self.gauche.append(-1)
            self.droite.append(-1)
            self.valeur.append(-g[idx].sum() / (len(idx) + self.lam) if j < 0 else 0.0)
            if j >= 0:
                pile.append((idx[~va_g], prof + 1, noeud, "d"))
                pile.append((idx[va_g], prof + 1, noeud, "g"))
        self.var, self.seuil, self.manq_g = np.array(self.var), np.array(self.seuil), np.array(self.manq_g)
        self.gauche, self.droite, self.valeur = np.array(self.gauche), np.array(self.droite), np.array(self.valeur)
        return self

    def predire(self, X) -> np.ndarray:
        noeud = np.zeros(len(X), dtype=int)
        lignes = np.arange(len(X))
        for _ in range(self.prof + 1):
            j = self.var[noeud]
            feuille = j < 0
            if feuille.all():
                break
            x = X[lignes, np.maximum(j, 0)]
            va_g = np.where(np.isnan(x), self.manq_g[noeud], x <= self.seuil[noeud])
            noeud = np.where(feuille, noeud, np.where(va_g, self.gauche[noeud], self.droite[noeud]))
        return self.valeur[noeud]


class XGBoostRegression:
    """Perte carrée ; `predire_etapes` donne la prévision après chaque arbre (choix du nombre d'arbres)."""

    def __init__(self, arbres: int = 300, taux: float = 0.1, profondeur: int = 3, lam: float = 1.0, gamma: float = 0.0,
                 min_feuille: int = 5, sous: float = 0.8, graine: int = 0):
        self.M, self.eta, self.prof, self.lam, self.gamma = arbres, taux, profondeur, lam, gamma
        self.min_feuille, self.sous, self.graine = min_feuille, sous, graine

    def entrainer(self, X, y) -> "XGBoostRegression":
        rng = np.random.default_rng(self.graine)
        n = len(y)
        self.F0 = float(np.mean(y))
        F = np.full(n, self.F0)
        self.arbres = []
        for _ in range(self.M):
            idx = rng.permutation(n)[:max(2 * self.min_feuille, int(self.sous * n))]
            arbre = ArbreXGB(self.prof, self.lam, self.gamma, self.min_feuille).construire(X[idx], (F - y)[idx])
            F += self.eta * arbre.predire(X)
            self.arbres.append(arbre)
        return self

    def predire(self, X, arbres: int | None = None) -> np.ndarray:
        return self.F0 + self.eta * sum((a.predire(X) for a in self.arbres[:arbres]), np.zeros(len(X)))

    def predire_etapes(self, X, etapes) -> dict[int, np.ndarray]:
        """{m: prévision avec les m premiers arbres} pour chaque m de `etapes`, en une seule passe."""
        F, res = np.full(len(X), self.F0), {}
        for m, a in enumerate(self.arbres, start=1):
            F = F + self.eta * a.predire(X)
            if m in etapes:
                res[m] = F.copy()
        return res
