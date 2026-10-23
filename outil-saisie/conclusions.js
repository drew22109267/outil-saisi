// ═══════════════════════════════════════════════════════════════════════════════════════════
// Conclusions pour le modèle : sous CHAQUE analyse des Indicateurs, un encadré calculé sur les données saisies, en
// quatre temps :
//   · Constat            — ce que disent les chiffres de l'analyse ;
//   · Ce que cela signifie — leur sens, en clair (pour le service comme pour le mémoire) ;
//   · Décision pour le modèle — ce que cela change pour NERA (module lit : prévision des présents par le SVR ;
//     module triage : classement grave / non grave des passages aux urgences) ;
//   · Démarche à suivre  — quoi faire selon le résultat (si… alors… ; sinon…) et le banc d'essai qui le vérifie.
// La Synthèse rassemble toutes les conclusions dans un tableau. Les seuils sont des repères usuels, rappelés dans
// le texte. Bancs du dépôt nera-modele : D1 à D9 (choix du modèle), P1 à P8 (prétraitement), T1 à T6 (triage).
// Une analyse qui transmet ses chiffres (res.mesures) est conclue sans refaire ses calculs (simulations).
// ═══════════════════════════════════════════════════════════════════════════════════════════
(function () {
  const S = window.Stat
  if (!S || typeof ONGLETS === 'undefined') return
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .ind-conclusion { margin-top: 12px; padding: 12px 14px; border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface); font-size: 13px; line-height: 1.55; }
  .ind-conclusion-k { display: flex; align-items: center; gap: 7px; margin-bottom: 6px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--ink); }
  .ind-conclusion-k svg { color: var(--brand); }
  .ind-conclusion p { margin: 3px 0; }
  .ind-conclusion p b { color: var(--ink); }
  .ind-conclusions-masquees .ind-conclusion { display: none; }
  .ind-recap td { vertical-align: top; white-space: normal !important; min-width: 160px; }
  .ind-recap td:first-child { font-weight: 600; white-space: nowrap !important; min-width: 0; }
  ` }))
  const ICO = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.2"/></svg>'
  const f = (v, k = 1) => (v === null || v === undefined || !Number.isFinite(v) ? '—' : (Math.round(v * 10 ** k) / 10 ** k || 0).toLocaleString('fr-FR', { maximumFractionDigits: k }))
  const pv = (p) => (!Number.isFinite(p) ? '—' : p < 0.001 ? '< 0,001' : f(p, 3))
  const pe = (p) => (!Number.isFinite(p) ? '= —' : p < 0.001 ? '< 0,001' : `= ${f(p, 3)}`)   // « p = 0,012 » ou « p < 0,001 »
  const moy = (t) => { const v = t.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN }
  const vari = (t) => { const v = t.filter(Number.isFinite), m = moy(v); return v.length > 1 ? v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1) : NaN }
  const med = (t) => { const v = t.filter(Number.isFinite).sort((a, b) => a - b); return v.length ? (v[(v.length - 1) >> 1] + v[v.length >> 1]) / 2 : NaN }
  const liste = (t) => (t.length > 1 ? `${t.slice(0, -1).join(', ')} et ${t.at(-1)}` : t[0] ?? '')
  const sansSejours = () => typeof registre === 'function' && !registre()?.sortieCalculee
  const triage = () => sansSejours()
  const unite = () => (triage() ? 'passages' : 'patients')
  const serieOk = (c) => c?.d && !c.d.message && c.d.presents?.length >= 28
  // Taille d'effet : ε² ou η² (0,01 petit, 0,06 moyen, 0,14 grand) ; r ou V (0,1 / 0,3 / 0,5).
  const effetE = (e) => (!Number.isFinite(e) ? '—' : e < 0.01 ? 'négligeable' : e < 0.06 ? 'petit' : e < 0.14 ? 'moyen' : 'grand')
  const forceR = (r) => { const a = Math.abs(r); return !Number.isFinite(a) ? '—' : a < 0.1 ? 'négligeable' : a < 0.3 ? 'faible' : a < 0.5 ? 'modéré' : a < 0.7 ? 'fort' : 'très fort' }
  // Correction de Holm (comparaisons multiples) : nombre de tests qui restent significatifs à 5 %.
  const holm = (ps) => { const t = ps.filter(Number.isFinite).sort((a, b) => a - b); let k = 0; while (k < t.length && t[k] <= 0.05 / (t.length - k)) k++; return k }

  // ════════════════════════════════════════════════════════════════════════════════════════
  // Règles communes aux deux modules (statistiques des patients ou des passages)
  // ════════════════════════════════════════════════════════════════════════════════════════
  const communes = [
    { t: 'Variables numériques des patients', nom: 'Qualité des variables mesurées', banc: () => (triage() ? 'T4, T5' : 'description'), f: (c) => {
      const vars = c.pat.num.filter((v) => !v.bin); if (!vars.length) return null
      const n = c.pat.n, d = vars.map((v) => ({ v, d: S.descriptif(v.x) }))
      const peu = d.filter((e) => e.d.n < 0.5 * n).map((e) => e.v.nom), nonNorm = d.filter((e) => e.d.pJb < 0.05)
      const atyp = d.filter((e) => e.d.aberrants > 0).sort((a, b) => b.d.aberrants - a.d.aberrants).slice(0, 3).map((e) => `${e.v.nom} (${e.d.aberrants})`)
      return { constat: `${vars.length} variable(s) mesurée(s) sur ${n} ${unite()} ; renseignées dans moins de la moitié des lignes : ${peu.length ? liste(peu) : 'aucune'} ; ${nonNorm.length} sur ${vars.length} ne suivent pas une loi normale (Jarque-Bera p < 0,05) ; valeurs atypiques surtout dans : ${atyp.length ? liste(atyp) : 'aucune'}.`,
        sens: 'Une variable peu renseignée ne représente que les patients chez qui on l’a mesurée (souvent les plus graves) ; une loi non normale se résume par la médiane et l’intervalle interquartile, pas par la moyenne ; une valeur atypique est soit un vrai cas extrême, soit une erreur de recopie.',
        decision: triage() ? 'Module triage : une constante renseignée dans au moins la moitié des passages entre dans le modèle (valeur manquante remplacée par la médiane apprise sur l’entraînement, plus une indicatrice « non mesurée ») ; une constante plus rare n’entre qu’avec son indicatrice. Les valeurs impossibles sont écartées par les bornes de plausibilité de la lecture du registre ; la standardisation est apprise sur l’entraînement seul.'
          : 'Module lit : ces variables décrivent les patients mais n’entrent pas dans le SVR, qui prévoit le nombre de présents jour par jour. La durée de séjour compte indirectement : elle fixe combien de jours d’admissions passées le modèle reçoit.',
        faire: `${atyp.length ? 'Vérifier sur les photos les valeurs atypiques citées (une erreur se corrige dans la saisie, un vrai cas extrême se garde). ' : ''}Dans le mémoire : médiane [Q1 ; Q3] pour les variables non normales, moyenne ± écart-type pour les autres.${triage() ? ' Banc T4 (avec et sans indicatrices de valeurs manquantes) et T5 (constantes brutes, écart à la norme de l’âge, seuils d’alerte).' : ''}` } } },
    { t: 'Distribution d’une variable', nom: 'Forme d’une variable', banc: () => (triage() ? 'T5' : 'D6'), f: (c) => {
      const o = optionsNum(c, true); if (!o.length) return null
      const v = trouverVar(c, o.some(([k]) => k === c.opts.varDist) ? c.opts.varDist : o[0][0]), d = S.descriptif(v.x); if (!d.n) return null
      const asy = d.asymetrie, forme = Math.abs(asy) < 0.5 ? 'à peu près symétrique' : asy > 0 ? 'étirée vers les grandes valeurs (queue à droite)' : 'étirée vers les petites valeurs (queue à gauche)'
      return { constat: `${v.nom} : n = ${d.n}, moyenne ${f(d.moyenne, 2)}, médiane ${f(d.mediane, 2)} ; distribution ${forme} (asymétrie ${f(asy, 2)}) ; normalité ${d.pJb < 0.05 ? 'rejetée' : 'non rejetée'} (Jarque-Bera p ${pe(d.pJb)}) ; ${d.aberrants} valeur(s) atypique(s).`,
        sens: d.pJb < 0.05 ? `La variable ne suit pas une loi normale : la moyenne ${Math.abs(d.moyenne - d.mediane) > 0.1 * Math.abs(d.mediane || 1) ? 'est tirée par les valeurs extrêmes et s’écarte de la médiane' : 'reste proche de la médiane, mais les extrêmes sont plus fréquents que prévu'} ; les tests sur les rangs (Mann-Whitney, Kruskal-Wallis, Spearman) sont les bons outils.`
          : 'La variable est compatible avec une loi normale : moyenne, écart-type, test t et corrélation de Pearson sont utilisables.',
        decision: Math.abs(asy) > 1 ? 'Variable très asymétrique : si elle sert d’entrée à un modèle, la passer en log(1 + x) ou la standardiser de façon robuste, sinon quelques valeurs extrêmes dominent la distance utilisée par le noyau RBF.'
          : 'Forme sans difficulté : la standardisation habituelle (centrer, réduire) suffit avant le modèle.',
        faire: `Si p < 0,05 : décrire par la médiane et comparer les groupes par des tests sur les rangs ; sinon, moyenne et tests paramétriques. Si des atypiques apparaissent sur la boîte à moustaches, les vérifier un par un sur la photo. ${triage() ? 'Banc T5 : constantes brutes contre écart à la norme de l’âge.' : 'Banc D6 : avec et sans standardisation.'}` } } },
    { t: 'Variables qualitatives : effectifs et proportions', nom: 'Modalités rares', banc: () => (triage() ? 'T4' : 'description'), f: (c) => {
      const q = c.pat.quali; if (!q.length) return null
      const info = q.map((v) => { const cnt = {}; let n = 0; for (const e of v.x) if (e !== null) { cnt[e] = (cnt[e] ?? 0) + 1; n++ } const rares = Object.values(cnt).filter((k) => k < 0.05 * n).length; return { v, n, manq: v.x.length - n, rares, mods: Object.keys(cnt).length, mode: Object.entries(cnt).sort((a, b) => b[1] - a[1])[0] } })
      const manq = info.filter((e) => e.manq > 0.2 * e.v.x.length).map((e) => `${e.v.nom} (${Math.round(100 * e.manq / e.v.x.length)} %)`), rares = info.filter((e) => e.rares).map((e) => `${e.v.nom} (${e.rares})`)
      return { constat: `${q.length} variable(s) qualitative(s). Plus de 20 % de lignes sans valeur : ${manq.length ? liste(manq) : 'aucune'}. Modalités rares (moins de 5 % des lignes) : ${rares.length ? liste(rares) : 'aucune'}.`,
        sens: 'Une proportion n’est fiable que si son intervalle de Wilson est étroit ; une modalité rare donne un intervalle très large et ne permet aucune comparaison. Beaucoup de valeurs manquantes peuvent signifier que la colonne n’est remplie que dans certains cas, ce qui biaise les proportions.',
        decision: triage() ? 'Module triage : les plaintes sont regroupées en 18 familles fixes et le contexte (moment de la garde, jour) en peu de modalités, justement pour éviter des catégories rares que le modèle ne pourrait pas apprendre.'
          : 'Module lit : ces variables ne sont pas des entrées du SVR (sauf le calendrier : jour, férié, vacances, mois) ; elles servent à décrire le service et à expliquer les durées de séjour.',
        faire: 'Regrouper les modalités rares (« Autres ») avant tout test du khi-deux ou tout encodage ; si une colonne est très incomplète, le dire dans les limites du mémoire plutôt que de l’interpréter.' } } },
    { t: 'Comparaison d’une variable entre groupes', nom: 'Différence entre groupes', banc: () => (triage() ? 'T4, T6' : 'description'), f: (c) => {
      const nums = c.pat.num.filter((v) => !v.bin), qual = c.pat.quali; if (!nums.length || !qual.length) return null
      const v = nums.find((e) => e.k === c.opts.grpVar) ?? nums[0], q = qual.find((e) => e.k === c.opts.grpPar) ?? qual[0], t = testsDeGroupes(v.x, q.x); if (!t) return null
      const p = t.deux ? t.deux.mw.p : t.kw.p, e = t.deux ? t.deux.mw.r : t.kw.epsilon2, nomE = t.deux ? `r = ${f(e, 2)} (${forceR(e)})` : `ε² = ${f(e, 3)} (${effetE(e)})`
      const meds = t.noms.map((nm, i) => [nm, med(t.listes[i])]).sort((a, b) => b[1] - a[1])
      return { constat: `${v.nom} selon ${q.nom} : ${t.noms.length} groupes, ${t.n} lignes ; ${t.deux ? 'Mann-Whitney' : 'Kruskal-Wallis'} p ${pe(p)}, taille d’effet ${nomE} ; médiane la plus haute : ${meds[0][0]} (${f(meds[0][1], 1)}), la plus basse : ${meds.at(-1)[0]} (${f(meds.at(-1)[1], 1)}).`,
        sens: p < 0.05 ? `Les groupes diffèrent réellement (le hasard seul l’expliquerait dans moins de 5 % des cas) ; l’effet est ${t.deux ? forceR(e) : effetE(e)}${(t.deux ? e < 0.1 : e < 0.01) ? ' : significatif mais sans portée pratique' : ''}.` : 'Rien ne prouve une différence : l’écart observé peut venir du hasard. Ce n’est pas la preuve que les groupes sont identiques, surtout avec de petits effectifs.',
        decision: p < 0.05 && (t.deux ? e >= 0.1 : e >= 0.01) ? `« ${q.nom} » sépare bien « ${v.nom} » : ${triage() ? 'si cette variable est connue dès l’arrivée, c’est un bon candidat d’entrée du modèle de triage.' : 'à citer pour expliquer les durées ou la charge en lits (case-mix).'}`
          : `« ${q.nom} » n’apporte pas d’information nette sur « ${v.nom} » : pas de raison d’en faire une entrée ou une stratification à partir de ce seul croisement.`,
        faire: 'Changer les deux listes pour passer en revue les croisements utiles (âge, durée, constantes selon l’issue, la cause, le sexe) ; ne retenir que ceux qui sont à la fois significatifs et d’effet au moins petit ; vérifier le classement global dans « Tests de comparaison de groupes ».' } } },
    { t: 'Matrice de corrélation — patients', nom: 'Variables redondantes', banc: () => (triage() ? 'T4' : 'description'), f: (c) => {
      const vars = c.pat.num; if (vars.length < 2) return null
      const m = c.opts.corr || 'spearman', paires = []
      for (let i = 0; i < vars.length; i++) for (let j = i + 1; j < vars.length; j++) { const r = correler(m, vars[i].x, vars[j].x); if (Number.isFinite(r.r)) paires.push({ a: vars[i].nom, b: vars[j].nom, ...r }) }
      if (!paires.length) return null
      const red = paires.filter((p) => Math.abs(p.r) >= 0.7 && p.p < 0.05).map((p) => `${p.a} / ${p.b} (${f(p.r, 2)})`)
      const cible = vars.find((v) => v.k === (triage() ? 'grave' : 'duree')), liens = cible ? paires.filter((p) => (p.a === cible.nom || p.b === cible.nom) && p.p < 0.05).sort((a, b) => Math.abs(b.r) - Math.abs(a.r)).slice(0, 3).map((p) => `${p.a === cible.nom ? p.b : p.a} (${f(p.r, 2)})`) : []
      return { constat: `${paires.length} paires calculées ; liens très forts (|r| ≥ 0,7) : ${red.length ? liste(red) : 'aucun'}.${cible ? ` Variables les plus liées à « ${cible.nom} » : ${liens.length ? liste(liens) : 'aucune de façon significative'}.` : ''}`,
        sens: 'Deux variables très corrélées disent presque la même chose ; une variable liée à l’issue (ou à la durée) est un indice utile, mais une corrélation ne prouve pas une cause et ne mesure qu’un lien monotone.',
        decision: triage() ? `Module triage : ${red.length ? 'les paires redondantes alourdissent la régression logistique (coefficients instables) sans gêner la forêt ni le SVM ; en garder une par paire dans la version logistique.' : 'pas de redondance forte : toutes les constantes peuvent entrer ensemble.'} Les variables liées à l’issue grave sont les premières à tester.`
          : 'Module lit : diagnostic descriptif des patients ; le SVR travaille sur les variables journalières (matrice suivante).',
        faire: 'Si |r| ≥ 0,7 : retirer l’une des deux variables d’un modèle linéaire (ou vérifier son VIF dans la régression) ; sinon, garder les deux. Lire les liens avec l’issue avec la force, pas seulement les étoiles.' } } },
    { t: 'Matrice de corrélation — variables journalières', nom: 'Mémoire journalière', banc: 'D5', f: (c) => {
      const J = c.jour; if (!J.length) return null
      const v = (k) => J.find((e) => e.k === k), y = v('presents') ?? v('arr'); if (!y) return null
      const cand = (y.k === 'presents' ? ['p1', 'p7', 'a1', 'am7', 'we'] : ['a1', 'a7', 'am7', 'we']).map(v).filter(Boolean)
      const r = cand.map((e) => ({ nom: e.nom, ...S.pearson(y.x, e.x) })).filter((e) => Number.isFinite(e.r)).sort((a, b) => Math.abs(b.r) - Math.abs(a.r))
      if (!r.length) return null
      return { constat: `Corrélation de « ${y.nom} » avec : ${r.map((e) => `${e.nom} ${f(e.r, 2)}${e.p < 0.05 ? '' : ' (n.s.)'}`).join(' ; ')}.`,
        sens: y.k === 'presents' ? 'Plus la corrélation avec la veille est proche de 1, plus l’occupation d’aujourd’hui se déduit de celle d’hier : la série a de la mémoire, donc elle est prévisible.' : 'Les arrivées d’un jour ressemblent peu ou beaucoup à celles de la veille et de la semaine précédente : c’est leur degré de prévisibilité.',
        decision: y.k === 'presents' ? `Module lit : ${r[0].r > 0.7 ? 'les retards d’occupation sont les entrées principales du SVR (7 derniers jours)' : 'la mémoire est modérée, les admissions récentes et le calendrier doivent compléter les retards'}.`
          : 'Module triage : l’affluence du jour n’est pas une entrée du modèle de triage (il classe chaque passage) ; elle sert à décrire la charge des urgences.',
        faire: 'Banc D5 : comparer le modèle avec et sans chaque groupe de variables (retards, flux, calendrier) ; ne garder un groupe que s’il réduit l’erreur sur des jours jamais vus.' } } },
    { t: 'Toutes les paires de variables, classées par force du lien', nom: 'Faux positifs possibles', banc: 'lecture', f: (c) => {
      const ps = [], fortes = []
      for (const vars of [c.pat.num, c.jour]) for (let i = 0; i < vars.length; i++) for (let j = i + 1; j < vars.length; j++) {
        if (!pairesSuffisantes(vars[i].x, vars[j].x)) continue
        const p = S.pearson(vars[i].x, vars[j].x); if (!Number.isFinite(p.p)) continue
        ps.push(p.p); if (p.p < 0.05 && Math.abs(p.r) >= 0.3) fortes.push(`${vars[i].nom} / ${vars[j].nom}`)
      }
      if (!ps.length) return null
      const sig = ps.filter((p) => p < 0.05).length, h = holm(ps)
      return { constat: `${ps.length} paires testées : ${sig} significatives à 5 %, dont ${h} le restent après correction de Holm ; environ ${Math.round(0.05 * ps.length)} seraient significatives par pur hasard. Liens au moins modérés (|r| ≥ 0,3) : ${fortes.length}.`,
        sens: 'Plus on fait de tests, plus on trouve de liens « significatifs » par hasard. La correction de Holm garde seulement ceux qui résistent à ce grand nombre de tests ; un lien faible (|r| < 0,3) peut être significatif sans aucune portée pratique.',
        decision: 'Seuls les liens à la fois robustes à la correction de Holm et au moins modérés sont présentés comme résultats ; les autres sont des pistes.',
        faire: `Dans le mémoire, annoncer le nombre de tests et la correction utilisée ; citer en priorité les ${Math.min(h, fortes.length) || 'quelques'} liens qui passent les deux filtres, et les relier à une explication clinique ou organisationnelle.` } } },
    { t: 'Nuage de points et droite de régression', nom: 'Forme d’un lien', banc: () => (triage() ? 'T2' : 'D2'), f: (c) => {
      const o = optionsNum(c, false); if (o.length < 2) return null
      const kx = o.some(([k]) => k === c.opts.nuX) ? c.opts.nuX : o[0][0], ky = o.some(([k]) => k === c.opts.nuY) ? c.opts.nuY : o[1][0]
      if (kx[0] !== ky[0]) return null
      const X = trouverVar(c, kx), Y = trouverVar(c, ky), p = S.pearson(X.x, Y.x), s = S.spearman(X.x, Y.x); if (!Number.isFinite(p.r)) return null
      const nonLin = Math.abs(s.r) - Math.abs(p.r) > 0.1
      return { constat: `${Y.nom} contre ${X.nom} (n = ${p.n}) : Pearson r = ${f(p.r, 2)} (p ${pe(p.p)}), Spearman ρ = ${f(s.r, 2)} ; pente ${f(p.pente, 4)} par unité de X ; R² = ${f(100 * p.r * p.r, 1)} %.`,
        sens: `Le lien est ${forceR(p.r)}${p.p < 0.05 ? '' : ' et non significatif'} : X explique ${f(100 * p.r * p.r, 0)} % des variations de Y en ligne droite.${nonLin ? ' Spearman dépasse nettement Pearson : le lien est monotone mais pas linéaire (courbe ou effet de seuil).' : ''}`,
        decision: Math.abs(p.r) < 0.1 && Math.abs(s.r) < 0.1 ? 'Pas de lien entre ces deux variables : l’une n’aide pas à prévoir l’autre, ni en ligne droite ni autrement.' : nonLin ? `Lien non linéaire : argument pour un modèle capable de courbes (noyau RBF du ${triage() ? 'SVM, forêt' : 'SVR'}) plutôt qu’une droite.` : 'Lien à peu près linéaire : un modèle linéaire le capte déjà ; le gain d’un modèle non linéaire viendra des interactions entre variables.',
        faire: `Si Spearman ≫ Pearson, essayer une transformation (log) ou un modèle non linéaire ; si |r| < 0,1, inutile d’insister sur cette paire. ${triage() ? 'Banc T2 : logistique contre SVM RBF et forêt.' : 'Banc D2 : noyau linéaire contre RBF.'}` } } },
    { t: 'Nuage de points en 3D (trois variables)', nom: 'Lien à trois variables', banc: 'lecture', f: (c) => {
      const vars = c.pat.num; if (vars.length < 3) return null
      const g = (cle, i) => vars.find((v) => v.k === c.opts[cle]) ?? vars[i], X = g('n3x', 0), Y = g('n3y', 1), Z = g('n3z', 2)
      const r = [[`${X.nom} / ${Y.nom}`, S.pearson(X.x, Y.x).r], [`${X.nom} / ${Z.nom}`, S.pearson(X.x, Z.x).r], [`${Y.nom} / ${Z.nom}`, S.pearson(Y.x, Z.x).r]].filter((e) => Number.isFinite(e[1]))
      if (!r.length) return null
      const max = r.slice().sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))[0]
      return { constat: `Corrélations deux à deux : ${r.map((e) => `${e[0]} ${f(e[1], 2)}`).join(' ; ')}. Lien le plus fort : ${max[0]} (${forceR(max[1])}).`,
        sens: 'Un nuage allongé dans une direction veut dire que les trois variables bougent ensemble ; un nuage en boule, qu’elles sont presque indépendantes. Un groupe de couleur à l’écart est un profil de patients particulier.',
        decision: 'Vue d’exploration : elle aide à repérer des profils et des valeurs aberrantes, pas à choisir une variable ; ce choix se fait par les tests et les bancs d’essai.',
        faire: 'Colorer par l’issue ou la cause : si un groupe se détache nettement, le vérifier par un test de groupes (Kruskal-Wallis) avant d’en tirer une conclusion.' } } },
    { t: 'Liens entre variables qualitatives (khi-deux, V de Cramér)', nom: 'Liens qualitatifs', banc: () => (triage() ? 'T1, T4' : 'description'), f: (c) => {
      const q = c.pat.quali; if (q.length < 2) return null
      const res = []
      for (let i = 0; i < q.length; i++) for (let j = i + 1; j < q.length; j++) {
        const a = [], b = []; q[i].x.forEach((v, t) => { if (v !== null && q[j].x[t] !== null) { a.push(v); b.push(q[j].x[t]) } })
        if (a.length < 5) continue; const r = S.khi2(a, b); if (Number.isFinite(r.p)) res.push({ a: q[i], b: q[j], ...r })
      }
      if (!res.length) return null
      const sig = res.filter((r) => r.p < 0.05).sort((a, b) => b.v - a.v), fragiles = res.filter((r) => r.faibles > 0.2).length
      const issue = sig.filter((r) => r.a.k === 'issue' || r.b.k === 'issue').map((r) => `${r.a.k === 'issue' ? r.b.nom : r.a.nom} (V = ${f(r.v, 2)})`)
      return { constat: `${res.length} paires testées, ${sig.length} liées (p < 0,05) ; lien le plus fort : ${sig[0] ? `${sig[0].a.nom} / ${sig[0].b.nom}, V = ${f(sig[0].v, 2)}` : 'aucun'}. Liées à l’issue : ${issue.length ? liste(issue) : 'aucune'}. ${fragiles} test(s) à p-valeur approximative (plus de 20 % de cases d’effectif attendu < 5).`,
        sens: 'Deux variables liées ne se répartissent pas indépendamment l’une de l’autre ; le V de Cramér dit si le lien est faible (< 0,3), modéré ou fort. Les tests à cases faibles sont fragiles : un regroupement de modalités peut changer la conclusion.',
        decision: triage() ? 'Module triage : une variable connue à l’arrivée et liée à l’issue (moment de la garde, tranche d’âge, plainte) est un candidat d’entrée ; une variable connue seulement après (cause de sortie) ne doit jamais entrer dans le modèle, elle tricherait.'
          : 'Module lit : ces liens expliquent la composition du service (quelle cause selon l’âge, quelle issue selon la cause) ; ils ne sont pas des entrées du SVR.',
        faire: 'Regrouper les modalités rares puis refaire le test pour les liens fragiles ; examiner chaque lien significatif dans le « Tableau croisé » pour voir quelles cases le portent.' } } },
    { t: 'Tableau croisé', nom: 'Cases qui font le lien', banc: 'lecture', f: (c) => {
      const q = c.pat.quali; if (q.length < 2) return null
      const A = q.find((v) => v.k === c.opts.ctA) ?? q[0], B = q.find((v) => v.k === c.opts.ctB && v !== A) ?? q.find((v) => v !== A), a = [], b = []
      A.x.forEach((v, t) => { if (v !== null && B.x[t] !== null) { a.push(v); b.push(B.x[t]) } })
      if (a.length < 5) return null
      const r = S.khi2(a, b), cases = []
      r.lignes.forEach((l, i) => r.colonnes.forEach((cl, j) => { const z = r.residus[i][j]; if (Math.abs(z) > 2) cases.push({ t: `${l} × ${cl} (${z > 0 ? 'plus' : 'moins'} fréquent, résidu ${f(z, 1)})`, z: Math.abs(z) }) }))
      cases.sort((x, y) => y.z - x.z)
      return { constat: `${A.nom} × ${B.nom} : n = ${r.n}, χ² = ${f(r.chi2, 1)}, p ${pe(r.p)}, V de Cramér ${f(r.v, 2)} ; cases marquantes : ${cases.length ? liste(cases.slice(0, 4).map((x) => x.t)) : 'aucune'}.`,
        sens: r.p < 0.05 ? `Les deux variables sont liées (lien ${forceR(r.v)}) ; les cases citées sont celles qui s’écartent le plus de l’indépendance et racontent le lien.` : 'Pas de lien démontré : la répartition de l’une ne change pas nettement selon l’autre.',
        decision: r.p < 0.05 ? 'Le lien est un résultat descriptif à rapporter avec les cases qui le portent ; il ne devient une entrée de modèle que si la variable des lignes est connue au moment de la décision.' : 'Rien à ajouter au modèle pour ce croisement.',
        faire: `${r.faibles > 0.2 ? 'Plus de 20 % de cases ont un effectif attendu < 5 : regrouper des modalités avant de conclure. ' : ''}Citer dans le mémoire les pourcentages en ligne des cases bleues et rouges, pas seulement le χ².` } } },
    { t: 'Tests de comparaison de groupes (tous les croisements)', nom: 'Différences robustes', banc: 'lecture', f: (c) => {
      const L = []
      for (const v of c.pat.num.filter((e) => !e.bin)) for (const q of c.pat.quali) {
        if ((q.k === 'mois' || q.k === 'tranche') && v.k === 'age') continue      // l'âge selon la tranche d'âge : différent par construction
        const t = testsDeGroupes(v.x, q.x); if (!t || t.noms.length > 12) continue
        L.push({ v: v.nom, q: q.nom, p: t.deux ? t.deux.mw.p : t.kw.p, e: t.deux ? t.deux.mw.r ** 2 : t.kw.epsilon2 })
      }
      if (!L.length) return null
      const h = holm(L.map((x) => x.p)), top = L.filter((x) => x.p < 0.05 && x.e >= 0.06).sort((a, b) => b.e - a.e).slice(0, 4).map((x) => `${x.v} selon ${x.q}`)
      return { constat: `${L.length} croisements testés ; ${L.filter((x) => x.p < 0.05).length} significatifs à 5 %, ${h} après correction de Holm ; différences d’effet au moins moyen : ${top.length ? liste(top) : 'aucune'}.`,
        sens: 'Les différences qui survivent à la correction de Holm et ont un effet au moins moyen sont les vrais résultats ; les autres peuvent être des coïncidences dues au grand nombre de tests.',
        decision: triage() ? 'Module triage : les constantes qui diffèrent nettement selon l’issue sont celles qui porteront le modèle ; celles qui ne diffèrent pas peuvent être retirées au banc T4 si elles n’apportent rien.' : 'Module lit : les différences de durée selon la cause ou l’âge expliquent les variations de charge en lits ; elles nourrissent la discussion, pas les entrées du SVR.',
        faire: 'Ouvrir chaque croisement retenu dans « Comparaison d’une variable entre groupes » pour en donner les médianes par groupe ; ne pas interpréter un croisement isolé non corrigé.' } } },
    { t: 'Régression linéaire multiple', nom: 'Part expliquée par un modèle linéaire', banc: () => (triage() ? 'T2' : 'D2'), f: (c) => {
      const niv = c.opts.regNiv === 'j' && c.jour.length ? 'j' : 'p', vars = variablesNiveau(c, niv), cy = niv === 'p' ? 'regY' : 'regYj', cx = niv === 'p' ? 'regX' : 'regXj'
      const Y = vars.find((v) => v.k === c.opts[cy]); if (!Y || !Array.isArray(c.opts[cx])) return null
      const X = vars.filter((v) => v !== Y && c.opts[cx].includes(v.k)); if (!X.length) return null
      const n = Y.x.length, r = S.regression(Array.from({ length: n }, (_, i) => X.map((v) => v.x[i] ?? NaN)), Y.x.map((v) => v ?? NaN), X.map((v) => v.nom)); if (!r) return null
      const sig = r.coef.slice(1).filter((e) => e.p < 0.05).map((e) => `${e.nom} (${e.b > 0 ? '+' : '−'})`)
      const vif = X.length < 2 ? [] : X.map((v, j) => { const au = X.filter((_, k) => k !== j), rr = S.regression(Array.from({ length: n }, (_, i) => au.map((a) => a.x[i] ?? NaN)), v.x.map((e) => e ?? NaN), au.map((a) => a.nom)); return rr && 1 / Math.max(1e-9, 1 - rr.r2) > 5 ? v.nom : null }).filter(Boolean)
      const res = r.y.map((v, i) => v - r.yhat[i]), jb = S.descriptif(res).pJb
      return { constat: `${Y.nom} expliquée par ${X.length} variable(s) sur ${r.n} lignes : R² = ${f(r.r2, 3)}, R² ajusté ${f(r.r2a, 3)}, F p ${pe(r.pF)} ; effets significatifs : ${sig.length ? liste(sig) : 'aucun'} ; colinéarité (VIF > 5) : ${vif.length ? liste(vif) : 'aucune'} ; résidus ${jb < 0.05 ? 'non normaux' : 'compatibles avec la normale'}.`,
        sens: `Un modèle en ligne droite explique ${f(100 * r.r2, 0)} % des variations de ${Y.nom}. ${r.r2 < 0.3 ? 'C’est peu : soit les variables utiles manquent, soit le lien n’est pas linéaire.' : r.r2 < 0.7 ? 'C’est une part moyenne : il reste de la place pour les interactions et les non-linéarités.' : 'C’est beaucoup : le lien est en grande partie linéaire.'} Chaque coefficient se lit « toutes choses égales par ailleurs ».`,
        decision: r.r2 < 0.7 ? `Un modèle linéaire seul ne suffit pas : argument pour ${triage() ? 'comparer la logistique au SVM RBF et à la forêt' : 'le SVR à noyau RBF face au SVR linéaire'}.` : 'Le linéaire capte déjà l’essentiel : un modèle non linéaire devra prouver un gain réel sur des données jamais vues.',
        faire: `${vif.length ? 'Retirer une des variables colinéaires puis relancer. ' : ''}Regarder le graphique des résidus : une courbe ou un entonnoir confirme la non-linéarité. ${triage() ? 'Banc T2.' : 'Banc D2 (noyau) et D3 (perte).'} Ce modèle reste exploratoire : il n’est pas le modèle du mémoire.` } } },
    { t: 'Régression à deux variables : plan ajusté en 3D', nom: 'Effet de deux variables ensemble', banc: 'lecture', f: (c) => {
      const vars = c.pat.num.filter((v) => !v.bin); if (vars.length < 3) return null
      const g = (cle, i) => vars.find((v) => v.k === c.opts[cle]) ?? vars[i], Y = g('r3y', 0), A = g('r3a', 1), B = g('r3b', 2)
      if (new Set([Y, A, B]).size < 3) return null
      const r = S.regression(A.x.map((v, i) => [v ?? NaN, B.x[i] ?? NaN]), Y.x.map((v) => v ?? NaN), [A.nom, B.nom]); if (!r) return null
      return { constat: `${Y.nom} = ${f(r.coef[0].b, 2)} ${r.coef[1].b >= 0 ? '+' : '−'} ${f(Math.abs(r.coef[1].b), 4)} × ${A.nom} ${r.coef[2].b >= 0 ? '+' : '−'} ${f(Math.abs(r.coef[2].b), 4)} × ${B.nom} ; R² = ${f(r.r2, 3)} ; p : ${pv(r.coef[1].p)} et ${pv(r.coef[2].p)} (n = ${r.n}).`,
        sens: `Le plan explique ${f(100 * r.r2, 0)} % des variations. ${r.coef[1].p < 0.05 && r.coef[2].p < 0.05 ? 'Les deux variables ont chacune un effet propre, même en tenant compte de l’autre.' : r.coef[1].p < 0.05 || r.coef[2].p < 0.05 ? 'Une seule des deux garde un effet propre une fois l’autre prise en compte.' : 'Aucune n’a d’effet propre démontré.'}`,
        decision: 'Lecture d’appui : elle montre visuellement pourquoi un modèle qui combine les variables (et leurs interactions) fait mieux qu’une variable seule.',
        faire: 'Tourner la vue : si les points au-dessus et en dessous du plan forment des zones séparées, le lien n’est pas plan (non linéaire) ; le confirmer par la régression multiple et ses résidus.' } } },
    // ── Analyse multivariée ──
    { t: 'Variables, adéquation (KMO, Bartlett) et valeurs propres', nom: 'ACP : est-elle justifiée ?', banc: 'description', f: (c) => {
      const R = preparerAcp(c)
      if (R.erreur) return { constat: R.erreur, sens: 'L’ACP a besoin d’assez de patients ayant toutes les variables cochées.', decision: 'Pas de conclusion multivariée pour l’instant.', faire: 'Décocher les variables les moins renseignées (nombre entre parenthèses), ou continuer la saisie.' }
      const A = R.A, ok = A.bartlett.p < 0.05 && A.kmo >= 0.5, faibles = R.act.filter((_, j) => A.msa[j] < 0.5).map((v) => v.court)
      return { constat: `${A.n} ${unite()} complets, ${A.p} variables ; Bartlett p ${pe(A.bartlett.p)} ; KMO = ${f(A.kmo, 2)} (${KAISER(A.kmo)}) ; MSA < 0,5 : ${faibles.length ? liste(faibles) : 'aucune'} ; ${A.retenus} axe(s) retenu(s).`,
        sens: ok ? 'Les variables partagent assez d’information pour être résumées par quelques axes : l’ACP a un sens.' : 'Les variables partagent peu d’information : les axes ne résument presque rien, chaque variable varie pour son propre compte.',
        decision: 'L’ACP sert à décrire les profils de patients ; elle ne remplace pas les variables d’entrée du modèle (on garde les variables d’origine, lisibles par le service).',
        faire: ok ? `Interpréter les ${A.retenus} premiers axes (cercle, contributions, modalités).${faibles.length ? ' Retirer les variables à MSA < 0,5 et relancer.' : ''}` : 'Ne pas interpréter les axes ; présenter plutôt les variables une à une et leurs tests de groupes.' } } },
    { t: 'Éboulis des valeurs propres : combien d’axes garder', nom: 'ACP : nombre d’axes', banc: 'description', f: (c) => {
      const R = preparerAcp(c); if (R.erreur) return null
      const A = R.A, cum = A.inertie.slice(0, A.retenus).reduce((a, b) => a + b, 0)
      return { constat: `${A.retenus} axe(s) au-dessus du seuil du hasard (analyse parallèle), soit ${f(cum, 1)} % de l’information ; premier axe : ${f(A.inertie[0], 1)} %.`,
        sens: `Les ${A.p} variables se ramènent à environ ${A.retenus} dimension(s) indépendante(s) : ${A.retenus <= Math.ceil(A.p / 3) ? 'beaucoup de variables disent des choses voisines' : 'les variables apportent surtout des informations distinctes'}.`,
        decision: A.retenus <= Math.ceil(A.p / 3) ? 'Information redondante : un modèle simple (peu de variables bien choisies) peut suffire ; à vérifier au banc des variables.' : 'Information dispersée : chaque variable peut compter, le banc des variables dira lesquelles.',
        faire: 'Garder les axes au-dessus de la courbe orange ; ne pas interpréter les suivants. Un premier axe à 25–35 % est courant avec des données cliniques.' } } },
    { t: 'Vue 3D interactive des trois premiers axes (F1, F2, F3)', nom: 'ACP : vue en 3D', banc: 'lecture', f: (c) => {
      const R = preparerAcp(c); if (R.erreur || R.A.p < 3) return null
      const A = R.A
      return { constat: `Les trois premiers axes portent ${f(A.inertie[0] + A.inertie[1] + A.inertie[2], 1)} % de l’information (F1 ${f(A.inertie[0], 1)} %, F2 ${f(A.inertie[1], 1)} %, F3 ${f(A.inertie[2], 1)} %).`,
        sens: 'Chaque point est un patient ; des patients proches ont des profils voisins. Des groupes séparés indiquent des types de patients distincts ; un nuage continu, une variation progressive.',
        decision: 'Vue d’exploration, sans décision directe pour le modèle.',
        faire: `${A.retenus < 3 ? 'F3 est sous le seuil du hasard : ne pas interpréter la profondeur. ' : ''}Isoler les groupes de couleur (légende) et confirmer chaque impression par les valeurs-test des modalités.` } } },
    { t: 'Cercle des corrélations', nom: 'ACP : variables du plan', banc: 'lecture', f: (c) => {
      const R = preparerAcp(c); if (R.erreur) return null
      const A = R.A, [a, b] = axesChoisis(c, A), bien = R.act.map((v, j) => ({ nom: v.court, q: A.cos2[j][a] + A.cos2[j][b] })).sort((x, y) => y.q - x.q)
      return { constat: `Plan F${a + 1} × F${b + 1} : variables bien représentées (cos² ≥ 0,5) : ${liste(bien.filter((x) => x.q >= 0.5).map((x) => x.nom)) || 'aucune'} ; mal représentées : ${liste(bien.filter((x) => x.q < 0.3).map((x) => x.nom)) || 'aucune'}.`,
        sens: 'Deux flèches longues et proches : variables corrélées ; opposées : corrélation négative ; à angle droit : indépendantes. Une flèche courte est mal vue sur ce plan : on ne l’interprète pas.',
        decision: 'Les groupes de flèches proches désignent des variables redondantes ; dans un modèle linéaire, une par groupe suffit.',
        faire: 'Ne lire que les flèches proches du cercle ; changer de plan pour voir les variables mal représentées ici.' } } },
    { t: 'Projection des patients sur le plan factoriel', nom: 'ACP : patients extrêmes', banc: 'lecture', f: (c) => {
      const R = preparerAcp(c); if (R.erreur) return null
      const A = R.A, [a, b] = axesChoisis(c, A), loin = A.scores.filter((s) => s[a] ** 2 / A.valeurs[a] + s[b] ** 2 / A.valeurs[b] > 13.8).length
      return { constat: `${A.n} ${unite()} projetés sur F${a + 1} × F${b + 1} ; ${loin} très éloigné(s) du centre (au-delà de l’ellipse à 99,9 %).`,
        sens: 'Un patient très éloigné cumule des valeurs extrêmes : vrai cas lourd ou erreur de saisie. Des nuages de couleurs séparés montrent que la variable qualitative choisie distingue des profils.',
        decision: loin ? 'Ces patients pèsent beaucoup dans une régression ou une moyenne ; un modèle robuste (perte quantile ou ε-insensible) les tolère mieux.' : 'Pas de patient aberrant : les mesures sont homogènes.',
        faire: 'Survoler les points isolés et vérifier leur ligne sur la photo ; colorer par l’issue pour voir si les cas graves occupent une zone à part.' } } },
    { t: 'Corrélations, qualité (cos²) et contributions des variables', nom: 'ACP : ce qui fait les axes', banc: 'lecture', f: (c) => {
      const R = preparerAcp(c); if (R.erreur) return null
      const A = R.A, top = (k) => R.act.map((v, j) => ({ nom: v.court, c: A.contrib[j][k] })).filter((x) => x.c >= 100 / A.p).sort((x, y) => y.c - x.c).map((x) => `${x.nom} (${f(x.c, 0)} %)`)
      return { constat: `F1 est construit surtout par ${liste(top(0)) || '—'}${A.p > 1 ? ` ; F2 par ${liste(top(1)) || '—'}` : ''}.`,
        sens: 'Les variables qui contribuent plus que la moyenne donnent leur nom à l’axe : c’est ce qui permet de dire « F1 = gravité du séjour » ou « F1 = âge et poids ».',
        decision: 'Les variables qui portent les premiers axes résument l’essentiel de la variabilité des patients : ce sont les premières à décrire dans le mémoire.',
        faire: 'Nommer chaque axe à partir de ses variables contributives et du signe de leur corrélation, puis vérifier ce nom avec les modalités caractéristiques.' } } },
    { t: 'Modalités caractéristiques des axes (valeurs-test)', nom: 'ACP : profils cliniques', banc: () => (triage() ? 'T4' : 'lecture'), f: (c) => {
      const R = preparerAcp(c); if (R.erreur) return null
      const K = Math.min(R.axes, 3), mods = R.quali.flatMap((q) => q.mods.map((m) => ({ t: `${q.nom} = ${m.m}`, k: q.k, v: m.vtest.slice(0, K) }))).filter((m) => m.v.some((x) => Math.abs(x) > 1.96))
      const issue = mods.filter((m) => m.k === 'issue').map((m) => m.t)
      return { constat: `${mods.length} modalité(s) caractéristique(s) d’au moins un des ${K} premiers axes ; liées à l’issue : ${issue.length ? liste(issue) : 'aucune'}.`,
        sens: 'Une modalité caractéristique se place nettement d’un côté d’un axe : ses patients ont des mesures différentes des autres. Si l’issue est caractéristique, les mesures séparent déjà les issues.',
        decision: issue.length ? `Les mesures séparent les issues : ${triage() ? 'bon signe pour le modèle de triage, qui apprendra cette séparation' : 'les séjours défavorables ont un profil mesurable'}.` : 'Les issues ne se distinguent pas sur les axes : la séparation, si elle existe, est plus fine (interactions) ou dépend d’autres variables.',
        faire: 'Relier chaque modalité citée au nom donné à l’axe ; dans le mémoire, citer la valeur-test (|v| > 1,96 ⇔ p < 0,05).' } } },
    { t: 'Interprétation des axes', nom: 'ACP : synthèse', banc: 'description', f: (c) => {
      const R = preparerAcp(c); if (R.erreur) return null
      const A = R.A, ok = A.bartlett.p < 0.05 && A.kmo >= 0.5
      return { constat: `${ok ? 'ACP justifiée' : 'ACP peu justifiée'} (KMO ${f(A.kmo, 2)}) ; ${A.retenus} axe(s) retenu(s), ${f(A.inertie.slice(0, A.retenus).reduce((a, b) => a + b, 0), 1)} % de l’information.`,
        sens: 'Le texte au-dessus traduit les tableaux en phrases : quelles variables vont ensemble, quels profils de patients s’opposent.',
        decision: 'Résultat descriptif du chapitre « Analyse des données » ; il justifie les variables retenues mais ne fixe pas le modèle, qui est choisi par les bancs d’essai.',
        faire: 'Reformuler ce texte avec vos mots en gardant les chiffres ; signaler les axes au-delà du seuil comme « à lire avec prudence ».' } } },
  ]

  // ════════════════════════════════════════════════════════════════════════════════════════
  // Module lit (registres d'hospitalisation : prévision des présents)
  // ════════════════════════════════════════════════════════════════════════════════════════
  const regles = [
    { t: 'Votre saisie', nom: 'Qualité de la saisie', banc: 'P1, P5', f: (c) => {
      const s = c.d?.statuts ?? {}, n = Object.values(s).reduce((a, b) => a + b, 0); if (!n) return null
      const inc = (s.inconnue ?? 0) + (s.imputee ?? 0), pInc = 100 * inc / n, trous = c.d.reglages?.manquants?.length ?? 0
      return { constat: `${f(pInc)} % des séjours sans durée connue (${inc} sur ${n}) ; ${trous} suite(s) de N° manquants.`,
        sens: 'Un séjour sans durée ne peut pas être placé jour par jour dans l’occupation ; un N° manquant est une ligne (souvent une page) absente, donc des enfants non comptés.',
        decision: pInc > 10 ? 'Les durées inconnues pèsent sur l’occupation des mois concernés : leur traitement est un vrai choix (estimées plutôt qu’exclues).' : 'Peu de durées inconnues : le traitement choisi change peu la série.',
        faire: `${trous ? 'Combler les N° manquants avant d’entraîner (un trou crée un faux creux que le modèle apprendrait). ' : ''}Si plus de 10 % des durées manquent, comparer « exclues » et « estimées » au banc P1 ; banc P5 pour le début de la période exploitable.` } } },
    { t: 'Chiffres clés de l’occupation', nom: 'Niveau d’occupation', banc: 'D4', f: (c) => {
      if (!serieOk(c)) return null
      const t = c.d.lignes.at(-1), per = c.d.lignes.filter((x) => x.periode !== 'Total'), tendus = per.filter((x) => x.tom >= 85).length
      if (!c.lits) return { constat: 'Nombre de lits non indiqué.', sens: 'Sans capacité, on connaît le nombre d’enfants présents mais pas le taux d’occupation ni les jours de sureffectif.', decision: 'Le modèle prévoit des présents : il n’a pas besoin des lits, mais la lecture (taux, sureffectif) oui.', faire: 'Indiquer les lits (menu Calcul), et confirmer la date du passage de 15 à 20 lits.' }
      return { constat: `Taux d’occupation moyen ${f(t.tom)} % ; ${tendus} période(s) au-dessus de 85 % ; ${t.sur} jour(s) en sureffectif.`,
        sens: t.tom >= 85 ? 'Le service vit en tension : au-delà de 85 %, la moindre vague d’admissions le fait déborder.' : t.sur ? 'Le service n’est pas plein en moyenne, mais déborde certains jours : la moyenne cache des pics.' : 'Le service garde de la marge : les lits sont rarement tous occupés.',
        decision: t.sur || tendus ? 'Le service connaît des jours tendus : la prévision doit viser haut, quantile τ = 0,8 (assez de lits 8 jours sur 10) et intervalle à 90 %.'
          : 'Le service n’est pas saturé en moyenne : l’intérêt du modèle est d’anticiper les pics, d’où la perte quantile plutôt que la moyenne.',
        faire: 'Choisir τ avec le service (coût d’une pénurie ÷ coût d’un lit vide) et le vérifier au banc D4 ; contrôler la couverture à 90 % au test final.' } } },
    { t: 'Patients et qualité des soins', nom: 'Issues des séjours', banc: 'description', f: (c) => {
      const st = c.st; if (!st?.n) return null
      const p = (k) => 100 * (st.issues[k] ?? 0) / st.n, dc = p('Décès'), sc = p('Sortie contre avis (SCAM)'), rf = p('Référé / transféré'), nr = p('Non renseignée')
      return { constat: `Décès ${f(dc)} %, SCAM ${f(sc)} %, référés ${f(rf)} %, issue non renseignée ${f(nr)} % (${st.n} séjours).`,
        sens: `${sc + rf >= 10 ? 'Une part notable de séjours se termine hors du circuit normal (SCAM, référés) : signe possible de manque de moyens, de coût ou de lits.' : 'La grande majorité des séjours se termine par une sortie ordinaire.'} Une SCAM ou un transfert raccourcit le séjour, donc libère un lit plus tôt.`,
        decision: 'L’issue n’est connue qu’à la sortie : elle n’entre jamais dans le SVR (elle tricherait). Elle sert à estimer la durée des séjours sans date de sortie et à interpréter les durées.',
        faire: `${nr > 10 ? 'Plus de 10 % d’issues non renseignées : vérifier la colonne Observation sur les photos. ' : ''}Comparer ces taux au récapitulatif mensuel du registre (rubrique Tableaux).` } } },
    { t: 'Variables numériques journalières', nom: 'Forme de la distribution', banc: 'choix du SVR', f: (c) => {
      if (!serieOk(c)) return null
      const d = S.descriptif(c.d.presents), a = S.descriptif(c.d.adm)
      return { constat: `Présents : asymétrie ${f(d.asymetrie, 2)}, Jarque-Bera p ${pe(d.pJb)} ; admissions : moyenne ${f(a.moyenne, 2)} par jour, variance ${f(a.variance, 2)}.`,
        sens: d.pJb < 0.05 ? 'L’occupation n’a pas une forme en cloche : les jours très chargés sont plus fréquents ou plus extrêmes qu’une loi normale ne le prévoit.' : 'L’occupation a une forme proche d’une cloche autour de sa moyenne.',
        decision: d.pJb < 0.05 ? 'L’occupation n’est pas normale : un modèle sans hypothèse de loi (SVR, perte quantile) est justifié face à une régression classique.' : 'Distribution proche de la normale : les modèles linéaires classiques restent de bonnes références.',
        faire: d.pJb < 0.05 ? 'Citer ce test pour justifier le SVR et la perte quantile dans la méthodologie ; calculer les intervalles de prévision par quantiles, pas par ± 1,96 écart-type.'
          : 'Garder les références linéaires (AR, SARIMA) dans le banc D1 : le SVR doit prouver son avantage sur elles ; refaire ce test quand la saisie sera complète, la forme peut changer avec la saison.' } } },
    { t: 'Jours fériés et vacances scolaires : effet sur les admissions', nom: 'Jours fériés', banc: 'D5', f: (c) => {
      if (!serieOk(c) || typeof ferieDe !== 'function') return null
      const a = c.d.adm, deb = c.d.debutNum, parJour = Array.from({ length: 7 }, () => [])
      a.forEach((v, i) => { if (!ferieDe(deb + i)) parJour[jourSemaine(deb + i)].push(v) })
      const ref = parJour.map(moy), fer = a.map((v, i) => (ferieDe(deb + i) ? [v, ref[jourSemaine(deb + i)]] : null)).filter(Boolean)
      if (!fer.length) return { constat: 'Aucun jour férié dans la période calculée.', sens: 'On ne peut pas mesurer un effet sans jour pour l’observer.', decision: 'Impossible de juger l’effet des fériés.', faire: 'Ne pas mettre la variable « férié » tant qu’il n’y a pas assez de fériés.' }
      const ratio = fer.reduce((s, x) => s + x[0], 0) / fer.reduce((s, x) => s + x[1], 0)
      return { constat: `${fer.length} jour(s) férié(s) ; admissions observées ÷ attendues (même jour de la semaine) = ${f(ratio, 2)}.`,
        sens: `Un férié reçoit ${ratio < 1 ? `${f(100 * (1 - ratio), 0)} % d’admissions en moins` : `${f(100 * (ratio - 1), 0)} % d’admissions en plus`} qu’un jour ordinaire comparable.`,
        decision: fer.length < 8 ? 'Trop peu de fériés pour que le modèle apprenne leur effet : la variable « férié » risque d’être inutile.' : Math.abs(ratio - 1) >= 0.15 ? 'Effet net des fériés : garder la variable « jour cible férié ».' : 'Effet faible des fériés.',
        faire: 'Banc D5 : avec et sans fériés et vacances ; ne garder que s’il y a un gain. Pour les vacances, lire l’écart « à mois égal », seul à séparer l’effet des vacances de celui de la saison.' } } },
    { t: 'Corrélation croisée : admissions → présents', nom: 'Durée d’effet d’une admission', banc: 'D5', f: (c) => {
      if (!serieOk(c)) return null
      const r = S.ccf(c.d.adm, c.d.presents, 14), b = 1.96 / Math.sqrt(c.d.presents.length)
      let k = 0; while (k + 1 < r.length && r[k + 1] > b) k++
      return { constat: `Une admission reste liée à l’occupation pendant ${k} jour(s) environ (corrélation au-dessus de ${f(b, 2)}).`,
        sens: 'Un enfant admis aujourd’hui occupe un lit pendant sa durée de séjour : les admissions des jours passés « pèsent » encore sur l’occupation d’aujourd’hui.',
        decision: k <= 3 ? 'Les admissions des 3 derniers jours portent l’essentiel : variable « admissions 3 j » justifiée.' : k <= 7 ? 'Effet jusqu’à une semaine : garder « admissions 3 j » et « admissions 7 j ».' : 'Effet au-delà d’une semaine : tester les admissions des 14 derniers jours.',
        faire: 'Banc D5 : avec et sans les variables de flux ; la durée trouvée doit être cohérente avec la médiane de la courbe de survie.' } } },
    // ── Occupation ──
    { t: 'Taux d’occupation par période', nom: 'Saisonnalité de l’occupation', banc: 'D5, D7', f: (c) => {
      if (!serieOk(c) || !c.lits) return null
      const L = c.d.lignes.filter((l) => l.periode !== 'Total' && Number.isFinite(l.tom)); if (L.length < 2) return null
      const hi = L.reduce((a, b) => (b.tom > a.tom ? b : a)), lo = L.reduce((a, b) => (b.tom < a.tom ? b : a)), larg = L.map((l) => l.tomHaut - l.tomBas).filter(Number.isFinite)
      return { constat: `Taux d’occupation de ${f(lo.tom, 0)} % (${etiquettePeriode(lo.periode)}) à ${f(hi.tom, 0)} % (${etiquettePeriode(hi.periode)}) ; ${L.filter((l) => l.tom > 100).length} période(s) au-dessus de 100 % ; fourchette moyenne due aux sorties non écrites : ${f(moy(larg), 1)} point(s).`,
        sens: hi.tom - lo.tom >= 20 ? 'L’occupation varie fortement d’une période à l’autre : il y a une saison (souvent celle du paludisme).' : 'L’occupation est assez stable d’une période à l’autre.',
        decision: hi.tom - lo.tom >= 20 ? 'Saison marquée : donner au modèle le mois (codé sur un cercle) et l’entraîner sur une fenêtre qui couvre au moins une année.' : 'Pas de saison forte : le mois apportera peu ; les retards récents suffisent.',
        faire: `${moy(larg) > 10 ? 'Fourchette large : compléter les sorties non écrites (ou les estimer) avant d’entraîner. ' : ''}Banc D5 (variable mois) et D7 (fenêtre d’entraînement).` } } },
    { t: 'Occupation moyenne et maximale par mois', nom: 'Pics par rapport à la moyenne', banc: 'D4', f: (c) => {
      if (!serieOk(c)) return null
      const L = c.d.lignes.filter((l) => l.periode !== 'Total' && l.J); if (!L.length) return null
      const r = L.map((l) => l.max / Math.max(0.1, l.JH / l.J)), au = c.lits ? L.filter((l) => l.max > c.lits).length : 0
      return { constat: `Le jour le plus chargé dépasse la moyenne de sa période de ${f(100 * (moy(r) - 1), 0)} % en moyenne${c.lits ? ` ; ${au} période(s) dont le maximum dépasse ${c.lits} lits` : ''}.`,
        sens: 'Dimensionner sur la moyenne laisserait le service en sureffectif les jours de pointe ; l’écart entre moyenne et maximum mesure ce risque.',
        decision: moy(r) > 1.3 ? 'Pics nettement au-dessus de la moyenne : prévoir un quantile élevé (τ = 0,8 ou 0,9), pas la moyenne.' : 'Pics proches de la moyenne : un quantile modéré (τ autour de 0,7) peut suffire.',
        faire: 'Banc D4 : comparer τ = 0,5 à 0,9 avec le coût moyen des décisions (pénurie contre lit vide).' } } },
    { t: 'Répartition des jours selon le taux d’occupation', nom: 'Jours tendus', banc: 'D4', f: (c) => {
      if (!serieOk(c) || !c.lits) return null
      const t = c.d.presents.map((v, i) => 100 * v / (c.d.litsJour?.[i] ?? c.lits)), n = t.length, tendus = t.filter((x) => x >= 85).length, sur = t.filter((x) => x > 100).length
      return { constat: `${f(100 * tendus / n, 0)} % des jours à 85 % ou plus ; ${f(100 * sur / n, 0)} % des jours au-dessus de 100 % (${sur} jours sur ${n}).`,
        sens: 'C’est la fréquence réelle des situations difficiles, plus parlante qu’une moyenne : elle dit combien de jours par an le service manque de lits.',
        decision: sur / n > 0.1 ? 'Sureffectif fréquent : la prévision doit servir d’alerte ; le quantile élevé et la probabilité de dépasser les lits sont les sorties utiles au service.' : 'Sureffectif rare : la prévision sert surtout à planifier (personnel, lits d’appoint) les rares pics.',
        faire: 'Au test final, mesurer combien de jours en sureffectif le modèle avait annoncés la veille (sensibilité de l’alerte).' } } },
    { t: 'Occupation selon le jour de la semaine', nom: 'Rythme de la semaine', banc: 'D5', f: (c) => {
      if (!serieOk(c)) return null
      const g = Array.from({ length: 7 }, () => []); c.d.presents.forEach((v, i) => g[jourSemaine(c.d.debutNum + i)].push(v))
      const kw = S.kruskal(g.filter((x) => x.length)), m = g.map(moy), amp = Math.max(...m) - Math.min(...m)
      const fort = kw.p < 0.05 && amp >= 0.5
      return { constat: `Écart entre le jour le plus chargé (${JOURS_SEMAINE[m.indexOf(Math.max(...m))]}) et le moins chargé (${JOURS_SEMAINE[m.indexOf(Math.min(...m))]}) : ${f(amp)} présent(s) ; Kruskal-Wallis p ${pe(kw.p)}.`,
        sens: fort ? 'L’occupation suit un rythme hebdomadaire : moins de sorties certains jours (week-end), plus d’admissions d’autres.' : 'L’occupation ne dépend pas nettement du jour de la semaine.',
        decision: fort ? 'Le jour de la semaine compte : garder les 7 indicatrices du jour cible.' : 'Le jour de la semaine apporte peu : ses 7 indicatrices risquent d’ajouter du bruit.',
        faire: `Banc D5 : comparer le modèle avec et sans le jour de la semaine${fort ? '' : ' (le retirer s’il n’y a pas de gain)'}.` } } },
    { t: 'Loi de Little et file d’attente (Erlang B) : contrôle et nombre de lits', nom: 'Cohérence des données (Little)', banc: 'garde-fou', f: (c) => {
      if (!serieOk(c) || !c.d.sorties?.length) return null
      const so = c.d.sorties, w = so.reduce((a, s) => a + s.poids, 0); if (!w) return null
      const comp = c.d.reglages?.comptage, h = c.d.reglages?.heures
      let W = so.reduce((a, s) => a + s.poids * s.nuits, 0) / w
      if (comp === 'journee') W += 1; else if (comp === 'pondere' && h) W += h.b - h.a
      const L = moy(c.d.presents), lam = moy(c.d.adm), ec = 100 * (L - lam * W) / (lam * W)
      return { constat: `Présents moyens ${f(L, 2)} ; admissions par jour × durée moyenne = ${f(lam, 2)} × ${f(W, 2)} = ${f(lam * W, 2)} ; écart ${f(ec)} % ; ${litsPour(L, 0.05)} lits suffisent pour être saturé moins de 5 % du temps.`,
        sens: 'Dans un service stable, présents = arrivées par jour × durée moyenne : si les deux côtés concordent, les admissions, les sorties et l’occupation reconstituée racontent la même histoire.',
        decision: Math.abs(ec) <= 10 ? 'Écart de moins de 10 % : la série d’occupation est cohérente avec les flux, elle peut être apprise.' : 'Écart de plus de 10 % : des sorties manquent ou des dates sont fausses ; le modèle apprendrait une série biaisée.',
        faire: Math.abs(ec) <= 10 ? 'Rien à corriger ; citer ce contrôle dans la méthodologie, et le nombre de lits d’Erlang dans la discussion.' : 'Revoir les avertissements (dates incohérentes, trous) et le rodage avant d’entraîner ; repérer dans le tableau les mois à écart rouge.' } } },
    { t: 'Pic de la journée : plus grand nombre d’enfants présents en même temps', nom: 'Dimensionnement', banc: 'lecture', f: (c) => {
      if (!serieOk(c) || !c.d.picHaut?.length) return null
      const ecart = moy(c.d.picHaut) - moy(c.d.presents), L = (i) => c.d.litsJour?.[i] ?? c.lits
      const cert = c.lits ? c.d.picBas.filter((v, i) => v > L(i)).length : null, poss = c.lits ? c.d.picHaut.filter((v, i) => v > L(i)).length : null
      return { constat: `Le pic de la journée dépasse le recensement en moyenne de ${f(Math.max(0, ecart), 1)} enfant(s) au plus${c.lits ? ` ; sureffectif certain ${cert} jour(s), possible ${poss} jour(s)` : ''}.`,
        sens: 'Le recensement de minuit ne voit pas les enfants entrés et sortis dans la journée : le vrai besoin en lits, au moment le plus chargé, est plus haut.',
        decision: 'Pour dimensionner les lits, raisonner sur le pic (le matin, avant les sorties) et non sur la moyenne ; le modèle prévoit le recensement, la marge du quantile τ couvre une partie de cet écart.',
        faire: 'Présenter au service le taux moyen ET le pic ; si l’écart dépasse 1 enfant, l’ajouter à la prévision avant de la comparer aux lits.' } } },
    { t: 'Occupation heure par heure : pic, surnombre et incertitude (heures inconnues)', nom: 'Surnombre dans la journée', banc: 'lecture', f: (c, res) => {
      const m = res?.mesures; if (!m) return null
      return { constat: `Avec sorties ${m.f.s1}–${m.f.s2} h et entrées ${m.f.e1}–${m.f.e2} h : pic moyen ${f(m.picMoyen, 2)} enfants, présence moyenne ${f(m.moyP, 2)}${c.lits ? ` ; ${f(m.attendus, 1)} jour(s) en surnombre attendus [${m.icBas} ; ${m.icHaut}], dont ${m.certains} certain(s) et ${m.possibles} possible(s)` : ''}.`,
        sens: 'Le moment le plus chargé est en général juste avant les sorties du matin : c’est là qu’il faut un lit pour chaque enfant. La fourchette vient de ce que le registre ne donne pas les heures.',
        decision: 'Le surnombre en journée est la mesure du besoin réel en lits ; le modèle prévoit le recensement, l’écart pic − recensement s’ajoute pour dimensionner.',
        faire: 'Refaire le calcul avec deux ou trois fenêtres d’heures plausibles (à demander au service ou relever dans le cahier de garde) et présenter la fourchette dans le mémoire.' } } },
    { t: 'Bilan des flux (entrées − sorties) et recalage sur des comptages réels', nom: 'Validation par des comptages réels', banc: 'garde-fou', f: (c, res) => {
      const m = res?.mesures; if (!m) return null
      return { constat: `Écart maximal entre bilan des flux et recensement : ${f(m.ecartMax, 3)} enfant ; ${m.comptes ? `${m.comptes} comptage(s) réel(s), écart moyen ${f(m.ecartMoy, 1)}, écart absolu moyen ${f(m.ecartAbs, 1)}` : 'aucun comptage réel saisi'}.`,
        sens: m.comptes ? (Math.abs(m.ecartMoy) > Math.max(1, m.ecartAbs / 2) ? 'Les comptages réels s’écartent toujours dans le même sens : le registre oublie systématiquement des enfants (ou en garde trop).' : 'Les écarts aux comptages réels varient autour de 0 : la reconstitution est validée.') : 'Le bilan redonne bien la série (contrôle interne), mais sans comptage réel on ne sait pas si le registre lui-même est complet.',
        decision: m.comptes && Math.abs(m.ecartMoy) > Math.max(1, m.ecartAbs / 2) ? 'Biais systématique : corriger la série (recalage) avant d’entraîner le modèle, sinon il apprendra un niveau faux.' : 'La série reconstituée peut servir de cible au modèle.',
        faire: 'Relever 5 à 10 effectifs réels (cahier de garde, rapport de relève) à des dates variées et les taper dans la case ; c’est la validation la plus forte à présenter.' } } },
    { t: 'Simulation de Monte-Carlo : incertitude de l’occupation', nom: 'Robustesse aux données manquantes', banc: 'P1, P3', f: (c, res) => {
      const m = res?.mesures; if (!m) return null
      const R = m.R, q = (t, p) => { const h = (t.length - 1) * p, b = Math.floor(h); return b + 1 < t.length ? t[b] + (h - b) * (t[b + 1] - t[b]) : t[b] }, larg = q(R.moyennes, 0.975) - q(R.moyennes, 0.025), rel = 100 * larg / Math.max(0.1, q(R.moyennes, 0.5))
      return { constat: `${R.incertains} séjours de durée incertaine tirés au hasard ${R.N} fois : présents moyens ${f(q(R.moyennes, 0.5), 2)} [${f(q(R.moyennes, 0.025), 2)} ; ${f(q(R.moyennes, 0.975), 2)}], soit ${f(rel, 1)} % de largeur${m.lits ? ` ; probabilité d’au moins un jour au-dessus des lits ${f(100 * R.pDepasse, 0)} %` : ''}.`,
        sens: rel < 5 ? 'Les données manquantes changent très peu le résultat : l’occupation reconstituée est robuste.' : rel < 15 ? 'Les données manquantes déplacent un peu le niveau : le résultat tient, avec une marge à citer.' : 'Les données manquantes changent nettement le résultat : l’occupation reconstituée dépend des hypothèses.',
        decision: rel < 15 ? 'La série principale peut servir de cible au modèle ; l’incertitude est à rappeler dans les limites.' : 'Compléter les durées manquantes avant d’entraîner, ou entraîner sur la période où elles sont rares.',
        faire: 'Banc P1 (durées inconnues exclues ou estimées) et P3 (convention du nombre de jours) : vérifier que le choix ne change pas le classement des modèles.' } } },
    { t: 'Analyse de survie : durée de séjour (Kaplan-Meier, log-rank)', nom: 'Durée de séjour (survie)', banc: 'D5, modèle de durée', f: (c, res) => {
      const m = res?.mesures; if (!m?.km?.length) return null
      const t = m.km.map((k) => `${k.nom} : médiane ${f(k.mediane, 0)} nuit(s)`)
      return { constat: `${m.nObs} séjours dont ${m.censures} encore hospitalisés (censurés) ; ${liste(t)}${m.lr ? ` ; log-rank (${m.strate}) p ${pe(m.lr.p)}` : ''}.`,
        sens: `La moitié des enfants est sortie après la médiane indiquée. ${m.lr ? (m.lr.p < 0.05 ? 'Les groupes comparés ont des durées réellement différentes.' : 'Les groupes comparés ne diffèrent pas nettement.') : ''} Les séjours encore en cours sont pris en compte sans être comptés comme terminés.`,
        decision: `La durée médiane fixe combien de jours une admission pèse sur l’occupation : c’est la justification des variables « admissions des 3 et 7 derniers jours » du SVR.${m.lr?.p < 0.05 ? ' Les groupes qui diffèrent sont des candidats pour le modèle de durée (estimation des sorties manquantes).' : ''}`,
        faire: 'Changer « Comparer selon » (issue, âge, cause) ; un groupe qui diffère nettement est à intégrer dans l’estimation des durées inconnues (modèle de durée), puis vérifié au banc P1.' } } },
    { t: 'Modèle de file M/G/∞ : loi du nombre d’enfants présents', nom: 'Variabilité de l’occupation', banc: 'D4', f: (c, res) => {
      const m = res?.mesures; if (!m) return null
      const best = [['Poisson', m.vtPois], ['mélange par mois', m.vtMel], ['binomiale négative', m.vtBn]].sort((a, b) => a[1] - b[1])[0]
      return { constat: `Indice de dispersion ${f(m.disp, 2)} (1 = hasard pur) ; loi la plus proche des jours observés : ${best[0]} (écart ${f(100 * best[1], 0)} %) ; jours à ${m.seuils[0]} enfants ou plus : ${f(100 * m.qObs[0], 1)} % observés, contre ${f(100 * m.qPois[0], 1)} % selon Poisson et ${f(100 * m.qBn[0], 1)} % selon la binomiale négative.`,
        sens: m.disp > 1.2 ? `L’occupation varie plus que le hasard : les admissions arrivent par vagues. ${m.vtMel < m.vtPois ? 'La saison (mois) explique une bonne partie de cet excès.' : 'La saison seule ne l’explique pas.'}` : 'L’occupation varie comme si les arrivées se faisaient au hasard : la loi de Poisson suffit à la décrire.',
        decision: m.disp > 1.2 ? 'Variabilité excessive : la moyenne prévue ne suffit pas, il faut un quantile élevé (τ = 0,8) et un modèle qui suit la saison.' : 'Variabilité de Poisson : un intervalle de prévision simple est réaliste.',
        faire: 'Banc D4 (choix de τ) ; dans le mémoire, montrer que Poisson sous-estime le risque de sureffectif quand l’indice dépasse 1.' } } },
    // ── Séries temporelles ──
    { t: 'Courbe jour par jour (options à cocher)', nom: 'Allure de la série', banc: 'D7', f: (c) => {
      if (!serieOk(c)) return null
      const sc = serieChoisie(c, c.opts.serie), st = statsSerie(sc.x)
      return { constat: `${sc.nom} : moyenne ${f(st.m, 1)}${sc.unite}, coefficient de variation ${f(st.cv, 0)} %, tendance ${st.pente >= 0 ? '+' : ''}${f(st.pente, 2)}${sc.unite} par mois, autocorrélation J−1 ${f(st.a1, 2)} et J−7 ${f(st.a7, 2)}.`,
        sens: `${st.a1 > 0.7 ? 'Chaque jour ressemble beaucoup à la veille : la série est lisse et prévisible à court terme.' : 'Les jours se suivent sans grande ressemblance : la série est agitée, plus difficile à prévoir.'} ${Math.abs(st.pente) > 0.05 * Math.abs(st.m) ? 'La tendance n’est pas négligeable : le niveau dérive au fil des mois.' : 'Le niveau ne dérive pas beaucoup.'}`,
        decision: Math.abs(st.pente) > 0.05 * Math.abs(st.m) ? 'Niveau qui dérive : préférer un apprentissage récent et un réapprentissage régulier.' : 'Niveau stable : toute la série peut servir à l’apprentissage.',
        faire: 'Cocher les moyennes mobiles et la bande ± 2 écarts-types pour repérer les jours exceptionnels (à vérifier : épidémie ou erreur) ; banc D7 pour la fenêtre d’entraînement.' } } },
    { t: 'Admissions jour par jour', nom: 'Régularité des admissions', banc: 'P7, D4', f: (c) => {
      if (!serieOk(c)) return null
      const x = c.d.adm, I = vari(x) / moy(x); let run = 0, maxRun = 0; for (const v of x) { run = v === 0 ? run + 1 : 0; maxRun = Math.max(maxRun, run) }
      return { constat: `${f(moy(x), 2)} admission(s) par jour, indice de dispersion ${f(I, 2)} ; ${x.filter((v) => v === 0).length} jour(s) sans admission, plus longue suite ${maxRun} jour(s).`,
        sens: `${I > 1.2 ? 'Les admissions arrivent par vagues (jours de rush).' : 'Les admissions arrivent à peu près au hasard, sans vagues marquées.'} ${maxRun >= 4 ? 'Une suite de 4 jours ou plus sans admission est suspecte : c’est souvent une page non saisie, pas un service vide.' : ''}`,
        decision: maxRun >= 4 ? 'Trou probable dans la saisie : il fausserait les variables de flux du modèle.' : I > 1.2 ? 'Vagues d’admissions : justifie le quantile élevé et les variables d’admissions récentes.' : 'Admissions régulières.',
        faire: `${maxRun >= 4 ? 'Vérifier sur les photos les jours sans admission les plus longs ; banc P7 (trous gardés, retirés ou interpolés). ' : ''}Banc D4 pour τ.` } } },
    { t: 'Décomposition : tendance, semaine, imprévus', nom: 'Part du prévisible', banc: 'D5', f: (c) => {
      if (!serieOk(c)) return null
      const dc = decomposition(c.d.presents, c.d.debutNum), fo = S.forces(dc.tend, dc.saison, dc.residu), amp = Math.max(...dc.profil) - Math.min(...dc.profil)
      return { constat: `Force de la tendance ${f(fo.tendance, 2)}, de la saisonnalité hebdomadaire ${f(fo.saisonnalite, 2)} (0 = nulle, 1 = forte) ; écart entre jours de la semaine ${f(amp, 1)} enfant(s).`,
        sens: `${fo.tendance > 0.6 ? 'L’essentiel des variations vient de l’évolution de fond (semaines, saisons).' : 'L’évolution de fond explique une part modeste des variations.'} ${fo.saisonnalite > 0.6 ? 'Le rythme de la semaine est marqué.' : 'Le rythme de la semaine est faible par rapport aux imprévus.'}`,
        decision: `${fo.tendance > 0.6 ? 'Les retards récents captent la tendance : ils restent les entrées principales.' : 'Beaucoup d’imprévus : la prévision gardera une marge (quantile, intervalle).'} ${fo.saisonnalite > 0.6 ? 'Garder le jour de la semaine.' : 'Le jour de la semaine est à confirmer au banc.'}`,
        faire: 'Banc D5 (jour de la semaine) ; regarder le résidu : un pic isolé est un événement (épidémie, fermeture), à vérifier.' } } },
    { t: 'Autocorrélation (ACF)', nom: 'Mémoire de la série', banc: 'D5', f: (c) => {
      if (!serieOk(c)) return null
      const x = c.d.presents, r = S.acf(x, 21), b = 1.96 / Math.sqrt(x.length)
      const sig = r.slice(1).filter((v) => Math.abs(v) > b).length, pic7 = r[7] > b && r[7] > r[6] && r[7] > r[8]
      return { constat: `Corrélation avec la veille ${f(r[1], 2)}, avec 7 jours avant ${f(r[7], 2)} ; ${sig} retard(s) sur 21 au-dessus du seuil ±${f(b, 2)}.`,
        sens: 'Des barres qui décroissent lentement veulent dire que l’occupation garde longtemps la trace des jours passés : la série a de la mémoire, ce qui la rend prévisible.',
        decision: `${r[1] > 0.5 ? 'Mémoire forte : l’occupation des jours précédents est la variable principale du modèle.' : 'Mémoire modérée : les retards seuls ne suffiront pas, les flux et le calendrier compteront.'}${pic7 ? ' Pic à 7 jours : rythme de la semaine, garder le retard J−7.' : ''}`,
        faire: 'Garder les 7 derniers jours d’occupation ; le banc D5 compare 3, 7 et 14 retards.' } } },
    { t: 'Autocorrélation partielle (PACF)', nom: 'Nombre de retards', banc: 'D5', f: (c) => {
      if (!serieOk(c)) return null
      const x = c.d.presents, p = S.pacf(x, 21), b = 1.96 / Math.sqrt(x.length)
      const sig = p.map((v, k) => (k && Math.abs(v) > b ? k : 0)).filter(Boolean), dernier = sig.filter((k) => k <= 14).at(-1) ?? 0
      return { constat: `Retards à effet propre significatif : ${sig.length ? sig.slice(0, 8).join(', ') : 'aucun'}.`,
        sens: 'Un retard significatif apporte une information que les jours plus récents n’avaient pas déjà ; au-delà du dernier, les jours anciens ne disent plus rien de neuf.',
        decision: dernier <= 3 ? 'L’effet propre s’arrête vite : 3 retards pourraient suffire ; la série ressemble à un AR(1) ou AR(2).'
          : dernier <= 7 ? 'Effet propre jusqu’à une semaine : 7 retards (choix retenu) couvrent la mémoire.' : 'Effet propre au-delà d’une semaine : tester 14 retards.',
        faire: `Banc D5 (3, 7, 14 retards) ; pour les références, l’AR choisit son ordre par AIC (ordre attendu proche de ${Math.max(1, Math.min(dernier, 14))}).` } } },
    { t: 'Volatilité : écart-type mobile', nom: 'Agitation dans le temps', banc: 'D4', f: (c) => {
      if (!serieOk(c)) return null
      const x = serieChoisie(c, c.opts.serie).x, s = ecartMobile(x, 30).filter((v) => v !== null && Number.isFinite(v)); if (s.length < 10) return null
      const h = Math.floor(s.length / 2), a = moy(s.slice(0, h)), b = moy(s.slice(h)), r = Math.max(...s) / Math.max(0.01, Math.min(...s))
      return { constat: `Écart-type sur 30 jours : ${f(Math.min(...s), 2)} à ${f(Math.max(...s), 2)} (rapport ${f(r, 1)}) ; ${f(a, 2)} en première moitié, ${f(b, 2)} en seconde.`,
        sens: r > 2 ? 'L’agitation change beaucoup selon les périodes : certaines saisons sont nettement plus imprévisibles.' : 'L’agitation reste à peu près la même au fil du temps.',
        decision: r > 2 ? 'Incertitude variable : un intervalle de largeur fixe serait trop étroit en période agitée ; préférer des quantiles appris (τ) qui s’adaptent.' : 'Incertitude stable : un intervalle de largeur constante est acceptable.',
        faire: 'Banc D4 ; au test final, vérifier la couverture de l’intervalle séparément en saison haute et basse.' } } },
    // ── Modèles de prévision ──
    { t: 'Série étudiée et tests de stationnarité', nom: 'Stationnarité', banc: 'D7', f: (c) => {
      const s = typeof serieModele === 'function' ? serieModele(c) : null, x = s?.x ?? (serieOk(c) ? c.d.presents : null); if (!x || x.length < 30) return null
      const a = S.adf(x), k = S.kpss(x); if (!a || !k) return null
      const rA = a.stat < -2.86, rK = k.stat > 0.463
      const cas = rA && !rK ? 'stationnaire' : !rA && rK ? 'non stationnaire (marche aléatoire)' : rA && rK ? 'sans racine unitaire, mais avec un niveau qui varie lentement (saison, tendance)' : 'indéterminée (pas assez de données)'
      return { constat: `${s?.nom ?? 'Série'} : ADF ${f(a.stat, 2)} (seuil −2,86) ; KPSS ${f(k.stat, 3)} (seuil 0,463) : série ${cas}.`,
        sens: 'Une série stationnaire revient toujours vers le même niveau : le passé est un bon guide de l’avenir. Une série non stationnaire dérive : il faut modéliser ses changements (différences) plutôt que son niveau.',
        decision: !rA && rK ? 'Différencier pour SARIMA (d = 1) ; pour le SVR, la validation glissante et un apprentissage récent comptent.'
          : rA && rK ? 'Pas de différenciation (d = 0) ; modéliser le niveau lent par le mois (codé sur un cercle) et réapprendre régulièrement.' : 'Pas de différenciation ; le modèle peut apprendre la série telle quelle.',
        faire: 'Banc D7 : fenêtre complète contre 365, 180 ou 90 derniers jours ; réapprentissage mensuel au test final.' } } },
    { t: 'Tendance, saisonnalité et dispersion (tests)', nom: 'Dispersion et tendance', banc: 'D4, D7', f: (c) => {
      if (!serieOk(c)) return null
      const a = c.d.adm, I = vari(a) / moy(a), kd = S.kendall(c.d.presents.map((_, i) => i), c.d.presents)
      return { constat: `Indice de dispersion des admissions ${f(I, 2)} (1 = arrivées au hasard) ; tendance de Mann-Kendall τ = ${f(kd.tau, 2)}, p ${pe(kd.p)}.`,
        sens: `${I > 1.2 ? 'Les arrivées sont plus irrégulières que le hasard.' : 'Les arrivées ressemblent à un tirage au hasard.'} ${kd.p < 0.05 ? `L’occupation ${kd.tau > 0 ? 'augmente' : 'baisse'} régulièrement sur la période.` : 'Pas de hausse ni de baisse régulière.'}`,
        decision: `${I > 1.2 ? 'Admissions par vagues (surdispersion) : la moyenne ne suffit pas, le quantile élevé et l’intervalle sont nécessaires.' : 'Admissions proches du hasard : une loi de Poisson décrit bien les arrivées.'}${kd.p < 0.05 ? ' Tendance significative : les années ne se ressemblent pas, préférer un apprentissage récent.' : ''}`,
        faire: 'Banc D4 (τ) ; banc D7 (fenêtre d’apprentissage).' } } },
    { t: 'Périodogramme : les cycles de la série', nom: 'Cycles', banc: 'D5', f: (c) => {
      const s = serieModele(c); if (!s || s.x.length < 21) return null
      const n = s.x.length, per = S.periodogramme(s.x).filter((e) => e.periode >= 2 && e.periode <= Math.min(60, n / 2)); if (!per.length) return null
      const m = moy(s.x), v = s.x.reduce((a, b) => a + (b - m) ** 2, 0) / n, seuil = v * Math.log(per.length / 0.05)
      const sem = per.filter((e) => e.periode >= 6.5 && e.periode <= 7.5).some((e) => e.puissance > seuil), courts = per.filter((e) => e.periode <= 14 && e.puissance > seuil).map((e) => f(e.periode, 1))
      return { constat: `Cycles courts (2 à 14 jours) au-dessus du seuil du hasard : ${courts.length ? `${liste(courts)} jours` : 'aucun'} ; cycle de 7 jours ${sem ? 'significatif' : 'non significatif'}.`,
        sens: sem ? 'La série se répète chaque semaine : une partie de ses variations est prévisible par le jour de la semaine.' : 'Aucun rythme hebdomadaire net : le jour de la semaine explique peu.',
        decision: sem ? 'Garder le jour de la semaine dans le SVR et le terme saisonnier s = 7 dans le SARIMA de référence.' : 'Le jour de la semaine est à tester, sans attente forte.',
        faire: 'Banc D5 : avec et sans le jour de la semaine. Ne pas interpréter les longues périodes à droite (elles reflètent la tendance).' } } },
    { t: 'Comparaison des modèles sur la période de validation', nom: 'Barre à battre', banc: 'D1', f: (c) => {
      const M = c._mod
      if (M && !M.erreur) {
        const b = M.res[0], naif = M.res.find((r) => r.cle === 'naif'), dm = naif && b !== naif ? S.dieboldMariano(b.err, naif.err) : null
        return { constat: `Sur ${M.n - M.fin} jours de validation : meilleur modèle ${b.m.nom.split(' (')[0]}, MAE ${f(b.met.mae, 2)}, MASE ${f(b.met.mase, 2)}, biais ${f(b.met.biais, 2)}${naif ? ` ; gain sur le naïf ${f(100 * (1 - b.met.mae / naif.met.mae), 1)} %${dm ? `, Diebold-Mariano p ${pe(dm.p)}` : ''}` : ''}.`,
          sens: `${b.met.mase < 1 ? 'Le meilleur modèle fait mieux que « même jour la semaine dernière ».' : 'Aucun modèle ne bat nettement la simple répétition de la semaine passée.'} ${dm ? (dm.p < 0.05 ? 'Son avantage sur le naïf n’est pas dû au hasard.' : 'Son avantage sur le naïf n’est pas démontré.') : ''} ${b.met.biais > 0 ? 'Il a tendance à sous-estimer.' : 'Il a tendance à surestimer.'}`,
          decision: 'C’est la barre à battre : le SVR de NERA n’est retenu que s’il fait significativement mieux que ces références (Diebold-Mariano p < 0,05) sur les mêmes jours.',
          faire: 'Banc D1 du dépôt nera-modele (références, lissages, SARIMA, concurrents et SVR) ; garder le plus simple parmi ceux qui ne sont pas significativement moins bons ; banc D9 pour la combinaison des modèles.' }
      }
      if (!serieOk(c)) return null
      const y = c.d.presents, n = y.length, d0 = Math.max(14, Math.floor(n * 0.8))
      const err = (p) => moy(y.slice(d0).map((v, i) => Math.abs(v - p(d0 + i))))
      const refs = [['persistance (demain = aujourd’hui)', err((t) => y[t - 1])], ['saisonnier naïf (même jour, 7 jours avant)', err((t) => y[t - 7])], ['moyenne mobile 7 jours', err((t) => moy(y.slice(t - 7, t)))]].sort((p, q) => p[1] - q[1])
      return { constat: `Sur les ${n - d0} derniers jours, la meilleure référence simple est la ${refs[0][0]}, avec une erreur moyenne de ${f(refs[0][1], 2)} présent(s).`,
        sens: 'Une méthode qui ne demande aucun calcul se trompe déjà de cette quantité en moyenne : tout modèle doit faire mieux pour être utile.',
        decision: 'C’est la barre à battre : un modèle plus complexe (SVR, lissages, SARIMA, concurrents) n’est retenu que s’il fait significativement mieux (Diebold-Mariano p < 0,05).',
        faire: 'Banc D1 du dépôt nera-modele ; garder le plus simple parmi ceux qui ne sont pas significativement moins bons.' }
    } },
    { t: 'SARIMA : estimation et prévision', nom: 'SARIMA de référence', banc: 'D1', f: (c) => {
      const P = c._prev; if (!P || P.erreur || !P.sar) return null
      const l1 = 2 * P.isar[0], lh = 2 * P.isar[P.h - 1]
      return { constat: `${P.sar.nom} : AIC ${f(P.sar.aic, 1)}, BIC ${f(P.sar.bic, 1)} ; prévision J+1 ${f(Math.max(0, P.psar[0]), 1)} (intervalle large de ${f(l1, 1)}), J+${P.h} ${f(Math.max(0, P.psar[P.h - 1]), 1)} (intervalle large de ${f(lh, 1)}).`,
        sens: `L’intervalle s’élargit de ${f(l1, 1)} à ${f(lh, 1)} entre demain et J+${P.h} : plus on prévoit loin, moins on est sûr. ${c.lits && lh > 0.3 * c.lits ? 'À cet horizon, l’intervalle couvre une grande partie de la capacité : la prévision lointaine guide peu la décision.' : ''}`,
        decision: 'Le SARIMA est un concurrent classique du SVR dans le banc D1, pas le modèle final ; ses ordres servent de référence statistique.',
        faire: 'Lancer la recherche automatique, puis vérifier les résidus (section suivante) ; reporter ses erreurs dans la comparaison D1.' } } },
    { t: 'Diagnostic des résidus du SARIMA', nom: 'Qualité du SARIMA', banc: 'D1', f: (c) => {
      const P = c._prev; if (!P || P.erreur || !P.sar) return null
      const r = P.sar.residus, o = c.opts.sarima, k = Math.min(21, Math.floor(r.length / 4)), lb = S.ljungBox(r, k, o.p + o.q + o.P + o.Q), d = S.descriptif(r), a = S.acf(r, Math.min(8, k)), b = 1.96 / Math.sqrt(r.length)
      return { constat: `Ljung-Box p ${pe(lb.p)} ; moyenne des résidus ${f(d.moyenne, 3)} ; normalité Jarque-Bera p ${pe(d.pJb)} ; autocorrélation résiduelle à 1 jour ${f(a[1], 2)}, à 7 jours ${f(a[7], 2)}.`,
        sens: lb.p >= 0.05 ? 'Les erreurs ressemblent à du bruit : le SARIMA a capté la structure exploitable de la série.' : 'Il reste de la structure dans les erreurs : le modèle laisse de l’information sur la table.',
        decision: lb.p >= 0.05 ? 'SARIMA bien spécifié : c’est une référence honnête pour le banc D1.' : 'SARIMA mal spécifié : sa place dans D1 sous-estimerait ce que peut faire un modèle linéaire ; l’améliorer avant la comparaison.',
        faire: `${Math.abs(a[7]) > b ? 'Barre significative à 7 jours : ajouter P ou Q. ' : ''}${Math.abs(a[1]) > b ? 'Barre significative à 1 jour : augmenter p ou q. ' : ''}${d.pJb < 0.05 ? 'Résidus non normaux : l’intervalle à 95 % est approximatif, le dire.' : ''}`.trim() || 'Rien à corriger.' } } },
    { t: 'Prévisions de tous les modèles', nom: 'Accord des modèles', banc: 'D9', f: (c) => {
      const P = c._prev; if (!P || P.erreur) return null
      const toutes = [...(P.psar ? [P.psar] : []), ...P.sorties.map((s) => s.p)]; if (toutes.length < 2) return null
      const h = P.h - 1, v = toutes.map((p) => Math.max(0, p[h])), mn = Math.min(...v), mx = Math.max(...v), m = moy(v)
      return { constat: `À J+${P.h}, les ${toutes.length} modèles prévoient entre ${f(mn, 1)} et ${f(mx, 1)} (moyenne ${f(m, 1)})${c.lits ? ` pour ${c.lits} lits` : ''}.`,
        sens: mx - mn > 0.2 * Math.max(1, m) ? 'Les modèles divergent nettement : l’avenir est incertain et le choix du modèle compte.' : 'Les modèles s’accordent : la prévision est robuste au choix de la méthode.',
        decision: 'La moyenne de plusieurs modèles est souvent plus fiable que chacun seul : c’est l’objet du banc D9 (meilleur modèle seul, moyenne, combinaison pondérée).',
        faire: `${c.lits && mx > c.lits ? 'Au moins un modèle annonce un dépassement des lits : le signaler comme alerte possible. ' : ''}Banc D9.` } } },
    // ── Flux et séjours ──
    { t: 'Admissions et sorties par période', nom: 'Équilibre des flux', banc: 'P5, P7', f: (c) => {
      if (!serieOk(c)) return null
      const L = c.d.lignes.filter((l) => l.periode !== 'Total'); if (!L.length) return null
      const mA = med(L.map((l) => l.adm)), bas = L.filter((l) => l.adm < 0.5 * mA).map((l) => etiquettePeriode(l.periode)), t = c.d.lignes.at(-1)
      return { constat: `${t.adm} admissions et ${Math.round(t.ns)} sorties sur la période ; ${bas.length ? `période(s) avec moins de la moitié des admissions habituelles : ${liste(bas)}` : 'aucune période anormalement creuse'}.`,
        sens: 'Sur une longue période, entrées et sorties doivent presque s’équilibrer ; une période très creuse est plus souvent une page manquante qu’un service vide.',
        decision: bas.length ? 'Périodes suspectes : à exclure ou à compléter avant d’entraîner, sinon le modèle apprend de faux creux.' : 'Flux cohérents : la série peut être apprise telle quelle.',
        faire: 'Vérifier les périodes citées sur les photos ; bancs P5 (période exploitable) et P7 (trous de saisie).' } } },
    { t: 'Durée des séjours (en nuits)', nom: 'Distribution des durées', banc: 'D5, modèle de durée', f: (c) => {
      if (!serieOk(c) || !c.d.sorties?.length) return null
      const tri = c.d.sorties.map((s) => s.nuits).sort((a, b) => a - b), q = (p) => tri[Math.floor(p * (tri.length - 1))], dms = c.d.lignes.at(-1).dms
      return { constat: `Médiane ${q(0.5)} nuit(s), DMS ${f(dms, 1)}, 90 % des séjours sous ${q(0.9)} nuits, plus long ${tri.at(-1)} ; ${f(100 * tri.filter((v) => v === 0).length / tri.length, 0)} % de séjours de 0 nuit.`,
        sens: `${dms > 1.3 * q(0.5) ? 'La moyenne dépasse nettement la médiane : quelques longs séjours occupent beaucoup de journées-lits.' : 'Moyenne et médiane sont proches : les durées sont homogènes.'} Les séjours de 0 nuit (mises en observation) n’occupent pas de lit à minuit.`,
        decision: `La plupart des enfants restent moins de ${q(0.75)} nuits : les admissions des 3 à 7 derniers jours portent l’essentiel de la charge. ${dms > 1.3 * q(0.5) ? 'La queue de longs séjours justifie un modèle de durée (estimation des sorties manquantes) plutôt que la moyenne.' : ''}`,
        faire: 'Comparer avec la courbe de survie (qui tient compte des enfants encore hospitalisés) ; banc D5 pour la profondeur des variables d’admissions.' } } },
    { t: 'Durée moyenne de séjour par mois', nom: 'Stabilité de la DMS', banc: 'D7', f: (c) => {
      if (!serieOk(c)) return null
      const L = c.d.lignes.filter((l) => l.periode !== 'Total' && Number.isFinite(l.dms)); if (L.length < 3) return null
      const d = L.map((l) => l.dms), cv = 100 * Math.sqrt(vari(d)) / moy(d), kd = S.kendall(d.map((_, i) => i), d)
      return { constat: `DMS de ${f(Math.min(...d), 1)} à ${f(Math.max(...d), 1)} nuits selon la période (variation ${f(cv, 0)} %) ; tendance τ = ${f(kd.tau, 2)}, p ${pe(kd.p)}.`,
        sens: `${cv > 25 ? 'La durée des séjours change beaucoup d’une période à l’autre : à admissions égales, la charge en lits varie.' : 'La durée des séjours est stable.'} ${kd.p < 0.05 ? `Elle ${kd.tau > 0 ? 's’allonge' : 'se raccourcit'} au fil du temps.` : ''}`,
        decision: cv > 25 || kd.p < 0.05 ? 'DMS variable : l’occupation récente (retards) capte mieux cette variation que la moyenne historique ; préférer un apprentissage récent.' : 'DMS stable : la relation admissions → occupation est constante, facile à apprendre.',
        faire: 'Banc D7 (fenêtre d’entraînement) ; expliquer les mois atypiques (épidémie, pénurie de médicaments, grève).' } } },
    { t: 'Durée moyenne de séjour par cause', nom: 'Durée selon la cause', banc: 'modèle de durée', f: (c) => groupesDuree(c, (s) => causeDe(s.l), 'cause', 'causes') },
    { t: 'Durée moyenne de séjour par tranche d’âge', nom: 'Durée selon l’âge', banc: 'modèle de durée', f: (c) => groupesDuree(c, (s) => trancheAge(s.l), 'tranche d’âge', 'tranches d’âge') },
    // ── Patients ──
    { t: 'Âge et sexe des enfants', nom: 'Âge et sexe', banc: 'description', f: (c) => {
      const a = c.st?.ages; if (!a) return null
      const tot = Object.values(a).reduce((s, x) => s + x.M + x.F, 0); if (!tot) return null
      const m5 = (a['0 – 11 mois']?.M ?? 0) + (a['0 – 11 mois']?.F ?? 0) + (a['12 – 59 mois']?.M ?? 0) + (a['12 – 59 mois']?.F ?? 0)
      const G = Object.values(a).reduce((s, x) => s + x.M, 0), F = Object.values(a).reduce((s, x) => s + x.F, 0), z = (G - F) / Math.sqrt(Math.max(1, G + F)), p = S.pNormaleBilat(z)
      return { constat: `${f(100 * m5 / tot, 0)} % de moins de 5 ans ; ${G} garçons pour ${F} filles (rapport ${f(G / Math.max(1, F), 2)}, test de l’égalité p ${pe(p)}).`,
        sens: `${m5 / tot > 0.5 ? 'Le service accueille surtout de jeunes enfants, les plus fragiles (paludisme grave, anémie, déshydratation).' : 'Les enfants de plus de 5 ans sont nombreux.'} ${p < 0.05 ? `Les ${G > F ? 'garçons' : 'filles'} sont significativement plus hospitalisé(e)s.` : 'Pas de différence démontrée entre garçons et filles.'}`,
        decision: 'L’âge et le sexe décrivent le case-mix mais n’entrent pas dans le SVR (qui compte des présents) ; ils servent à expliquer les durées et à comparer avec d’autres hôpitaux.',
        faire: 'Comparer avec le récapitulatif mensuel du registre ; citer la part des moins de 5 ans dans la présentation du service.' } } },
    { t: 'Principales causes d’hospitalisation', nom: 'Causes dominantes', banc: 'D5', f: (c) => {
      const C = c.st?.causes; if (!C) return null
      const o = Object.entries(C).sort((a, b) => b[1] - a[1]), tot = o.reduce((s, x) => s + x[1], 0); if (!tot) return null
      const nr = o.filter(([k]) => /non renseign|autre/i.test(k)).reduce((s, x) => s + x[1], 0)
      return { constat: `Première cause : ${o[0][0]} (${f(100 * o[0][1] / tot, 0)} %) ; trois premières : ${f(100 * o.slice(0, 3).reduce((s, x) => s + x[1], 0) / tot, 0)} % ; non renseignées ou « autres » : ${f(100 * nr / tot, 0)} %.`,
        sens: /palu/i.test(o[0][0]) ? 'Le paludisme domine : sa saison (pluies) commande l’essentiel des variations d’occupation.' : 'Quelques causes concentrent l’essentiel des hospitalisations ; leur saisonnalité commande la charge du service.',
        decision: 'La cause n’est connue qu’au diagnostic : elle n’entre pas dans le SVR ; sa saisonnalité est captée par le mois (codé sur un cercle) et les retards d’occupation.',
        faire: `${nr / tot > 0.2 ? 'Plus de 20 % de causes non reconnues : compléter les abréviations du regroupement (registres.js). ' : ''}Banc D5 (variable mois).` } } },
    { t: 'Issue du séjour', nom: 'Issues', banc: 'description', f: (c) => {
      const I = c.st?.issues; if (!I) return null
      const tot = Object.values(I).reduce((a, b) => a + b, 0); if (!tot) return null
      const nr = I['Non renseignée'] ?? 0, def = (I['Décès'] ?? 0) + (I['Sortie contre avis (SCAM)'] ?? 0) + (I['Référé / transféré'] ?? 0)
      return { constat: `${f(100 * def / tot, 1)} % d’issues défavorables (décès, SCAM, référés) ; ${f(100 * nr / tot, 0)} % non renseignées.`,
        sens: 'L’issue dit comment se terminent les séjours ; une part élevée de non renseignées rend tous les taux incertains (on ne sait pas si ce sont des sorties ordinaires).',
        decision: 'Non utilisée comme entrée (connue après coup) ; elle sert à estimer la durée des séjours sans sortie écrite (banque des durées par issue).',
        faire: nr / tot > 0.1 ? 'Reprendre la colonne Observation sur les photos pour les issues non renseignées.' : 'Rien à corriger.' } } },
    { t: 'Admissions selon le jour de la semaine', nom: 'Jour d’enregistrement', banc: 'D5', f: (c) => {
      const s = c.st?.semaine; if (!s) return null
      const n = s.reduce((a, b) => a + b, 0); if (n < 14) return null
      const e = n / 7, chi = s.reduce((a, o) => a + (o - e) ** 2 / e, 0), p = S.pKhi2(chi, 6), hi = s.indexOf(Math.max(...s)), lo = s.indexOf(Math.min(...s))
      return { constat: `Jour le plus fréquent : ${JOURS_SEMAINE[hi]} (${s[hi]}), le moins fréquent : ${JOURS_SEMAINE[lo]} (${s[lo]}) ; ${p < 0.05 ? 'les jours ne sont pas également chargés' : 'pas de différence nette entre les jours'} (χ² = ${f(chi, 1)}, p ${pe(p)}).`,
        sens: p < 0.05 ? `Les admissions ne se répartissent pas également sur la semaine${hi === 0 ? ' ; un pic le lundi peut venir d’enregistrements regroupés après le week-end plutôt que d’arrivées réelles' : ''}.` : 'Les admissions se répartissent à peu près également sur la semaine.',
        decision: p < 0.05 ? 'Rythme hebdomadaire des admissions : le jour de la semaine est une entrée utile du SVR.' : 'Pas de rythme hebdomadaire des admissions : le jour de la semaine apportera peu.',
        faire: 'Banc D5 ; si le pic du lundi est un artefact d’enregistrement, utiliser la date d’entrée plutôt que la date d’enregistrement.' } } },
    { t: 'Quartiers de résidence les plus fréquents', nom: 'Aire de recrutement', banc: 'description', f: (c) => {
      const Q = c.st?.quartiers; if (!Q) return null
      const o = Object.values(Q).sort((a, b) => b - a), tot = o.reduce((a, b) => a + b, 0); if (!tot) return null
      return { constat: `${Object.keys(Q).length} quartiers ; les 3 premiers regroupent ${f(100 * o.slice(0, 3).reduce((a, b) => a + b, 0) / tot, 0)} % des enfants.`,
        sens: o.slice(0, 3).reduce((a, b) => a + b, 0) / tot > 0.5 ? 'Le service recrute surtout dans quelques quartiers proches.' : 'Le service recrute dans une aire large et dispersée.',
        decision: 'Le quartier n’entre pas dans le modèle (donnée personnelle, sans lien direct avec l’occupation du jour) ; il décrit l’aire de recrutement.',
        faire: 'Citer l’aire de recrutement dans la présentation du terrain ; ne jamais publier de quartier associé à un patient.' } } },
    { t: 'Durée moyenne de séjour selon l’âge', nom: 'Durée et âge', banc: 'modèle de durée', f: () => {
      const L = lignesPeriode().map((x) => ({ m: ageEnMois(x.l.age), d: dureeEcrite(x.l) })).filter((e) => e.m !== null && e.d !== null); if (L.length < 8) return null
      const r = S.spearman(L.map((e) => e.m), L.map((e) => e.d))
      return { constat: `${L.length} lignes avec âge et durée ; Spearman ρ = ${f(r.r, 2)}, p ${pe(r.p)}.`,
        sens: r.p < 0.05 ? `La durée ${r.r > 0 ? 'augmente' : 'diminue'} avec l’âge (lien ${forceR(r.r)}${Math.abs(r.r) < 0.1 ? ' : significatif mais sans portée pratique' : ''}).` : 'La durée ne dépend pas nettement de l’âge.',
        decision: r.p < 0.05 && Math.abs(r.r) >= 0.1 ? 'L’âge est une variable utile du modèle de durée (estimation des sorties manquantes).' : 'L’âge n’aide pas à estimer les durées.',
        faire: 'Vérifier avec la courbe de survie par tranche d’âge (rubrique Occupation).' } } },
    { t: 'Transfusions par mois', nom: 'Transfusions', banc: 'description', f: (c) => {
      const P = c.st?.parMois; if (!P) return null
      const m = Object.keys(P).sort(), v = m.map((k) => P[k].transf); if (m.length < 3 || !v.some((x) => x)) return null
      const hi = v.indexOf(Math.max(...v))
      return { constat: `${v.reduce((a, b) => a + b, 0)} transfusions ; pic en ${etiquettePeriode(m[hi])} (${v[hi]}) ; variation entre mois ${f(100 * Math.sqrt(vari(v)) / Math.max(0.1, moy(v)), 0)} %.`,
        sens: 'Les transfusions suivent le paludisme grave avec anémie : leurs pics signalent la saison des formes graves, qui sont aussi les plus longues.',
        decision: 'Indicateur de gravité saisonnière, pas une entrée du SVR ; il appuie l’usage du mois comme variable.',
        faire: 'Croiser avec l’occupation mensuelle : si les pics coïncident, le mentionner comme explication de la saison haute.' } } },
    // ── Tableaux ──
    { t: 'Récapitulatif mensuel (à comparer avec celui du registre)', nom: 'Contrôle par le récapitulatif', banc: 'garde-fou', f: (c) => {
      const P = c.st?.parMois; if (!P) return null
      const m = Object.keys(P).sort(); if (m.length < 2) return null
      const md = med(m.map((k) => P[k].malades)), bas = m.filter((k) => P[k].malades < 0.5 * md).map(etiquettePeriode)
      return { constat: `${m.length} mois ; médiane ${f(md, 0)} malades par mois ; mois à moins de la moitié : ${bas.length ? liste(bas) : 'aucun'}.`,
        sens: 'Si vos chiffres diffèrent du récapitulatif écrit à la fin du mois dans le registre, des lignes manquent ou sont mal saisies ; un mois très bas est le premier suspect.',
        decision: 'Un mois incomplet fausse l’occupation et doit être complété ou exclu de l’apprentissage.',
        faire: 'Comparer mois par mois au récapitulatif papier ; noter les écarts dans un tableau du mémoire (contrôle de qualité).' } } },
    { t: 'Indicateurs hospitaliers par période', nom: 'Indicateurs officiels', banc: 'lecture', f: (c) => {
      if (!serieOk(c)) return null
      const t = c.d.lignes.at(-1)
      return { constat: `Sur la période : TOM ${f(t.tom, 1)} %, DMS ${f(t.dms, 1)} nuits, rotation ${f(t.rot, 1)} patients par lit, intervalle de rotation ${f(t.inter, 1)} jour(s), mortalité ${f(t.mort, 1)} %.`,
        sens: `${t.inter < 0 ? 'Intervalle de rotation négatif : un lit est réoccupé avant d’être libéré, le service fonctionne en sureffectif.' : t.inter < 1 ? 'Moins d’un jour de lit vide entre deux patients : rotation très rapide, service sous pression.' : 'Les lits restent libres un moment entre deux patients : il y a de la marge.'}`,
        decision: 'Ces indicateurs, calculés avec les mêmes définitions que l’application NERA, sont ceux que le service connaît : ils servent à présenter les prévisions dans son langage.',
        faire: 'Reporter le tableau dans le mémoire ; comparer aux normes nationales si elles existent (TOM cible autour de 85 %).' } } },
    { t: 'Indicateurs par cause d’hospitalisation', nom: 'Causes qui occupent les lits', banc: 'description', f: (c) => {
      if (!serieOk(c) || !c.d.sorties?.length) return null
      const j = {}; for (const s of c.d.sorties) j[causeDe(s.l)] = (j[causeDe(s.l)] ?? 0) + s.poids * s.nuits
      const tot = Object.values(j).reduce((a, b) => a + b, 0); if (!tot) return null
      const o = Object.entries(j).sort((a, b) => b[1] - a[1])
      return { constat: `Journées-lits des séjours terminés : ${o.slice(0, 3).map(([k, v]) => `${k} ${f(100 * v / tot, 0)} %`).join(', ')}.`,
        sens: 'Une cause pèse sur les lits par son nombre ET sa durée : c’est la part des journées-lits, pas la part des patients, qui dit qui occupe le service.',
        decision: 'Les causes qui dominent les journées-lits fixent la saisonnalité de l’occupation que le modèle doit suivre.',
        faire: 'Citer la cause principale en journées-lits dans la discussion (priorité de prévention et de stock de médicaments).' } } },
  ]
  // Durée par groupe (cause ou âge) : moyenne, groupes fiables et test de Kruskal-Wallis.
  function groupesDuree(c, cle, nomG, nomPl) {
    if (!serieOk(c) || !c.d.sorties?.length) return null
    const g = {}; for (const s of c.d.sorties) { const k = cle(s) ?? 'Non lisible'; (g[k] ??= []).push(s.nuits) }
    const ok = Object.entries(g).filter(([k, v]) => v.length >= 5 && !/^non /i.test(k)); if (ok.length < 2) return null
    const kw = S.kruskal(ok.map(([, v]) => v)), o = ok.map(([k, v]) => [k, moy(v)]).sort((a, b) => b[1] - a[1])
    return { constat: `${ok.length} ${nomPl} d’au moins 5 séjours (hors non renseignés) ; la plus longue : ${o[0][0]} (${f(o[0][1], 1)} nuits), la plus courte : ${o.at(-1)[0]} (${f(o.at(-1)[1], 1)} nuits) ; Kruskal-Wallis p ${pe(kw.p)}, ε² = ${f(kw.epsilon2, 3)} (${effetE(kw.epsilon2)}).`,
      sens: kw.p < 0.05 ? `La durée de séjour dépend réellement de la ${nomG}.` : `Pas de différence de durée démontrée selon la ${nomG}.`,
      decision: kw.p < 0.05 && kw.epsilon2 >= 0.01 ? `La ${nomG} est utile pour estimer la durée des séjours sans sortie écrite (modèle de durée), pas comme entrée du SVR.` : `La ${nomG} n’aide pas à estimer les durées.`,
      faire: 'Ne pas interpréter les barres pâles (moins de 5 enfants) ; confirmer par la courbe de survie selon le même critère.' }
  }

  // ════════════════════════════════════════════════════════════════════════════════════════
  // Module triage (registre des urgences : passages)
  // ════════════════════════════════════════════════════════════════════════════════════════
  const reglesTriage = [
    { t: 'Votre saisie', nom: 'Variables de triage disponibles', banc: 'T4', f: () => {
      const L = lignesService(), n = L.length; if (!n) return null
      const cst = [['temperature', 'température'], ['pouls', 'pouls'], ['ta', 'tension'], ['glycemie', 'glycémie'], ['fr', 'fréquence respiratoire'], ['spo2', 'SpO2'], ['poids', 'poids']].filter(([k]) => aCol(k))
      const part = cst.map(([k, l]) => [l, 100 * L.filter((x) => String(x[k] ?? '').trim()).length / n])
      const ok = part.filter((p) => p[1] >= 50).map((p) => p[0]), faibles = part.filter((p) => p[1] < 50).map((p) => p[0])
      return { constat: `Constantes écrites dans au moins la moitié des passages : ${ok.join(', ') || 'aucune'}${faibles.length ? ` ; trop rares : ${faibles.join(', ')}` : ''}.`,
        sens: 'Une constante souvent absente est surtout mesurée chez les patients qui semblent graves : sa seule présence est déjà une information, mais sa valeur ne représente pas tous les passages.',
        decision: ok.length ? 'Ces constantes peuvent porter le modèle de triage ; les plus rares entrent seulement avec une indicatrice « non mesurée ».' : 'Pas assez de constantes écrites : le modèle de triage reposerait sur les plaintes et l’âge seulement.',
        faire: 'Banc T4 : constantes seules, + plaintes, + contexte, + indicatrices de valeurs manquantes.' } } },
    { t: 'Patients et qualité des soins', nom: 'Cible du triage', banc: 'T1, T6', f: () => {
      const L = lignesService(), o = L.map(issueUrg), n = L.length; if (!n) return null
      const grave = o.filter((x) => ['Hospitalisé', 'Référé', 'Décédé'].includes(x)).length, ext = o.filter((x) => x === 'Externe').length, meo = o.filter((x) => x === 'MEO').length
      const ages = L.map((l) => ageEnMois(l.age)).filter((a) => a !== null), enf = ages.filter((a) => a < 180).length
      return { constat: `${grave} passage(s) « graves » (hospitalisé, référé, décédé), ${ext} externe(s), ${meo} mise(s) en observation ; ${enf} enfant(s) et ${ages.length - enf} adulte(s) d’âge connu.`,
        sens: `${grave} cas graves sur ${n} passages (${f(100 * grave / n, 0)} %) : c’est la classe que le modèle doit repérer ; plus elle est rare, plus il est difficile de l’apprendre sans fausses alertes.`,
        decision: `${grave < 100 ? 'Moins de 100 graves : trop peu pour un modèle fiable, continuer la saisie. ' : 'Assez de graves pour apprendre. '}Enfants et adultes : deux modèles séparés. La mise en observation est un cas intermédiaire à placer (grave, non grave ou exclue).`,
        faire: 'Banc T1 (place de la MEO) ; banc T6 (enfants et adultes séparés) ; coût C₊/C₋ fixé avec le service (banc T3).' } } },
    { t: 'Variables numériques journalières', nom: 'Affluence des urgences', banc: 'description', f: (c) => {
      const x = c.brut?.x; if (!x || x.length < 14) return null
      const d = S.descriptif(x), I = d.variance / d.moyenne
      return { constat: `${f(d.moyenne, 1)} passage(s) par jour en moyenne (médiane ${f(d.mediane, 0)}, maximum ${f(d.max, 0)}) ; indice de dispersion ${f(I, 2)} ; ${x.filter((v) => v === 0).length} jour(s) sans passage.`,
        sens: `${I > 1.2 ? 'Les passages arrivent par vagues : certains jours, les urgences sont débordées.' : 'Les passages arrivent à peu près au hasard.'} Un jour sans aucun passage est plus souvent une page non saisie qu’un service vide.`,
        decision: 'Le modèle de triage classe chaque passage un par un : l’affluence du jour n’en est pas une entrée. Elle compte pour le service (combien de patients à trier) et pour repérer les pages manquantes.',
        faire: 'Vérifier sur les photos les jours sans passage ; si l’affluence varie beaucoup, vérifier au banc T4 que le modèle reste aussi bon les jours chargés (contexte de la garde).' } } },
    { t: 'Jours fériés et vacances scolaires : effet sur les admissions', nom: 'Passages les jours fériés', banc: 'T4', f: (c) => {
      const b = c.brut; if (!b || typeof ferieDe !== 'function') return null
      const fer = b.x.filter((_, i) => ferieDe(b.debutNum + i)), ord = b.x.filter((_, i) => !ferieDe(b.debutNum + i)); if (!fer.length) return null
      const mw = fer.length >= 3 ? S.mannWhitney(fer, ord) : null
      return { constat: `${fer.length} jour(s) férié(s) : ${f(moy(fer), 1)} passage(s) par jour, contre ${f(moy(ord), 1)} les autres jours${mw ? ` (Mann-Whitney p ${pe(mw.p)})` : ''}.`,
        sens: mw?.p < 0.05 ? 'Les jours fériés changent l’affluence des urgences.' : 'Pas d’effet démontré des jours fériés sur l’affluence (souvent faute de jours).',
        decision: 'Le jour férié n’est pas une entrée du modèle de triage : la gravité d’un patient ne dépend pas du calendrier. Le moment de la garde, lui, fait partie du contexte testé.',
        faire: 'Banc T4 (avec et sans contexte) ; citer l’effet sur l’affluence dans la description des urgences.' } } },
    { t: 'Âge et sexe des enfants', nom: 'Enfants et adultes', banc: 'T6', f: () => {
      const ages = lignesService().map((l) => ageEnMois(l.age)).filter((a) => a !== null); if (!ages.length) return null
      const enf = ages.filter((a) => a < 180).length, nrs = ages.filter((a) => a < 12).length
      return { constat: `${enf} enfant(s) de moins de 15 ans (${f(100 * enf / ages.length, 0)} %), dont ${nrs} nourrisson(s), et ${ages.length - enf} adulte(s).`,
        sens: 'Les constantes normales changent fortement avec l’âge (un pouls de 140 est normal chez un nourrisson, alarmant chez un adulte) : un même seuil ne peut pas servir à tous.',
        decision: 'Deux modèles séparés (enfants, adultes) ; chez l’enfant, les constantes sont aussi exprimées en écart à la norme de l’âge.',
        faire: `Banc T6 (séparés ou ensemble) et T5 (écart à la norme de l’âge).${ages.length - enf < 100 || enf < 100 ? ' Un des groupes a moins de 100 passages : continuer la saisie avant de conclure pour lui.' : ''}` } } },
    { t: 'Issue du séjour', nom: 'Équilibre des classes', banc: 'T3', f: () => {
      const o = lignesService().map(issueUrg), n = o.length; if (!n) return null
      const nr = o.filter((x) => x === null).length, g = o.filter((x) => ['Hospitalisé', 'Référé', 'Décédé'].includes(x)).length, r = g / Math.max(1, n - nr)
      return { constat: `${f(100 * r, 0)} % de passages graves parmi les décisions écrites ; ${f(100 * nr / n, 0)} % de décisions non écrites.`,
        sens: r < 0.2 ? 'Les cas graves sont minoritaires : un modèle qui dirait toujours « non grave » aurait une bonne précision globale mais raterait tous les graves.' : 'Les classes sont assez équilibrées.',
        decision: 'Le seuil de décision suit le rapport des coûts C₊/C₋ (rater un grave coûte plus qu’une fausse alerte) ; on juge le modèle sur la sensibilité et le sous-triage, pas sur la précision globale.',
        faire: `${nr / n > 0.1 ? 'Compléter les décisions non écrites (elles sont exclues de l’apprentissage). ' : ''}Banc T3 : coûts égaux, équilibrés, rapport du service.` } } },
    { t: 'Admissions selon le jour de la semaine', nom: 'Passages selon le jour', banc: 'T4', f: (c) => {
      const s = c.st?.semaine; if (!s) return null
      const n = s.reduce((a, b) => a + b, 0); if (n < 14) return null
      const e = n / 7, chi = s.reduce((a, o) => a + (o - e) ** 2 / e, 0), p = S.pKhi2(chi, 6), hi = s.indexOf(Math.max(...s))
      return { constat: `Jour le plus chargé : ${JOURS_SEMAINE[hi]} ; égalité des jours ${p < 0.05 ? 'rejetée' : 'non rejetée'} (χ² = ${f(chi, 1)}, p ${pe(p)}).`,
        sens: p < 0.05 ? 'L’affluence des urgences suit un rythme hebdomadaire.' : 'L’affluence est à peu près la même chaque jour.',
        decision: 'Le jour n’entre dans le modèle de triage qu’au titre du contexte, et seulement s’il améliore le classement.',
        faire: 'Banc T4 (+ contexte).' } } },
    { t: 'Principales causes d’hospitalisation', nom: 'Diagnostics', banc: 'T4', f: (c) => {
      const C = c.st?.causes; if (!C) return null
      const o = Object.entries(C).sort((a, b) => b[1] - a[1]), tot = o.reduce((s, x) => s + x[1], 0); if (!tot) return null
      return { constat: `Diagnostic le plus fréquent : ${o[0][0]} (${f(100 * o[0][1] / tot, 0)} %).`,
        sens: 'Le diagnostic décrit les motifs de recours aux urgences ; il est posé après l’examen.',
        decision: 'Le diagnostic n’est jamais lu par le modèle de triage (il serait connu trop tard) : le modèle utilise les plaintes, regroupées en familles.',
        faire: 'Banc T4 : apport des familles de plaintes.' } } },
    { t: 'Récapitulatif mensuel (à comparer avec celui du registre)', nom: 'Contrôle par mois', banc: 'garde-fou', f: (c) => {
      const P = c.st?.parMois; if (!P) return null
      const m = Object.keys(P).sort(); if (m.length < 2) return null
      const md = med(m.map((k) => P[k].malades)), bas = m.filter((k) => P[k].malades < 0.5 * md).map(etiquettePeriode)
      return { constat: `${m.length} mois ; médiane ${f(md, 0)} passages par mois ; mois à moins de la moitié : ${bas.length ? liste(bas) : 'aucun'}.`,
        sens: 'Un mois très bas est le plus souvent un mois incomplètement saisi.',
        decision: 'Un mois incomplet ne fausse pas le classement d’un passage, mais il déséquilibre la répartition des saisons dans l’apprentissage et dans le test.',
        faire: 'Compléter les mois cités ; garder le découpage par mois (apprentissage puis calibrage) du protocole.' } } },
  ]

  // ── Encadré et branchement sous chaque analyse ─────────────────────────────────────────
  const bloc = (r) => r ? `<div class="ind-conclusion"><div class="ind-conclusion-k">${ICO}Conclusion pour le modèle</div>
    <p><b>Constat :</b> ${r.constat}</p><p><b>Ce que cela signifie :</b> ${r.sens}</p><p><b>Décision pour le modèle NERA :</b> ${r.decision}</p><p><b>Démarche à suivre :</b> ${r.faire}</p></div>` : ''
  const actives = () => [...(triage() ? reglesTriage : regles), ...communes.filter((r) => !(triage() ? reglesTriage : regles).some((s) => s.t === r.t))]
  const premiereVariante = (c) => !cacheIndicateurs?.variantes || c.d === cacheIndicateurs.variantes[0].d
  // Analyse pas encore calculable (trop peu de lignes, de jours ou de variables) : on dit ce qui manque et quoi faire,
  // plutôt que de ne rien afficher. Le message de l'analyse elle-même (« Il faut au moins… ») sert de constat.
  const enAttente = (res, regle) => {
    const msg = (res?.html ?? '').match(/class="ind-vide">([^<]*)</)?.[1]
    return { constat: msg || 'Pas encore assez de données pour que cette analyse conclue.',
      sens: 'Un test ou un modèle calculé sur trop peu d’observations donne un résultat dû au hasard : mieux vaut ne pas conclure que conclure à tort.',
      decision: regle ? 'Aucune décision pour le modèle tant que l’analyse n’est pas calculable ; le choix correspondant reste fixé par le protocole et sera vérifié par son banc d’essai.' : `Cette analyse décrit le registre ; elle ne décide rien pour ${triage() ? 'le modèle de triage' : 'le modèle de prévision des lits'}.`,
      faire: regle ? `Continuer la saisie (au moins 28 jours d’occupation calculée pour les séries, 15 ${unite()} complets pour l’ACP, 8 paires pour une corrélation), compléter les dates de sortie ou le nombre de jours, ou choisir d’autres variables dans les listes de l’analyse.` : 'La citer seulement dans la description du service.' }
  }
  const RECAP = 'Conclusions pour le modèle : ce que les analyses décident'
  for (const o of ONGLETS) for (const sec of o.sections ?? []) {
    if (sec.t === RECAP) continue
    const rendre0 = sec.rendre
    sec.rendre = (c, W, H) => {
      const res = rendre0(c, W, H)
      if (!res || !premiereVariante(c)) return res
      const regle = actives().find((r) => r.t === sec.t)
      let x = null
      try { x = regle ? regle.f(c, res) : null } catch (e) { console.warn('conclusion', sec.t, e) }
      res.html = (res.html ?? '') + bloc(x ?? enAttente(res, regle))
      return res
    }
  }

  // Rubrique récapitulative de la Synthèse : toutes les conclusions calculables sans simulation, en un tableau.
  const syn = ONGLETS.find((o) => o.nom === 'Synthèse')
  syn?.sections.push({ t: RECAP, rendre: (c) => {
    const lignes = actives().map((r) => { let x = null; try { x = r.f(c) } catch { x = null } return x && [r.nom, x.constat, x.sens, x.decision, x.faire, typeof r.banc === 'function' ? r.banc() : r.banc] }).filter(Boolean)
    if (!lignes.length) return { html: '<div class="alert info" style="display:block">Pas encore assez de données pour conclure.</div>' }
    return { html: `<div class="table-wrap ind-recap"><table class="table"><thead><tr><th>Analyse</th><th>Constat</th><th>Ce que cela signifie</th><th>Décision pour le modèle</th><th>Démarche à suivre</th><th>Banc</th></tr></thead><tbody>${lignes.map((l) => `<tr>${l.map((v) => `<td>${v}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
      lecture: `chaque ligne résume une analyse de l’outil, ce qu’elle signifie et ce qu’elle décide pour le modèle NERA (${triage() ? 'module triage' : 'module lit'}). Les analyses à simulation (Monte-Carlo, heure par heure, survie, file M/G/∞) et les modèles de prévision ont leur conclusion sous leur propre graphique. Les « bancs » sont les comparaisons du dépôt nera-modele qui vérifient chaque choix sur des jours jamais vus (D : choix du modèle ; P : prétraitement ; T : triage). Une décision n’est définitive qu’une fois confirmée par son banc.` }
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
