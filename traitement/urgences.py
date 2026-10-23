r"""
Registre des URGENCES (registre `URG` de l'outil de saisie) : lecture du CSV exporté par l'outil et
nettoyage des passages pour le module triage du modèle NERA (dépôt nera-modele, dossier module_triage).

Une ligne = un PASSAGE aux urgences. Les colonnes de l'outil (intitulés exacts du CSV, séparateur « ; ») :
    Identifiant ligne ; N° d'ordre ; Date de passage ; Garde ; Sexe ; Âge ; Profession ; Résidence ; Pouls ;
    TA ; Glycémie ; Poids ; Température ; FR ; SpO2 ; Plaintes ; Diagnostic ; N° dossier ; Décision ;
    Remarque de saisie

Ce qui est gardé, et pourquoi
-----------------------------
  gardé     date, garde (jour / garde de nuit / permanence), sexe, âge, constantes, plaintes, décision ;
  écarté    N° dossier et résidence (identifiants ou quasi-identifiants : jamais dans un fichier de travail),
            profession (sert seulement à reconnaître un nourrisson « NRS » quand l'âge manque),
            diagnostic (écrit APRÈS l'examen : le donner au modèle serait une fuite de l'avenir, le triage
            se fait à l'arrivée ; il reste lisible dans l'outil pour les statistiques descriptives).

Règles de lecture (rien n'est inventé : une valeur illisible ou impossible devient « manquante »)
--------------------------------------------------------------------------------------------------
  Âge           « 4 ans », « 9 mois », « 3 sem », « 10 j », « 1 an 6 mois », « 18 mois » → années
                (1 mois = 1/12 an, 1 semaine = 7/365,25 an, 1 jour = 1/365,25 an) ; un nombre seul est
                en années ; « NRS » (nourrisson) sans nombre → manquant, mais l'indicatrice nourrisson est
                mise à 1 (moins d'un an). Plausible : 0 à 110 ans.
  TA            « 120/80 » (mmHg) ou « 12/8 » (cmHg, écriture courante : ×10 si la systolique < 30).
                Plausible : systolique 40–260, diastolique 20–160, systolique > diastolique.
  Glycémie      convertie en g/L.  « g/L » tel quel ; « mmol/L » ÷ 5,551 (1 mmol/L de glucose = 0,1802 g/L) ;
                « mg/dL » ÷ 100.  Sans unité : ≤ 3 → g/L ; 3 à 35 → mmol/L ; > 35 → mg/dL (une glycémie
                de 4 g/L sans unité est donc lue 4 mmol/L : l'unité doit être recopiée quand elle est écrite).
                « HI » (au-dessus de la limite du lecteur) → 6,0 g/L ; « LO » → 0,2 g/L. Plausible : 0,1–8 g/L.
  Température   °C, plausible 30–44.     Pouls       plausible 20–260 /min.
  FR            plausible 5–120 /min.    SpO2        plausible 40–100 %.      Poids  plausible 0,4–250 kg.
  Plaintes      texte libre séparé par des virgules ; reconnu par familles (voir PLAINTES) : une famille
                est une liste FIXÉE À L'AVANCE, pas apprise sur les données (sinon fuite).
  Décision      orientation écrite par le médecin → classe :
                  Hospitalisé, Référé, Décédé                      → grave
                  Externe                                          → non grave
                  MEO (mise en observation)                        → intermédiaire (placée par le banc T1)
                  SCAM (sortie contre avis médical)                → grave : le médecin voulait garder le patient
                  vide ou illisible                                → ligne sans cible (exclue de l'apprentissage)
"""
from __future__ import annotations

import csv
import io
import math
import re
import unicodedata
from pathlib import Path

import pandas as pd

from .depuis_outil import lire_date

AGE_ADULTE = 15.0            # ans : à partir de 15 ans, le patient relève des urgences adultes

PLAUSIBLE = {"pouls": (20, 260), "ta_sys": (40, 260), "ta_dia": (20, 160), "glycemie": (0.1, 8.0),
             "poids": (0.4, 250), "temperature": (30, 44), "fr": (5, 120), "spo2": (40, 100)}

# Familles de plaintes : nom de la variable → expression cherchée dans le texte (minuscules, sans accents).
PLAINTES = {
    "fievre": r"fievre|hyperthermi|corps chaud|febri",
    "toux": r"toux|tousse",
    "vomissements": r"vomi",
    "diarrhee": r"diarrh|selles liquides",
    "convulsions": r"convuls|crise",
    "douleur_abdominale": r"douleur abdo|abdominal|ventre|epigastr|colique",
    "cephalees": r"cephal|mal de tete|maux de tete",
    "dyspnee": r"dyspn|detresse respi|difficulte respi|essouffl|polypn|tirage|geignement",
    "paleur": r"paleur|anemi|pale\b",
    "conscience": r"inconscien|coma|obnubil|trouble de la conscience|alteration de la conscience|somnolen|agitation",
    "traumatisme": r"trauma|avp|accident|chute|plaie|fracture|blessure|morsure",
    "brulure": r"brulure",
    "saignement": r"saign|hemorrag|hematemese|epistaxis|rectorragie|hematurie|melena",
    "douleur_thoracique": r"douleur thorac|precordial",
    "oedemes": r"oedem|gonfle",
    "ictere": r"icter|jaunisse|yeux jaunes",
    "refus_alimentation": r"refus de tet|refus de s.?alimenter|refus alimentaire|ne tete plus|anorexie",
    "deshydratation": r"deshydrat|soif",
}

# Intitulé du CSV (ou clé interne de l'outil), normalisé → nom de la colonne dans le tableau des passages.
COLONNES = {
    "ndordre": "numero_ordre", "nordre": "numero_ordre",
    "datedepassage": "date_passage", "datepassage": "date_passage",
    "garde": "moment", "moment": "moment", "sexe": "sexe", "age": "age_texte", "profession": "profession",
    "pouls": "pouls", "ta": "ta", "glycemie": "glycemie", "poids": "poids", "temperature": "temperature",
    "fr": "fr", "spo2": "spo2", "plaintes": "plaintes", "symptomes": "plaintes", "decision": "decision",
    "remarquedesaisie": "remarque", "remarque": "remarque",
    # « N° dossier », « Résidence », « Diagnostic » : volontairement absents (voir l'en-tête).
}


def sans_accents(t: str | None) -> str:
    return unicodedata.normalize("NFD", t or "").encode("ascii", "ignore").decode().lower()


def _cle(t: str) -> str:
    return re.sub(r"[^a-z0-9]", "", sans_accents(t))


def _nombre(t: str) -> float | None:
    m = re.search(r"\d+(?:[.,]\d+)?", t)
    return float(m.group(0).replace(",", ".")) if m else None


def _plausible(v: float | None, nom: str) -> float | None:
    bas, haut = PLAUSIBLE[nom]
    return v if v is not None and bas <= v <= haut else None


def lire_age(brut: str | None, profession: str | None = None) -> tuple[float | None, bool]:
    """(âge en années ou None, nourrisson reconnu au texte « NRS »)."""
    t = sans_accents(brut).replace(",", ".")
    nrs = bool(re.search(r"\bnrs\b|nourrisson", f"{t} {sans_accents(profession)}"))
    total, trouve = 0.0, False
    for nombre, unite in re.findall(r"(\d+(?:\.\d+)?)\s*([a-z]*)", t):
        v = float(nombre)
        if unite.startswith(("an", "a")) or unite == "":
            total += v
        elif unite.startswith("m"):
            total += v / 12
        elif unite.startswith("s"):
            total += v * 7 / 365.25
        elif unite.startswith("j"):
            total += v / 365.25
        else:
            continue
        trouve = True
    if not trouve or not 0 <= total <= 110:
        return None, nrs
    return total, nrs or total < 1


def lire_ta(brut: str | None) -> tuple[float | None, float | None]:
    """(systolique, diastolique) en mmHg."""
    m = re.search(r"(\d+(?:[.,]\d+)?)\s*/\s*(\d+(?:[.,]\d+)?)", brut or "")
    if not m:
        return None, None
    s, d = float(m.group(1).replace(",", ".")), float(m.group(2).replace(",", "."))
    if s < 30:                                         # écrit en cmHg : 12/8
        s, d = s * 10, d * 10
    s, d = _plausible(s, "ta_sys"), _plausible(d, "ta_dia")
    if s is None or d is None or s <= d:
        return None, None
    return s, d


def lire_glycemie(brut: str | None) -> float | None:
    """Glycémie en g/L (règles de l'en-tête)."""
    t = sans_accents(brut).replace(" ", "")
    if not t:
        return None
    if re.search(r"\bhi\b|high", sans_accents(brut)):
        return 6.0
    if re.search(r"\blo\b|low", sans_accents(brut)):
        return 0.2
    v = _nombre(t)
    if v is None:
        return None
    if "mmol" in t:
        v = v / 5.551
    elif "mg" in t:
        v = v / 100
    elif "g/l" in t or "g" in t:
        pass
    elif v > 35:
        v = v / 100
    elif v > 3:
        v = v / 5.551
    return _plausible(v, "glycemie")


def lire_constante(brut: str | None, nom: str) -> float | None:
    return _plausible(_nombre(brut or ""), nom)


def classe_decision(brut: str | None) -> str | None:
    """Orientation → 'grave', 'non_grave', 'intermediaire' (MEO) ou None (illisible)."""
    if "†" in (brut or ""):                            # croix : décédé (le symbole disparaît sans les accents)
        return "grave"
    t = sans_accents(brut)
    if not t.strip():
        return None
    if re.search(r"hosp|refer|transf|evacu|deced|deces|dcd|scam|contre avis", t):
        return "grave"
    if re.search(r"\bmeo\b|observation", t):
        return "intermediaire"
    if re.search(r"\bext|domicile|ambulatoire|retour", t):
        return "non_grave"
    return None


def plaintes(brut: str | None) -> dict[str, int]:
    t = sans_accents(brut)
    return {f"plainte_{k}": int(bool(re.search(motif, t))) for k, motif in PLAINTES.items()}


def lire_csv(chemin: str | Path) -> list[dict]:
    """Lignes du CSV de l'outil, avec les seules colonnes gardées (voir COLONNES)."""
    texte = Path(chemin).read_text(encoding="utf-8-sig")
    premiere = texte.split("\n", 1)[0]
    sep = max([";", ",", "\t"], key=premiere.count)
    lignes = list(csv.reader(io.StringIO(texte), delimiter=sep))
    entete = [COLONNES.get(_cle(h)) for h in lignes[0]]
    if "date_passage" not in entete or "decision" not in entete:
        raise ValueError("Ce fichier n'est pas un export du registre des urgences (colonnes « Date de passage » "
                         "et « Décision » absentes).")
    return [{k: (v[i].strip() or None) for i, k in enumerate(entete) if k and i < len(v)}
            for v in lignes[1:] if any(c.strip() for c in v)]


def preparer_passages(lignes: list[dict], aujourdhui: pd.Timestamp | None = None) -> tuple[pd.DataFrame, dict]:
    """Passages nettoyés (une ligne par passage) et rapport de lecture."""
    aujourdhui = aujourdhui or pd.Timestamp.today().normalize()
    sortie, rejets = [], {"date_illisible": 0, "date_future": 0}
    illisibles = {k: 0 for k in ["age", "ta", "glycemie", "pouls", "temperature", "fr", "spo2", "poids", "decision"]}
    for val in lignes:
        d = lire_date(val.get("date_passage"))
        if d is None:
            rejets["date_illisible"] += 1; continue
        d = pd.Timestamp(d)
        if d > aujourdhui:
            rejets["date_future"] += 1; continue
        age, nrs = lire_age(val.get("age_texte"), val.get("profession"))
        sys_, dia = lire_ta(val.get("ta"))
        p = {"date_passage": d, "moment": _moment(val.get("moment")), "sexe": _sexe(val.get("sexe")),
             "age": age, "nourrisson": int(nrs), "ta_sys": sys_, "ta_dia": dia,
             "glycemie": lire_glycemie(val.get("glycemie"))}
        for c in ("pouls", "temperature", "fr", "spo2", "poids"):
            p[c] = lire_constante(val.get(c), c)
        p.update(plaintes(val.get("plaintes")))
        p["nombre_plaintes"] = len([x for x in re.split(r"[,;/+]| et ", val.get("plaintes") or "") if x.strip()])
        p["decision"] = val.get("decision")
        p["classe"] = classe_decision(val.get("decision"))
        # Une valeur écrite mais non lue est comptée (contrôle de la saisie), jamais devinée.
        for c, lu in (("age", age), ("ta", sys_), ("glycemie", p["glycemie"]), ("pouls", p["pouls"]),
                      ("temperature", p["temperature"]), ("fr", p["fr"]), ("spo2", p["spo2"]),
                      ("poids", p["poids"]), ("decision", p["classe"])):
            brut = val.get("age_texte" if c == "age" else c)
            if brut and lu is None and not (c == "age" and nrs):
                illisibles[c] += 1
        sortie.append(p)
    df = pd.DataFrame(sortie)
    if len(df):
        df = df.sort_values("date_passage", kind="stable").reset_index(drop=True)
        df["groupe"] = df.apply(lambda r: groupe(r["age"], r["nourrisson"]), axis=1)
    rapport = {"lignes_lues": len(lignes), "passages": len(df), **rejets,
               "valeurs_ecrites_mais_illisibles": illisibles}
    return df, rapport


def groupe(age: float | None, nourrisson: int = 0) -> str | None:
    """'enfant' (< 15 ans), 'adulte', ou None si l'âge est inconnu (sauf nourrisson reconnu)."""
    if nourrisson:
        return "enfant"
    if age is None or (isinstance(age, float) and math.isnan(age)):
        return None
    return "enfant" if age < AGE_ADULTE else "adulte"


def _moment(t: str | None) -> str | None:
    s = sans_accents(t)
    if "perm" in s:
        return "permanence"
    if "garde" in s or "nuit" in s:
        return "garde"
    if "jour" in s:
        return "jour"
    return None


def _sexe(t: str | None) -> str | None:
    s = sans_accents(t).strip()
    if s.startswith("f") or "♀" in (t or ""):
        return "F"
    if s.startswith("m") or s.startswith("h") or "♂" in (t or ""):
        return "M"
    return None


def lire_passages(chemin: str | Path, aujourdhui: pd.Timestamp | None = None) -> tuple[pd.DataFrame, dict]:
    """CSV du registre URG exporté par l'outil → (passages nettoyés, rapport)."""
    return preparer_passages(lire_csv(chemin), aujourdhui)


def decrire(passages: pd.DataFrame) -> pd.DataFrame:
    """Par groupe : passages, part de chaque constante renseignée, répartition des classes."""
    lignes = []
    for g, part in passages.groupby(passages["groupe"].fillna("âge inconnu")):
        ligne = {"groupe": g, "passages": len(part)}
        for c in ("age", "pouls", "ta_sys", "temperature", "fr", "spo2", "glycemie", "poids"):
            ligne[f"renseigne_{c}"] = round(float(part[c].notna().mean()), 3)
        for k in ("grave", "non_grave", "intermediaire"):
            ligne[k] = int((part["classe"] == k).sum())
        ligne["sans_decision"] = int(part["classe"].isna().sum())
        lignes.append(ligne)
    return pd.DataFrame(lignes)
