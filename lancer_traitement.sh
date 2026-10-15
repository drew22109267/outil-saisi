#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════════════════════
# Traitement des données, sur la dernière version du CSV exporté de l'outil de saisie :
#   0  vérification de tous les calculs (outil = Python = calcul direct ; statistiques contre scipy)
#   1  conversion vers le format NERA, occupation selon chaque méthode de comptage, indicateurs,
#      loi de Little, Erlang B, scénarios de 15 à 20 lits
# Les données ne quittent pas l'ordinateur : donnees/ et resultats/ ne sont jamais envoyés sur GitHub.
#
# Usage (terminal Ubuntu / WSL, depuis le dossier outil-saisi) :
#     bash lancer_traitement.sh
#     ETAPES=1 COMPTAGES="minuit" bash lancer_traitement.sh
# Réglages : SOURCE (CSV de l'outil), LITS [20], LITS_FICHIER (date_debut;lits), COMPTAGES, ETAPES.
# Pour le modèle de prévision : dépôt nera-modele (module_lit/lancer_tout.sh refait ces étapes).
# ═══════════════════════════════════════════════════════════════════════════════════════════════
set -u
cd "$(dirname "$0")"
PY="${PY:-$HOME/memoire-env/bin/python}"
SOURCE="${SOURCE:-/mnt/c/Users/User/Desktop/MEMOIRE/saisie_ia/registre-ped-tous-les-mois.csv}"
LITS="${LITS:-20}"
COMPTAGES="${COMPTAGES:-minuit journee pondere}"
ETAPES="${ETAPES:-0 1}"
CAPACITE="--lits $LITS"; [ -n "${LITS_FICHIER:-}" ] && CAPACITE="--lits-fichier $LITS_FICHIER"
JOURNAL=resultats/journaux; mkdir -p "$JOURNAL" donnees
EXPORT=donnees/export_outil_PED.csv

etape() { [[ " $ETAPES " == *" $1 "* ]]; }
lancer() {
  local nom=$1; shift
  echo "── $(date '+%H:%M') $nom"
  if "$@" > "$JOURNAL/$nom.log" 2>&1; then echo "   terminé ($JOURNAL/$nom.log)"; else echo "   ÉCHEC : voir $JOURNAL/$nom.log"; tail -5 "$JOURNAL/$nom.log"; fi
}

etape 0 && lancer verification "$PY" -m verification.verifier_calculs
if etape 1; then
  lancer conversion "$PY" -m traitement.depuis_outil "$SOURCE" --service PED --sortie "$EXPORT"
  for c in $COMPTAGES; do
    lancer "occupation_$c" "$PY" -m traitement.rapport_occupation "$EXPORT" --service PED $CAPACITE --inconnues estimee \
      --fenetre-censure p95 --rodage-debut --comptage "$c" --scenarios-lits 15 16 17 18 19 20
  done
fi
echo "── $(date '+%H:%M') fini. Rapports et tableaux : resultats/ · vérification : verification/rapport_verification.md"
