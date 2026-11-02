r"""
Durées de séjour manquantes : les exclure, ou les ESTIMER à partir de ce qui est écrit sur la ligne.

Le problème : certaines lignes n'ont ni date de sortie ni nombre de jours (octobre 2024 en pédiatrie :
près d'une ligne sur deux). Les exclure sous-estime l'occupation des mois concernés ; les garder
« encore hospitalisés » la surestime. Mais la ligne contient souvent d'autres traces de la durée :

  le PRIX payé      il suit la durée : en pédiatrie (juillet 2024 à mars 2025),
                    4 000 F → 1 nuit (MEO), 7 500 F → 3, 15 000 F → 5, 22 500 F → 8 à 9 (médianes) ;
  l'ISSUE           une mise en observation (MEO) dure 1 nuit, une sortie contre avis est plus courte ;
  l'ÂGE, le SEXE, « Ancien / Nouveau », le MOIS d'entrée : des indices plus faibles, que les méthodes à
                    modèle combinent ;
  les médicaments   leur nombre n'apporte presque rien (vérifié par validation croisée).

Méthodes (paramètre `inconnues` de traitement.chargement.preparer_sejours ; banc P1 du module lit) :
  'exclure'        la ligne n'entre pas dans l'occupation (comportement historique de NERA) ;
  'mediane'        durée médiane des séjours connus du service ;
  'moyenne'        durée moyenne des séjours connus (sensible aux longs séjours) ;
  'mediane_age'    médiane de la tranche d'âge (< 1 an, 1–4, 5–14, 15–39, 40–64, ≥ 65 ans) ;
  'estimee'        médiane des séjours connus AYANT LE MÊME PRIX (au moins `min_lignes` séjours) ;
                   à défaut, même issue ; à défaut, médiane du service (méthode retenue jusqu'ici) ;
  'knn'            les k = 15 séjours connus les plus proches (prix, âge, sexe, issue, Ancien/Nouveau, mois),
                   distance euclidienne sur les seules variables écrites des deux côtés, remise à l'échelle :
                       d²(a, b) = (p / |o_a ∩ o_b|) Σ_{j ∈ o_a ∩ o_b} (z_aj − z_bj)² ;
                   durée = médiane des voisins, q1 et q3 = quartiles des voisins ;
  'regression'     équations enchaînées (principe de MICE) : chaque variable incomplète, la durée comprise,
                   est prédite par une régression ridge sur toutes les autres, 10 tours :
                       β_j = (AᵀA + λI)⁻¹ Aᵀ z_j,  z_ij ← a_iᵀ β_j   (λ = 1) ;
                   le prix manquant est donc lui aussi complété avant de servir à la durée ;
  'em'             loi normale multivariée de (log(1 + durée), log prix, âge, sexe, issue, …) apprise par
                   l'algorithme EM (Dempster, Laird et Rubin, 1977), avec la covariance conditionnelle
                   C = Σ_mm − Σ_mo Σ_oo⁻¹ Σ_om dans l'étape M ; la durée reçoit son espérance conditionnelle
                   E[z_m | z_o] = μ_m + Σ_mo Σ_oo⁻¹ (z_o − μ_o), et q1, q3 = espérance ± 0,674 écart-type
                   conditionnel (quartiles de la loi normale), remis en nuits par exp(·) − 1 ;
  'acp_iterative'  imputation de rang faible : ACP des séjours (80 % de la variance), cases vides remplacées par
                   la reconstruction U_k S_k V_kᵀ jusqu'à stabilité ; pour un séjour inconnu, coordonnées
                   s = (V_oᵀV_o + αI)⁻¹ V_oᵀ z_o sur ses variables écrites, durée = V_m s.
La durée est modélisée en log(1 + nuits) pour les méthodes à modèle (les durées sont très asymétriques).
Rien n'est codé en dur : tout est appris sur les séjours CONNUS du service (et seulement eux).

Incertitude : pour chaque séjour estimé on garde aussi un 1er et un 3e quartile. traitement.occupation les
utilise comme bornes (scénario « basse » : q1, « haute » : q3, « attendue » : estimation) ; sensibilite.py
propage donc cette incertitude jusqu'aux conclusions du modèle. Pour la régression et l'ACP, q1 et q3 viennent
des quartiles des résidus sur les séjours connus. Les durées estimées n'entrent ni dans la DMS ni dans les
sorties par issue (dates inventées).

Validation (valider_estimation) : validation croisée en k plis sur les séjours connus ; on cache la
durée, on la prédit avec chaque méthode, on mesure l'erreur absolue moyenne et la part à ±1 nuit. Sur la
pédiatrie (méthodes simples) : médiane 1,46 nuit d'erreur, prix 1,13 nuit ; ±1 nuit dans 60 % des cas pour
la médiane, 77 % pour le prix.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

METHODES = ("exclure", "mediane", "moyenne", "mediane_age", "estimee", "knn", "regression", "em", "acp_iterative")
A_MODELE = ("knn", "regression", "em", "acp_iterative")
MIN_LIGNES = 5
TRANCHES_AGE = (0.0, 1.0, 5.0, 15.0, 40.0, 65.0, math.inf)
ISSUES = ("Sortie", "Décès", "Sortie contre avis médical", "Transfert externe", "Transfert interne", "Évasion")
Z_QUARTILE = 0.6745                                  # quartiles de la loi normale centrée réduite : ±0,6745


def _resume(d: pd.Series) -> tuple[float, float, float]:
    return float(d.median()), float(d.quantile(0.25)), float(d.quantile(0.75))


def _age(lignes: pd.DataFrame) -> pd.Series:
    from traitement.urgences import lire_age            # même lecture de l'âge que le registre des urgences
    if "age_texte" not in lignes:
        return pd.Series(np.nan, index=lignes.index)
    return lignes["age_texte"].map(lambda t: lire_age(None if pd.isna(t) else str(t))[0]).astype(float)


def variables(lignes: pd.DataFrame) -> np.ndarray:
    """Une ligne par séjour : log prix, âge, sexe féminin, nouveau, issue (indicatrices), mois (sinus, cosinus)."""
    n = len(lignes)
    prix = pd.to_numeric(lignes["prix"], errors="coerce") if "prix" in lignes else pd.Series(np.nan, index=lignes.index)
    cols = [np.log(prix.where(prix > 0)).to_numpy(float), _age(lignes).to_numpy(float)]
    sexe = lignes["sexe"].astype(str).str.upper().str[:1] if "sexe" in lignes else pd.Series("", index=lignes.index)
    cols.append(np.where(sexe == "F", 1.0, np.where(sexe == "M", 0.0, np.nan)))
    an = lignes["ancien_nouveau"].astype(str).str.upper().str[:1] if "ancien_nouveau" in lignes else pd.Series("", index=lignes.index)
    cols.append(np.where(an == "N", 1.0, np.where(an == "A", 0.0, np.nan)))
    issue = lignes["issue"].astype(str) if "issue" in lignes else pd.Series("", index=lignes.index)
    cols += [(issue == i).to_numpy(float) for i in ISSUES]
    mois = pd.to_datetime(lignes["entree"]).dt.month.to_numpy(float) if "entree" in lignes else np.full(n, np.nan)
    cols += [np.sin(2 * np.pi * (mois - 1) / 12), np.cos(2 * np.pi * (mois - 1) / 12)]
    return np.column_stack(cols) if n else np.empty((0, len(cols)))


def _motifs(M: np.ndarray):
    motifs, inverse = np.unique(M, axis=0, return_inverse=True)
    inverse = inverse.ravel()
    for k in range(len(motifs)):
        yield motifs[k], np.flatnonzero(inverse == k)


class ModeleDuree:
    """Méthodes à modèle : apprises sur les séjours connus, appliquées aux séjours sans durée."""

    def __init__(self, methode: str, k: int = 15):
        self.methode, self.k = methode, k

    def ajuster(self, connus: pd.DataFrame) -> "ModeleDuree":
        J = np.column_stack([np.log1p(connus["duree_nuits"].astype(float).to_numpy()), variables(connus)])
        self.garder = [j for j in range(J.shape[1]) if (~np.isnan(J[:, j])).sum() >= 2 and np.nanstd(J[:, j]) > 1e-12]
        J = J[:, self.garder]
        self.centre, self.echelle = np.nanmean(J, axis=0), np.nanstd(J, axis=0)
        Z = (J - self.centre) / self.echelle
        self.Z = Z
        getattr(self, f"_ajuster_{self.methode}")(Z)
        if self.methode in ("regression", "acp_iterative"):          # résidus sur les connus (durée cachée)
            cachee = Z.copy(); cachee[:, 0] = np.nan
            pred = self._completer(cachee)[:, 0]
            self.residus = Z[:, 0] - pred
        return self

    def _vers_z(self, lignes: pd.DataFrame) -> np.ndarray:
        J = np.column_stack([np.full(len(lignes), np.nan), variables(lignes)])[:, self.garder]
        return (J - self.centre) / self.echelle

    def _nuits(self, z: np.ndarray) -> np.ndarray:
        return np.expm1(z * self.echelle[0] + self.centre[0]).clip(min=0)

    def predire(self, lignes: pd.DataFrame) -> pd.DataFrame:
        Z = self._vers_z(lignes)
        if self.methode == "knn":
            med, q1, q3 = self._knn(Z)
        else:
            Zc = self._completer(Z)
            z = Zc[:, 0]
            if self.methode == "em":
                sd = np.sqrt(np.maximum(self._var_cond, 0))
                q1z, q3z = z - Z_QUARTILE * sd, z + Z_QUARTILE * sd
            else:
                r1, r3 = np.quantile(self.residus, [0.25, 0.75])
                q1z, q3z = z + r1, z + r3
            med, q1, q3 = self._nuits(z), self._nuits(q1z), self._nuits(q3z)
        nuits = np.round(med)
        return pd.DataFrame({"nuits": nuits.astype(int), "nuits_q1": np.minimum(np.floor(q1), nuits).astype(int),
                             "nuits_q3": np.maximum(np.ceil(q3), nuits).astype(int), "source": self.methode}, index=lignes.index)

    # ── k plus proches voisins ──
    def _ajuster_knn(self, Z):
        pass

    def _knn(self, Z):
        F, G = Z[:, 1:], self.Z[:, 1:]
        Ma, Mb = (~np.isnan(F)).astype(float), (~np.isnan(G)).astype(float)
        fa, fb = np.nan_to_num(F), np.nan_to_num(G)
        communes = Ma @ Mb.T
        d2 = (Ma * fa ** 2) @ Mb.T + Ma @ (Mb * fb ** 2).T - 2 * (Ma * fa) @ (Mb * fb).T
        d2 = np.where(communes > 0, d2.clip(min=0) * F.shape[1] / np.maximum(communes, 1), np.inf)
        k = min(self.k, len(G))
        proches = np.argpartition(d2, k - 1, axis=1)[:, :k]
        durees = self._nuits(self.Z[:, 0])[proches]
        return np.median(durees, axis=1), np.quantile(durees, 0.25, axis=1), np.quantile(durees, 0.75, axis=1)

    # ── régressions enchaînées ──
    def _ajuster_regression(self, Z, tours: int = 10, lam: float = 1.0):
        M = ~np.isnan(Z)
        Zf = np.where(M, Z, 0.0)
        self.incompletes = [j for j in range(Z.shape[1]) if (~M[:, j]).any() or j == 0]
        self.beta, self.tours = {}, tours
        for _ in range(tours):
            for j in self.incompletes:
                autres = [i for i in range(Z.shape[1]) if i != j]
                A = np.column_stack([Zf[:, autres], np.ones(len(Zf))])
                obs = M[:, j]
                b = np.linalg.solve(A[obs].T @ A[obs] + lam * np.eye(A.shape[1]), A[obs].T @ Zf[obs, j])
                self.beta[j] = b
                Zf[~obs, j] = A[~obs] @ b

    # ── loi normale multivariée par EM ──
    def _ajuster_em(self, Z, tours: int = 100, lam: float = 1e-3, tol: float = 1e-5):
        n, p = Z.shape
        M = ~np.isnan(Z)
        mu, sigma = np.zeros(p), np.eye(p)
        for _ in range(tours):
            Zc, C, _ = self._esperance(Z, M, mu, sigma)
            mu_n = Zc.mean(axis=0)
            D = Zc - mu_n
            sigma_n = (D.T @ D + C) / n + lam * np.eye(p)
            ecart = max(np.abs(mu_n - mu).max(), np.abs(sigma_n - sigma).max())
            mu, sigma = mu_n, sigma_n
            if ecart < tol:
                break
        self.mu, self.sigma = mu, sigma

    @staticmethod
    def _esperance(Z, M, mu, sigma):
        Zc = np.where(M, Z, 0.0)
        C = np.zeros_like(sigma)
        var0 = np.zeros(len(Z))                       # variance conditionnelle de la durée (colonne 0)
        for motif, lignes in _motifs(M):
            o, m = motif, ~motif
            if not m.any():
                continue
            im = np.flatnonzero(m)
            if not o.any():
                Zc[np.ix_(lignes, im)] = mu[im]
                Cm = sigma[np.ix_(im, im)]
            else:
                io = np.flatnonzero(o)
                K = np.linalg.solve(sigma[np.ix_(io, io)], sigma[np.ix_(im, io)].T).T
                Zc[np.ix_(lignes, im)] = mu[im] + (Zc[np.ix_(lignes, io)] - mu[io]) @ K.T
                Cm = sigma[np.ix_(im, im)] - K @ sigma[np.ix_(im, io)].T
            C[np.ix_(im, im)] += len(lignes) * Cm
            if m[0]:
                var0[lignes] = Cm[0, 0]
        return Zc, C, var0

    # ── ACP itérative ──
    def _ajuster_acp_iterative(self, Z, tours: int = 100, part: float = 0.8, tol: float = 1e-6):
        M = ~np.isnan(Z)
        Zf = np.where(M, Z, 0.0)
        s = np.linalg.svd(Zf, compute_uv=False)
        cumul = np.cumsum(s ** 2) / (s ** 2).sum()
        self.rang = max(1, int((cumul < part).sum()) + 1)
        for _ in range(tours):
            U, s, Vt = np.linalg.svd(Zf, full_matrices=False)
            R = (U[:, :self.rang] * s[:self.rang]) @ Vt[:self.rang]
            avant = Zf[~M].copy()
            Zf[~M] = R[~M]
            if not len(avant) or np.abs(Zf[~M] - avant).max() < tol:
                break
        self.V = Vt[:self.rang].T

    # ── application commune (régression, EM, ACP) ──
    def _completer(self, Z):
        M = ~np.isnan(Z)
        if self.methode == "em":
            Zc, _, self._var_cond = self._esperance(Z, M, self.mu, self.sigma)
            return Zc
        Zc = np.where(M, Z, 0.0)
        if self.methode == "regression":
            for _ in range(self.tours):
                for j in self.incompletes:
                    vides = ~M[:, j]
                    if vides.any():
                        autres = [i for i in range(Z.shape[1]) if i != j]
                        Zc[vides, j] = np.column_stack([Zc[np.ix_(vides, autres)], np.ones(vides.sum())]) @ self.beta[j]
            return Zc
        for motif, lignes in _motifs(M):                      # ACP itérative
            o, m = motif, ~motif
            if m.any() and o.any():
                Vo, Vm = self.V[o], self.V[m]
                s = np.linalg.solve(Vo.T @ Vo + 1e-3 * np.eye(Vo.shape[1]), Vo.T @ Zc[np.ix_(lignes, np.flatnonzero(o))].T).T
                Zc[np.ix_(lignes, np.flatnonzero(m))] = s @ Vm.T
        return Zc


def tables_durees(connus: pd.DataFrame, min_lignes: int = MIN_LIGNES) -> dict:
    """
    `connus` : séjours de durée connue (colonnes duree_nuits, et si possible prix, issue, âge…).
    Renvoie {'global': (med, q1, q3), 'moyenne': (…), 'prix': {prix: (…)}, 'issue': {issue: (…)},
    'age': [(…) par tranche], 'connus': les séjours (pour les méthodes à modèle)} ; une classe n'est retenue
    que si elle compte au moins `min_lignes` séjours.
    """
    d = connus["duree_nuits"].astype(float)
    t = {"global": _resume(d) if len(d) else (np.nan,) * 3, "prix": {}, "issue": {}, "connus": connus}
    t["moyenne"] = (float(d.mean()), t["global"][1], t["global"][2]) if len(d) else (np.nan,) * 3
    for col in ("prix", "issue"):
        if col in connus:
            for k, g in d.groupby(connus[col]):
                if pd.notna(k) and len(g) >= min_lignes:
                    t[col][k] = _resume(g)
    age = _age(connus)
    t["age"] = []
    for a, b in zip(TRANCHES_AGE[:-1], TRANCHES_AGE[1:]):
        g = d[(age >= a) & (age < b)]
        t["age"].append(_resume(g) if len(g) >= min_lignes else None)
    return t


def estimer(lignes: pd.DataFrame, tables: dict, methode: str = "estimee") -> pd.DataFrame:
    """Pour chaque ligne : nuits (estimation), nuits_q1, nuits_q3 et la source de l'estimation."""
    if methode not in METHODES[1:]:
        raise ValueError(f"Méthode d'estimation inconnue : {methode} (attendues : {', '.join(METHODES[1:])}).")
    if methode in A_MODELE:
        if len(lignes) == 0:
            return pd.DataFrame(columns=["nuits", "nuits_q1", "nuits_q3", "source"])
        return ModeleDuree(methode).ajuster(tables["connus"]).predire(lignes)
    ages = _age(lignes) if methode == "mediane_age" else None
    res = []
    for i, l in lignes.iterrows():
        source, v = "mediane", tables["global"]
        if methode == "moyenne":
            source, v = "moyenne", tables["moyenne"]
        elif methode == "mediane_age" and pd.notna(ages[i]):
            for (a, b), r in zip(zip(TRANCHES_AGE[:-1], TRANCHES_AGE[1:]), tables["age"]):
                if a <= ages[i] < b and r is not None:
                    source, v = "age", r
        elif methode == "estimee":
            if "prix" in l and pd.notna(l["prix"]) and l["prix"] in tables["prix"]:
                source, v = "prix", tables["prix"][l["prix"]]
            elif "issue" in l and pd.notna(l["issue"]) and l["issue"] in tables["issue"]:
                source, v = "issue", tables["issue"][l["issue"]]
        res.append({"nuits": round(v[0]), "nuits_q1": int(np.floor(v[1])), "nuits_q3": int(np.ceil(v[2])), "source": source})
    return pd.DataFrame(res, index=lignes.index)


def valider_estimation(connus: pd.DataFrame, plis: int = 5, graine: int = 1, min_lignes: int = MIN_LIGNES,
                       methodes: tuple = METHODES[1:]) -> pd.DataFrame:
    """
    Validation croisée : chaque séjour connu est prédit par des tables ou un modèle construits SANS lui.
      erreur_moyenne_nuits   moyenne de |prédit − vrai|
      erreur_mediane_nuits   médiane de |prédit − vrai|
      a_1_nuit_pres_%        part des séjours prédits à ±1 nuit
      biais_nuits            moyenne de (prédit − vrai) : < 0, la méthode sous-estime les durées
      dans_q1_q3_%           part des vraies durées entre q1 et q3 (50 % attendus si l'incertitude est juste)
    Une ligne par méthode. À citer dans le mémoire pour justifier le choix.
    """
    connus = connus[connus["duree_nuits"].notna()]
    ordre = np.random.default_rng(graine).permutation(len(connus))
    res = {m: [] for m in methodes}
    for k in range(plis):
        test = connus.iloc[ordre[k::plis]]
        entrainement = connus.iloc[np.setdiff1d(ordre, ordre[k::plis])]
        tables = tables_durees(entrainement, min_lignes)
        vrai = test["duree_nuits"].astype(float)
        for m in res:
            e = estimer(test, tables, m)
            res[m].append(pd.DataFrame({"ecart": e["nuits"].astype(float) - vrai,
                                        "dedans": (vrai >= e["nuits_q1"]) & (vrai <= e["nuits_q3"])}))
    lignes = []
    for m, e in res.items():
        e = pd.concat(e)
        a = e["ecart"].abs()
        lignes.append({"methode": m, "sejours": len(e), "erreur_moyenne_nuits": round(float(a.mean()), 2),
                       "erreur_mediane_nuits": round(float(a.median()), 2),
                       "a_1_nuit_pres_%": round(100 * float((a <= 1).mean()), 1),
                       "biais_nuits": round(float(e["ecart"].mean()), 2),
                       "dans_q1_q3_%": round(100 * float(e["dedans"].mean()), 1)})
    return pd.DataFrame(lignes).set_index("methode")
