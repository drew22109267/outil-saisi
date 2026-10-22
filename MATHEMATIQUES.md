# Mathématiques du traitement des données et des statistiques

Toutes les formules utilisées par l'**outil de saisie** (`outil-saisie/`, en JavaScript) et par le **traitement
des données** en Python (`traitement/`), avec leur justification : reconstitution de l'occupation à partir des
registres, validation de cette reconstitution, statistiques descriptives et tests, séries temporelles, modèles de
prévision de référence, et la vérification qui prouve que les calculs sont justes.

Les mathématiques du **modèle de prévision NERA** (SVR, pertes, noyaux, optimiseurs, validation, bancs d'essai)
sont dans le dépôt [nera-modele](https://github.com/drew22109267/nera-modele).

Tous les calculs sont écrits à la main : l'outil de saisie n'a aucune dépendance, le traitement Python
n'utilise que pandas (lecture des fichiers, dates) et matplotlib (figures). scipy et statsmodels ne servent
**que de juges** dans la vérification. Les nombres cités en exemple sont **fictifs**.

## Sommaire

1. [Mathématiques A : reconstitution de l'occupation](#1-mathématiques-a--reconstitution-de-loccupation)
2. [Mathématiques B : validation de l'occupation](#2-mathématiques-b--validation-de-loccupation)
3. [Mathématiques C : statistiques descriptives et tests](#3-mathématiques-c--statistiques-descriptives-et-tests)
4. [Mathématiques D : séries temporelles](#4-mathématiques-d--séries-temporelles)
5. [Mathématiques E : modèles de prévision de référence](#5-mathématiques-e--modèles-de-prévision-de-référence)
6. [Vérification complète des calculs (`verification/`)](#6-vérification-complète-des-calculs-verification)
7. [Outils numériques internes](#7-outils-numériques-internes)

---

## 1. Mathématiques A : reconstitution de l'occupation

Code : `traitement/chargement.py`, `traitement/imputation.py`, `traitement/occupation.py`, `traitement/indicateurs.py`,
et la fonction `calculerIndicateurs` de `outil-saisie/saisie.html` (mêmes formules).

### 1.1 Notations et statuts d'un séjour

Pour chaque séjour i : e_i la date d'entrée, S_i la date de sortie, n_i le « nombre de jours »
écrit dans le registre. Les dates sont converties en numéros de jour entiers.

| Statut | Situation | Traitement |
|---|---|---|
| observée | date de sortie écrite | S_i = date écrite |
| calculée | pas de date de sortie, nombre de jours écrit | S_i = e_i + n_i ou e_i + n_i − 1 (section 1.3) |
| censurée | ni sortie ni départ écrit, entrée récente (dans la fenêtre de censure avant l'extraction) | présent jusqu'à la date d'extraction |
| estimée (imputée) | ni sortie ni nombre de jours, départ écrit ou entrée ancienne | durée estimée (section 1.5), ou séjour exclu selon le réglage |
| inconnue | rien d'exploitable | exclu et dénombré à part |

Un enfant dont le départ est écrit (sortie, SCAM, décès, référé, évadé, mise en observation)
n'est jamais « encore hospitalisé », même entré récemment.

Durée maximale plausible : un séjour de plus de `MAX_NUITS` nuits est considéré comme une erreur
de saisie de la date de sortie (sortie ignorée, séjour signalé).

### 1.2 Recensement de minuit

Un enfant compte dans l'occupation du jour d s'il est présent à minuit :

```
P_d = Σ_i 1(e_i ≤ d < S_i)
```

Il occupe un lit la nuit de son entrée, mais plus la nuit de sa sortie. Un séjour de 3 nuits
(entrée le 1er, sortie le 4) compte les 1er, 2 et 3. Un enfant entré et sorti le même jour
n'apparaît pas dans l'occupation de minuit, mais compte dans les admissions.

**Calcul par tableau de différences.** On ajoute +1 au jour e_i et −w au jour de chaque sortie
possible (w = poids de cette sortie, section 1.4), puis on fait la somme cumulée. Les séjours
entrés avant le premier jour de la période sont cumulés dans la valeur de départ. Complexité :
O(nombre de séjours + nombre de jours).

L'occupation **n'est pas plafonnée** au nombre de lits : un dépassement est un sureffectif réel
(lit d'appoint, deux enfants par lit) et c'est une information à garder.

### 1.2 bis Deuxième méthode : le comptage journalier

Option `--comptage journee` (Python) et réglage « Comptage » de l'outil. Un enfant compte chaque jour où il
est présent, jour de sortie compris :

```
P'_d = Σ_i 1(e_i ≤ d ≤ S_i)
```

Calcul : le même tableau de différences, avec chaque fin de séjour décalée d'un jour (−w au jour S_i + 1).
Un séjour de n nuits compte n + 1 jours ; une mise en observation (entrée et sortie le même jour) compte 1.
Les admissions et les sorties ne changent pas ; seul le nombre de présents change.

Conséquences exactes, utiles pour vérifier les calculs :

- journées : JH' = JH + (nombre de séjours terminés dans la période), à l'effet de bord près ;
- loi de Little : L' = λ·(W + 1), W en nuits (le contrôle `verifier_little` ajoute 1 à W en mode journée) ;
- présents moyens et taux d'occupation : augmentés d'environ λ, le nombre d'admissions par jour.

**Limites de chaque méthode.**

| | Recensement de minuit | Comptage journalier |
|---|---|---|
| Ce qu'il mesure | lits occupés pendant la nuit | lits utilisés à un moment de la journée |
| Référence | norme des statistiques hospitalières (journées d'hospitalisation = nuits) ; comparable aux autres hôpitaux | pas de norme commune : à définir dans le mémoire |
| Mises en observation (0 nuit) | invisibles (comptent 0), alors qu'elles occupent un lit le jour | comptées (1 jour) |
| Jour de sortie | ignoré : le lit libéré le matin est compté libre | compté occupé, même si l'enfant part à 8 h |
| Rotation dans la journée | un lit libéré puis réoccupé le même jour compte 1 | compte 2 (sortant et entrant) : peut **surestimer** le besoin réel en lits simultanés |
| Biais | sous-estime la charge de jour (consultations, soins, MEO) | surestime l'occupation simultanée ; plus sensible aux erreurs sur la date de sortie |
| Pour la décision | lits nécessaires la nuit (garde) | charge de travail et lits utilisés dans la journée |

Aucune des deux n'est « la vraie » occupation : sans heure d'entrée ni de sortie dans le registre, on ne
peut mesurer que ces deux bornes de lecture. Le vrai nombre de lits occupés au même moment de la journée
se situe entre les deux, en général plus près du recensement de minuit (pas de chevauchement des sorties du
matin et des entrées de l'après-midi). Le banc de prétraitement (dimension P8) et l'option `--comptage` de
tous les scripts permettent de mener toute l'étude avec l'une ou l'autre série et de comparer les conclusions.

### 1.2 ter Troisième méthode : la présence pondérée par le temps

Option `--comptage pondere` (Python, avec `--heure-entree`, `--heure-sortie`, `--duree-meme-jour`) et
« Pondérée par le temps » dans l'outil. Le registre ne donne pas les heures. D'après le service, les
**admissions se font à toute heure, 24 h sur 24**, et les **sorties de jour**, du matin à la tombée de la nuit
(8–18 h). On prend la moyenne de chaque fenêtre : admission à h_e = 12 h, sortie à h_s = 13 h, séjour du même jour
de m heures (8 h). Comme la présence d'un jour est linéaire en l'heure d'arrivée et de départ, remplacer les heures
inconnues par leur moyenne donne **exactement** l'occupation moyenne attendue (E[1 − H_e/24] = 1 − E[H_e]/24) ;
avec des admissions uniformes sur 0–24 h, a = 1/2 sans aucune approximation.
Avec a = h_e/24, b = h_s/24, μ = m/24, la contribution d'un séjour au jour d est la fraction du jour passée
dans le service :

```
           ⎧ 1 − a     si d = e < S          (jour d'entrée)
           ⎪ 1         si e < d < S          (jours pleins)
c_i(d) =   ⎨ b         si d = S > e          (jour de sortie)
           ⎪ μ         si d = e = S          (séjour du même jour)
           ⎩ 0         sinon
P''_d = Σ_i w_i c_i(d)
```

Calcul : le comptage journalier, moins une correction a au jour d'entrée et (1 − b) au jour de sortie (ou
1 − μ − a pour un séjour du même jour, puisque 1 − a − (1 − μ − a) = μ). Un enfant encore hospitalisé ne reçoit
que la correction d'entrée.

Conséquence exacte pour la loi de Little : W'' = n + (b − a) pour un séjour de n ≥ 1 nuit, μ pour un séjour du
même jour ; `verifier_little` utilise cette durée.

| | Pondérée par le temps |
|---|---|
| Ce qu'elle mesure | le nombre moyen de lits occupés sur 24 h (l'occupation réelle, si les heures sont justes) |
| Mises en observation | comptées pour leur durée (μ) |
| Rotation dans la journée | un lit libéré à 11 h et réoccupé à 12 h compte 11/24 + 12/24 ≈ 0,96, pas 2 |
| Limite | dépend des heures supposées : si les sorties ont lieu en moyenne à 10 h au lieu de 13 h, chaque séjour perd 1/8 de jour ; le banc P8 et les options `--heure-*` mesurent cette sensibilité |

### 1.2 quater Le pic de la journée : un encadrement exact

Les trois méthodes donnent un nombre moyen. Pour dimensionner, il faut le **plus grand nombre d'enfants
présents en même temps** le jour d. Sans les heures, on l'encadre exactement :

```
max(P_{d−1}, P_d) ≤ pic_d ≤ P'_d
```

- borne basse : les enfants présents à minuit (début ou fin de la journée) sont présents ensemble à cet instant ;
- borne haute : personne n'est présent dans la journée sans être compté par le comptage journalier.

Colonnes `pic_bas` et `pic_haut` de `occupation_<SERVICE>.csv` ; rubrique « Pic de la journée » de l'outil.
Un jour où même la borne basse dépasse les lits est un sureffectif **certain** ; si seule la borne haute les
dépasse, il est **possible**.

**Heure par heure, sans heure dans le registre** (section « Occupation heure par heure » de l'outil). Les heures
d'entrée H_e et de sortie H_s sont aléatoires, de fonctions de répartition F_e et F_s (uniformes sur des fenêtres
réglables), indépendantes d'un enfant à l'autre. Fenêtres par défaut, d'après le service : entrées sur 0–24 h
(à toute heure), sorties sur 8–18 h (de jour). Une mise en observation arrive, comme les autres entrées, à toute heure
(répartition F_m = F_e) et reste m heures, sans suivre la fenêtre des sorties ; arrivée tard, elle est comptée
jusqu'à minuit au plus, puisque le registre la date du même jour. Avec, pour le jour d, les poids des fins possibles (sortie
calculée : p le jour e + n − 1, 1 − p le jour e + n) : pleins_d (présents toute la journée), A_d (entrées), S_d
(sorties) et M_d (mises en observation, présentes m heures) :

```
E[N_d(u)]   = pleins_d + A_d·F_e(u) + S_d·(1 − F_s(u)) + M_d·q(u),     q(u) = F_m(u) − F_m(u − m)
Var[N_d(u)] = A_d·F_e(1 − F_e) + S_d·F_s(1 − F_s) + M_d·q(1 − q)
```

E[N_d(0)] = P_{d−1} et E[N_d(24)] = P_d : le profil raccorde les deux recensements de minuit. Moyenne de la
journée : P_{d−1} − S_d(1 − h̄_s/24) + A_d(1 − h̄_e/24) (+ mises en observation), soit, par la loi de Little,
L_minuit + λ(h̄_s − h̄_e)/24. Le pic et P(pic > lits) sont estimés par Monte-Carlo (heures tirées pour chaque
séjour, sortie avant entrée à heure égale). Détail et exemple : guide mathématique (MEMOIRE), chapitre Occupation.

**Où est le moment le plus chargé ?** Avec ces fenêtres, l'occupation attendue monte de minuit à 8 h (entrées,
aucune sortie), varie linéairement de 8 h à 18 h (entrées et sorties), puis remonte jusqu'à minuit (entrées seules).
Une fonction linéaire par morceaux atteint son maximum à une extrémité : le maximum attendu de la journée est

```
max( P_{d−1} + A_d·s₁/24 ,  P_d )        (à 8 h, avant les premières sorties ; ou à minuit)
```

Le matin, les enfants de la nuit sont encore tous là pendant que de nouveaux arrivent : le recensement de minuit
sous-estime alors le besoin en lits d'environ A_d·s₁/24 (un tiers des admissions du jour avec s₁ = 8 h). C'est
pourquoi le pic, et non la moyenne, sert à dimensionner.

### 1.2 quinquies Capacité variable

Le service est passé de 15 à 20 lits à une date inconnue, et tous les lits ne sont peut-être pas utilisables.
Le taux d'occupation utilise la capacité **de chaque jour** :

```
TOM = Σ_d P_d / Σ_d lits_d          sureffectif_d = 1(P_d > lits_d)
```

Python : `--lits-fichier lits_PED.csv` (colonnes `date_debut;lits`) ; outil : « Changements » dans le bouton
Calcul (`01/03/25=20`). Tant que la date est inconnue, `--scenarios-lits 15 16 17 18 19 20` donne le taux pour
chaque capacité : on présente une plage, pas un chiffre.

### 1.3 Convention du nombre de jours : estimation de p avec rétrécissement

Quand la sortie n'est pas écrite, « n jours » peut vouloir dire :

- n **nuits** : S = e + n ;
- n jours **entrée et sortie comprises** (ligne inclusive) : S = e + n − 1.

Les deux pratiques coexistent selon le médecin. On mesure la part p de lignes inclusives sur les
lignes où **la date de sortie et le nombre de jours sont tous deux écrits** : une ligne est
inclusive si S − e − n = −1, en nuits si S − e − n = 0 (les autres écarts sont des incohérences,
ignorées).

Estimation mois par mois avec **rétrécissement vers la moyenne globale** (estimateur bayésien
empirique) :

```
p_M = (k_M + 10 · p̂) / (n_M + 10)
```

- k_M : lignes inclusives du mois M ; n_M : lignes mesurables du mois M ;
- p̂ = Σ k_M / Σ n_M : part globale ;
- 10 : nombre de « pseudo-lignes » (poids de l'a priori).

Exemple fictif : 30 lignes inclusives sur 40 et p̂ = 0,5 donnent (30 + 5)/(40 + 10) = 0,70 au lieu
de 0,75. Un mois avec 2 lignes mesurables, toutes inclusives, donne (2 + 5)/(2 + 10) = 0,58 au lieu
de 1 : un mois pauvre en données est tiré vers la moyenne au lieu de prendre une valeur extrême.

Si aucune ligne n'est mesurable, p = 0,5.

### 1.4 Trois scénarios : attendu, bas, haut

Pour un séjour calculé, les deux sorties possibles ne diffèrent que d'une nuit, celle du jour
d* = e + n − 1 :

```
P(e ≤ d < S) = 1        pour e ≤ d < d*
             = 1 − p    pour d = d*
             = 0        pour d > d*
```

- **Scénario attendu** : E[P_d] = Σ_i P(e_i ≤ d < S_i). Par linéarité de l'espérance, c'est exact
  sans aucune hypothèse d'indépendance entre séjours. La nuit incertaine compte pour 1 − p. Les
  sorties sont pondérées de même : poids p le jour e + n − 1, poids 1 − p le jour e + n.
- **Scénario bas** : toutes les lignes calculées sont inclusives (p = 1).
- **Scénario haut** : toutes sont en nuits (p = 0).

Comme P_d est croissant en chaque S_i, toute répartition réelle des deux conventions donne une
série comprise entre les scénarios bas et haut : c'est un **encadrement exact** (si seules ces
deux conventions existent), pas un intervalle de confiance. Pour les durées estimées (section
5.5), le scénario bas utilise le 1er quartile et le scénario haut le 3e quartile.

### 1.5 Durées inconnues estimées

Pour un séjour sans sortie ni nombre de jours, trois réglages :

- `exclure` : le séjour n'entre pas dans l'occupation ;
- `mediane` : durée médiane des séjours connus du service ;
- `estimee` (défaut) : durée médiane des séjours connus **de même prix** (au moins 5 séjours) ;
  à défaut, de même issue ; à défaut, médiane du service.

Le prix payé suit la durée (tarification à la journée) : c'est le meilleur substitut disponible.
L'incertitude est gardée : 1er et 3e quartile de la classe (bornes des scénarios bas et haut).
Les durées estimées n'entrent ni dans la DMS ni dans les sorties par issue.

**Validation de l'estimation** (`traitement/imputation.py`, `valider_estimation`) : validation croisée
en k plis sur les séjours connus. On cache la durée, on la prédit, on mesure l'erreur absolue
moyenne et la part des prédictions à ±1 nuit, pour chaque méthode.

### 1.6 Rodage, fenêtre de censure, fin de série

- **Rodage** = max(14, p95 des durées connues) jours. Les enfants entrés avant le premier jour
  saisi occupent des lits mais n'apparaissent pas dans les lignes : on attend que la plupart
  soient sortis avant de commencer le calcul.
- **Fenêtre de censure** : un séjour sans sortie est « encore hospitalisé » si son entrée est
  dans les max(7, p95) derniers jours avant l'extraction (réglage `p95`), ou dans un nombre de
  jours fixe (réglage `seuil`).
- **Trou final** : si les derniers numéros d'ordre manquent (pages pas encore saisies), le calcul
  s'arrête avant.
- **Délai d'inscription** = date d'enregistrement − date d'entrée. Son 95e centile (borné entre
  2 et 10 jours) fixe le nombre de derniers jours retirés de la série de modélisation : ces jours
  manquent d'enfants pas encore inscrits.

### 1.7 Indicateurs hospitaliers

Pour une période de J jours et un service de N lits :

| Indicateur | Formule | Lecture |
|---|---|---|
| Journées d'hospitalisation | JH = Σ_d P_d | nombre total de nuits passées à l'hôpital |
| Taux d'occupation moyen | TOM = JH / (N · J) × 100 | part des lits réellement occupés ; > 100 % = sureffectif |
| Présents moyens | L = JH / J | |
| Durée moyenne de séjour | DMS = Σ w · nuits / Σ w (séjours terminés dans la période) | les séjours en cours ne comptent pas |
| Rotation des lits | sorties / N | nombre de patients par lit sur la période |
| Intervalle de rotation | (N · J − JH) / sorties | jours moyens de lit vide entre deux patients ; négatif = sureffectif |
| Mortalité hospitalière | décès / sorties × 100 | |
| Jours en sureffectif | #{d : P_d > N} | |

Les sorties sont pondérées par leurs poids w (section 1.4) : sorties = Σ w, décès = Σ w·1(décès).
Ce sont les espérances des sommes ; la DMS est le rapport des deux.

**Fourchette du TOM** : TOM_bas ≤ TOM ≤ TOM_haut, mois par mois, puisque JH est croissant en chaque
date de sortie.

**Capacité variable** (lits ajoutés ou fermés) : N · J est remplacé par Σ_d N_d ; la rotation
utilise le nombre moyen de lits.

**Capacité incertaine (cas de la pédiatrie : de 15 à 20 lits entre 2024 et 2026, date du changement et lits
réellement opérationnels inconnus).** Le nombre de présents ne dépend pas du nombre de lits : la série, le
modèle SVR et ses prévisions ne changent pas. Seuls les indicateurs rapportés aux lits changent (taux, jours
saturés, sureffectif, rotation, intervalle de rotation, Erlang B). Trois outils :
- `--lits-fichier` (Python) ou le champ « Changements » de l'outil (`01/03/25=20`) : chaque jour avec sa capacité ;
- `--scenarios-lits 15 16 17 18 19 20` : les mêmes indicateurs pour chaque capacité possible ;
- dans le mémoire, présenter le taux comme une **plage** (par exemple 42 % avec 20 lits à 56 % avec 15 lits,
  recensement de minuit) tant que la date du changement et le nombre de lits opérationnels ne sont pas confirmés
  par le service (cahier de garde, administration, inventaire des lits).

### 1.8 Loi de Little et Erlang B (garde-fous)

Code : `traitement/garde_fous.py` et la section « Loi de Little et file d'attente » de l'outil.

**Loi de Little.** Dans tout système stable :

```
L = λ · W
```

L : présents moyens ; λ : admissions par jour ; W : durée moyenne de séjour en nuits. Elle ne
dépend d'aucune hypothèse sur la forme des arrivées ou des durées. Un écart de plus de 10 % entre
L mesuré et λW signale un problème de données (page manquante, dates fausses, sorties non
saisies) ou une période trop courte ou non stationnaire.

**Erlang B (file M/G/c/c, modèle à perte).** Arrivées de Poisson, durées quelconques, c lits,
pas de file d'attente. Probabilité qu'un enfant arrive alors que les c lits sont pleins :

```
B(c, a) = (a^c / c!) / Σ_{k=0..c} a^k / k!        a = λ · W = charge offerte en lits
```

Calcul stable par récurrence : B(0) = 1, puis B(k) = a·B(k−1) / (k + a·B(k−1)). On en déduit le
nombre de lits nécessaire pour une saturation inférieure à 5 % ou à 1 %.

| Charge a (exemple fictif) | B(10 lits) | B(20 lits) | Lits pour B ≤ 5 % | Lits pour B ≤ 1 % |
|---|---|---|---|---|
| 8 | 12 % | < 0,1 % | 12 | 15 |
| 12 | 30 % | 1 % | 17 | 20 |

On dimensionne un service sur ses pics, pas sur sa moyenne. Erlang B suppose qu'un patient refusé
est perdu ; dans un service qui ajoute des lits, la saturation observée peut dépasser B.

**Lien avec la perte quantile du SVR.** Sous-estimer un pic coûte plus que le surestimer. Si
c_p est le coût d'un lit manquant et c_s celui d'un lit vide, le quantile optimal à prévoir est

```
τ = c_p / (c_p + c_s)
```

τ = 0,8 revient à dire qu'une pénurie coûte 4 fois plus qu'un lit vide.

## 2. Mathématiques B : validation de l'occupation

Code : `outil-saisie/occupation-validation.js` (rubrique « Occupation » de l'outil). Quatre
méthodes indépendantes pour contrôler la reconstitution.

### 2.1 Bilan des flux et recalage sur des comptages réels

L'occupation est traitée comme un stock :

```
P_t = P_{t−1} + A_t − S_t
```

A_t : entrées du jour t ; S_t : sorties du jour t (une sortie calculée compte pour p le jour
e + n − 1 et pour 1 − p le jour e + n).

**Équivalence avec le recensement.** En déroulant la récurrence, P_t = P_0 + Σ_{u≤t} (A_u − S_u).
Chaque séjour ajoute +1 à son entrée et −1 à sa sortie : la somme cumulée compte les séjours
entrés et pas encore sortis, c'est-à-dire Σ 1(e ≤ t < S). L'écart entre les deux calculs doit
être 0 : ce contrôle vérifie le programme, pas le registre.

**Recalage.** Un comptage réel C_k fait le jour τ_k (cahier de garde, relève, comptage sur place)
est une donnée indépendante du registre. L'outil calcule :

- l'écart e_k = C_k − P_{τ_k} ;
- la série recalée P̃_t = P_t + e_k pour τ_k ≤ t < τ_{k+1} ;
- le biais ē = (1/K) Σ e_k et l'écart absolu moyen (1/K) Σ |e_k|.

**Test du signe.** Si le registre était juste, chaque écart serait positif ou négatif avec une
chance sur deux. La probabilité que K écarts soient tous du même signe vaut 2 · 0,5^K (bilatéral).
Exemple fictif : 8 écarts tous positifs, moyenne +3,25 : p = 0,008. Le registre sous-estime
l'occupation d'environ 3 enfants par nuit ; avec 8 présents moyens et 20 lits, le TOM passe de
40 % à 56 %. Avec moins de 5 comptages, aucune conclusion n'est possible (2 · 0,5⁵ = 0,06).

Précautions : un comptage fait le matin n'est pas un comptage de minuit (sorties du matin) ; il
ne doit compter ni les accompagnants ni les lits d'autres services.

### 2.2 Simulation de Monte-Carlo

On tire au hasard tout ce qui est incertain, N fois (100, 300 ou 1 000), et on refait le
recensement à chaque tirage r :

| Type de séjour | Traitement à chaque tirage |
|---|---|
| sortie écrite | fixe |
| sortie calculée | loi de Bernoulli : avec la probabilité p_M, S = e + n − 1, sinon S = e + n |
| durée inconnue | bootstrap : une durée tirée avec remise parmi les séjours connus de même prix (au moins 5), sinon de même issue, sinon de tout le service |
| encore hospitalisé | présent jusqu'à la fin de la période |

Pour chaque tirage : présents moyens L^(r), TOM^(r) = L^(r)/N, jours en sureffectif, maximum.

- **Intervalle de confiance à 95 % par percentiles** : [θ_(2,5 %) ; θ_(97,5 %)] des N valeurs.
- **Bande quotidienne** : 5e et 95e centiles de P_t^(r) pour chaque jour t.
- **P(au moins un jour > lits)** = part des tirages qui contiennent un sureffectif.

**Pourquoi l'intervalle est plus étroit que la fourchette basse / haute.** La fourchette met
toutes les lignes incertaines du même côté en même temps. La simulation tire chaque séjour
indépendamment : avec m séjours d'écart-type σ, la fourchette varie comme m·σ, l'écart-type de
la somme comme √m · σ. Exemple fictif : 200 séjours, σ = 2 nuits, 20 lits, 600 jours : écart-type
des JH ≈ 2 √200 ≈ 28 journées, soit ± 0,5 point de TOM à 95 %, contre ± 3,3 points pour la
fourchette.

**Précision de la simulation.** Une probabilité estimée sur N tirages a une erreur d'environ
√(p(1 − p)/N) : ± 2,9 points pour N = 300, ± 1,6 point pour N = 1 000. Le générateur pseudo-aléatoire
(mulberry32) a une graine fixe : le résultat est reproductible.

**Limite.** La simulation suppose que les durées manquantes ressemblent aux durées connues de la
même classe (hypothèse MAR, *missing at random*). Elle ne voit pas les enfants absents du
registre : seul le recalage sur des comptages réels (6.1) le peut.

### 2.3 Analyse de survie : Kaplan-Meier et log-rank

T = durée de séjour en nuits ; S(t) = P(T > t) est la part des enfants encore hospitalisés après
t nuits. Un enfant encore présent à la fin de la saisie est **censuré à droite** : on sait
seulement que T dépasse sa durée observée.

**Estimateur de Kaplan-Meier.** À chaque durée t_i où au moins une sortie a lieu, n_i est le
nombre d'enfants encore à risque juste avant t_i, d_i le nombre de sorties à t_i :

```
Ŝ(t) = Π_{t_i ≤ t} (1 − d_i / n_i)
```

Un censuré compte dans les n_i jusqu'à sa censure, puis disparaît sans créer de sortie. Un
censuré à la même durée qu'une sortie est encore à risque à cette durée.

Exemple fictif, 10 enfants de durées 1, 2, 2, 3, 3+, 4, 5, 5, 6+, 8 (+ = censuré) :

| t_i | n_i | d_i | Ŝ(t_i) |
|---|---|---|---|
| 1 | 10 | 1 | 0,90 |
| 2 | 9 | 2 | 0,70 |
| 3 | 7 | 1 | 0,60 |
| 4 | 5 | 1 | 0,48 |
| 5 | 4 | 2 | 0,24 |
| 8 | 1 | 1 | 0 |

Médiane = première durée où Ŝ ≤ 0,5, soit 4 nuits. En jetant les censurés, on trouverait 3,5 nuits :
biais vers le bas. Quartiles : Q1 = première durée où Ŝ ≤ 0,75, Q3 = première durée où Ŝ ≤ 0,25.

**Variance de Greenwood et intervalle à 95 %.**

```
Var[Ŝ(t)] ≈ Ŝ(t)² · Σ_{t_i ≤ t} d_i / (n_i (n_i − d_i))        IC = Ŝ ± 1,96 √Var
```

Exemple fictif à t = 2 : Σ = 1/90 + 2/63 = 0,0429 ; écart-type 0,70 · √0,0429 = 0,145 ;
IC [0,42 ; 0,98].

**Durée moyenne restreinte à 30 nuits** : ∫_0^30 Ŝ(t) dt = E[min(T, 30)], calculable même si la
courbe ne descend pas à 0. Lien avec la loi de Little : E[T] = ∫_0^∞ S(t) dt, donc Kaplan-Meier
donne un W qui tient compte des censures.

**Test du log-rank (forme de Peto).** À chaque durée t de sortie, le groupe g recevrait, sans
différence entre groupes, une part des d_t sorties proportionnelle à son effectif à risque :
E_{g,t} = d_t · n_{g,t} / n_t. Avec O_g = Σ_t d_{g,t} et E_g = Σ_t E_{g,t} :

```
χ² = Σ_g (O_g − E_g)² / E_g        k − 1 degrés de liberté
```

Cette forme est un peu prudente (elle rejette un peu moins souvent que la forme à variance
complète). Hypothèses : censure non informative ; les enfants partis sans date ni durée ne sont
pas des censurés (durée inconnue) et sont exclus de Kaplan-Meier.

### 2.4 Modèle de file M/G/∞

Hypothèses : arrivées de Poisson de taux λ, durées indépendantes de loi quelconque G de moyenne
W, nombre de lits illimité (en pédiatrie, un enfant en surplus est couché quand même).

**Théorème.** En régime stable, le nombre de présents suit une loi de Poisson de moyenne λW,
quelle que soit la loi des durées :

```
P(N = k) = e^{−λW} (λW)^k / k!        E[N] = Var[N] = λW
```

Idée de la preuve : un enfant arrivé il y a u jours est encore là avec la probabilité S(u) ; un
processus de Poisson dont on garde chaque point avec la probabilité S(u) reste de Poisson, de
moyenne λ ∫ S(u) du = λW. Version non stationnaire : N_t suit une loi de Poisson de moyenne
Σ_k λ_{t−k} S(k).

**Indice de dispersion** D = variance / moyenne des présents observés : D ≈ 1 conforme au hasard,
D > 1 surdispersion (arrivées par vagues), D < 1 régularité. Le test (n − 1)·D ~ χ²(n − 1)
n'est pas valide ici, les présents d'un jour à l'autre étant fortement corrélés : D se lit comme
un indicateur.

**Mélange de Poisson par mois** : P(N = k) = Σ_m w_m · Poisson(k ; μ_m), w_m = part des jours du
mois m, μ_m = moyenne du mois. Par la loi de la variance totale, Var(N) = E[μ] + Var(μ) : la
saison crée à elle seule de la surdispersion. Exemple fictif : μ = 6 et μ = 10 à parts égales
donnent une moyenne 8, une variance 12, D = 1,5.

**Binomiale négative** (mélange Poisson-gamma), ajustée par les moments (si v > m) :

```
r = m² / (v − m)    q = m / v    P(N = k) = Γ(k + r) / (Γ(r) k!) · q^r (1 − q)^k
```

**Queues de distribution** (exemple fictif, 20 lits, 8 présents en moyenne) :

| Loi | Variance | P(N ≥ 17) | P(N ≥ 21) |
|---|---|---|---|
| Poisson(8) | 8 | 0,37 % | 0,009 % |
| mélange μ = 6 / 10 | 12 | 1,4 % | 0,08 % |
| binomiale négative | 16 | 3,2 % | 0,6 % |

À même moyenne, ignorer la surdispersion fait sous-estimer les pics. C'est l'argument de la perte
quantile τ = 0,8 pour le SVR.

### 2.5 Quelle méthode répond à quelle question

| Question | Méthode | Ce qu'elle ne voit pas |
|---|---|---|
| Le calcul est-il juste ? | bilan des flux (écart nul) | les erreurs du registre |
| Le registre est-il complet ? | recalage sur comptages réels | rien, si les comptages sont fiables |
| Les données manquantes changent-elles le résultat ? | Monte-Carlo | les enfants absents du registre |
| Combien de temps reste un enfant, selon le groupe ? | Kaplan-Meier, log-rank | les durées des enfants partis sans date |
| Le service est-il souvent plein ? | M/G/∞ | le plafond physique des lits |
| Combien de lits faudrait-il ? | Erlang B | le surnombre (il suppose le refus) |

## 3. Mathématiques C : statistiques descriptives et tests

Code : `outil-saisie/statistiques.js` et `outil-saisie/indicateurs.js` (rubriques de l'outil),
`svr/analyse.py` (figures Python).

### 3.1 Règles de lecture communes

- **p-valeur** : probabilité d'observer un écart au moins aussi grand si l'hypothèse nulle (aucun
  lien, aucune différence) était vraie. On rejette l'hypothèse nulle si p < 0,05. Une p-valeur ne
  mesure pas l'importance d'un effet : il faut toujours lire la **taille d'effet** à côté.
- **Comparaisons multiples** : sur 100 tests à 5 %, environ 5 sortent significatifs par hasard.
  Correction de Bonferroni : seuil = 0,05 / nombre de tests.
- **Paramétrique ou non** : si une variable n'est pas normale (Jarque-Bera), préférer les tests
  sur les rangs (Spearman, Kendall, Mann-Whitney, Kruskal-Wallis).

### 3.2 Une variable numérique

| Indicateur | Formule |
|---|---|
| Moyenne | x̄ = Σx / n |
| Médiane, quantiles | quantile de type 7 : position h = (n − 1)q, interpolation linéaire entre x_(⌊h⌋) et x_(⌊h⌋+1) |
| Variance | s² = Σ(x − x̄)² / (n − 1) |
| Erreur-type | s / √n |
| IC 95 % de la moyenne | x̄ ± t_{0,975}(n − 1) · s / √n |
| Coefficient de variation | CV = 100 · s / x̄ |
| Écart interquartile | IQR = Q3 − Q1 |
| Écart absolu médian | MAD = médiane(|x − médiane|) |
| Asymétrie | G1 = √(n(n − 1)) / (n − 2) · m₃ / m₂^{3/2}, m_k = (1/n) Σ(x − x̄)^k |
| Aplatissement (excès) | G2, nul pour une loi normale |
| Jarque-Bera | JB = n/6 · (g1² + g2²/4) ~ χ²(2) |
| Valeurs atypiques (Tukey) | x < Q1 − 1,5 IQR ou x > Q3 + 1,5 IQR |
| Largeur des classes (Freedman-Diaconis) | h = 2 · IQR · n^{−1/3} |
| Droite de Henry | abscisse Φ⁻¹((i − ½)/n), ordonnée valeur centrée réduite |

### 3.3 Variables qualitatives

- **Intervalle de Wilson** d'une proportion, z = 1,96 :
  (p̂ + z²/2n ± z √(p̂(1 − p̂)/n + z²/4n²)) / (1 + z²/n). Il reste dans [0 ; 1] et fiable pour les
  petits effectifs.
- **Entropie normalisée** : H = −Σ p_i ln p_i / ln k, entre 0 (une seule modalité) et 1
  (modalités également fréquentes).

### 3.4 Corrélations

| Coefficient | Formule | Mesure |
|---|---|---|
| Pearson | r = Σ(x − x̄)(y − ȳ) / √(Σ(x − x̄)² Σ(y − ȳ)²) ; test t = r √(n − 2) / √(1 − r²) ~ Student(n − 2) | lien linéaire |
| Spearman | Pearson sur les rangs (ex æquo au rang moyen) | lien monotone |
| Kendall τ-b | (C − D) / √((n₀ − n₁)(n₀ − n₂)), C et D paires concordantes et discordantes | lien monotone, gère les ex æquo |
| Point-bisériale | Pearson avec une variable 0/1 | différence de moyennes |

Force de |r| : < 0,1 négligeable, < 0,3 faible, < 0,5 modéré, < 0,7 fort, au-delà très fort.
r² = part de variance commune. En Python, la matrice de Pearson se calcule R = ZᵀZ / n sur les
variables centrées réduites.

### 3.5 Tableaux croisés : χ² et V de Cramér

```
χ² = Σ (O − E)² / E      E = total ligne × total colonne / n      ddl = (l − 1)(c − 1)
V = √(χ² / (n (min(l, c) − 1)))
```

Résidus standardisés (O − E)/√E : > 2 case sur-représentée, < −2 sous-représentée. Si plus de 20 %
des cases ont E < 5, regrouper des modalités avant de citer le test.

### 3.6 Comparer des groupes

| Test | Formule | Taille d'effet |
|---|---|---|
| Mann-Whitney | U = R₁ − n₁(n₁ + 1)/2 ; z = (U − n₁n₂/2) / √(n₁n₂(n₁ + n₂ + 1)/12) | r = |z| / √n |
| t de Welch | t = (x̄₁ − x̄₂) / √(s₁²/n₁ + s₂²/n₂), ddl de Welch-Satterthwaite | d de Cohen |
| Kruskal-Wallis | H = 12 / (n(n + 1)) Σ R_j²/n_j − 3(n + 1) ~ χ²(k − 1) | ε² = H / (n − 1) |
| ANOVA | F = (SCE_inter/(k − 1)) / (SCE_intra/(n − k)) | η² = SCE_inter / SCE_totale |

Repères : r ≈ 0,1 / 0,3 / 0,5 ; ε² ou η² ≈ 0,01 / 0,06 / 0,14 ; d ≈ 0,2 / 0,5 / 0,8 (petit /
moyen / grand).

### 3.7 Régression linéaire multiple (moindres carrés)

```
y = β₀ + β₁x₁ + … + β_k x_k + ε        β̂ = (XᵀX)⁻¹ Xᵀ y
σ̂² = SCE / (n − k − 1)                 se(β̂_j) = √(σ̂² [(XᵀX)⁻¹]_jj)
t_j = β̂_j / se ~ Student(n − k − 1)    IC 95 % = β̂_j ± t_{0,975} · se
R² = 1 − SCE/SCT                       R²_ajusté = 1 − (1 − R²)(n − 1)/(n − k − 1)
F = ((SCT − SCE)/k) / σ̂²               RMSE = √(SCE / n)
β standardisé = β · s_x / s_y          VIF_j = 1 / (1 − R_j²)
```

VIF > 5 : colinéarité, coefficient instable. Résidus en entonnoir : hétéroscédasticité ; résidus
en courbe : lien non linéaire (argument pour un noyau RBF).

### 3.8 Analyse en composantes principales (ACP normée)

1. Variables positives très asymétriques (|G1| > 1) transformées en log(1 + x).
2. Centrage-réduction z_ij = (x_ij − x̄_j)/s_j, matrice des corrélations R = ZᵀZ / (n − 1).
3. Diagonalisation R = U Λ Uᵀ par la **méthode de Jacobi** (rotations qui annulent le plus grand
   terme hors diagonale, jusqu'à 10⁻¹²). λ_k = variance de l'axe k, Σλ = p, inertie = λ_k / p.
4. Coordonnées F_ik = Σ_j z_ij u_jk ; corrélation variable-axe r_jk = u_jk √λ_k ; cos² = r_jk² ;
   contribution = u_jk² × 100 % (une variable « fait » l'axe au-delà de 100/p %).
5. **Test de Bartlett** : χ² = −(n − 1 − (2p + 5)/6) · ln|R|, ddl p(p − 1)/2 ; p < 0,05 nécessaire.
6. **KMO** = Σr² / (Σr² + Σa²), a_ij = −R⁻¹_ij / √(R⁻¹_ii R⁻¹_jj) (corrélations partielles) ; échelle
   de Kaiser de 0,5 (médiocre) à 0,9 (excellent) ; MSA = même indice par variable.
7. **Nombre d'axes** : analyse parallèle de Horn (100 permutations indépendantes des colonnes,
   95e centile des valeurs propres, graine fixe) ; bâton brisé b_k = (1/p) Σ_{i=k..p} 1/i ;
   critère de Kaiser λ > 1 (affiché pour mémoire).
8. **Valeur-test** d'un groupe de n_g individus de barycentre ḡ_k sur l'axe k :
   v = ḡ_k / √(λ_k / n_g · (n − n_g)/(n − 1)) ; |v| > 1,96 : groupe significativement d'un côté.
9. **Ellipses** : en 2D, ellipse de confiance à 95 % du barycentre (covariance / n_g, rayon
   √5,991) ; en 3D, ellipse à 1,5 écart-type des points projetés.

### 3.9 Calendrier camerounais

- **Pâques** (algorithme de Meeus/Jones/Butcher, divisions entières) : a = Y mod 19 ; b = Y div 100,
  c = Y mod 100 ; d = b div 4, e = b mod 4 ; f = (b + 8) div 25 ; g = (b − f + 1) div 3 ;
  h = (19a + b − d − g + 15) mod 30 ; i = c div 4, k = c mod 4 ; l = (32 + 2e + 2i − h − k) mod 7 ;
  m = (a + 11h + 22l) div 451 ; mois = (h + l − 7m + 114) div 31 ; jour = ((h + l − 7m + 114) mod 31) + 1.
- Vendredi saint = Pâques − 2 jours ; Ascension = Pâques + 39 jours.
- Fêtes fixes : 1er janvier, 11 février, 1er mai, 20 mai, 15 août, 25 décembre. Fêtes musulmanes
  (Aïd el-Fitr, Tabaski) lues dans `donnees/feries_supplementaires.csv` d'après les annonces
  officielles ; vacances scolaires dans `donnees/vacances_scolaires.csv`.
- **Observé / attendu d'un férié** = admissions des fériés / Σ (moyenne des jours ordinaires du
  même jour de la semaine) : neutralise l'effet du jour de la semaine.
- **Écart vacances − classe à mois égal** = Σ_m n_vac,m (ȳ_vac,m − ȳ_classe,m) / Σ_m n_vac,m :
  neutralise la saison.

### 3.10 Contrôle qualité de la saisie

- Numéro d'ordre daté hors de ses voisins (n − 3 à n + 3) : plus tôt ou plus tard que la médiane
  des précédents et que celle des suivants, d'au moins 4 jours.
- Enregistré avant l'entrée, ou plus de 10 jours après ; date illisible.
- Doublons probables : même date d'entrée, même sexe, même âge, même quartier.
- Numéros d'ordre manquants entre deux numéros d'un même mois.
- **Contrôle sur les photos** (onglet Contrôle qualité de l'outil) : pages tirées au hasard, comparées aux
  lignes saisies retrouvées par (mois, N° d'ordre). Taux d'erreur = cases fausses / cases vérifiées ;
  intervalle de confiance à 95 % par bootstrap sur les pages (unité de tirage ; 2 000 rééchantillonnages
  avec remise, percentiles 2,5 et 97,5) ; par colonne, intervalle de Wilson ; taux séparé sur les colonnes
  de l'occupation ; lignes oubliées et en trop.
- **Double saisie** (`python -m traitement.qualite_saisie`) : accord par colonne, kappa de Cohen
  κ = (p_o − p_e) / (1 − p_e), p_o accord observé, p_e accord attendu par hasard.

## 4. Mathématiques D : séries temporelles

### 4.1 Lissages descriptifs et décomposition

- Moyenne mobile m_t = (1/k) Σ_{i=0..k−1} y_{t−i} ; médiane, écart-type et CV mobiles ; bande ± 2σ
  sur 30 jours ; tendance linéaire y_t = a + b t (moindres carrés).
- **Décomposition additive** y_t = T_t + S_t + R_t : T = moyenne mobile centrée sur 7 jours,
  S = moyenne de y − T par jour de la semaine recentrée à somme nulle, R = y − T − S.
- **Forces** (Wang, Smith et Hyndman) : F = max(0, 1 − Var(R) / Var(composante + R)).

### 4.2 Autocorrélations

- **ACF** : ρ̂(k) = Σ_t (y_t − ȳ)(y_{t+k} − ȳ) / Σ_t (y_t − ȳ)² ; bande ± 1,96/√n.
- **PACF** par la récursion de Durbin-Levinson :
  φ_kk = (ρ(k) − Σ_{j<k} φ_{k−1,j} ρ(k − j)) / (1 − Σ_{j<k} φ_{k−1,j} ρ(j)),
  φ_kj = φ_{k−1,j} − φ_kk φ_{k−1,k−j}.
- **Corrélation croisée** admissions → présents : ρ_xy(k) = corr(A_{t−k}, P_t).

| ACF | PACF | Processus |
|---|---|---|
| décroît lentement | un pic à 1 | AR(1) |
| décroît lentement | pics à 1 et 2 | AR(2) |
| coupe net après k | décroît | MA(k) |
| pics à 7, 14, 21 | pic à 7 | saisonnalité hebdomadaire |

### 4.3 Tests sur la série

- **Ljung-Box** : Q = n(n + 2) Σ_{k=1..m} ρ̂_k² / (n − k) ~ χ²(m − paramètres). Sur la série brute,
  p < 0,05 signifie qu'elle a de la mémoire ; sur les résidus d'un modèle, on veut p ≥ 0,05.
- **ADF** : Δy_t = α + γ y_{t−1} + Σ δ_i Δy_{t−i} + ε ; statistique t de γ comparée aux valeurs de
  MacKinnon (−3,43 / −2,86 / −2,57) ; inférieure à −2,86 : on rejette la racine unitaire.
- **KPSS** : η = Σ S_t² / (n² σ̂²_lr), S_t somme cumulée des écarts, σ̂²_lr variance de long terme de
  Newey-West ; valeurs critiques 0,347 / 0,463 / 0,739 ; au-delà de 0,463 on rejette la
  stationnarité. ADF et KPSS se lisent ensemble :

| ADF | KPSS | Conclusion |
|---|---|---|
| rejette | ne rejette pas | stationnaire |
| ne rejette pas | rejette | racine unitaire : différencier |
| rejette | rejette | niveau qui varie lentement : modéliser la saison |
| ne rejette pas | ne rejette pas | pas assez de données |

- **Mann-Kendall** : τ de Kendall entre le temps et la série (tendance monotone).
- **Indice de dispersion des admissions** I = variance / moyenne ; (n − 1) I ~ χ²(n − 1) sous
  l'hypothèse de Poisson (les admissions d'un jour à l'autre sont peu corrélées, contrairement
  aux présents).
- **Périodogramme** : I(f) = |Σ_t (y_t − ȳ) e^{−2iπft}|² / n, période 1/f ; seuil du hasard à 95 %
  = σ² ln(K / 0,05) pour K fréquences (I(f)/σ² suit une loi exponentielle de moyenne 1 pour un
  bruit blanc).

## 5. Mathématiques E : modèles de prévision de référence

Code : `svr/references.py`, `svr/classiques.py`, `svr/series_classiques.py` (Python) et
`outil-saisie/statistiques.js` (rubrique « Modèles de prévision » de l'outil). `series_classiques.py`
reprend en Python, à l'identique, tous les modèles de l'outil pour le banc de comparaison.

**Protocole équitable avec les SVR.** Dans le banc, chaque modèle de référence est **réestimé à chaque
origine** de la validation glissante, sur les seuls jours connus ce soir-là (comme le SVR est réentraîné),
puis son état (niveau, tendance, saisons, innovations) avance jour par jour sans jamais lire le futur. Pour
être jugé sur la même perte pinball que le SVR, il reçoit des quantiles tirés de ses propres erreurs à h jours
sur l'apprentissage : q̂_τ = ŷ + Q_τ(e), e_s = y_{s+h} − ŷ_{s+h|s}, s + h ≤ O. L'ordre du SARIMA est choisi
une seule fois sur les jours d'avant la validation (meilleur BIC à (d, D) fixés, puis départage par l'erreur
sur les 20 % finaux de l'apprentissage).

### 5.1 Modèles

| Modèle | Équations |
|---|---|
| Persistance (naïf) | ŷ_{t+h} = y_t |
| Saisonnier naïf | ŷ_{t+h} = moyenne des derniers jours connus de même jour de la semaine que t + h |
| Moyenne mobile | ŷ_{t+h} = (1/k) Σ_{j=0..k−1} y_{t−j} |
| Lissage exponentiel simple | l_t = α y_t + (1 − α) l_{t−1} ; ŷ_{t+h} = l_t |
| Thêta | lissage simple + ½ b̂ (h − 1 + 1/α), b̂ pente des moindres carrés |
| Holt linéaire | l_t = α y_t + (1 − α)(l_{t−1} + b_{t−1}) ; b_t = β(l_t − l_{t−1}) + (1 − β) b_{t−1} ; ŷ_{t+h} = l_t + h b_t |
| Holt amorti | ŷ_{t+h} = l_t + (φ + φ² + … + φ^h) b_t |
| Saisonnier sans tendance | l_t = α(y_t − s_{t−7}) + (1 − α) l_{t−1} ; s_t = γ(y_t − l_t) + (1 − γ) s_{t−7} |
| Holt-Winters additif, tendance amortie (m = 7) | l_t = α(y_t − s_{t−m}) + (1 − α)(l_{t−1} + φ b_{t−1}) ; b_t = β(l_t − l_{t−1}) + (1 − β) φ b_{t−1} ; s_t = γ(y_t − l_t) + (1 − γ) s_{t−m} ; ŷ_{t+h} = l_t + Σ_{j=1..h} φ^j b_t + s_{t+h−m(k+1)}, k = ⌊(h − 1)/m⌋ |
| Holt-Winters multiplicatif | ŷ = (l + Σ φ^j b) × s |
| AR(p) | y_t = c + Σ_{i=1..p} a_i y_{t−i} + ε, moindres carrés, p choisi par AIC = n ln(SCE/n) + 2(p + 1) |
| SARIMA(p,d,q)(P,D,Q)₇ | (1 − φ(B))(1 − Φ(B⁷))(1 − B)^d (1 − B⁷)^D y_t = c + (1 + θ(B))(1 + Θ(B⁷)) ε_t |
| Régression ridge | min Σ (y_i − w·x_i − b)² + λ‖w‖² ; solution exacte (X̃ᵀX̃ + λI) w = X̃ᵀỹ, b = ȳ − x̄·w |

### 5.2 Estimation

- Lissages (outil) : minimisation de la somme des carrés des erreurs à un pas,
  SSE = Σ (y_t − ŷ_{t|t−1})², par le simplexe de **Nelder-Mead** (réflexion 1, expansion 2,
  contraction ½, réduction ½). Les paramètres α, β, γ ∈ ]0 ; 1[ sont écrits σ(u) = 1/(1 + e^{−u})
  pour optimiser sans contrainte ; φ ∈ [0,8 ; 0,98].
- Holt-Winters (Python) : initialisation sur deux semaines (l = moyenne de la 1re semaine,
  b = (moyenne 2e − moyenne 1re)/m, s_i = y_i − l), paramètres choisis par grille en minimisant
  la MAE à h jours sur l'entraînement seul.
- SARIMA : somme conditionnelle des carrés des innovations (CSS) ; paramètres passés par tanh
  (stationnarité et inversibilité approchées). Intervalle : écriture MA(∞) y = Σ ψ_j ε_{t−j},
  Var(e_h) = σ² Σ_{j<h} ψ_j², bornes ± 1,96 √Var. Recherche automatique sur 60 modèles par
  BIC = n ln σ² + k ln n à d et D égaux, puis erreur de validation.
- Intervalle naïf : y_t + quantiles des erreurs passées de la persistance e_s = y_{s+h} − y_s
  (180 derniers jours).

Si l'estimation trouve β = 0, Holt linéaire, Holt amorti et Thêta se réduisent au lissage simple :
ce n'est pas une erreur, c'est l'absence de tendance exploitable.

## 6. Vérification complète des calculs (`verification/`)

```bash
~/memoire-env/bin/python -m verification.verifier_calculs
```

Sur des **données fictives** (registre inventé de 9 mois, séries simulées), 118 contrôles, chacun « JUSTE »
ou « ÉCART », écrits dans `verification/rapport_verification.md` :

| Partie | Ce qui est comparé |
|---|---|
| A. Occupation | le **vrai code de l'outil** (`saisie.html`, exécuté par Node via `outil_node.mjs`, sans copie), la chaîne Python et un calcul « à la force brute » écrit à partir des définitions, jour par jour : trois méthodes, trois scénarios, pic de la journée, admissions, capacité de 15 puis 20 lits, taux et sureffectif |
| B. Statistiques de l'outil | chaque fonction de `statistiques.js` contre scipy, statsmodels et numpy (juges seulement) : lois (Γ, bêta, normale, Student, χ², Fisher), Wilson, descriptif complet, Pearson, Spearman, Kendall, χ² et V de Cramér, Welch, ANOVA, Kruskal-Wallis, Mann-Whitney, régression (coefficients, erreurs-types, p, R², F), Jacobi, ACP (valeurs propres, Bartlett, KMO, coordonnées), ACF, PACF, Ljung-Box, ADF, KPSS, périodogramme, métriques, Diebold-Mariano ; pour le lissage, l'AR et l'ARMA par CSS, l'optimum trouvé par l'outil est comparé à une recherche exhaustive |
| C. Cas faits à la main | séjour de 3 nuits et séjour du même jour dans les trois méthodes, sortie calculée ambiguë, Wilson 0/10 |

Node doit être installé (sous WSL, le `node.exe` de Windows est trouvé automatiquement). Seule différence
connue, voulue : l'outil prend z = 1,96 dans l'intervalle de Wilson au lieu de 1,959964 (écart sur la
5e décimale, contrôlé à part).

## 7. Outils numériques internes

Ces briques produisent toutes les p-valeurs ; elles sont écrites à la main
(`outil-saisie/statistiques.js` ; leurs équivalents Python sont dans le dépôt nera-modele, `module_lit/svr/`).

| Outil | Méthode | Sert à |
|---|---|---|
| ln Γ(x) | approximation de Lanczos (g = 7, 9 coefficients) | lois du χ², de Student, de Fisher, binomiale négative |
| gamma incomplète P(a, x) | série si x < a + 1, sinon fraction continue de Lentz | p-valeurs du χ², loi gamma |
| bêta incomplète I_x(a, b) | fraction continue | p-valeurs de Student et de Fisher |
| loi normale Φ(z) | fonction erreur | tests en z |
| quantile normal Φ⁻¹(p) | algorithme d'Acklam | droite de Henry, intervalle de Wilson |
| Student : P(|T| > t) | I_{ν/(ν+t²)}(ν/2, ½) | tests t, IC |
| χ² : P(X > x) | 1 − P(k/2, x/2) | χ², Bartlett, Ljung-Box, Jarque-Bera, log-rank |
| Fisher : P(F > f) | I_{d₂/(d₂+d₁f)}(d₂/2, d₁/2) | ANOVA, F global |
| inversion de matrice | Gauss-Jordan à pivot partiel | régression, KMO |
| valeurs propres | méthode de Jacobi | ACP |
| optimisation sans gradient | simplexe de Nelder-Mead | lissages exponentiels, SARIMA |
| nombres pseudo-aléatoires | mulberry32 à graine fixe | analyse parallèle de Horn, Monte-Carlo |
