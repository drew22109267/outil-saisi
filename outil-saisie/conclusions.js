// ═══════════════════════════════════════════════════════════════════════════════════════════
// Conclusions pour le modèle : sous chaque analyse qui décide d'un choix du modèle NERA, un encadré calculé sur
// les données saisies — Constat (ce que disent les chiffres), Décision (ce que cela change pour le modèle),
// À faire (l'action et le banc d'essai qui la vérifie). La Synthèse rassemble toutes les décisions dans un
// tableau, pour le développeur data. Module lit pour les registres d'hospitalisation, module triage pour le
// registre des urgences (passages). Les seuils sont des repères usuels, rappelés dans le texte.
// ═══════════════════════════════════════════════════════════════════════════════════════════
(function () {
  const S = window.Stat
  if (!S || typeof ONGLETS === 'undefined') return
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .ind-conclusion { margin-top: 12px; padding: 12px 14px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface); font-size: 13px; line-height: 1.55; }
  .ind-conclusion-k { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ink); }
  .ind-conclusion-k svg { color: var(--brand); }
  .ind-conclusion p { margin: 2px 0; }
  .ind-conclusion p b { color: var(--ink); }
  .ind-conclusions-masquees .ind-conclusion { display: none; }
  .ind-recap td { vertical-align: top; white-space: normal !important; }
  .ind-recap td:first-child { font-weight: 600; white-space: nowrap !important; }
  ` }))
  const ICO = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/></svg>'
  const f = (v, k = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : v.toLocaleString('fr-FR', { maximumFractionDigits: k }))
  const pv = (p) => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< 0,001' : f(p, 3))
  const moy = (t) => { const v = t.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN }
  const vari = (t) => { const v = t.filter(Number.isFinite), m = moy(v); return v.length > 1 ? v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1) : NaN }
  const sansSejours = () => typeof registre === 'function' && !registre()?.sortieCalculee
  const serieOk = (c) => c?.d && !c.d.message && c.d.presents?.length >= 28

  // ── Règles du module lit ─────────────────────────────────────────────────────────────
  const regles = [
    { t: 'Votre saisie', nom: 'Qualité de la saisie', banc: 'P1, P5', f: (c) => {
      const s = c.d?.statuts ?? {}, n = Object.values(s).reduce((a, b) => a + b, 0); if (!n) return null
      const inc = (s.inconnue ?? 0) + (s.imputee ?? 0), pInc = 100 * inc / n, trous = c.d.reglages?.manquants?.length ?? 0
      return { constat: `${f(pInc)} % des séjours sans durée connue (${inc} sur ${n}) ; ${trous} suite(s) de N° manquants.`,
        decision: pInc > 10 ? 'Les durées inconnues pèsent sur l’occupation des mois concernés : leur traitement est un vrai choix (estimées plutôt qu’exclues).' : 'Peu de durées inconnues : le traitement choisi change peu la série.',
        faire: `${trous ? 'Combler les N° manquants avant d’entraîner (un trou crée un faux creux que le modèle apprendrait). ' : ''}Lire le banc P1 (durées inconnues) et P5 (début de période).` } } },
    { t: 'Chiffres clés de l’occupation', nom: 'Niveau d’occupation', banc: 'D4', f: (c) => {
      if (!serieOk(c)) return null
      const t = c.d.lignes.at(-1), per = c.d.lignes.filter((x) => x.periode !== 'Total'), tendus = per.filter((x) => x.tom >= 85).length
      if (!c.lits) return { constat: 'Nombre de lits non indiqué.', decision: 'Le modèle prévoit des présents : il n’a pas besoin des lits, mais la lecture (taux, sureffectif) oui.', faire: 'Indiquer les lits (menu Calcul), et confirmer la date du passage de 15 à 20 lits.' }
      return { constat: `Taux d’occupation moyen ${f(t.tom)} % ; ${tendus} période(s) au-dessus de 85 % ; ${t.sur} jour(s) en sureffectif.`,
        decision: t.sur || tendus ? 'Le service connaît des jours tendus : la prévision doit viser haut, quantile τ = 0,8 (assez de lits 8 jours sur 10) et intervalle à 90 %.'
          : 'Le service n’est pas saturé en moyenne : l’intérêt du modèle est d’anticiper les pics, d’où la perte quantile plutôt que la moyenne.',
        faire: 'Choisir τ avec le service (coût d’une pénurie ÷ coût d’un lit vide) et le vérifier au banc D4 ; contrôler la couverture à 90 % au test final.' } } },
    { t: 'Occupation selon le jour de la semaine', nom: 'Rythme de la semaine', banc: 'D5', f: (c) => {
      if (!serieOk(c)) return null
      const g = Array.from({ length: 7 }, () => []); c.d.presents.forEach((v, i) => g[jourSemaine(c.d.debutNum + i)].push(v))
      const kw = S.kruskal(g.filter((x) => x.length)), m = g.map(moy), amp = Math.max(...m) - Math.min(...m)
      const fort = kw.p < 0.05 && amp >= 0.5
      return { constat: `Écart entre le jour le plus chargé et le moins chargé : ${f(amp)} présent(s) ; Kruskal-Wallis p = ${pv(kw.p)}.`,
        decision: fort ? 'Le jour de la semaine compte : garder les 7 indicatrices du jour cible.' : 'Le jour de la semaine apporte peu : ses 7 indicatrices risquent d’ajouter du bruit.',
        faire: `Banc D5 : comparer le modèle avec et sans le jour de la semaine${fort ? '' : ' (le retirer s’il n’y a pas de gain)'}.` } } },
    { t: 'Loi de Little et file d’attente (Erlang B) : contrôle et nombre de lits', nom: 'Cohérence des données (Little)', banc: 'garde-fou', f: (c) => {
      if (!serieOk(c) || !c.d.sorties?.length) return null
      const so = c.d.sorties, w = so.reduce((a, s) => a + s.poids, 0); if (!w) return null
      const comp = c.d.reglages?.comptage, h = c.d.reglages?.heures
      let W = so.reduce((a, s) => a + s.poids * s.nuits, 0) / w
      if (comp === 'journee') W += 1; else if (comp === 'pondere' && h) W += h.b - h.a
      const L = moy(c.d.presents), lam = moy(c.d.adm), ec = 100 * (L - lam * W) / (lam * W)
      return { constat: `Présents moyens ${f(L, 2)} ; admissions par jour × durée moyenne = ${f(lam, 2)} × ${f(W, 2)} = ${f(lam * W, 2)} ; écart ${f(ec)} %.`,
        decision: Math.abs(ec) <= 10 ? 'Écart de moins de 10 % : la série d’occupation est cohérente avec les flux, elle peut être apprise.' : 'Écart de plus de 10 % : des sorties manquent ou des dates sont fausses ; le modèle apprendrait une série biaisée.',
        faire: Math.abs(ec) <= 10 ? 'Rien à corriger ; citer ce contrôle dans la méthodologie.' : 'Revoir les avertissements (dates incohérentes, trous) et le rodage avant d’entraîner.' } } },
    { t: 'Autocorrélation (ACF)', nom: 'Mémoire de la série', banc: 'D5', f: (c) => {
      if (!serieOk(c)) return null
      const x = c.d.presents, r = S.acf(x, 21), b = 1.96 / Math.sqrt(x.length)
      const sig = r.slice(1).filter((v) => Math.abs(v) > b).length, pic7 = r[7] > b && r[7] > r[6] && r[7] > r[8]
      return { constat: `Corrélation avec la veille ${f(r[1], 2)}, avec 7 jours avant ${f(r[7], 2)} ; ${sig} retard(s) sur 21 au-dessus du seuil ±${f(b, 2)}.`,
        decision: `${r[1] > 0.5 ? 'Mémoire forte : l’occupation des jours précédents est la variable principale du modèle.' : 'Mémoire modérée : les retards seuls ne suffiront pas, les flux et le calendrier compteront.'}${pic7 ? ' Pic à 7 jours : rythme de la semaine, garder le retard J−7.' : ''}`,
        faire: 'Garder les 7 derniers jours d’occupation ; le banc D5 compare 3, 7 et 14 retards.' } } },
    { t: 'Autocorrélation partielle (PACF)', nom: 'Nombre de retards', banc: 'D5', f: (c) => {
      if (!serieOk(c)) return null
      const x = c.d.presents, p = S.pacf(x, 21), b = 1.96 / Math.sqrt(x.length)
      const sig = p.map((v, k) => (k && Math.abs(v) > b ? k : 0)).filter(Boolean), dernier = sig.filter((k) => k <= 14).at(-1) ?? 0
      return { constat: `Retards à effet propre significatif : ${sig.length ? sig.slice(0, 8).join(', ') : 'aucun'}.`,
        decision: dernier <= 3 ? 'L’effet propre s’arrête vite : 3 retards pourraient suffire ; la série ressemble à un AR(1) ou AR(2).'
          : dernier <= 7 ? 'Effet propre jusqu’à une semaine : 7 retards (choix retenu) couvrent la mémoire.' : 'Effet propre au-delà d’une semaine : tester 14 retards.',
        faire: `Banc D5 (3, 7, 14 retards) ; pour les références, l’AR choisit son ordre par AIC (ordre attendu proche de ${Math.max(1, Math.min(dernier, 14))}).` } } },
    { t: 'Série étudiée et tests de stationnarité', nom: 'Stationnarité', banc: 'D7', f: (c) => {
      if (!serieOk(c)) return null
      const a = S.adf(c.d.presents), k = S.kpss(c.d.presents); if (!a || !k) return null
      const rA = a.stat < -2.86, rK = k.stat > 0.463
      const cas = rA && !rK ? 'stationnaire' : !rA && rK ? 'non stationnaire (marche aléatoire)' : rA && rK ? 'sans racine unitaire, mais avec un niveau qui varie lentement (saison, tendance)' : 'indéterminée (pas assez de données)'
      return { constat: `ADF ${f(a.stat, 2)} (seuil −2,86) ; KPSS ${f(k.stat, 3)} (seuil 0,463) : série ${cas}.`,
        decision: !rA && rK ? 'Différencier pour SARIMA (d = 1) ; pour le SVR, la validation glissante et un apprentissage récent comptent.'
          : rA && rK ? 'Pas de différenciation (d = 0) ; modéliser le niveau lent par le mois (codé sur un cercle) et réapprendre régulièrement.' : 'Pas de différenciation ; le modèle peut apprendre la série telle quelle.',
        faire: 'Banc D7 : fenêtre complète contre 365, 180 ou 90 derniers jours ; réapprentissage mensuel au test final.' } } },
    { t: 'Tendance, saisonnalité et dispersion (tests)', nom: 'Dispersion et tendance', banc: 'D4, D7', f: (c) => {
      if (!serieOk(c)) return null
      const a = c.d.adm, I = vari(a) / moy(a), kd = S.kendall(c.d.presents.map((_, i) => i), c.d.presents)
      return { constat: `Indice de dispersion des admissions ${f(I, 2)} (1 = arrivées au hasard) ; tendance de Mann-Kendall τ = ${f(kd.tau, 2)}, p = ${pv(kd.p)}.`,
        decision: `${I > 1.2 ? 'Admissions par vagues (surdispersion) : la moyenne ne suffit pas, le quantile élevé et l’intervalle sont nécessaires.' : 'Admissions proches du hasard : une loi de Poisson décrit bien les arrivées.'}${kd.p < 0.05 ? ' Tendance significative : les années ne se ressemblent pas, préférer un apprentissage récent.' : ''}`,
        faire: 'Banc D4 (τ) ; banc D7 (fenêtre d’apprentissage).' } } },
    { t: 'Corrélation croisée : admissions → présents', nom: 'Durée d’effet d’une admission', banc: 'D5', f: (c) => {
      if (!serieOk(c)) return null
      const r = S.ccf(c.d.adm, c.d.presents, 14), b = 1.96 / Math.sqrt(c.d.presents.length)
      let k = 0; while (k + 1 < r.length && r[k + 1] > b) k++
      return { constat: `Une admission reste liée à l’occupation pendant ${k} jour(s) environ (corrélation au-dessus de ${f(b, 2)}).`,
        decision: k <= 3 ? 'Les admissions des 3 derniers jours portent l’essentiel : variable « admissions 3 j » justifiée.' : k <= 7 ? 'Effet jusqu’à une semaine : garder « admissions 3 j » et « admissions 7 j ».' : 'Effet au-delà d’une semaine : tester les admissions des 14 derniers jours.',
        faire: 'Banc D5 : avec et sans les variables de flux.' } } },
    { t: 'Jours fériés et vacances scolaires : effet sur les admissions', nom: 'Jours fériés', banc: 'D5', f: (c) => {
      if (!serieOk(c) || typeof ferieDe !== 'function') return null
      const a = c.d.adm, deb = c.d.debutNum, parJour = Array.from({ length: 7 }, () => [])
      a.forEach((v, i) => { if (!ferieDe(deb + i)) parJour[jourSemaine(deb + i)].push(v) })
      const ref = parJour.map(moy), fer = a.map((v, i) => (ferieDe(deb + i) ? [v, ref[jourSemaine(deb + i)]] : null)).filter(Boolean)
      if (!fer.length) return { constat: 'Aucun jour férié dans la période calculée.', decision: 'Impossible de juger l’effet des fériés.', faire: 'Ne pas mettre la variable « férié » tant qu’il n’y a pas assez de fériés.' }
      const ratio = fer.reduce((s, x) => s + x[0], 0) / fer.reduce((s, x) => s + x[1], 0)
      return { constat: `${fer.length} jour(s) férié(s) ; admissions observées ÷ attendues (même jour de la semaine) = ${f(ratio, 2)}.`,
        decision: fer.length < 8 ? 'Trop peu de fériés pour que le modèle apprenne leur effet : la variable « férié » risque d’être inutile.' : Math.abs(ratio - 1) >= 0.15 ? 'Effet net des fériés : garder la variable « jour cible férié ».' : 'Effet faible des fériés.',
        faire: 'Banc D5 : avec et sans fériés et vacances ; ne garder que s’il y a un gain.' } } },
    { t: 'Comparaison des modèles sur la période de validation', nom: 'Barre à battre', banc: 'D1', f: (c) => {
      if (!serieOk(c)) return null
      const y = c.d.presents, n = y.length, d0 = Math.max(14, Math.floor(n * 0.8))
      const err = (p) => moy(y.slice(d0).map((v, i) => Math.abs(v - p(d0 + i))))
      const mm7 = (t) => moy(y.slice(t - 7, t))
      const refs = [['persistance (demain = aujourd’hui)', err((t) => y[t - 1])], ['saisonnier naïf (même jour, 7 jours avant)', err((t) => y[t - 7])], ['moyenne mobile 7 jours', err(mm7)]].sort((p, q) => p[1] - q[1])
      return { constat: `Sur les ${n - d0} derniers jours, la meilleure référence simple est la ${refs[0][0]}, avec une erreur moyenne de ${f(refs[0][1], 2)} présent(s).`,
        decision: `C’est la barre à battre : un modèle plus complexe (SVR, lissages, SARIMA, concurrents) n’est retenu que s’il fait significativement mieux (Diebold-Mariano p < 0,05).`,
        faire: 'Banc D1 du dépôt nera-modele (23 modèles) ; garder le plus simple parmi ceux qui ne sont pas significativement moins bons.' } } },
    { t: 'Pic de la journée : plus grand nombre d’enfants présents en même temps', nom: 'Dimensionnement', banc: 'lecture', f: (c) => {
      if (!serieOk(c) || !c.d.picHaut?.length) return null
      const ecart = moy(c.d.picHaut) - moy(c.d.presents)
      return { constat: `Le pic de la journée dépasse le recensement en moyenne de ${f(Math.max(0, ecart), 1)} enfant(s) au plus.`,
        decision: 'Pour dimensionner les lits, raisonner sur le pic (le matin, avant les sorties) et non sur la moyenne ; le modèle prévoit le recensement, la marge du quantile τ couvre une partie de cet écart.',
        faire: 'Présenter au service le taux moyen ET le pic ; vérifier avec les heures habituelles (rubrique horaire).' } } },
    { t: 'Variables numériques journalières', nom: 'Forme de la distribution', banc: 'choix du SVR', f: (c) => {
      if (!serieOk(c)) return null
      const d = S.descriptif(c.d.presents)
      return { constat: `Asymétrie ${f(d.asymetrie, 2)} ; Jarque-Bera p = ${pv(d.pJb)}.`,
        decision: d.pJb < 0.05 ? 'L’occupation n’est pas normale : un modèle sans hypothèse de loi (SVR, perte quantile) est justifié face à une régression classique.' : 'Distribution proche de la normale : les modèles linéaires classiques restent de bonnes références.',
        faire: 'Citer ce test pour justifier le SVR dans la méthodologie.' } } },
  ]

  // ── Règles du module triage (registre des urgences) ─────────────────────────────────
  const reglesTriage = [
    { t: 'Votre saisie', nom: 'Variables de triage disponibles', banc: 'T4', f: () => {
      const L = lignesService(), n = L.length; if (!n) return null
      const cst = [['temperature', 'température'], ['pouls', 'pouls'], ['ta', 'tension'], ['glycemie', 'glycémie'], ['fr', 'fréquence respiratoire'], ['spo2', 'SpO2'], ['poids', 'poids']].filter(([k]) => aCol(k))
      const part = cst.map(([k, l]) => [l, 100 * L.filter((x) => String(x[k] ?? '').trim()).length / n])
      const ok = part.filter((p) => p[1] >= 50).map((p) => p[0]), faibles = part.filter((p) => p[1] < 50).map((p) => p[0])
      return { constat: `Constantes écrites dans au moins la moitié des passages : ${ok.join(', ') || 'aucune'}${faibles.length ? ` ; trop rares : ${faibles.join(', ')}` : ''}.`,
        decision: ok.length ? 'Ces constantes peuvent porter le modèle de triage ; les plus rares entrent seulement avec une indicatrice « non mesurée ».' : 'Pas assez de constantes écrites : le modèle de triage reposerait sur les plaintes et l’âge seulement.',
        faire: 'Banc T4 : constantes seules, + plaintes, + contexte, + indicatrices de valeurs manquantes.' } } },
    { t: 'Patients et qualité des soins', nom: 'Cible du triage', banc: 'T1, T6', f: () => {
      const L = lignesService(), o = L.map(issueUrg), n = L.length; if (!n) return null
      const grave = o.filter((x) => ['Hospitalisé', 'Référé', 'Décédé'].includes(x)).length, ext = o.filter((x) => x === 'Externe').length, meo = o.filter((x) => x === 'MEO').length
      const ages = L.map((l) => ageEnMois(l.age)).filter((a) => a !== null), enf = ages.filter((a) => a < 180).length
      return { constat: `${grave} passage(s) « graves » (hospitalisé, référé, décédé), ${ext} externe(s), ${meo} mise(s) en observation ; ${enf} enfant(s) et ${ages.length - enf} adulte(s) d’âge connu.`,
        decision: `${grave < 100 ? 'Moins de 100 graves : trop peu pour un modèle fiable, continuer la saisie. ' : 'Assez de graves pour apprendre. '}Enfants et adultes : deux modèles séparés. La mise en observation est un cas intermédiaire à placer (grave, non grave ou exclue).`,
        faire: 'Banc T1 (place de la MEO) ; banc T6 (enfants et adultes séparés) ; coût C₊/C₋ fixé avec le service (banc T3).' } } },
  ]

  const bloc = (r) => r ? `<div class="ind-conclusion"><div class="ind-conclusion-k">${ICO}Conclusion pour le modèle</div><p><b>Constat :</b> ${r.constat}</p><p><b>Décision :</b> ${r.decision}</p><p><b>À faire :</b> ${r.faire}</p></div>` : ''
  const actives = () => (sansSejours() ? reglesTriage : regles)
  const premiereVariante = (c) => !cacheIndicateurs?.variantes || c.d === cacheIndicateurs.variantes[0].d

  // Encadré sous chaque analyse concernée (une seule fois en mode « toutes les méthodes »).
  for (const o of ONGLETS) for (const sec of o.sections ?? []) {
    if (!regles.some((r) => r.t === sec.t) && !reglesTriage.some((r) => r.t === sec.t)) continue
    const rendre0 = sec.rendre
    sec.rendre = (c, W, H) => {
      const res = rendre0(c, W, H)
      const regle = actives().find((r) => r.t === sec.t)
      if (res && regle && premiereVariante(c)) { try { res.html = (res.html ?? '') + bloc(regle.f(c)) } catch { /* une conclusion ne doit jamais casser la rubrique */ } }
      return res
    }
  }

  // Rubrique récapitulative de la Synthèse : toutes les décisions, en un tableau.
  const syn = ONGLETS.find((o) => o.nom === 'Synthèse')
  syn?.sections.push({ t: 'Conclusions pour le modèle : ce que les analyses décident', rendre: (c) => {
    const lignes = actives().map((r) => { let x = null; try { x = r.f(c) } catch { x = null } return x && [r.nom, x.constat, x.decision, x.faire, r.banc] }).filter(Boolean)
    if (!lignes.length) return { html: '<div class="alert info" style="display:block">Pas encore assez de données pour conclure.</div>' }
    return { html: `<div class="table-wrap ind-recap"><table class="table"><thead><tr><th>Analyse</th><th>Constat</th><th>Décision pour le modèle</th><th>À faire</th><th>Banc</th></tr></thead><tbody>${lignes.map((l) => `<tr>${l.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
      lecture: `chaque ligne résume une analyse de l’outil et ce qu’elle décide pour le modèle NERA (${sansSejours() ? 'module triage' : 'module lit'}). Les « bancs » sont les comparaisons du dépôt nera-modele qui vérifient chaque choix sur des jours jamais vus (D : choix du modèle ; P : prétraitement ; T : triage). Une décision n’est définitive qu’une fois confirmée par son banc. Le détail de chaque modèle et de chaque décision est dans le guide des modèles.` }
  } })

  // Menu Affichage : afficher ou masquer les conclusions.
  const pop = document.getElementById('popAffichage')
  if (pop && !document.getElementById('indConclusions')) {
    const lab = Object.assign(document.createElement('label'), { className: 'ind-case', title: 'Afficher sous les analyses l’encadré « Conclusion pour le modèle »' })
    lab.innerHTML = '<input type="checkbox" id="indConclusions">Conclusions pour le modèle'
    pop.appendChild(lab)
    const cb = lab.querySelector('input'), zone = () => document.getElementById('vueIndicateurs')
    const appliquer = () => { cb.checked = etat.indConclusions !== false; zone()?.classList.toggle('ind-conclusions-masquees', !cb.checked); document.getElementById('indModal')?.classList.toggle('ind-conclusions-masquees', !cb.checked) }
    cb.addEventListener('change', () => { etat.indConclusions = cb.checked; sauver(); appliquer() })
    appliquer()
  }
})()
