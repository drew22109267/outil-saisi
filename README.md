# Outil de saisie et statistiques des registres hospitaliers

*Données du modèle NERA : de la page du registre papier à la série d'occupation des lits, avec toutes les
statistiques et la justification de chaque décision prise sur les données.*

Ce dépôt contient tout ce qui se passe **avant** le modèle de prévision :

1. **la collecte** : photographier les registres papier, masquer les données identifiantes, transcrire
   (à la main ou avec une IA), importer, contrôler la qualité de la saisie ;
2. **le traitement** : conversion vers le format de l'application NERA, statut de chaque séjour, reconstitution
   de l'occupation jour par jour selon trois méthodes de comptage, pic de la journée, capacité variable,
   indicateurs hospitaliers, garde-fous (loi de Little, Erlang B) ;
3. **les statistiques** : statistiques descriptives, corrélations et tests, ACP, séries temporelles, modèles de
   prévision de référence, calculées en direct dans l'outil de saisie ;
4. **les décisions** prises sur les données pour le modèle, avec le banc d'essai qui vérifie chacune ;
5. **la vérification** que tous les calculs sont justes.

Les trois dépôts du projet :

| Dépôt | Contenu |
|---|---|
| **outil-saisi** (celui-ci) | collecte, traitement des données, statistiques |
| [nera-modele](https://github.com/drew22109267/nera-modele) | le modèle de prévision NERA : module lit (opérationnel) et module triage (en préparation), avec toutes les mathématiques |
| [NERA-api](https://github.com/drew22109267/NERA-api) | l'API de l'application hospitalière NERA (.NET, PostgreSQL) |

Toutes les formules mathématiques du traitement et des statistiques, avec leur justification :
[`MATHEMATIQUES.md`](MATHEMATIQUES.md). Mode d'emploi détaillé de l'outil :
[`outil-saisie/LISEZMOI.md`](outil-saisie/LISEZMOI.md). Lecture de chaque graphe, avec des exemples fictifs :
[`outil-saisie/INTERPRETER-LES-GRAPHES.md`](outil-saisie/INTERPRETER-LES-GRAPHES.md).

## Sommaire

1. [Organisation du dépôt](#1-organisation-du-dépôt)
2. [Installation et lancement](#2-installation-et-lancement)
3. [Collecte des données, étape par étape](#3-collecte-des-données-étape-par-étape)
4. [Traitement des données](#4-traitement-des-données)
5. [Statistiques](#5-statistiques)
6. [Décisions prises sur les données, et leur banc d'essai](#6-décisions-prises-sur-les-données-et-leur-banc-dessai)
7. [Vérification des calculs et tests](#7-vérification-des-calculs-et-tests)
8. [Confidentialité et période verrouillée](#8-confidentialité-et-période-verrouillée)
9. [État d'avancement](#9-état-davancement)

---

## 1. Organisation du dépôt

```
outil-saisi/
├── README.md                     ce document
├── MATHEMATIQUES.md              toutes les formules : occupation, validation, statistiques, séries, vérification
├── outil-saisie/                 l'outil de saisie et d'analyse (HTML + JavaScript, sans dépendance)
│   ├── saisie.html               la page à ouvrir
│   ├── registres.js              colonnes de chaque registre (pédiatrie, urgences…)
│   ├── statistiques.js           bibliothèque statistique écrite à la main
│   ├── indicateurs.js            rubriques et graphes de l'onglet Indicateurs
│   ├── occupation-validation.js  bilan des flux, Monte-Carlo, Kaplan-Meier, file M/G/∞, pic de la journée
│   ├── temps.js, legende.js      zoom, regroupement, animation ; légendes cliquables
│   ├── synthese.js               cartes de chiffres avec leur graphique, style des rubriques
│   ├── menu-indicateurs.js       menu flottant des rubriques (la barre latérale ne défile plus)
│   ├── conclusions.js            conclusions pour le modèle sous chaque analyse, et leur récapitulatif
│   ├── barre-haut.js             filtres dans la barre du haut, bouton profil, carte Sauvegarde
│   ├── calendrier.js             jours fériés et vacances scolaires camerounais
│   ├── convertir_photos.bat      conversion des photos (HEIC → JPEG, sans métadonnées)
│   ├── LISEZMOI.md               mode d'emploi détaillé
│   └── INTERPRETER-LES-GRAPHES.md  comment lire chaque graphe
├── traitement/                   traitement des données en Python (paquet installable)
│   ├── depuis_outil.py           CSV de l'outil → format harmonisé NERA, corrections de dates
│   ├── chargement.py             lecture, statuts des séjours, convention des jours, période exploitable
│   ├── imputation.py             durées inconnues : exclues ou estimées (prix, issue)
│   ├── occupation.py             occupation jour par jour : trois méthodes, trois scénarios, pic, capacité
│   ├── indicateurs.py            TOM, DMS, rotation, intervalle de rotation, mortalité, avec fourchette
│   ├── garde_fous.py             loi de Little, Erlang B
│   ├── doublons.py               patients reportés (même séjour écrit deux fois)
│   ├── verrou.py                 période de test final verrouillée
│   ├── comptage.py               méthodes de comptage et noms des fichiers de résultats
│   ├── rapport_occupation.py     de l'export à l'occupation et aux indicateurs (script)
│   └── qualite_saisie.py         comparaison de deux saisies des mêmes photos (kappa de Cohen)
├── verification/                 vérification de tous les calculs (outil = Python = calcul direct)
├── tests/                        tests automatiques (pytest)
├── traitement.ipynb              le traitement pas à pas, avec les explications (notebook Jupyter)
├── lancer_traitement.sh          vérification + traitement en une commande
└── pyproject.toml                installation du paquet « traitement » (utilisé par le modèle NERA)
```

`donnees/` et `resultats/` sont créés à l'usage et **ne sont jamais versionnés** ; le `.gitignore` exclut aussi
toutes les photos, tous les CSV et toutes les sauvegardes JSON.

---

## 2. Installation et lancement

### 2.1 L'outil de saisie

Aucune installation : une page web autonome, qui n'envoie rien sur Internet.

- **Méthode A, la plus simple** : double-cliquer sur `outil-saisie/saisie.html` (Chrome ou Edge).
- **Méthode B, serveur local** : depuis le dossier qui contient `outil-saisi/` :

  ```bash
  python -m http.server 8765
  ```

  puis ouvrir `http://localhost:8765/outil-saisi/outil-saisie/saisie.html`.

Le navigateur range les lignes **par adresse de site** : les lignes saisies par la méthode A ne sont pas
visibles par la méthode B, ni dans un autre navigateur. Choisir une méthode et la garder ; pour passer de l'une
à l'autre, utiliser la sauvegarde complète (section 3.9).

### 2.2 Le traitement en Python

Les scripts s'exécutent sous Linux ; sous Windows, dans **WSL (Ubuntu)**. Installation une seule fois :

```bash
python3 -m venv ~/memoire-env
~/memoire-env/bin/pip install pandas matplotlib pytest jupyterlab
~/memoire-env/bin/pip install scipy statsmodels nbformat     # seulement pour la vérification (juges)
cd /mnt/c/Users/<utilisateur>/Desktop/outil-saisi
~/memoire-env/bin/pip install -e .                          # rend le paquet « traitement » utilisable partout
```

(Avec `uv` : `uv pip install --python ~/memoire-env/bin/python -e .`.) Le modèle NERA (dépôt nera-modele)
utilise ce même paquet : une correction faite ici profite aussitôt au modèle.

Tout le traitement, sur la dernière version du CSV exporté de l'outil :

```bash
bash lancer_traitement.sh                             # vérification des calculs + occupation, trois méthodes
~/memoire-env/bin/jupyter lab traitement.ipynb        # ou pas à pas, avec les explications
```

Le notebook est versionné **sans sorties** : avant tout envoi sur GitHub, *Modifier → Effacer toutes les
sorties*, pour que les résultats des vraies données restent sur l'ordinateur.

---

## 3. Collecte des données, étape par étape

Les données viennent des **registres papier d'hospitalisation** (pédiatrie). On passe d'un registre papier à
des données propres et contrôlées avec l'**outil de saisie**. La transcription peut se faire **à la main** ou
être **assistée par une IA** (un assistant capable de lire des images, qui reçoit les photos masquées et rend un
CSV). Dans les deux cas, ce sont les mêmes étapes de masquage, d'import et de contrôle qui garantissent la
qualité.

### 3.1 Vue d'ensemble

```
 1. Photographier le registre (page par page, téléphone)
 2. Convertir les photos           convertir_photos.bat : HEIC → JPEG, métadonnées supprimées
 3. Ouvrir l'outil de saisie       saisie.html (double-clic ou petit serveur local)
 4. Masquer noms et téléphones     bouton « Masquer », puis « Enregistrer les photos masquées »
 5. Transcrire                     à la main (onglet Saisie) ou par IA à partir des photos masquées → CSV
 6. Importer le CSV                Sauvegarde → « Reprendre un CSV »
 7. Contrôle qualité               onglet 2 : pages tirées au hasard, taux d'erreur chiffré
 8. Combler les trous              panneau Avertissements : N° manquants, jours sans inscription
 9. Sauvegarder / exporter         sauvegarde complète .json, CSV pour l'application NERA
10. Analyser                       onglet 3 (indicateurs, statistiques), puis traitement Python et modèle NERA
```

### 3.2 Photographier les registres

- Une photo par page (ou par double page si tout reste lisible), à plat, bien éclairée, sans reflet.
- Toujours cadrer la **colonne des N° d'ordre** et la **date** : ce sont eux qui identifient les lignes.
- Photographier **jusqu'à la dernière ligne de chaque mois**. Les fins de mois sont les pages les plus souvent
  oubliées : un trou de plusieurs jours en fin de mois dans les analyses vient presque toujours d'une dernière
  page non photographiée.
- Photographier aussi le **récapitulatif mensuel** du registre : il sert à vérifier les totaux.
- Ranger les photos dans un dossier par service et par période. Garder les originaux à part.

### 3.3 Convertir les photos

Les téléphones produisent souvent des photos HEIC (que les navigateurs n'affichent pas), et toutes les photos
contiennent des métadonnées (position GPS, date, modèle du téléphone).

1. Double-cliquer sur `outil-saisie/convertir_photos.bat`.
2. Indiquer le dossier des photos originales, puis le dossier de sortie.

Le script convertit en JPEG, réduit à 2 600 pixels de côté au plus, **supprime les métadonnées** et ne modifie
jamais les originaux. Il utilise le décodeur intégré à Windows : rien à installer.

### 3.4 Ouvrir l'outil et choisir le service

Voir la section 2.1. À la première ouverture, choisir le **service** en haut de l'écran. La fenêtre « Aide »
rappelle les règles à tout moment.

### 3.5 Masquer les données identifiantes

Avant qu'une photo quitte l'ordinateur (par exemple pour une transcription assistée par IA), les données
identifiantes doivent être cachées.

1. Menu **Ouvrir les photos** : sélectionner les JPEG convertis.
2. Sur la photo, bouton **Masquer**, puis tracer un rectangle (cliquer-glisser) sur chaque **nom**,
   **téléphone**, **nom de médecin** et **numéro de facture**.
3. **Reprendre la photo précédente** recopie les masques quand la mise en page est la même.
4. **Enregistrer toutes les photos masquées** : l'outil produit des copies où les zones sont noircies dans
   l'image elle-même. Ce sont ces copies, et elles seules, qui peuvent être transmises.

### 3.6 Transcrire

**À la main** (onglet 1 · Saisie) : la photo à gauche, le formulaire à droite. `Entrée` passe au champ
suivant, `Ctrl + Entrée` enregistre la ligne, le N° suivant se remplit seul. Les règles (« ? » pour une case
illisible, « = » pour une date identique, etc.) sont dans le LISEZMOI de l'outil.

**Assistée par IA**, à partir des photos masquées. On demande à l'assistant de rendre un CSV qui respecte les
règles suivantes :

| Règle | Détail |
| --- | --- |
| En-tête | `Identifiant ligne;N° d'ordre;Date (enregistrement);Ancien / Nouveau;Sexe;Âge;Domicile;Date d'entrée;Date de sortie;Diagnostic;Bilan demandé;T3 reçu;GE / TDR palu;Diagnostic de sortie;T3 de sortie;Nbre de jours;Prix;Observation;Remarque de saisie` |
| Séparateur | `;` de préférence ; `,` et la tabulation sont aussi reconnus |
| Dates | `jj/mm/aa` ou `jj/mm/aaaa` |
| Une ligne du registre | une ligne du CSV, dans l'ordre des N° |
| Case illisible | la valeur lue suivie de `?`, ou `?` seul |
| Jamais recopié | nom, prénom, téléphone, médecin, numéro de facture |
| Notes en rouge | dans la remarque : « Transfusion (rouge) », « Drépano (rouge) », « Référé… » |
| Remarque | commence par « Transcription IA à vérifier », suivie de ce qui était douteux |

L'import reconnaît aussi les autres noms de colonnes courants (« N° », « Date », « Date entrée », « Date
sortie », « Dg », « Signe/Symptôme », « Nbre jrs », « Montant », « Annotation (rouge) »…) et sépare un montant
écrit avec l'issue (« 7500F Sortie »). Les colonnes nom, téléphone, médecin et facture ne sont **jamais
importées**, même si elles sont présentes.

Une transcription par IA n'est jamais considérée comme juste par principe : elle passe par le contrôle qualité
(section 3.8), comme une saisie à la main.

### 3.7 Importer un CSV

1. Choisir le bon **service** en haut de l'écran.
2. Bouton **Sauvegarde** (en bas de la barre latérale) → **Reprendre un CSV** → choisir le fichier.
3. L'outil indique combien de lignes ont été ajoutées, remplacées ou ignorées : on peut réimporter un fichier
   sans créer de doublon. Une meilleure transcription d'une ligne déjà présente (même mois, même N°, date
   proche, contenu différent) la remplace après confirmation.
4. Vérifier dans **Aperçu des lignes** (barre latérale) que les mois attendus apparaissent.

### 3.8 Mesurer la qualité de la saisie

Onglet 2 · **Contrôle qualité**. On relit un échantillon tiré au hasard, page par page, et l'outil en déduit
le taux d'erreur de toute la saisie.

1. Ouvrir les photos, choisir le nombre de pages (20 par défaut, environ 300 lignes), **Tirer au hasard**.
2. Pour chaque page : choisir le **mois** et taper le **premier N°** écrit sur la photo. Les lignes saisies
   correspondantes s'affichent à côté (le dernier N° se remplit seul). La photo n'a pas besoin d'avoir été
   rattachée à ses lignes au moment de la saisie.
3. Cliquer chaque case **différente de la photo** (elle devient rouge) ; compter les lignes oubliées ou en trop.
4. **Voir les résultats** : taux d'erreur global avec son intervalle de confiance (bootstrap sur les pages),
   taux sur les colonnes qui servent au calcul de l'occupation, taux par colonne (intervalle de Wilson), liste
   des erreurs avec un bouton **Corriger**, et une phrase prête pour le mémoire.

Repères : moins de 1 % de cases fausses, très bonne qualité ; moins de 2 %, bonne ; de 2 à 5 %, acceptable ;
au-delà, la saisie est à reprendre. Une colonne au-dessus de 5 % est à revérifier en entier.

Pour une **double saisie** (deux personnes saisissent les mêmes photos) :
`python -m traitement.qualite_saisie saisie_A.csv saisie_B.csv` donne l'accord par colonne et le kappa de Cohen.

### 3.9 Repérer et combler les trous

Dans l'onglet 3 · Indicateurs, le bouton **Avertissements** liste par mois :

- les **N° d'ordre manquants** (la numérotation repart à 1 chaque mois) : une suite de N° manquants signale une
  page entière non saisie ;
- le **trou final** (dernières pages pas encore saisies) : le calcul de l'occupation s'arrête avant ;
- les dates d'enregistrement incohérentes et les doublons probables.

Il faut aussi chercher les **jours sans aucune inscription** de plus de trois jours hors week-end, surtout en
fin de mois. Ces trous font baisser artificiellement l'occupation et faussent l'apprentissage du modèle : on les
comble en retrouvant les pages, ou on les signale dans le mémoire.

### 3.10 Sauvegarder et exporter

Bouton **Sauvegarde** (barre latérale) :

- **Télécharger la sauvegarde complète** (`.json`) à la fin de **chaque séance** : lignes de tous les services,
  masques, contrôles qualité, réglages. C'est la vraie copie de sécurité ; la garder aussi sur une clé USB.
  **Restaurer** la recharge en un clic.
- **CSV du service affiché** ou **de tous les services** : le fichier traité par `traitement.depuis_outil`
  (section 4) et importé dans l'application NERA.

---

## 4. Traitement des données

### 4.1 Le parcours des données

```
Registre papier (photos masquées : noms, téléphones, médecin, facture cachés)
    │  outil-saisie/saisie.html       recopie ligne par ligne, contrôle qualité, statistiques en direct
    ▼
CSV de l'outil (un fichier, tous les mois)
    │  traitement/depuis_outil.py     format harmonisé NERA (mêmes règles que l'import de l'application),
    │                                 fautes d'année ou de mois sur l'entrée corrigées et listées
    ▼
donnees/export_outil_PED.csv
    │  traitement/chargement.py       période verrouillée, statut de chaque sortie, convention des jours
    │  traitement/imputation.py       durées inconnues : exclues ou estimées (prix, issue)
    ▼
séjours (entrée, sortie, sortie basse, part inclusive p, statut, issue, durée)
    │  traitement/occupation.py       présents chaque jour : minuit, journée ou pondéré ; pic de la journée
    ▼
occupation jour par jour (attendue, borne basse, borne haute), indicateurs, Little, Erlang B
    │                                 ← python -m traitement.rapport_occupation
    ▼
Modèle NERA, module lit (dépôt nera-modele) : apprentissage et prévision
```

L'outil de saisie refait en JavaScript, à l'identique, la reconstitution de l'occupation et les indicateurs :
on contrôle donc les résultats pendant la saisie, avant tout export. L'identité des deux calculs est vérifiée
jour par jour (section 7).

### 4.2 Les scripts

**Conversion** du CSV de l'outil :

```bash
~/memoire-env/bin/python -m traitement.depuis_outil <CSV de l'outil> --service PED --sortie donnees/export_outil_PED.csv
```

Mêmes règles que l'import de l'application NERA : dates lues (un « ? » final est ignoré), nombre de jours
plausible (au plus 90 nuits), issue harmonisée (sortie, SCAM, décès, transfert, évasion), entrée déduite si
illisible. Garde-fou supplémentaire : une date d'entrée à plus de 30 jours avant (ou 10 jours après) la date
d'enregistrement est une faute de frappe sur l'année ou le mois ; elle est corrigée et listée dans
`donnees/corrections_dates_PED.csv`, pour être corrigée dans l'outil (la source doit rester juste).

**Occupation et indicateurs** :

```bash
~/memoire-env/bin/python -m traitement.rapport_occupation donnees/export_outil_PED.csv --service PED --lits 20 \
    --inconnues estimee --fenetre-censure p95 --rodage-debut --comptage minuit --scenarios-lits 15 16 17 18 19 20
```

Affiche la convention des jours mesurée, les séjours gardés et écartés, la période exploitable, l'occupation et
sa fourchette, les bornes du pic de la journée, la loi de Little et Erlang B, les indicateurs par mois et les
scénarios de capacité. Écrit dans `resultats/` : `occupation_<SERVICE>.csv` (et ses versions basse et haute),
`indicateurs_<SERVICE>_par_mois.csv` et `_par_annee.csv`, `scenarios_lits_<SERVICE>.csv`,
`occupation_<SERVICE>.png`, le diagramme de flux des données et la liste des reports suspects.

| Option | Effet |
|---|---|
| `--comptage minuit\|journee\|pondere` | méthode de comptage des présents (fichiers suffixés `_journee`, `_pondere`) |
| `--heure-entree 12 --heure-sortie 13 --duree-meme-jour 8` | heures moyennes de la méthode pondérée (entrées à toute heure, sorties de jour 8–18 h) |
| `--lits 20` ou `--lits-fichier donnees/lits_PED.csv` | capacité fixe, ou variable (`date_debut;lits`) |
| `--scenarios-lits 15 16 … 20` | taux pour chaque capacité, tant que la date du passage de 15 à 20 lits est inconnue |
| `--inconnues exclure\|mediane\|estimee` | traitement des durées inconnues |
| `--fenetre-censure 30\|p95` | délai au-delà duquel un séjour sans sortie n'est plus « encore hospitalisé » |
| `--rodage-debut` | rodage compté depuis le premier jour d'enregistrement |
| `--reports retirer` | fusion des reports confirmés (seulement après confirmation par le service) |

Les formules de chaque étape sont dans [`MATHEMATIQUES.md`](MATHEMATIQUES.md), section 1.

### 4.3 Trois façons de compter les présents

| Méthode | Un enfant compte le jour d | Séjour de 3 nuits | Mise en observation | Limite |
|---|---|---|---|---|
| Recensement de minuit (retenue, norme hospitalière) | 1 si entrée ≤ d < sortie | 3 | 0 | ignore les mises en observation et le jour de sortie |
| Présence dans la journée | 1 si entrée ≤ d ≤ sortie | 4 | 1 | compte deux fois un lit libéré puis réoccupé le même jour |
| Pondérée par le temps | part du jour passée dans le service | 3 + (h_s − h_e)/24 | m/24 | dépend des heures supposées |

Le **pic de la journée** (plus grand nombre d'enfants présents en même temps) est encadré exactement, sans
hypothèse d'heure : max(minuit de d − 1, minuit de d) ≤ pic ≤ comptage de la journée d.

---

## 5. Statistiques

L'onglet 3 · **Indicateurs** de l'outil calcule en direct, sur les lignes saisies, toutes les statistiques ; les
formules sont dans [`MATHEMATIQUES.md`](MATHEMATIQUES.md) et la lecture de chaque graphe dans
[`outil-saisie/INTERPRETER-LES-GRAPHES.md`](outil-saisie/INTERPRETER-LES-GRAPHES.md).

| Rubrique | Contenu | Formules |
|---|---|---|
| Synthèse | période, lignes, statuts des séjours ; TOM et fourchette, présents, admissions, DMS, rotation ; décès, SCAM, référés | section 1 |
| Occupation | taux par période, répartition des jours, jour de la semaine, pic de la journée, Little et Erlang B, bilan des flux, Monte-Carlo, Kaplan-Meier, file M/G/∞ | sections 1 et 2 |
| Statistiques descriptives | moyenne, médiane, quantiles, asymétrie, aplatissement, Jarque-Bera, histogramme, droite de Henry, Wilson | section 3 |
| Corrélations et tests | Pearson, Spearman, Kendall, χ² et V de Cramér, Welch, ANOVA, Kruskal-Wallis, Mann-Whitney, régression multiple | section 3 |
| Analyse multivariée | ACP normée, KMO, Bartlett, analyse parallèle de Horn, cercle des corrélations | section 3 |
| Séries temporelles | courbe jour par jour, décomposition, ACF, PACF, Ljung-Box, ADF, KPSS, périodogramme | section 4 |
| Modèles de prévision de référence | naïf, saisonnier, lissages, Holt, Holt-Winters, Thêta, AR(p), SARIMA ; MAE, RMSE, MASE, Diebold-Mariano | section 5 |

Commandes communes : **méthode de comptage** (minuit, journée, pondérée, ou les trois côte à côte), **capacité**
de départ et changements (`01/03/25=20`), regroupement **jour · semaine · mois · année**, **zoom**,
déplacement, **animation**, **légendes cliquables** (masquer ou afficher chaque courbe).

**Période verrouillée** : les lignes entrées à partir du **01/09/2026** sont gardées mais n'entrent dans
**aucune** analyse (section 8).

---

## 6. Décisions prises sur les données, et leur banc d'essai

Chaque ligne : ce qui a été retenu, contre quoi, pourquoi, et où c'est vérifié. « Protocole » signifie que le
choix est fixé par la méthode du mémoire. Les bancs P1 à P8 mesurent l'effet de chaque choix **sur l'erreur de
prévision du modèle NERA** : ils sont donc lancés dans le dépôt nera-modele (`module_lit/benchmark_pretraitement.py`),
avec le test de Diebold-Mariano contre le choix retenu. Les décisions sur le modèle lui-même (variables,
noyau, perte, τ, hyperparamètres, validation) sont dans `module_lit/METHODE.md` du dépôt nera-modele.

### 6.1 Données

| Décision | Retenu | Alternatives | Pourquoi | Vérifié par |
|---|---|---|---|---|
| Service étudié | pédiatrie | autres services | seul registre disponible sur 27 mois ; les autres services n'ont que 6 mois (transfert) | protocole |
| Période de données | juillet 2024 → 31 août 2026 | — | tout ce qui est saisi avant le verrou | protocole |
| Période de test final | septembre-octobre 2026, verrouillée | 1 mois | test sur septembre, puis réentraînement et test sur octobre | protocole |
| Cible | présents à minuit, J+1, J+3, J+7 | admissions, sorties | c'est le nombre de lits occupés ; les horizons couvrent la décision du lendemain et de la semaine | protocole |
| Source des données | registre saisi → format harmonisé NERA | — | même harmonisation pour tous les hôpitaux | protocole |
| Qualité de saisie | contrôle sur photos (page par page) | — | mesure le bruit des données, limite basse de l'erreur atteignable | contrôle qualité de l'outil |

### 6.2 Prétraitement

| Décision | Retenu | Alternatives | Pourquoi | Banc |
|---|---|---|---|---|
| Durées inconnues | estimée (prix, puis issue, puis médiane) | exclure, médiane | exclure sous-estime l'occupation des mois incomplets ; le prix suit la durée (tarif à la journée) | P1 |
| Fenêtre de censure | p95 des durées connues | 14, 30, 60 jours | s'adapte au service au lieu d'un nombre arbitraire | P2 |
| Convention des jours | série attendue (nuit incertaine = 1 − p) | tout inclusif, tout en nuits | espérance exacte, sans supposer une seule pratique | P3, sensibilité |
| Patients reportés | gardés | fusionnés | la fusion n'est sûre qu'une fois confirmée par le service | P4 |
| Début de la période | mois avec ≥ 90 % de durées connues, puis rodage | 80 %, 95 %, rodage au début | équilibre entre données gardées et biais de sous-comptage | P5 |
| Fin de série | p95 du délai d'inscription retiré | aucune coupe, 7 jours | les derniers jours manquent d'enfants pas encore inscrits | P6 |
| Trous de saisie | gardés | lignes d'apprentissage touchées exclues | à mesurer : un trou crée un faux creux que le modèle apprendrait | P7 |
| Méthode de comptage | recensement de minuit | comptage journalier, présence pondérée par le temps | norme hospitalière, comparable ; les deux autres séries sont menées en parallèle dans toute la chaîne | P8 |
| Capacité | 20 lits, scénarios de 15 à 20 | capacité variable datée | la date du passage de 15 à 20 lits est inconnue : le taux est présenté comme une plage | scénarios de lits |
| Fautes d'année ou de mois sur l'entrée | corrigées et listées, à reporter dans l'outil | ligne gardée telle quelle | une entrée en 2023 fausse tout le début de la série | contrôle du convertisseur |
| Départ du rodage | premier jour d'enregistrement + max(14 j, p95 des durées) | début du premier mois | les enfants présents au premier jour du registre ont été admis avant : on attend qu'ils soient sortis | P5 |

---

## 7. Vérification des calculs et tests

```bash
~/memoire-env/bin/python -m verification.verifier_calculs     # 118 contrôles, données fictives
~/memoire-env/bin/python -m pytest tests -q                    # 21 tests
```

**Vérification** (`verification/`, détail dans [`MATHEMATIQUES.md`](MATHEMATIQUES.md), section 6) : sur un registre
inventé, le vrai code de l'outil (exécuté par Node), le traitement Python et un calcul direct à partir des
définitions donnent les mêmes nombres chaque jour, pour les trois méthodes, les trois scénarios, le pic de la
journée et une capacité variable ; chaque fonction de `statistiques.js` est comparée à scipy et statsmodels
(utilisés seulement comme juges). Rapport : `verification/rapport_verification.md`.

| Fichier de tests | Ce qui est vérifié |
|---|---|
| `test_occupation.py` | les trois méthodes de comptage et le pic sur des cas faits à la main, censure, Little, Erlang B, durées estimées |
| `test_indicateurs.py` | TOM, DMS, rotation, mortalité ; part inclusive globale et mensuelle ; trois scénarios |
| `test_verrou.py` | rien après le verrou n'est lu ; ouverture journalisée ; période exploitable |
| `test_traitement.py` | patients reportés, capacité variable, kappa de Cohen |

Les fichiers JavaScript se vérifient aussi par `node --check <fichier>.js` ; dans le navigateur, chaque rubrique
affiche « Calcul impossible » avec le message d'erreur si un calcul échoue.

---

## 8. Confidentialité et période verrouillée

**Confidentialité.** Les registres contiennent des données de patients :

- les photos sont masquées avant toute recopie (noms, téléphones, médecin, facture) ;
- ces informations ne sont jamais recopiées, ni importées, ni exportées ;
- aucune photo, aucun CSV, aucune sauvegarde n'est versionné (voir `.gitignore`) : **seuls le code, la
  documentation et les icônes sont sur GitHub** ;
- le code ne contient aucune donnée simulée : les analyses portent sur les registres réels ; seule la
  vérification utilise un registre inventé, généré à chaque lancement et jamais versionné ;
- l'outil n'envoie rien sur Internet (seule la police d'écriture est chargée depuis Google Fonts).

**Période verrouillée (coffre-fort).** Les données vont de juillet 2024 à octobre 2026. À partir du 01/09/2026,
rien n'est lu pendant le développement (`traitement/verrou.py`, et `CONFIG_SAISIE.dateVerrou` dans l'outil) :
les séjours admis après le verrou sont retirés ; les sorties postérieures au verrou sont effacées (le séjour
est « encore en cours » au verrou). Seule la validation finale du modèle NERA ouvre le coffre, une seule fois,
avec une phrase de confirmation ; chaque ouverture est inscrite dans `resultats/coffre_ouvertures.log`.

---

## 9. État d'avancement

| Partie | État |
|---|---|
| Outil de saisie : saisie, import, contrôle qualité page par page, avertissements | fait, utilisé pour la pédiatrie |
| Statistiques de l'outil, zoom et animation, légendes cliquables, guide d'interprétation | fait |
| Traitement : conversion, statuts, trois méthodes de comptage, pic, capacité variable, indicateurs, garde-fous | fait, testé, vérifié |
| Saisie de la pédiatrie (juillet 2024 → octobre 2026) | en cours de correction (dates incohérentes, trous) |
| Registre des urgences (module triage du modèle NERA) | colonnes définies dans `registres.js`, saisie à faire |
| Date du passage de 15 à 20 lits, heures habituelles d'entrée et de sortie | à confirmer avec le major du service |
