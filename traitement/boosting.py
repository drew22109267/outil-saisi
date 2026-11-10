r"""
XGBoost (Chen et Guestrin, 2016) écrit à la main en PyTorch (CPU, float64), perte carrée, pour estimer les durées
inconnues (traitement.imputation, méthodes « xgboost » et « hybride »). Le même algorithme sert au triage et aux lits
(nera-modele, svr/concurrents.py) ; il est réécrit ici pour que l'outil ne dépende pas du modèle.

Une somme d'arbres  F(x) = F₀ + η Σ_m f_m(x),  F₀ = moyenne de y. À l'étape m, avec les résidus de la perte
carrée g_i = F(x_i) − y_i (dérivée première) et h_i = 1 (dérivée seconde), l'arbre minimise
    Σ_i [g_i f(x_i) + ½ h_i f(x_i)²] + γ T + ½ λ Σ_feuilles w².
Feuille de sommes G, H :  w* = −G/(H + λ).  Coupure gardée si
    gain = ½ [G_G²/(H_G + λ) + G_D²/(H_D + λ) − G²/(H + λ)] − γ > 0,
et chaque côté garde H ≥ min_hessien (ici : au moins `min_feuille` séjours, puisque h = 1).

Cases vides (prix ou âge non écrits) : comme XGBoost, chaque coupure apprend une DIRECTION PAR DÉFAUT. Les
séjours dont la variable manque sont essayés à gauche puis à droite, et l'on garde le côté de plus grand gain.
Aucune imputation préalable : l'absence d'une valeur peut elle-même renseigner sur la durée.

Construction (recherche exacte, comme la version numpy d'origine) : chaque colonne est triée UNE fois par arbre
(cases vides en dernier, tri stable) ; l'arbre est ensuite bâti NIVEAU PAR NIVEAU, tous les nœuds d'une même
profondeur à la fois : un tri stable par numéro de nœud regroupe les séjours de chaque nœud sans défaire l'ordre des
valeurs, et les sommes cumulées de g se lisent par segment. Mêmes coupures que la recherche nœud par nœud, avec la
même règle en cas d'égalité de gain : manquants à gauche d'abord, puis la plus petite position, puis la plus petite
variable ; le côté « manquants à droite » ne l'emporte que s'il fait STRICTEMENT mieux.
"""
from __future__ import annotations

import torch

TYPE = torch.float64


def _tenseur(X) -> torch.Tensor:
    return X.to(TYPE) if isinstance(X, torch.Tensor) else torch.as_tensor(X, dtype=TYPE)


class ArbreXGB:
    """Arbre du second ordre, stocké en tenseurs : variable (−1 = feuille), seuil, côté des manquants, enfants, valeur."""

    def __init__(self, profondeur: int, lam: float, gamma: float, min_feuille: int):
        self.prof, self.lam, self.gamma, self.min_feuille = profondeur, lam, gamma, min_feuille

    def construire(self, X: torch.Tensor, g: torch.Tensor) -> "ArbreXGB":
        n, p = X.shape
        lam, gam, mf = self.lam, self.gamma, self.min_feuille
        ordre = torch.sort(X, dim=0, stable=True).indices          # NaN en dernier (plus grand que tout)
        noeud = torch.zeros(n, dtype=torch.long)                    # nœud courant de chaque séjour (−1 : rangé)
        var, seuil, manq_g, gauche, droite, valeur = [-1], [0.0], [True], [-1], [-1], [0.0]
        actifs = torch.tensor([0])                                  # nœuds du niveau courant
        for prof in range(self.prof + 1):
            if not len(actifs):
                break
            ligne_actif = noeud >= 0
            cpt = torch.bincount(noeud[ligne_actif], minlength=len(var)).to(TYPE)
            sg = torch.zeros(len(var), dtype=TYPE).index_add_(0, noeud[ligne_actif], g[ligne_actif])
            choix = {}
            if prof < self.prof:
                choix = self._coupures(X, g, ordre, noeud, actifs, cpt, sg, p, lam, gam, mf)
            suivants = []
            for v in actifs.tolist():
                c = choix.get(v)
                if c is not None:
                    j, s, mg = c
                    lignes = noeud == v
                    x = X[lignes, j]
                    va_g = torch.where(torch.isnan(x), torch.tensor(mg), x <= s)
                    if bool(va_g.all()) or not bool(va_g.any()):
                        c = None
                if c is None:                                       # feuille
                    valeur[v] = float(-sg[v] / (cpt[v] + lam))
                    noeud[noeud == v] = -1
                    continue
                ig, idr = len(var), len(var) + 1
                var[v], seuil[v], manq_g[v], gauche[v], droite[v] = j, s, mg, ig, idr
                for _ in range(2):
                    var.append(-1); seuil.append(0.0); manq_g.append(True); gauche.append(-1); droite.append(-1)
                    valeur.append(0.0)
                pos = torch.nonzero(lignes).squeeze(1)
                noeud[pos] = torch.where(va_g, torch.tensor(ig), torch.tensor(idr))
                suivants += [ig, idr]
            actifs = torch.tensor(suivants, dtype=torch.long)
        self.var = torch.tensor(var, dtype=torch.long)
        self.seuil = torch.tensor(seuil, dtype=TYPE)
        self.manq_g = torch.tensor(manq_g, dtype=torch.bool)
        self.gauche = torch.tensor(gauche, dtype=torch.long)
        self.droite = torch.tensor(droite, dtype=torch.long)
        self.valeur = torch.tensor(valeur, dtype=TYPE)
        return self

    @staticmethod
    def _coupures(X, g, ordre, noeud, actifs, cpt, sg, p, lam, gam, mf) -> dict:
        """Meilleure coupure de chaque nœud actif : {nœud: (variable, seuil, manquants à gauche)}."""
        n = len(g)
        coupables = actifs[cpt[actifs] >= 2 * mf]
        if not len(coupables):
            return {}
        grand = len(cpt)                                            # rang des séjours hors jeu : à la fin
        cle = torch.where(torch.isin(noeud, coupables), noeud, torch.tensor(grand))
        nd = cle[ordre]                                             # (n, p) nœud de chaque séjour, colonne triée
        perm = torch.sort(nd, dim=0, stable=True).indices          # regroupe par nœud, garde l'ordre des valeurs
        o2 = ordre.gather(0, perm)
        ns = nd.gather(0, perm)[:, 0]                               # identique pour toutes les colonnes
        utiles = ns < grand
        m = int(utiles.sum())
        o2, ns = o2[:m], ns[:m]
        xs = X.gather(0, o2)
        gs = g[o2]
        vides = torch.isnan(xs)
        v = torch.where(vides, torch.zeros((), dtype=TYPE), gs)
        # début de chaque segment (nœud) et position k dans le nœud
        debut_pos = torch.ones(m, dtype=torch.bool)
        debut_pos[1:] = ns[1:] != ns[:-1]
        id_seg = torch.cumsum(debut_pos.long(), 0) - 1
        debuts = torch.nonzero(debut_pos).squeeze(1)
        k = torch.arange(m) - debuts[id_seg]
        nn_ = cpt[ns]                                               # taille du nœud, par position
        # sommes cumulées par segment (cumul global moins le cumul avant le début du segment)
        cum = torch.cumsum(v, 0)
        avant = torch.zeros((len(debuts), p), dtype=TYPE)
        avant[1:] = cum[debuts[1:] - 1]
        cum = cum - avant[id_seg]
        ecrits_seg = torch.zeros((len(debuts), p), dtype=TYPE).index_add_(0, id_seg, (~vides).to(TYPE))
        fin = torch.cat([debuts[1:] - 1, torch.tensor([m - 1])])
        G = sg[ns][:, None]
        H = nn_[:, None]
        ecrits = ecrits_seg[id_seg]
        Gm, Hm = G - cum[fin][id_seg], H - ecrits
        Gc, Hc = cum, (k + 1).to(TYPE)[:, None]
        base = G * G / (H + lam)
        xsuiv = torch.full_like(xs, float("nan"))
        xsuiv[:-1] = xs[1:]
        dernier = (k + 1).to(TYPE) >= nn_                           # dernière position du nœud : pas de coupure
        possible = ((k + 1)[:, None].to(TYPE) < ecrits) & ((xsuiv - xs) > 1e-9) & ~dernier[:, None]
        gains = []
        for gauche_m in (True, False):
            GG, HG = (Gc + Gm, Hc + Hm) if gauche_m else (Gc, Hc.expand_as(Gc))
            GD, HD = G - GG, H - HG
            gain = 0.5 * (GG ** 2 / (HG + lam) + GD ** 2 / (HD + lam) - base) - gam
            ok = possible & (HG >= mf) & (HD >= mf)
            gains.append(torch.where(ok, gain, torch.tensor(float("-inf"), dtype=TYPE)))
        gain = torch.stack(gains)                                   # (2, m, p)
        nseg = len(debuts)
        seg3 = id_seg[None, :, None].expand_as(gain).reshape(-1)
        gplat = gain.reshape(-1)
        meilleur = torch.full((nseg,), float("-inf"), dtype=TYPE).scatter_reduce(0, seg3, gplat, "amax")
        # ordre de préférence : direction (manquants à gauche d'abord), position k, variable j
        dir_idx = torch.arange(2)[:, None, None].expand_as(gain)
        rang = (dir_idx * (n * p) + (k[None, :, None] * p) + torch.arange(p)[None, None, :]).reshape(-1)
        candidat = (gplat == meilleur[seg3]) & (meilleur[seg3] > 0)
        grand_rang = torch.tensor(2 * n * p + 1)
        premier = torch.full((nseg,), int(grand_rang)).scatter_reduce(
            0, seg3, torch.where(candidat, rang, grand_rang), "amin")
        res = {}
        for s_i in range(nseg):
            r = int(premier[s_i])
            if r > 2 * n * p:
                continue
            d, reste = divmod(r, n * p)
            kk, j = divmod(reste, p)
            pos = int(debuts[s_i]) + kk
            seuil = float((xs[pos, j] + xs[pos + 1, j]) / 2)
            res[int(ns[debuts[s_i]])] = (j, seuil, d == 0)
        return res

    def predire(self, X: torch.Tensor) -> torch.Tensor:
        noeud = torch.zeros(len(X), dtype=torch.long)
        lignes = torch.arange(len(X))
        for _ in range(self.prof + 1):
            j = self.var[noeud]
            feuille = j < 0
            if bool(feuille.all()):
                break
            x = X[lignes, j.clamp(min=0)]
            va_g = torch.where(torch.isnan(x), self.manq_g[noeud], x <= self.seuil[noeud])
            noeud = torch.where(feuille, noeud, torch.where(va_g, self.gauche[noeud], self.droite[noeud]))
        return self.valeur[noeud]


class XGBoostRegression:
    """Perte carrée ; `predire_etapes` donne la prévision après chaque arbre (choix du nombre d'arbres)."""

    def __init__(self, arbres: int = 300, taux: float = 0.1, profondeur: int = 3, lam: float = 1.0, gamma: float = 0.0,
                 min_feuille: int = 5, sous: float = 0.8, graine: int = 0):
        self.M, self.eta, self.prof, self.lam, self.gamma = arbres, taux, profondeur, lam, gamma
        self.min_feuille, self.sous, self.graine = min_feuille, sous, graine

    def entrainer(self, X, y) -> "XGBoostRegression":
        X, y = _tenseur(X), _tenseur(y)
        gen = torch.Generator().manual_seed(self.graine)
        n = len(y)
        self.F0 = float(y.mean())
        F = torch.full((n,), self.F0, dtype=TYPE)
        self.arbres = []
        taille = max(2 * self.min_feuille, int(self.sous * n))
        for _ in range(self.M):
            idx = torch.randperm(n, generator=gen)[:taille]
            arbre = ArbreXGB(self.prof, self.lam, self.gamma, self.min_feuille).construire(X[idx], (F - y)[idx])
            F += self.eta * arbre.predire(X)
            self.arbres.append(arbre)
        return self

    def predire(self, X, arbres: int | None = None) -> torch.Tensor:
        X = _tenseur(X)
        F = torch.full((len(X),), self.F0, dtype=TYPE)
        for a in self.arbres[:arbres]:
            F = F + self.eta * a.predire(X)
        return F

    def predire_etapes(self, X, etapes) -> dict[int, torch.Tensor]:
        """{m: prévision avec les m premiers arbres} pour chaque m de `etapes`, en une seule passe."""
        X = _tenseur(X)
        F, res = torch.full((len(X),), self.F0, dtype=TYPE), {}
        for m, a in enumerate(self.arbres, start=1):
            F = F + self.eta * a.predire(X)
            if m in etapes:
                res[m] = F.clone()
        return res
