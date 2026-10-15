"""Méthodes de comptage des présents et nom des fichiers de résultats correspondants."""
from __future__ import annotations

COMPTAGES = ("minuit", "journee", "pondere")


def etiquette(service: str, comptage: str = "minuit") -> str:
    """Nom des fichiers d'un service selon la méthode de comptage : « PED » (minuit) ou « PED_journee »."""
    return service if comptage == "minuit" else f"{service}_{comptage}"


def option_comptage(parser) -> None:
    """Option --comptage commune aux scripts du traitement et du modèle (voir traitement.occupation)."""
    parser.add_argument("--comptage", choices=COMPTAGES, default="minuit",
                        help="série utilisée : minuit (nuits passées, défaut), journee (jour de sortie compris) ou pondere "
                             "(présence pondérée par le temps, heures typiques) ; "
                             "lancer d'abord traitement.rapport_occupation avec la même option")
