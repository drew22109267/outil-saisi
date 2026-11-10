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

Calcul : PyTorch (CPU, float64) et pandas, sans numpy. Quantiles par interpolation linéaire (torch.quantile, la
définition de numpy par défaut ; la médiane d'un nombre pair de valeurs est la moyenne des deux du milieu).
Temps de calcul (profil du 09/11/2026 : 1 200 s par appel de valider_estimation, dont 465 s de XGBoost, 243 s
de lecture répétée des variables et 220 s d'EM) :
  - les variables (âge lu dans le texte, familles de diagnostic) sont calculées une fois par TEXTE distinct, et
    une fois par séjour pour toute la validation (colonnes cachées, voir `avec_variables`) ;
  - l'EM calcule les motifs de cases vides une fois par ajustement, pas à chaque itération ;
  - les découpages de la validation sont indépendants : ils tournent en parallèle (`processus`, variable
    d'environnement NERA_PROCESSUS ; même résultat qu'en série, l'ordre des découpages est conservé) ;
  - le résultat peut être gardé sur disque (`cache`) : la clé est l'empreinte des séjours et des réglages, il
    n'est donc relu que pour des données identiques (les trois comptages d'un même service, par exemple).
"""
from __future__ import annotations

import hashlib
import math
import os
import pickle
from concurrent.futures import ProcessPoolExecutor
from multiprocessing import get_context
from pathlib import Path

import pandas as pd
import torch

TYPE = torch.float64
NAN = float("nan")
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
VERSION_CALCUL = "torch-1"                           # entre dans la clé du cache : à changer si le calcul change
N_VARIABLES = 4 + len(ISSUES) + 2                    # log prix, âge, sexe, nouveau, issues, mois (sin, cos)


# ── petits outils (tenseurs) ──
def _t(x) -> torch.Tensor:
    if isinstance(x, torch.Tensor):
        return x.to(TYPE)
    if isinstance(x, (pd.Series, pd.Index)):
        x = x.to_numpy(dtype="float64", na_value=NAN)
    return torch.tensor(x, dtype=TYPE)


def _serie(s: pd.Series) -> torch.Tensor:
    return torch.tensor(pd.to_numeric(s, errors="coerce").astype("float64").to_numpy(na_value=NAN), dtype=TYPE)


def _generateur(graine: int) -> torch.Generator:
    return torch.Generator().manual_seed(int(graine))


def _quantile(x: torch.Tensor, q, dim=None) -> torch.Tensor:
    """Quantile par interpolation linéaire (définition par défaut de numpy)."""
    return torch.quantile(x, torch.tensor(q, dtype=TYPE), dim=dim)


def _nanstd(x: torch.Tensor, dim: int = 0) -> torch.Tensor:
    m = torch.nanmean(x, dim=dim, keepdim=True)
    return torch.sqrt(torch.nanmean((x - m) ** 2, dim=dim))


def _sauf(n: int, retires: torch.Tensor) -> torch.Tensor:
    """Indices 0 … n − 1 sans `retires`, en ordre croissant (np.setdiff1d)."""
    garde = torch.ones(n, dtype=torch.bool)
    garde[retires] = False
    return torch.nonzero(garde).squeeze(1)


def _resume(d: pd.Series) -> tuple[float, float, float]:
    return float(d.median()), float(d.quantile(0.25)), float(d.quantile(0.75))


# ── variables d'un séjour ──
def _age(lignes: pd.DataFrame) -> pd.Series:
    """Âge en années lu dans le texte ; chaque texte distinct n'est lu qu'une fois."""
    from traitement.urgences import lire_age            # même lecture de l'âge que le registre des urgences
    if "age_texte" not in lignes:
        return pd.Series(NAN, index=lignes.index, dtype="float64")
    textes = [None if pd.isna(t) else str(t) for t in lignes["age_texte"]]   # NaN ≠ NaN : clé None à la place
    lus = {t: lire_age(t)[0] for t in set(textes)}
    return pd.Series([lus[t] for t in textes], index=lignes.index, dtype="float64")


def familles_diagnostic(lignes: pd.DataFrame, colonnes=("diagnostic_sortie", "diagnostic_entree")) -> torch.Tensor:
    """Une indicatrice par famille de DIAGNOSTICS (texte des `colonnes` réunies) ; vide si rien n'est écrit."""
    from traitement.urgences import sans_accents
    if not len(lignes):
        return torch.empty((0, len(DIAGNOSTICS)), dtype=TYPE)
    texte = pd.Series("", index=lignes.index)
    for c in colonnes:
        if c in lignes:
            texte = texte + " " + lignes[c].fillna("").astype(str)
    distincts = pd.Series(texte.drop_duplicates().to_list())
    propres = distincts.map(sans_accents)
    ecrit = propres.str.strip().ne("")
    table = pd.DataFrame({nom: propres.str.contains(motif, regex=True).astype("float64").where(ecrit)
                          for nom, motif in DIAGNOSTICS.items()})
    table.index = distincts
    return torch.tensor(table.loc[texte.to_list()].to_numpy(dtype="float64", na_value=NAN), dtype=TYPE)


def _variables_calculees(lignes: pd.DataFrame) -> torch.Tensor:
    n = len(lignes)
    if not n:
        return torch.empty((0, N_VARIABLES), dtype=TYPE)
    prix = _serie(lignes["prix"]) if "prix" in lignes else torch.full((n,), NAN, dtype=TYPE)
    cols = [torch.log(torch.where(prix > 0, prix, torch.tensor(NAN, dtype=TYPE))), _t(_age(lignes))]
    sexe = lignes["sexe"].astype(str).str.upper().str[:1] if "sexe" in lignes else pd.Series("", index=lignes.index)
    cols.append(_t(sexe.map({"F": 1.0, "M": 0.0}).astype("float64")))
    an = lignes["ancien_nouveau"].astype(str).str.upper().str[:1] if "ancien_nouveau" in lignes else pd.Series("", index=lignes.index)
    cols.append(_t(an.map({"N": 1.0, "A": 0.0}).astype("float64")))
    issue = lignes["issue"].astype(str) if "issue" in lignes else pd.Series("", index=lignes.index)
    cols += [_t((issue == i).astype("float64")) for i in ISSUES]
    mois = _t(pd.to_datetime(lignes["entree"]).dt.month.astype("float64")) if "entree" in lignes else torch.full((n,), NAN, dtype=TYPE)
    cols += [torch.sin(2 * math.pi * (mois - 1) / 12), torch.cos(2 * math.pi * (mois - 1) / 12)]
    return torch.stack(cols, dim=1)


_COLS_V = [f"__v{i}" for i in range(N_VARIABLES)]
_COLS_D = [f"__d{i}" for i in range(len(DIAGNOSTICS))]


def avec_variables(lignes: pd.DataFrame) -> pd.DataFrame:
    """
    Copie de `lignes` avec les variables des méthodes à modèle en colonnes cachées (__v…, __d…) : calculées une fois
    ici, elles suivent les séjours dans tous les découpages de la validation au lieu d'être relues à chaque modèle.
    """
    if _COLS_V[0] in lignes:
        return lignes
    V = pd.DataFrame(_variables_calculees(lignes).tolist(), index=lignes.index, columns=_COLS_V, dtype="float64")
    D = pd.DataFrame(familles_diagnostic(lignes).tolist(), index=lignes.index, columns=_COLS_D, dtype="float64")
    return pd.concat([lignes, V, D], axis=1)


def variables(lignes: pd.DataFrame, diagnostic: bool = False) -> torch.Tensor:
    """Une ligne par séjour : log prix, âge, sexe féminin, nouveau, issue (indicatrices), mois (sinus, cosinus),
    et si `diagnostic` les familles de diagnostics."""
    if _COLS_V[0] in lignes:
        cols = _COLS_V + (_COLS_D if diagnostic else [])
        return torch.tensor(lignes[cols].to_numpy(dtype="float64", na_value=NAN), dtype=TYPE).reshape(len(lignes), len(cols))
    X = _variables_calculees(lignes)
    return torch.cat([X, familles_diagnostic(lignes)], dim=1) if diagnostic else X


# ── kNN ──
def _distances(F: torch.Tensor, G: torch.Tensor, bloc: int = 128) -> torch.Tensor:
    """
    d²(a, b) entre chaque ligne de F et chaque ligne de G, sur les variables écrites des deux côtés, × p/|C|.
    Calcul DIRECT, Σ (z_a − z_b)², par blocs de lignes : deux séjours de mêmes variables sont exactement à
    distance 0, et deux voisins également proches sont exactement à égalité (départagés ensuite par leur ordre).
    La forme développée a² + b² − 2ab (version numpy d'origine) laissait un bruit d'arrondi de l'ordre de 1e−16
    décider quel voisin, parmi des ex aequo, entrait dans les k plus proches. Même calculée directement, une
    distance garde le bruit de la mise à l'échelle (moyenne et écart-type, ~1e−15) : elle est donc arrondie à
    1e−9, si bien que des voisins également proches sont exactement ex aequo et départagés par l'ordre des séjours
    (règle fixe, la même quelle que soit la bibliothèque de calcul).
    """
    Ma, Mb = ~torch.isnan(F), ~torch.isnan(G)
    fa, fb = torch.nan_to_num(F, nan=0.0), torch.nan_to_num(G, nan=0.0)
    communes = Ma.to(TYPE) @ Mb.to(TYPE).T
    d2 = torch.empty((len(F), len(G)), dtype=TYPE)
    for i in range(0, len(F), bloc):
        ecart = fa[i:i + bloc, None, :] - fb[None, :, :]
        ensemble = Ma[i:i + bloc, None, :] & Mb[None, :, :]
        d2[i:i + bloc] = torch.where(ensemble, ecart * ecart, torch.zeros((), dtype=TYPE)).sum(dim=2)
    d2 = torch.round(d2 * F.shape[1] / communes.clamp(min=1), decimals=9)
    return torch.where(communes > 0, d2, torch.tensor(math.inf, dtype=TYPE))


def _voisins(d2: torch.Tensor, durees: torch.Tensor, grille) -> dict[int, tuple]:
    """Pour chaque k de la grille : médiane, q1 et q3 des durées des k plus proches (une ligne de d2 par séjour)."""
    tri = durees[torch.sort(d2, dim=1, stable=True).indices]
    res = {}
    for k in grille:
        if k <= tri.shape[1]:
            q = _quantile(tri[:, :k], [0.5, 0.25, 0.75], dim=1)
            res[k] = (q[0], q[1], q[2])
    return res


def _en_nuits(med, q1, q3, source: str, index) -> pd.DataFrame:
    nuits = torch.round(med)
    return pd.DataFrame({"nuits": nuits.to(torch.long).tolist(),
                         "nuits_q1": torch.minimum(torch.floor(q1), nuits).to(torch.long).tolist(),
                         "nuits_q3": torch.maximum(torch.ceil(q3), nuits).to(torch.long).tolist(),
                         "source": source}, index=index)


def _motifs(M: torch.Tensor) -> list[tuple[torch.Tensor, torch.Tensor]]:
    """[(motif des cases écrites, lignes qui le portent)] — calculé une fois par masque."""
    motifs, inverse = torch.unique(M.to(torch.int8), dim=0, return_inverse=True)
    ordre = torch.sort(inverse, stable=True)
    bornes = torch.bincount(inverse, minlength=len(motifs)).tolist()
    groupes, debut = [], 0
    for k, taille in enumerate(bornes):
        groupes.append((motifs[k].bool(), ordre.indices[debut:debut + taille]))
        debut += taille
    return groupes


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

    def _tableau(self, duree: torch.Tensor, lignes: pd.DataFrame) -> torch.Tensor:
        J = torch.cat([torch.log1p(duree)[:, None], variables(lignes, self.diagnostic)], dim=1)
        if not self.log:                                 # durée en nuits, prix en francs (colonne 1 : log prix)
            J[:, 0], J[:, 1] = duree, torch.exp(J[:, 1])
        return J

    def ajuster(self, connus: pd.DataFrame) -> "ModeleDuree":
        duree = _serie(connus["duree_nuits"])
        J = self._tableau(duree, connus)
        ecrits = (~torch.isnan(J)).sum(0)
        ecart = _nanstd(J, 0)
        self.garder = [j for j in range(J.shape[1]) if int(ecrits[j]) >= 2 and float(ecart[j]) > 1e-12]
        J = J[:, self.garder]
        if self.echelle_type == "robuste":
            q1, med, q3 = torch.nanquantile(J, torch.tensor([0.25, 0.5, 0.75], dtype=TYPE), dim=0)
            self.centre = med
            self.echelle = torch.where(q3 - q1 > 1e-12, q3 - q1, torch.ones_like(q1))   # indicatrice rare : Q3 − Q1 = 0
        else:
            self.centre, self.echelle = torch.nanmean(J, dim=0), _nanstd(J, 0)
        Z = (J - self.centre) / self.echelle
        self.Z = Z
        self.max_nuits = float(duree[~torch.isnan(duree)].max())
        # Durées EXACTES des séjours connus (kNN) : les reconstituer par exp(z·écart-type + moyenne) − 1 laisse un
        # bruit de ~1e−15 (1,9999999999999998 au lieu de 2) qui fait basculer floor(q1) et ceil(q3) d'une nuit.
        self.nuits_connues = duree.clamp(0, self.max_nuits)
        if self.reglage is None and self.methode in ("regression", "em", "acp_iterative", "softimpute"):
            self.reglage, self.erreurs_reglage = self._choisir_reglage(connus, self._grille(Z.shape[1]))
        getattr(self, f"_ajuster_{self.methode}")(Z)
        if self.methode in ("regression", "acp_iterative", "softimpute"):   # résidus sur les connus (durée cachée)
            cachee = Z.clone(); cachee[:, 0] = NAN
            pred = self._completer(cachee)[:, 0]
            self.residus = Z[:, 0] - pred
        return self

    def _vers_z(self, lignes: pd.DataFrame) -> torch.Tensor:
        J = self._tableau(torch.full((len(lignes),), NAN, dtype=TYPE), lignes)[:, self.garder]
        return (J - self.centre) / self.echelle

    def _nuits(self, z: torch.Tensor) -> torch.Tensor:
        x = z * self.echelle[0] + self.centre[0]
        # Bornée par les durées vues à l'apprentissage : une estimation un peu extrême en log deviendrait, par
        # exp(·) − 1, des centaines de nuits (validation temporelle de l'ACP : 182 nuits d'erreur moyenne).
        return (torch.expm1(x) if self.log else x).clamp(0, self.max_nuits)

    def predire(self, lignes: pd.DataFrame) -> pd.DataFrame:
        Z = self._vers_z(lignes)
        if self.methode == "knn":
            med, q1, q3 = self._knn(Z)
        else:
            Zc = self._completer(Z)
            z = Zc[:, 0]
            if self.methode == "em":
                sd = torch.sqrt(self._var_cond.clamp(min=0))
                q1z, q3z = z - Z_QUARTILE * sd, z + Z_QUARTILE * sd
            else:
                r1, r3 = _quantile(self.residus, [0.25, 0.75])
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
        ordre = torch.randperm(n, generator=_generateur(graine))
        vrai = torch.round(_serie(connus["duree_nuits"]))
        ecarts = {v: [] for v in grille}
        for f in range(plis):
            test = ordre[f::plis]
            entr = _sauf(n, test)
            for v in grille:
                m = ModeleDuree(self.methode, echelle=self.echelle_type, log=self.log, reglage=v,
                                diagnostic=self.diagnostic).ajuster(connus.iloc[entr.tolist()])
                pred = _t(m.predire(connus.iloc[test.tolist()])["nuits"].astype("float64"))
                ecarts[v].append((pred - vrai[test]).abs())
        erreurs = {v: float(torch.cat(e).mean()) for v, e in ecarts.items()}
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
            ordre = torch.randperm(len(y), generator=_generateur(graine))
            erreurs, horsech = {}, {}
            for prof in GRILLE_XGB_PROFONDEUR:
                for f in range(plis):
                    test = ordre[f::plis]
                    entr = _sauf(len(y), test)
                    m = XGBoostRegression(XGB_ARBRES, 0.1, prof).entrainer(X[entr], y[entr])
                    for a, z in m.predire_etapes(X[test], etapes).items():
                        e = (torch.round(self._nuits(z)) - torch.round(self._nuits(y[test]))).abs()
                        erreurs.setdefault((prof, a), []).append(e)
                        horsech.setdefault((prof, a), torch.empty(len(y), dtype=TYPE))[test] = y[test] - z
            erreurs = {k: float(torch.cat(v).mean()) for k, v in erreurs.items()}
            self.reglage = min(erreurs, key=lambda k: (erreurs[k], k[0], k[1]))
            self.erreurs_reglage = erreurs
            self.residus = horsech[self.reglage]
        prof, arbres = self.reglage or (3, 100)
        self.xgb = XGBoostRegression(arbres, 0.1, prof).entrainer(X, y)
        if getattr(self, "residus", None) is None or len(self.residus) != len(y):
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
        nuits = self.nuits_connues                       # durées exactes (voir ajuster)
        ordre = torch.randperm(n, generator=_generateur(graine))
        ecarts = {k: [] for k in grille}
        for p in range(plis):
            test = ordre[p::plis]
            entr = _sauf(n, test)
            for k, (med, _, _) in _voisins(_distances(Z[test, 1:], Z[entr, 1:]), nuits[entr], grille).items():
                ecarts[k].append((torch.round(med) - torch.round(nuits[test])).abs())
        erreurs = {k: float(torch.cat(v).mean()) for k, v in ecarts.items()}
        return min(erreurs, key=lambda k: (erreurs[k], k)), erreurs

    def _knn(self, Z, grille=None):
        r = _voisins(_distances(Z[:, 1:], self.Z[:, 1:]), self.nuits_connues,
                     grille or [min(self.k, len(self.Z))])
        return r if grille else next(iter(r.values()))

    def predire_grille(self, lignes: pd.DataFrame, grille=K_GRILLE) -> dict[int, pd.DataFrame]:
        """Estimations kNN pour chaque k de la grille (balayage de k dans valider_estimation)."""
        return {k: _en_nuits(med, q1, q3, f"knn k={k}", lignes.index)
                for k, (med, q1, q3) in self._knn(self._vers_z(lignes), list(grille)).items()}

    # ── régressions enchaînées ──
    def _ajuster_regression(self, Z, tours: int = 10):
        lam = 1.0 if self.reglage is None else self.reglage
        M = ~torch.isnan(Z)
        Zf = torch.where(M, Z, torch.zeros((), dtype=TYPE))
        p = Z.shape[1]
        self.incompletes = [j for j in range(p) if bool((~M[:, j]).any()) or j == 0]
        self.beta, self.tours = {}, tours
        un = torch.ones((len(Zf), 1), dtype=TYPE)
        for _ in range(tours):
            for j in self.incompletes:
                autres = [i for i in range(p) if i != j]
                A = torch.cat([Zf[:, autres], un], dim=1)
                obs = M[:, j]
                Ao = A[obs]
                b = torch.linalg.solve(Ao.T @ Ao + lam * torch.eye(A.shape[1], dtype=TYPE), Ao.T @ Zf[obs, j])
                self.beta[j] = b
                Zf[~obs, j] = A[~obs] @ b

    # ── loi normale multivariée par EM ──
    def _ajuster_em(self, Z, tours: int = 100, tol: float = 1e-5):
        lam = 1e-3 if self.reglage is None else self.reglage
        n, p = Z.shape
        M = ~torch.isnan(Z)
        groupes = _motifs(M)                              # une fois : le masque ne change pas pendant l'EM
        mu, sigma = torch.zeros(p, dtype=TYPE), torch.eye(p, dtype=TYPE)
        for _ in range(tours):
            Zc, C, _ = self._esperance(Z, M, mu, sigma, groupes)
            mu_n = Zc.mean(dim=0)
            D = Zc - mu_n
            sigma_n = (D.T @ D + C) / n + lam * torch.eye(p, dtype=TYPE)
            ecart = max(float((mu_n - mu).abs().max()), float((sigma_n - sigma).abs().max()))
            mu, sigma = mu_n, sigma_n
            if ecart < tol:
                break
        self.mu, self.sigma = mu, sigma

    @staticmethod
    def _esperance(Z, M, mu, sigma, groupes=None):
        Zc = torch.where(M, Z, torch.zeros((), dtype=TYPE))
        C = torch.zeros_like(sigma)
        var0 = torch.zeros(len(Z), dtype=TYPE)       # variance conditionnelle de la durée (colonne 0)
        for motif, lignes in (groupes if groupes is not None else _motifs(M)):
            o, m = motif, ~motif
            if not bool(m.any()):
                continue
            im = torch.nonzero(m).squeeze(1)
            if not bool(o.any()):
                Zc[lignes[:, None], im[None, :]] = mu[im]
                Cm = sigma[im][:, im]
            else:
                io = torch.nonzero(o).squeeze(1)
                K = torch.linalg.solve(sigma[io][:, io], sigma[im][:, io].T).T
                Zc[lignes[:, None], im[None, :]] = mu[im] + (Zc[lignes][:, io] - mu[io]) @ K.T
                Cm = sigma[im][:, im] - K @ sigma[im][:, io].T
            C[im[:, None], im[None, :]] += len(lignes) * Cm
            if bool(m[0]):
                var0[lignes] = Cm[0, 0]
        return Zc, C, var0

    # ── ACP itérative ──
    def _ajuster_acp_iterative(self, Z, tours: int = 100, part: float = 0.8, tol: float = 1e-6):
        M = ~torch.isnan(Z)
        Zf = torch.where(M, Z, torch.zeros((), dtype=TYPE))
        if self.reglage is None:                         # trop peu de séjours pour choisir : 80 % de la variance
            s = torch.linalg.svdvals(Zf)
            cumul = torch.cumsum(s ** 2, 0) / (s ** 2).sum()
            self.rang = max(1, int((cumul < part).sum()) + 1)
        else:
            self.rang = int(min(self.reglage, Z.shape[1]))
        vides = ~M
        for _ in range(tours):
            U, s, Vt = torch.linalg.svd(Zf, full_matrices=False)
            R = (U[:, :self.rang] * s[:self.rang]) @ Vt[:self.rang]
            avant = Zf[vides].clone()
            Zf[vides] = R[vides]
            if not len(avant) or float((Zf[vides] - avant).abs().max()) < tol:
                break
        self.V = Vt[:self.rang].T
        self.retrecir = torch.ones(self.rang, dtype=TYPE)

    # ── SoftImpute (norme nucléaire) ──
    def _ajuster_softimpute(self, Z, tours: int = 100, tol: float = 1e-6):
        """R = U diag(max(σ − λ, 0)) Vᵀ, cases vides ← R, jusqu'à stabilité ; λ = reglage × σ_1 (Z rempli par 0)."""
        M = ~torch.isnan(Z)
        Zf = torch.where(M, Z, torch.zeros((), dtype=TYPE))
        lam = (0.1 if self.reglage is None else self.reglage) * float(torch.linalg.svdvals(Zf)[0])
        vides = ~M
        for _ in range(tours):
            U, s, Vt = torch.linalg.svd(Zf, full_matrices=False)
            d = (s - lam).clamp(min=0.0)
            avant = Zf[vides].clone()
            Zf[vides] = ((U * d) @ Vt)[vides]
            if not len(avant) or float((Zf[vides] - avant).abs().max()) < tol:
                break
        garde = d > 0
        garde[0] = True
        self.rang = int(garde.sum())
        self.V = Vt[garde].T
        self.retrecir = torch.where(s[garde] > 0, d[garde] / s[garde], torch.zeros_like(s[garde]))  # (σ_i − λ)/σ_i

    # ── application commune (régression, EM, ACP) ──
    def _completer(self, Z):
        M = ~torch.isnan(Z)
        if self.methode == "em":
            Zc, _, self._var_cond = self._esperance(Z, M, self.mu, self.sigma)
            return Zc
        Zc = torch.where(M, Z, torch.zeros((), dtype=TYPE))
        if self.methode == "xgboost":
            Zc[:, 0] = self.xgb.predire(Z[:, 1:])
            return Zc
        p = Z.shape[1]
        if self.methode == "regression":
            for _ in range(self.tours):
                for j in self.incompletes:
                    vides = ~M[:, j]
                    if bool(vides.any()):
                        autres = [i for i in range(p) if i != j]
                        A = torch.cat([Zc[vides][:, autres], torch.ones((int(vides.sum()), 1), dtype=TYPE)], dim=1)
                        Zc[vides, j] = A @ self.beta[j]
            return Zc
        for motif, lignes in _motifs(M):                      # ACP itérative et SoftImpute (axes rétrécis)
            o, m = motif, ~motif
            if bool(m.any()) and bool(o.any()):
                Vo, Vm = self.V[o], self.V[m] * self.retrecir
                io, im = torch.nonzero(o).squeeze(1), torch.nonzero(m).squeeze(1)
                s = torch.linalg.solve(Vo.T @ Vo + 1e-3 * torch.eye(Vo.shape[1], dtype=TYPE), Vo.T @ Zc[lignes][:, io].T).T
                Zc[lignes[:, None], im[None, :]] = s @ Vm.T
        return Zc


def tables_durees(connus: pd.DataFrame, min_lignes: int = MIN_LIGNES) -> dict:
    """
    `connus` : séjours de durée connue (colonnes duree_nuits, et si possible prix, issue, âge…).
    Renvoie {'global': (med, q1, q3), 'moyenne': (…), 'prix': {prix: (…)}, 'issue': {issue: (…)},
    'age': [(…) par tranche], 'connus': les séjours (pour les méthodes à modèle)} ; une classe n'est retenue
    que si elle compte au moins `min_lignes` séjours.
    """
    d = connus["duree_nuits"].astype(float)
    t = {"global": _resume(d) if len(d) else (NAN,) * 3, "prix": {}, "issue": {}, "connus": connus}
    t["moyenne"] = (float(d.mean()), t["global"][1], t["global"][2]) if len(d) else (NAN,) * 3
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


def _en_ligne(source: str, v: tuple) -> tuple:
    return round(v[0]), math.floor(v[1]), math.ceil(v[2]), source


def estimer(lignes: pd.DataFrame, tables: dict, methode: str = "estimee") -> pd.DataFrame:
    """Pour chaque ligne : nuits (estimation), nuits_q1, nuits_q3 et la source de l'estimation."""
    if methode not in METHODES[1:]:
        raise ValueError(f"Méthode d'estimation inconnue : {methode} (attendues : {', '.join(METHODES[1:])}).")
    if methode in A_MODELE or methode == "hybride":
        if len(lignes) == 0:
            return pd.DataFrame(columns=["nuits", "nuits_q1", "nuits_q3", "source"])
    if methode == "hybride":                           # prix écrit et classe connue : médiane par prix ; sinon XGBoost
        res = estimer(lignes, tables, "estimee")
        sans_prix = (res["source"] != "prix").to_list()
        if any(sans_prix):
            res.loc[sans_prix, ["nuits", "nuits_q1", "nuits_q3", "source"]] = (
                _modele(tables, "xgboost").predire(lignes[sans_prix]).to_numpy())
        res[["nuits", "nuits_q1", "nuits_q3"]] = res[["nuits", "nuits_q1", "nuits_q3"]].astype(int)
        res["source"] = ["hybride: xgboost" if s else "hybride: prix" for s in sans_prix]
        return res
    if methode in A_MODELE:
        return _modele(tables, methode).predire(lignes)
    # Méthodes simples : une valeur par classe (prix, issue, tranche d'âge), appliquée sans boucle sur les lignes.
    n = len(lignes)
    if methode == "moyenne":
        valeurs = [_en_ligne("moyenne", tables["moyenne"])] * n
    else:
        valeurs = [_en_ligne("mediane", tables["global"])] * n
        if methode == "mediane_age":
            ages = _age(lignes).to_list()
            bornes = list(zip(TRANCHES_AGE[:-1], TRANCHES_AGE[1:]))
            for i, a in enumerate(ages):
                if pd.notna(a):
                    for (lo, hi), r in zip(bornes, tables["age"]):
                        if lo <= a < hi and r is not None:
                            valeurs[i] = _en_ligne("age", r)
        elif methode == "estimee":
            prix = lignes["prix"].to_list() if "prix" in lignes else [None] * n
            issue = lignes["issue"].to_list() if "issue" in lignes else [None] * n
            for i in range(n):
                if pd.notna(prix[i]) and prix[i] in tables["prix"]:
                    valeurs[i] = _en_ligne("prix", tables["prix"][prix[i]])
                elif pd.notna(issue[i]) and issue[i] in tables["issue"]:
                    valeurs[i] = _en_ligne("issue", tables["issue"][issue[i]])
    return pd.DataFrame(valeurs, index=lignes.index, columns=["nuits", "nuits_q1", "nuits_q3", "source"])


REFERENCE = "estimee"                      # la méthode retenue, contre laquelle les autres sont testées
# Variantes de prétraitement des méthodes à modèle, comparées dans valider_estimation (nom : méthode, options).
PRETRAITEMENTS = {"knn (mise à l'échelle robuste)": ("knn", dict(echelle="robuste")),
                  **{f"{m} (sans logarithme)": (m, dict(log=False)) for m in A_MODELE},
                  **{f"{m} (+ diagnostic)": (m, dict(diagnostic=True)) for m in ("knn", "regression", "em")},
                  "xgboost (sans diagnostic)": ("xgboost", dict(diagnostic=False))}
EVALUATIONS = ("croisee", "temporelle", "masquage")


def _wilcoxon(d) -> float:
    """
    Test des rangs signés de Wilcoxon (bilatéral, approximation normale avec correction des ex aequo) sur des
    différences appariées d_i = |erreur de la méthode|_i − |erreur de la référence|_i, sur les MÊMES séjours.
    W⁺ = somme des rangs de |d_i| pour d_i > 0 (les zéros sont retirés) ;
    E[W⁺] = n(n+1)/4,  Var[W⁺] = n(n+1)(2n+1)/24 − Σ_t (t³ − t)/48  (t : taille de chaque groupe d'ex aequo).
    """
    d = _t(d)
    d = d[d != 0]
    n = len(d)
    if n < 10:
        return NAN
    rangs = _t(pd.Series(d.abs().tolist()).rank(method="average"))
    w = float(rangs[d > 0].sum())
    t = torch.unique(d.abs(), return_counts=True)[1].to(TYPE)
    var = n * (n + 1) * (2 * n + 1) / 24 - float((t ** 3 - t).sum()) / 48
    if var <= 0:
        return NAN
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


def _erreurs_tache(args) -> dict[str, pd.DataFrame]:
    """Un découpage, dans un processus à part : un seul fil de calcul (les matrices sont petites)."""
    torch.set_num_threads(1)
    os.environ["NERA_PROCESSUS"] = "1"                # pas de nouveaux processus à l'intérieur d'un découpage
    return _erreurs(*args)


def _decoupages(evaluation: str, connus: pd.DataFrame, tous: pd.DataFrame | None, plis: int, graine: int,
                repetitions: int, part_masquee: float, min_entrainement: int):
    """Couples (apprentissage, test) de séjours CONNUS selon la façon d'évaluer (tirages repris de `graine`)."""
    gen = _generateur(graine)
    n = len(connus)
    if evaluation == "croisee":                      # k plis au hasard
        ordre = torch.randperm(n, generator=gen)
        for k in range(plis):
            test = ordre[k::plis]
            yield connus.iloc[_sauf(n, test).tolist()], connus.iloc[test.tolist()], f"pli {k + 1}"
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
        poids = _t(cellule(connus).map(p_cellule).fillna(0).astype("float64"))
        if float(poids.sum()) <= 0:
            return
        n_test = min(max(1, int(part_masquee * n)), int((poids > 0).sum()))
        for r in range(repetitions):
            idx = torch.multinomial(poids / poids.sum(), n_test, replacement=False, generator=gen)
            yield connus.iloc[_sauf(n, idx).tolist()], connus.iloc[idx.tolist()], f"tirage {r + 1}"


def _cle_cache(connus: pd.DataFrame, tous: pd.DataFrame | None, reglages: dict) -> str:
    h = hashlib.sha256(VERSION_CALCUL.encode())
    for df in (connus, tous):
        if df is not None:
            h.update(pd.util.hash_pandas_object(df.astype(str), index=True).to_numpy().tobytes())
            h.update(",".join(map(str, df.columns)).encode())
    h.update(repr(sorted(reglages.items())).encode())
    return h.hexdigest()[:20]


def nombre_processus() -> int:
    """Processus pour la validation : NERA_PROCESSUS, sinon tous les cœurs."""
    return max(1, int(os.environ.get("NERA_PROCESSUS", os.cpu_count() or 1)))


def valider_estimation(connus: pd.DataFrame, plis: int = 5, graine: int = 1, min_lignes: int = MIN_LIGNES,
                       methodes: tuple = METHODES[1:], tous: pd.DataFrame | None = None,
                       evaluations: tuple = EVALUATIONS, repetitions: int = 10, part_masquee: float = 0.2,
                       bootstrap: int = 1000, min_entrainement: int = 100, grille_k: tuple = K_GRILLE,
                       pretraitements: bool = True, processus: int | None = None,
                       cache: str | Path | None = None) -> pd.DataFrame:
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
    `processus` : découpages calculés en parallèle (None : NERA_PROCESSUS, sinon tous les cœurs ; 1 : en série).
    `cache` : dossier où garder le résultat ; relu tel quel si les séjours et les réglages sont identiques.
    À citer dans le mémoire pour justifier le choix.
    """
    connus = connus[connus["duree_nuits"].notna()]
    reglages = dict(plis=plis, graine=graine, min_lignes=min_lignes, methodes=tuple(methodes),
                    evaluations=tuple(evaluations), repetitions=repetitions, part_masquee=part_masquee,
                    bootstrap=bootstrap, min_entrainement=min_entrainement, grille_k=tuple(grille_k),
                    pretraitements=pretraitements)
    fichier = None
    if cache is not None:
        fichier = Path(cache) / f"validation_durees_{_cle_cache(connus, tous, reglages)}.pkl"
        if fichier.exists():
            return pd.read_pickle(fichier)
    connus = avec_variables(connus)
    gen_boot = _generateur(graine + 7)
    processus = nombre_processus() if processus is None else max(1, int(processus))
    balayage = grille_k if "knn" in methodes else ()
    variantes = {n: v for n, v in PRETRAITEMENTS.items() if v[0] in methodes} if pretraitements else {}
    # Tous les découpages d'abord (tirages dans l'ordre), puis leurs erreurs, en parallèle ou en série.
    taches, evals = [], []
    for evaluation in evaluations:
        for entr, test, _ in _decoupages(evaluation, connus, tous, plis, graine, repetitions, part_masquee,
                                         min_entrainement):
            taches.append((entr, test, methodes, min_lignes, balayage, variantes))
            evals.append(evaluation)
    if processus > 1 and len(taches) > 1:
        with ProcessPoolExecutor(min(processus, len(taches)), mp_context=get_context("spawn")) as ex:
            resultats = list(ex.map(_erreurs_tache, taches))
    else:
        resultats = [_erreurs(*t) for t in taches]
    lignes = []
    for evaluation in evaluations:
        res = {}
        for ev, r in zip(evals, resultats):
            if ev == evaluation:
                for m, e in r.items():
                    res.setdefault(m, []).append(e)
        if not any(res.values()):
            continue
        err = {m: pd.concat(v, ignore_index=True) for m, v in res.items() if v}
        n = len(next(iter(err.values())))
        err = {m: e for m, e in err.items() if len(e) == n}    # un k plus grand qu'un apprentissage manque à un pli
        tirages = torch.randint(0, n, (bootstrap, n), generator=gen_boot)
        ref = err.get(REFERENCE)
        for m, e in err.items():
            a = _t(e["ecart"].abs().astype("float64"))
            boot = a[tirages].mean(dim=1)
            q_boot = _quantile(boot, [0.025, 0.975])
            l = {"evaluation": evaluation, "methode": m, "sejours": n,
                 "erreur_moyenne_nuits": round(float(a.mean()), 3),
                 "IC95_bas": round(float(q_boot[0]), 3), "IC95_haut": round(float(q_boot[1]), 3)}
            if ref is not None and m != REFERENCE:
                d = a - _t(ref["ecart"].abs().astype("float64"))
                bd = _quantile(d[tirages].mean(dim=1), [0.025, 0.975])
                l.update({"ecart_vs_reference": round(float(d.mean()), 3),
                          "ecart_IC95_bas": round(float(bd[0]), 3),
                          "ecart_IC95_haut": round(float(bd[1]), 3),
                          "p_wilcoxon": round(_wilcoxon(d), 4)})
            l.update({"erreur_mediane_nuits": round(float(_quantile(a, 0.5)), 2),
                      "a_1_nuit_pres_%": round(100 * float((a <= 1).to(TYPE).mean()), 1),
                      "biais_nuits": round(float(e["ecart"].mean()), 2),
                      "dans_q1_q3_%": round(100 * float(e["dedans"].astype("float64").mean()), 1)})
            lignes.append(l)
    resultat = pd.DataFrame(lignes).set_index(["evaluation", "methode"])
    if fichier is not None:
        fichier.parent.mkdir(parents=True, exist_ok=True)
        provisoire = fichier.with_suffix(f".{os.getpid()}.tmp")
        resultat.to_pickle(provisoire)
        os.replace(provisoire, fichier)
    return resultat
