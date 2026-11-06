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
  'knn'            les k séjours connus les plus proches (prix, âge, sexe, issue, Ancien/Nouveau, mois),
                   distance euclidienne sur les seules variables écrites des deux côtés, remise à l'échelle :
                       d²(a, b) = (p / |o_a ∩ o_b|) Σ_{j ∈ o_a ∩ o_b} (z_aj − z_bj)² ;
                   durée = médiane des voisins, q1 et q3 = quartiles des voisins ;
                   k n'est pas fixé : il est choisi par validation croisée en 5 plis sur les séjours connus
                   (ceux de l'apprentissage seulement), sur la grille K_GRILLE :
                       k* = argmin_k (1/n) Σ_i |d_i − d̂_i^(k)|   (ex aequo : le plus petit k) ;
  'regression'     équations enchaînées (principe de MICE) : chaque variable incomplète, la durée comprise,
                   est prédite par une régression ridge sur toutes les autres, 10 tours :
                       β_j = (AᵀA + λI)⁻¹ Aᵀ z_j,  z_ij ← a_iᵀ β_j   (λ choisi par validation croisée) ;
                   le prix manquant est donc lui aussi complété avant de servir à la durée ;
  'em'             loi normale multivariée de (log(1 + durée), log prix, âge, sexe, issue, …) apprise par
                   l'algorithme EM (Dempster, Laird et Rubin, 1977), avec la covariance conditionnelle
                   C = Σ_mm − Σ_mo Σ_oo⁻¹ Σ_om dans l'étape M ; la durée reçoit son espérance conditionnelle
                   E[z_m | z_o] = μ_m + Σ_mo Σ_oo⁻¹ (z_o − μ_o), et q1, q3 = espérance ± 0,674 écart-type
                   conditionnel (quartiles de la loi normale), remis en nuits par exp(·) − 1 ;
  'acp_iterative'  imputation de rang faible : ACP des séjours (rang r choisi par validation croisée), cases vides
                   remplacées par la reconstruction U_r S_r V_rᵀ jusqu'à stabilité ; pour un séjour inconnu,
                   coordonnées s = (V_oᵀV_o + αI)⁻¹ V_oᵀ z_o sur ses variables écrites, durée = V_m s ;
  'softimpute'     même famille (rang faible), sans couper à un rang : chaque valeur singulière est diminuée
                   de λ, σ_i ← max(σ_i − λ, 0) (Mazumder, Hastie et Tibshirani, 2010) ; c'est la solution de
                   min ½‖P_Ω(Z − R)‖² + λ‖R‖_* (norme nucléaire = somme des σ_i). Les petits axes sont rétrécis
                   au lieu d'être gardés entiers ou jetés ; λ = fraction de σ_1 choisie par validation croisée.
                   Séjour inconnu : coordonnées comme l'ACP, chacune rétrécie par (σ_i − λ)/σ_i.
  'xgboost'        somme d'arbres du second ordre (traitement/boosting.py) sur log(1 + durée), avec le
                   DIAGNOSTIC en familles (DIAGNOSTICS) en plus des variables ci-dessus ; les cases vides ne sont
                   pas complétées, chaque coupure apprend de quel côté envoyer les séjours sans valeur.
                   Profondeur (2, 3, 4) et nombre d'arbres (25 à 200, η = 0,1) choisis par validation croisée (3 plis) ;
                   q1 et q3 viennent des résidus HORS échantillon de cette validation.
  'hybride'        la médiane des séjours de même prix quand le prix est écrit et sa classe compte au moins
                   `min_lignes` séjours ; sinon XGBoost (le prix manque : c'est là qu'un modèle peut aider).
Diagnostic : pour reconstituer une durée PASSÉE, le diagnostic (de sortie, à défaut d'entrée) n'est pas une fuite
de l'avenir : il est écrit sur la ligne du séjour. Il entre en familles (indicatrices 0/1, vides si aucun
diagnostic n'est écrit) ; XGBoost l'utilise par défaut, les autres méthodes à modèle sont aussi mesurées avec lui
(variantes « + diagnostic » de valider_estimation), et XGBoost sans lui.
Réglages par validation croisée (comme k pour le kNN) : λ de la ridge (GRILLE_LAMBDA_RIDGE), λ de l'EM
(GRILLE_LAMBDA_EM), rang de l'ACP (1 … p − 1), λ/σ_1 du SoftImpute (GRILLE_SOFTIMPUTE) ; 5 plis sur les
séjours connus de l'apprentissage, erreur = moyenne de |nuits estimées − vraies nuits| ; ex aequo : le plus simple.
La durée est modélisée en log(1 + nuits) et le prix en log(prix) pour les méthodes à modèle (les durées sont
très asymétriques), puis chaque variable est centrée-réduite (z-score). Ces deux choix sont comparés par
valider_estimation : mise à l'échelle robuste, z = (x − médiane)/(Q3 − Q1), pour le kNN, et chaque méthode à
modèle sans logarithme (durée en nuits, prix en francs).
Rien n'est codé en dur : tout est appris sur les séjours CONNUS du service (et seulement eux).

Incertitude : pour chaque séjour estimé on garde aussi un 1er et un 3e quartile. traitement.occupation les
utilise comme bornes (scénario « basse » : q1, « haute » : q3, « attendue » : estimation) ; sensibilite.py
propage donc cette incertitude jusqu'aux conclusions du modèle. Pour la régression et l'ACP, q1 et q3 viennent
des quartiles des résidus sur les séjours connus. Les durées estimées n'entrent ni dans la DMS ni dans les
sorties par issue (dates inventées).

Validation (valider_estimation) : on cache la durée de séjours connus, on la prédit avec chaque méthode, de
trois façons (validation croisée en k plis ; validation temporelle, apprendre sur les mois passés et tester le
mois suivant ; masquage réaliste, cacher les séjours qui ressemblent aux vrais manquants), avec un intervalle à
95 % par bootstrap et le test des rangs signés de Wilcoxon contre la méthode retenue. Sur la
pédiatrie (méthodes simples) : médiane 1,46 nuit d'erreur, prix 1,13 nuit ; ±1 nuit dans 60 % des cas pour
la médiane, 77 % pour le prix.
"""
from __future__ import annotations

import math

import numpy as np
import pandas as pd

METHODES = ("exclure", "mediane", "moyenne", "mediane_age", "estimee", "knn", "regression", "em", "acp_iterative",
            "softimpute", "xgboost", "hybride")
A_MODELE = ("knn", "regression", "em", "acp_iterative", "softimpute", "xgboost")
# Familles de diagnostics (texte sans accents, minuscules), fixées d'après les sigles des registres (00-sigles du mémoire).
DIAGNOSTICS = {
    "paludisme": r"\bap[gs]?\b|palu|palustre",
    "infection_grave": r"sepsis|septic|mening|infectieu|infectueu|salmonell|typho|choc",
    "respiratoire": r"pneumo|bronch|rhino|asthm|\btoux|angine|\boma\b|respir|pulmon|\bcap\b|\boap\b",
    "digestif": r"\bge[afu]|diarrh|vomiss|enterit|\bdsh\b|deshydrat|gastr|mugd|abdo|digest|occlusion|pancreat",
    "anemie_drepanocytose": r"anemi|\bcvo\b|drepano",
    "neurologique": r"convuls|\bavc\b|\bait\b|coma|encephal|cephal|ischemi|\btc\b",
    "cardio_metabolique": r"\bhta\b|hypertens|cardi|diabet|\bdt2\b|hyperglyc|desequilibr|decompens|insuffisan|\bir\b",
    "chirurgie_traumatisme": r"append|fractur|trauma|\bavp\b|\brta\b|plaie|brulur|abces|cellulit|dermohypo",
    "gynecologique": r"\bpid\b|\bgeu\b|grossesse|myome|ovari|uter",
    "malnutrition": r"\bmas\b|malnutri|kwash|marasm",
    "vih": r"pvvs|\bvih\b|\bhiv\b",
}
MIN_LIGNES = 5
TRANCHES_AGE = (0.0, 1.0, 5.0, 15.0, 40.0, 65.0, math.inf)
ISSUES = ("Sortie", "Mise en observation", "Décès", "Sortie contre avis médical", "Transfert externe", "Transfert interne",
          "Évasion")
Z_QUARTILE = 0.6745                                  # quartiles de la loi normale centrée réduite : ±0,6745
K_GRILLE = (1, 3, 5, 7, 9, 11, 15, 21, 31, 51)       # valeurs de k essayées par la validation croisée du kNN
PLIS_K = 5
GRILLE_XGB_PROFONDEUR = (2, 3, 4)                    # XGBoost : profondeurs essayées (nombre d'arbres lu en chemin)
XGB_ARBRES = 200
PLIS_XGB = 3                                         # plis du choix des réglages de XGBoost (coût)
GRILLE_LAMBDA_RIDGE = (0.01, 0.1, 1.0, 10.0, 100.0)  # λ de la ridge des régressions enchaînées
GRILLE_LAMBDA_EM = (1e-4, 1e-3, 1e-2, 1e-1)          # λ ajouté à la diagonale de Σ dans l'EM
GRILLE_SOFTIMPUTE = (0.01, 0.03, 0.1, 0.2, 0.3, 0.5)  # λ / σ_1 du SoftImpute


def _resume(d: pd.Series) -> tuple[float, float, float]:
    return float(d.median()), float(d.quantile(0.25)), float(d.quantile(0.75))


def _age(lignes: pd.DataFrame) -> pd.Series:
    from traitement.urgences import lire_age            # même lecture de l'âge que le registre des urgences
    if "age_texte" not in lignes:
        return pd.Series(np.nan, index=lignes.index)
    return lignes["age_texte"].map(lambda t: lire_age(None if pd.isna(t) else str(t))[0]).astype(float)


def familles_diagnostic(lignes: pd.DataFrame) -> np.ndarray:
    """Une indicatrice par famille de DIAGNOSTICS (diagnostic de sortie, puis d'entrée) ; vide si rien n'est écrit."""
    from traitement.urgences import sans_accents
    texte = pd.Series("", index=lignes.index)
    for c in ("diagnostic_sortie", "diagnostic_entree"):
        if c in lignes:
            texte = texte + " " + lignes[c].fillna("").astype(str)
    texte = texte.map(sans_accents)
    ecrit = texte.str.strip().ne("").to_numpy()
    cols = [np.where(ecrit, texte.str.contains(motif, regex=True).to_numpy(float), np.nan) for motif in DIAGNOSTICS.values()]
    return np.column_stack(cols) if len(lignes) else np.empty((0, len(DIAGNOSTICS)))


def variables(lignes: pd.DataFrame, diagnostic: bool = False) -> np.ndarray:
    """Une ligne par séjour : log prix, âge, sexe féminin, nouveau, issue (indicatrices), mois (sinus, cosinus),
    et si `diagnostic` les familles de diagnostics."""
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
    X = np.column_stack(cols) if n else np.empty((0, len(cols)))
    return np.column_stack([X, familles_diagnostic(lignes)]) if diagnostic else X


def _distances(F: np.ndarray, G: np.ndarray) -> np.ndarray:
    """d²(a, b) entre chaque ligne de F et chaque ligne de G, sur les variables écrites des deux côtés, × p/|C|."""
    Ma, Mb = (~np.isnan(F)).astype(float), (~np.isnan(G)).astype(float)
    fa, fb = np.nan_to_num(F), np.nan_to_num(G)
    communes = Ma @ Mb.T
    d2 = (Ma * fa ** 2) @ Mb.T + Ma @ (Mb * fb ** 2).T - 2 * (Ma * fa) @ (Mb * fb).T
    return np.where(communes > 0, d2.clip(min=0) * F.shape[1] / np.maximum(communes, 1), np.inf)


def _voisins(d2: np.ndarray, durees: np.ndarray, grille) -> dict[int, tuple]:
    """Pour chaque k de la grille : médiane, q1 et q3 des durées des k plus proches (une ligne de d2 par séjour)."""
    tri = durees[np.argsort(d2, axis=1, kind="stable")]
    return {k: (np.median(tri[:, :k], axis=1), np.quantile(tri[:, :k], 0.25, axis=1), np.quantile(tri[:, :k], 0.75, axis=1))
            for k in grille if k <= tri.shape[1]}


def _en_nuits(med, q1, q3, source: str, index) -> pd.DataFrame:
    nuits = np.round(med)
    return pd.DataFrame({"nuits": nuits.astype(int), "nuits_q1": np.minimum(np.floor(q1), nuits).astype(int),
                         "nuits_q3": np.maximum(np.ceil(q3), nuits).astype(int), "source": source}, index=index)


def _motifs(M: np.ndarray):
    motifs, inverse = np.unique(M, axis=0, return_inverse=True)
    inverse = inverse.ravel()
    for k in range(len(motifs)):
        yield motifs[k], np.flatnonzero(inverse == k)


class ModeleDuree:
    """Méthodes à modèle : apprises sur les séjours connus, appliquées aux séjours sans durée."""

    def __init__(self, methode: str, k: int | None = None, echelle: str = "zscore", log: bool = True,
                 reglage=None, diagnostic: bool | None = None):
        """
        echelle : 'zscore' (moyenne, écart-type) ou 'robuste' (médiane, Q3 − Q1) ; log : durée et prix en log.
        k (kNN) et reglage (λ de la ridge ou de l'EM, rang de l'ACP, λ/σ_1 du SoftImpute) : None = choisis par
        validation croisée sur les séjours connus.
        """
        self.methode, self.k = methode, k                # k = None : choisi par validation croisée (kNN)
        self.echelle_type, self.log, self.reglage = echelle, log, reglage
        self.erreurs_k = self.erreurs_reglage = None
        self.diagnostic = (methode == "xgboost") if diagnostic is None else diagnostic   # XGBoost : avec, par défaut

    def _tableau(self, duree: np.ndarray, lignes: pd.DataFrame) -> np.ndarray:
        J = np.column_stack([np.log1p(duree), variables(lignes, self.diagnostic)])
        if not self.log:                                 # durée en nuits, prix en francs (colonne 1 : log prix)
            J[:, 0], J[:, 1] = duree, np.exp(J[:, 1])
        return J

    def ajuster(self, connus: pd.DataFrame) -> "ModeleDuree":
        J = self._tableau(connus["duree_nuits"].astype(float).to_numpy(), connus)
        self.garder = [j for j in range(J.shape[1]) if (~np.isnan(J[:, j])).sum() >= 2 and np.nanstd(J[:, j]) > 1e-12]
        J = J[:, self.garder]
        if self.echelle_type == "robuste":
            q1, med, q3 = np.nanquantile(J, [0.25, 0.5, 0.75], axis=0)
            self.centre, self.echelle = med, np.where(q3 - q1 > 1e-12, q3 - q1, 1.0)   # indicatrice rare : Q3 − Q1 = 0
        else:
            self.centre, self.echelle = np.nanmean(J, axis=0), np.nanstd(J, axis=0)
        Z = (J - self.centre) / self.echelle
        self.Z = Z
        self.max_nuits = float(connus["duree_nuits"].astype(float).max())
        if self.reglage is None and self.methode in ("regression", "em", "acp_iterative", "softimpute"):
            self.reglage, self.erreurs_reglage = self._choisir_reglage(connus, self._grille(Z.shape[1]))
        getattr(self, f"_ajuster_{self.methode}")(Z)
        if self.methode in ("regression", "acp_iterative", "softimpute"):   # résidus sur les connus (durée cachée)
            cachee = Z.copy(); cachee[:, 0] = np.nan
            pred = self._completer(cachee)[:, 0]
            self.residus = Z[:, 0] - pred
        return self

    def _vers_z(self, lignes: pd.DataFrame) -> np.ndarray:
        J = self._tableau(np.full(len(lignes), np.nan), lignes)[:, self.garder]
        return (J - self.centre) / self.echelle

    def _nuits(self, z: np.ndarray) -> np.ndarray:
        x = z * self.echelle[0] + self.centre[0]
        # Bornée par les durées vues à l'apprentissage : une estimation un peu extrême en log deviendrait, par
        # exp(·) − 1, des centaines de nuits (validation temporelle de l'ACP : 182 nuits d'erreur moyenne).
        return (np.expm1(x) if self.log else x).clip(0, self.max_nuits)

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
        return _en_nuits(med, q1, q3, self.methode, lignes.index)

    # ── réglages par validation croisée (ridge, EM, ACP, SoftImpute) ──
    def _grille(self, p: int) -> tuple:
        return {"regression": GRILLE_LAMBDA_RIDGE, "em": GRILLE_LAMBDA_EM, "softimpute": GRILLE_SOFTIMPUTE,
                "acp_iterative": tuple(range(1, max(p, 2)))}[self.methode]

    def _choisir_reglage(self, connus: pd.DataFrame, grille: tuple, plis: int = PLIS_K, graine: int = 1):
        """
        Validation croisée en `plis` plis sur les séjours connus (apprentissage seulement) : pour chaque valeur de
        la grille, le modèle est appris sur les autres plis et estime les durées du pli caché ; erreur = moyenne de
        |nuits estimées − vraies nuits|. Renvoie la valeur de plus petite erreur et les erreurs. Ex aequo : la plus
        simple (λ le plus grand pour ridge, EM et SoftImpute ; rang le plus petit pour l'ACP). Moins de 2 × plis
        séjours : None, valeur par défaut (λ = 1 ; 1e−3 ; rang à 80 % de la variance ; λ = 0,1 σ_1).
        """
        n = len(connus)
        if n < 2 * plis:
            return None, None
        ordre = np.random.default_rng(graine).permutation(n)
        vrai = np.round(connus["duree_nuits"].astype(float).to_numpy())
        ecarts = {v: [] for v in grille}
        for f in range(plis):
            test, entr = ordre[f::plis], np.setdiff1d(ordre, ordre[f::plis])
            for v in grille:
                m = ModeleDuree(self.methode, echelle=self.echelle_type, log=self.log, reglage=v).ajuster(connus.iloc[entr])
                ecarts[v].append(np.abs(m.predire(connus.iloc[test])["nuits"].to_numpy(float) - vrai[test]))
        erreurs = {v: float(np.concatenate(e).mean()) for v, e in ecarts.items()}
        simple = (lambda v: v) if self.methode == "acp_iterative" else (lambda v: -v)
        return min(erreurs, key=lambda v: (erreurs[v], simple(v))), erreurs

    # ── XGBoost (traitement/boosting.py) ──
    def _ajuster_xgboost(self, Z, plis: int = PLIS_XGB, graine: int = 1):
        """
        Validation croisée en `plis` plis : pour chaque profondeur de GRILLE_XGB_PROFONDEUR, un modèle de
        XGB_ARBRES arbres par pli ; l'erreur en nuits est lue après 25, 50, … arbres (une seule passe). Le couple
        (profondeur, arbres) de plus petite erreur est gardé (ex aequo : le plus simple), puis appris sur tout.
        Les résidus hors échantillon de ce couple donnent q1 et q3.
        """
        from traitement.boosting import XGBoostRegression
        X, y = Z[:, 1:], Z[:, 0]
        etapes = tuple(range(25, XGB_ARBRES + 1, 25))
        if self.reglage is None and len(y) >= 2 * plis:
            ordre = np.random.default_rng(graine).permutation(len(y))
            erreurs, horsech = {}, {}
            for prof in GRILLE_XGB_PROFONDEUR:
                for f in range(plis):
                    test, entr = ordre[f::plis], np.setdiff1d(ordre, ordre[f::plis])
                    m = XGBoostRegression(XGB_ARBRES, 0.1, prof).entrainer(X[entr], y[entr])
                    for a, z in m.predire_etapes(X[test], etapes).items():
                        e = np.abs(np.round(self._nuits(z)) - np.round(self._nuits(y[test])))
                        erreurs.setdefault((prof, a), []).append(e)
                        horsech.setdefault((prof, a), np.empty(len(y)))[test] = y[test] - z
            erreurs = {k: float(np.concatenate(v).mean()) for k, v in erreurs.items()}
            self.reglage = min(erreurs, key=lambda k: (erreurs[k], k[0], k[1]))
            self.erreurs_reglage = erreurs
            self.residus = horsech[self.reglage]
        prof, arbres = self.reglage or (3, 100)
        self.xgb = XGBoostRegression(arbres, 0.1, prof).entrainer(X, y)
        if not hasattr(self, "residus") or self.residus is None or len(self.residus) != len(y):
            self.residus = y - self.xgb.predire(X)

    # ── k plus proches voisins ──
    def _ajuster_knn(self, Z):
        if self.k is None:
            self.k, self.erreurs_k = self._choisir_k(Z)

    def _choisir_k(self, Z, plis: int = PLIS_K, graine: int = 1):
        """
        Validation croisée en `plis` plis sur les séjours connus : chaque pli est caché à son tour, ses durées sont
        estimées avec les k plus proches parmi les autres plis, pour chaque k de K_GRILLE ; erreur(k) = moyenne de
        |nuits estimées − vraies nuits|. Renvoie le k de plus petite erreur (ex aequo : le plus petit) et les erreurs.
        Moins de 2 × plis séjours connus : pas assez pour cinq plis, k = √n.
        """
        n = len(Z)
        grille = [k for k in K_GRILLE if k <= n - -(-n // plis)]     # au plus la taille du plus petit apprentissage
        if n < 2 * plis or not grille:
            return max(1, round(math.sqrt(n))), None
        nuits = self._nuits(Z[:, 0])
        ordre = np.random.default_rng(graine).permutation(n)
        ecarts = {k: [] for k in grille}
        for p in range(plis):
            test = ordre[p::plis]
            entr = np.setdiff1d(ordre, test)
            for k, (med, _, _) in _voisins(_distances(Z[test, 1:], Z[entr, 1:]), nuits[entr], grille).items():
                ecarts[k].append(np.abs(np.round(med) - np.round(nuits[test])))
        erreurs = {k: float(np.concatenate(v).mean()) for k, v in ecarts.items()}
        return min(erreurs, key=lambda k: (erreurs[k], k)), erreurs

    def _knn(self, Z, grille=None):
        r = _voisins(_distances(Z[:, 1:], self.Z[:, 1:]), self._nuits(self.Z[:, 0]),
                     grille or [min(self.k, len(self.Z))])
        return r if grille else next(iter(r.values()))

    def predire_grille(self, lignes: pd.DataFrame, grille=K_GRILLE) -> dict[int, pd.DataFrame]:
        """Estimations kNN pour chaque k de la grille (balayage de k dans valider_estimation)."""
        return {k: _en_nuits(med, q1, q3, f"knn k={k}", lignes.index)
                for k, (med, q1, q3) in self._knn(self._vers_z(lignes), list(grille)).items()}

    # ── régressions enchaînées ──
    def _ajuster_regression(self, Z, tours: int = 10):
        lam = 1.0 if self.reglage is None else self.reglage
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
    def _ajuster_em(self, Z, tours: int = 100, tol: float = 1e-5):
        lam = 1e-3 if self.reglage is None else self.reglage
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
        if self.reglage is None:                         # trop peu de séjours pour choisir : 80 % de la variance
            s = np.linalg.svd(Zf, compute_uv=False)
            cumul = np.cumsum(s ** 2) / (s ** 2).sum()
            self.rang = max(1, int((cumul < part).sum()) + 1)
        else:
            self.rang = int(min(self.reglage, Z.shape[1]))
        for _ in range(tours):
            U, s, Vt = np.linalg.svd(Zf, full_matrices=False)
            R = (U[:, :self.rang] * s[:self.rang]) @ Vt[:self.rang]
            avant = Zf[~M].copy()
            Zf[~M] = R[~M]
            if not len(avant) or np.abs(Zf[~M] - avant).max() < tol:
                break
        self.V = Vt[:self.rang].T
        self.retrecir = np.ones(self.rang)

    # ── SoftImpute (norme nucléaire) ──
    def _ajuster_softimpute(self, Z, tours: int = 100, tol: float = 1e-6):
        """R = U diag(max(σ − λ, 0)) Vᵀ, cases vides ← R, jusqu'à stabilité ; λ = reglage × σ_1 (Z rempli par 0)."""
        M = ~np.isnan(Z)
        Zf = np.where(M, Z, 0.0)
        lam = (0.1 if self.reglage is None else self.reglage) * np.linalg.svd(Zf, compute_uv=False)[0]
        for _ in range(tours):
            U, s, Vt = np.linalg.svd(Zf, full_matrices=False)
            d = np.maximum(s - lam, 0.0)
            avant = Zf[~M].copy()
            Zf[~M] = ((U * d) @ Vt)[~M]
            if not len(avant) or np.abs(Zf[~M] - avant).max() < tol:
                break
        garde = d > 0
        garde[0] = True
        self.rang = int(garde.sum())
        self.V = Vt[garde].T
        self.retrecir = np.where(s[garde] > 0, d[garde] / s[garde], 0.0)     # (σ_i − λ)/σ_i

    # ── application commune (régression, EM, ACP) ──
    def _completer(self, Z):
        M = ~np.isnan(Z)
        if self.methode == "em":
            Zc, _, self._var_cond = self._esperance(Z, M, self.mu, self.sigma)
            return Zc
        Zc = np.where(M, Z, 0.0)
        if self.methode == "xgboost":
            Zc[:, 0] = self.xgb.predire(Z[:, 1:])
            return Zc
        if self.methode == "regression":
            for _ in range(self.tours):
                for j in self.incompletes:
                    vides = ~M[:, j]
                    if vides.any():
                        autres = [i for i in range(Z.shape[1]) if i != j]
                        Zc[vides, j] = np.column_stack([Zc[np.ix_(vides, autres)], np.ones(vides.sum())]) @ self.beta[j]
            return Zc
        for motif, lignes in _motifs(M):                      # ACP itérative et SoftImpute (axes rétrécis)
            o, m = motif, ~motif
            if m.any() and o.any():
                Vo, Vm = self.V[o], self.V[m] * self.retrecir
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


def _modele(tables: dict, methode: str) -> "ModeleDuree":
    """Modèle appris une seule fois par jeu de séjours connus (« xgboost » et « hybride » partagent le même)."""
    cache = tables.setdefault("modeles", {})
    if methode not in cache:
        cache[methode] = ModeleDuree(methode).ajuster(tables["connus"])
    return cache[methode]


def estimer(lignes: pd.DataFrame, tables: dict, methode: str = "estimee") -> pd.DataFrame:
    """Pour chaque ligne : nuits (estimation), nuits_q1, nuits_q3 et la source de l'estimation."""
    if methode not in METHODES[1:]:
        raise ValueError(f"Méthode d'estimation inconnue : {methode} (attendues : {', '.join(METHODES[1:])}).")
    if methode in A_MODELE or methode == "hybride":
        if len(lignes) == 0:
            return pd.DataFrame(columns=["nuits", "nuits_q1", "nuits_q3", "source"])
    if methode == "hybride":                           # prix écrit et classe connue : médiane par prix ; sinon XGBoost
        res = estimer(lignes, tables, "estimee")
        sans_prix = (res["source"] != "prix").to_numpy()
        if sans_prix.any():
            res.loc[sans_prix] = _modele(tables, "xgboost").predire(lignes[sans_prix]).to_numpy()
        res[["nuits", "nuits_q1", "nuits_q3"]] = res[["nuits", "nuits_q1", "nuits_q3"]].astype(int)
        res["source"] = np.where(sans_prix, "hybride: xgboost", "hybride: prix")
        return res
    if methode in A_MODELE:
        return _modele(tables, methode).predire(lignes)
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


REFERENCE = "estimee"                      # la méthode retenue, contre laquelle les autres sont testées
# Variantes de prétraitement des méthodes à modèle, comparées dans valider_estimation (nom : méthode, options).
PRETRAITEMENTS = {"knn (mise à l'échelle robuste)": ("knn", dict(echelle="robuste")),
                  **{f"{m} (sans logarithme)": (m, dict(log=False)) for m in A_MODELE},
                  **{f"{m} (+ diagnostic)": (m, dict(diagnostic=True)) for m in ("knn", "regression", "em")},
                  "xgboost (sans diagnostic)": ("xgboost", dict(diagnostic=False))}
EVALUATIONS = ("croisee", "temporelle", "masquage")


def _wilcoxon(d: np.ndarray) -> float:
    """
    Test des rangs signés de Wilcoxon (bilatéral, approximation normale avec correction des ex aequo) sur des
    différences appariées d_i = |erreur de la méthode|_i − |erreur de la référence|_i, sur les MÊMES séjours.
    W⁺ = somme des rangs de |d_i| pour d_i > 0 (les zéros sont retirés) ;
    E[W⁺] = n(n+1)/4,  Var[W⁺] = n(n+1)(2n+1)/24 − Σ_t (t³ − t)/48  (t : taille de chaque groupe d'ex aequo).
    """
    d = d[d != 0]
    n = len(d)
    if n < 10:
        return float("nan")
    rangs = pd.Series(np.abs(d)).rank(method="average").to_numpy()
    w = rangs[d > 0].sum()
    _, t = np.unique(np.abs(d), return_counts=True)
    var = n * (n + 1) * (2 * n + 1) / 24 - ((t ** 3 - t).sum()) / 48
    if var <= 0:
        return float("nan")
    z = (abs(w - n * (n + 1) / 4) - 0.5) / math.sqrt(var)
    return float(math.erfc(max(z, 0) / math.sqrt(2)))


def _erreurs(entrainement: pd.DataFrame, test: pd.DataFrame, methodes, min_lignes, grille_k=(),
             pretraitements: dict | None = None) -> dict[str, pd.DataFrame]:
    """
    Écart (prédit − vrai) et « dans la fourchette » de chaque séjour test, pour chaque méthode ; avec `grille_k`,
    aussi le kNN à k imposé (« knn k=… ») pour le balayage de k. La ligne « knn » est le kNN tel qu'il est
    utilisé : k choisi par validation croisée sur les seuls séjours d'apprentissage (validation imbriquée).
    `pretraitements` : variantes {nom: (méthode, options de ModeleDuree)} (mise à l'échelle, logarithme).
    """
    tables = tables_durees(entrainement, min_lignes)
    vrai = test["duree_nuits"].astype(float)
    estimations = {m: estimer(test, tables, m) for m in methodes}
    if len(grille_k) and len(test):
        estimations |= {f"knn k={k}": e for k, e in
                        ModeleDuree("knn", k=1).ajuster(entrainement).predire_grille(test, grille_k).items()}
    for nom, (m, options) in (pretraitements or {}).items():
        if len(test):
            estimations[nom] = ModeleDuree(m, **options).ajuster(entrainement).predire(test)
    return {m: pd.DataFrame({"ecart": e["nuits"].astype(float) - vrai,
                             "dedans": (vrai >= e["nuits_q1"]) & (vrai <= e["nuits_q3"])}, index=test.index)
            for m, e in estimations.items()}


def _decoupages(evaluation: str, connus: pd.DataFrame, tous: pd.DataFrame | None, plis: int, graine: int,
                repetitions: int, part_masquee: float, min_entrainement: int):
    """Couples (apprentissage, test) de séjours CONNUS selon la façon d'évaluer."""
    rng = np.random.default_rng(graine)
    if evaluation == "croisee":                      # k plis au hasard
        ordre = rng.permutation(len(connus))
        for k in range(plis):
            yield connus.iloc[np.setdiff1d(ordre, ordre[k::plis])], connus.iloc[ordre[k::plis]], f"pli {k + 1}"
    elif evaluation == "temporelle":                 # apprendre sur les mois passés, tester le mois suivant
        mois = pd.to_datetime(connus["entree"]).dt.to_period("M")
        for m in sorted(mois.unique()):
            avant, pendant = connus[mois < m], connus[mois == m]
            if len(avant) >= min_entrainement and len(pendant):
                yield avant, pendant, str(m)
    elif evaluation == "masquage":                   # cacher des séjours connus selon le profil des vrais manquants
        if tous is None or "statut" not in tous:
            return
        inconnu = tous["statut"].isin(["inconnue", "imputee"])
        cellule = lambda s: (pd.to_datetime(s["entree"]).dt.to_period("M").astype(str) + "|"
                             + s["prix"].notna().astype(str) + "|"
                             + s["issue"].fillna("").astype(str).str.strip().ne("").astype(str))
        c_tous = cellule(tous)
        # P(durée inconnue | mois, prix écrit, issue écrite), lissée (k + ½)/(n + 1) (Jeffreys) : une cellule sans
        # aucun manquant garde une petite probabilité au lieu de zéro.
        g = inconnu.groupby(c_tous)
        p_cellule = (g.sum() + 0.5) / (g.size() + 1)
        poids = cellule(connus).map(p_cellule).fillna(0).to_numpy(float)
        if poids.sum() <= 0:
            return
        n_test = min(max(1, int(part_masquee * len(connus))), int((poids > 0).sum()))
        for r in range(repetitions):
            idx = rng.choice(len(connus), size=n_test, replace=False, p=poids / poids.sum())
            garde = np.setdiff1d(np.arange(len(connus)), idx)
            yield connus.iloc[garde], connus.iloc[idx], f"tirage {r + 1}"


def valider_estimation(connus: pd.DataFrame, plis: int = 5, graine: int = 1, min_lignes: int = MIN_LIGNES,
                       methodes: tuple = METHODES[1:], tous: pd.DataFrame | None = None,
                       evaluations: tuple = EVALUATIONS, repetitions: int = 10, part_masquee: float = 0.2,
                       bootstrap: int = 1000, min_entrainement: int = 100, grille_k: tuple = K_GRILLE,
                       pretraitements: bool = True) -> pd.DataFrame:
    """
    Chaque méthode prédit des durées CONNUES qu'on lui cache ; trois façons de choisir les durées cachées :
      croisee    validation croisée en `plis` plis, séjours tirés au hasard ;
      temporelle apprendre sur les mois passés, tester le mois suivant, comme dans la réalité (rien du futur) ;
      masquage   masquage RÉALISTE : on cache des séjours connus avec une probabilité proportionnelle à
                 P(durée inconnue | mois d'entrée, prix écrit, issue écrite), estimée sur TOUS les séjours
                 (`tous`, avec la colonne statut) : les séjours cachés ressemblent aux vrais manquants
                 (`repetitions` tirages de `part_masquee` des séjours connus).
    Mesures, par évaluation et par méthode, sur les mêmes séjours pour toutes les méthodes :
      erreur_moyenne_nuits  et son intervalle à 95 % (bootstrap des séjours, `bootstrap` tirages)
      ecart_vs_reference    erreur moyenne − celle de la méthode retenue (« estimee »), intervalle bootstrap apparié
      p_wilcoxon            test des rangs signés de Wilcoxon sur |erreur| contre la méthode retenue
      erreur_mediane_nuits, a_1_nuit_pres_%, biais_nuits (< 0 : durées sous-estimées), dans_q1_q3_% (50 % attendus)
    Balayage de k (si « knn » est parmi les méthodes) : lignes « knn k=1 », « knn k=3 »… pour chaque k de
    `grille_k`, sur les mêmes séjours cachés ; la courbe erreur(k) montre le creux entre k trop petit (instable)
    et k trop grand (tout le monde reçoit presque la médiane générale). La ligne « knn » choisit k elle-même,
    sans voir les séjours testés.
    Prétraitement (`pretraitements`) : lignes « knn (mise à l'échelle robuste) » et « <méthode> (sans
    logarithme) » pour les méthodes à modèle présentes, sur les mêmes séjours cachés : justifient le z-score et
    les logarithmes de la durée et du prix.
    À citer dans le mémoire pour justifier le choix.
    """
    connus = connus[connus["duree_nuits"].notna()]
    rng = np.random.default_rng(graine + 7)
    lignes = []
    for evaluation in evaluations:
        res = {}
        balayage = grille_k if "knn" in methodes else ()
        variantes = {n: v for n, v in PRETRAITEMENTS.items() if v[0] in methodes} if pretraitements else {}
        for entr, test, _ in _decoupages(evaluation, connus, tous, plis, graine, repetitions, part_masquee, min_entrainement):
            for m, e in _erreurs(entr, test, methodes, min_lignes, balayage, variantes).items():
                res.setdefault(m, []).append(e)
        if not any(res.values()):
            continue
        err = {m: pd.concat(v, ignore_index=True) for m, v in res.items() if v}
        n = len(next(iter(err.values())))
        err = {m: e for m, e in err.items() if len(e) == n}    # un k plus grand qu'un apprentissage manque à un pli
        tirages = rng.integers(0, n, size=(bootstrap, n))
        ref = err.get(REFERENCE)
        for m, e in err.items():
            a = e["ecart"].abs().to_numpy()
            boot = a[tirages].mean(axis=1)
            l = {"evaluation": evaluation, "methode": m, "sejours": n,
                 "erreur_moyenne_nuits": round(float(a.mean()), 3),
                 "IC95_bas": round(float(np.quantile(boot, 0.025)), 3), "IC95_haut": round(float(np.quantile(boot, 0.975)), 3)}
            if ref is not None and m != REFERENCE:
                d = a - ref["ecart"].abs().to_numpy()
                bd = d[tirages].mean(axis=1)
                l.update({"ecart_vs_reference": round(float(d.mean()), 3),
                          "ecart_IC95_bas": round(float(np.quantile(bd, 0.025)), 3),
                          "ecart_IC95_haut": round(float(np.quantile(bd, 0.975)), 3),
                          "p_wilcoxon": round(_wilcoxon(d), 4)})
            l.update({"erreur_mediane_nuits": round(float(np.median(a)), 2),
                      "a_1_nuit_pres_%": round(100 * float((a <= 1).mean()), 1),
                      "biais_nuits": round(float(e["ecart"].mean()), 2),
                      "dans_q1_q3_%": round(100 * float(e["dedans"].mean()), 1)})
            lignes.append(l)
    return pd.DataFrame(lignes).set_index(["evaluation", "methode"])
