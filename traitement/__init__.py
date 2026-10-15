"""
Traitement des données des registres (dépôt outil-saisi) : conversion du CSV de l'outil de saisie vers le
format harmonisé de l'application NERA, statuts des séjours, reconstitution de l'occupation (trois méthodes
de comptage, fourchette, pic de la journée, capacité variable), indicateurs hospitaliers, garde-fous de
Little et d'Erlang B, période verrouillée.

Le modèle de prévision NERA (dépôt nera-modele) utilise ce paquet comme dépendance :
    pip install -e <chemin>/outil-saisi
"""
