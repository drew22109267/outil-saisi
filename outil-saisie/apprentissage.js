// ═══════════════════════════════════════════════════════════════════════════════════════════
// Rubrique « Apprentissage : SVM et arbres » : AFFICHE les résultats du modèle NERA, sans rien recalculer.
//
// On importe resultats/triage/apprentissage_<groupe>.json, écrit par nera-modele/module_triage/
// exporter_apprentissage.py avec les classes Python des modèles (triage/modeles.py). Le fichier contient :
//   · plan : les passages placés sur les deux premiers axes d'une ACP apprise sur l'apprentissage
//     (coordonnées, classe, apprentissage ou évaluation ; aucun identifiant, aucune date) ;
//   · frontieres : pour chaque modèle appris sur ces deux axes, son score sur une grille du plan, son seuil,
//     ses AUC (apprentissage, évaluation) et le score de chaque passage ;
//   · apprentissage_principal : J à chaque pas d'Adam du SVM RBF (toutes les variables), l'AUC après t pas,
//     et la frontière du SVM RBF du plan après 1, 10, 50 pas et à la fin ;
//   · complexite et taille : erreurs (1 − AUC) d'apprentissage et d'évaluation selon le réglage et la taille.
// Le fichier est gardé dans ce navigateur, un par groupe (enfants, adultes).
// ═══════════════════════════════════════════════════════════════════════════════════════════
(function () {
  const CLE = (g) => `nera.apprentissage.${g}`
  const groupeDe = (c) => c.opts.apGroupe ?? 'adulte'
  const lire = (g) => { try { return JSON.parse(localStorage.getItem(CLE(g)) ?? 'null') } catch { return null } }
  const fmtHeure = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

  // ── Import du fichier ───────────────────────────────────────────────────────────────────
  const entree = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', hidden: true })
  document.body.appendChild(entree)
  entree.addEventListener('change', async () => {
    const f = entree.files?.[0]; entree.value = ''; if (!f) return
    try {
      const j = JSON.parse(await f.text())
      if (j.format !== 'apprentissage-nera/1') throw new Error('ce n’est pas un fichier apprentissage_<groupe>.json')
      localStorage.setItem(CLE(j.groupe), JSON.stringify(j))
      message(`Résultats d’apprentissage importés pour les ${j.groupe}s (calculés le ${fmtHeure(j.genere)}).`)
      afficherIndicateurs()
    } catch (e) { message(`Import impossible : ${echapper(e.message)}.`, 'alerte') }
  })
  document.addEventListener('click', (e) => { if (e.target.closest('[data-apprentissage-importer]')) entree.click() })
  const boutonImport = '<button type="button" class="btn" data-apprentissage-importer>Importer apprentissage_&lt;groupe&gt;.json</button>'
  const absent = (g) => vide(`Aucun résultat d’apprentissage importé pour les ${g}s. Dans WSL, depuis nera-modele/module_triage :<br>
    <code>~/memoire-env/bin/python exporter_apprentissage.py &lt;registre-urgences.csv&gt;</code><br>puis importez <code>resultats/triage/apprentissage_${g}.json</code> avec le bouton ci-dessus.`)

  // ── Couleurs et dessins ─────────────────────────────────────────────────────────────────
  const couleurScore = (p) => {
    const a = Math.max(0, Math.min(1, p)), [r0, g0, b0] = a < 0.5 ? [0, 85, 247] : [215, 38, 61], t = a < 0.5 ? (0.5 - a) * 2 : (a - 0.5) * 2
    return `rgb(${Math.round(255 + (r0 - 255) * t * 0.55)},${Math.round(255 + (g0 - 255) * t * 0.55)},${Math.round(255 + (b0 - 255) * t * 0.55)})`
  }
  const nomAxe = (R, k) => `axe ${k + 1} de l’ACP (${nf(100 * R.plan.inertie[k], 1)} %)`
  // Carte : grille[i][j] = score (entre 0 et 1) au point (x_i, y_j) ; frontière là où le score franchit le seuil.
  function carte(R, grilleV, seuil, { W, H, points = null, titre = '', petit = false }) {
    const [x0, y0, x1, y1] = R.plan.bornes, [nx, ny] = R.plan.grille
    const { x, y, fond } = cadre({ W, H, ml: petit ? 30 : 56, mb: petit ? 22 : 40, mt: petit ? 18 : 12, xmin: x0, xmax: x1, ymin: y0, ymax: y1,
      titreX: petit ? '' : nomAxe(R, 0), titreY: petit ? '' : nomAxe(R, 1), sansX: petit, sansY: petit })
    const cw = (x(x1) - x(x0)) / nx, ch = (y(y0) - y(y1)) / ny
    // La grille Python est aux nœuds (linspace) : chaque nœud colore une case centrée sur lui.
    let cases = '', front = ''
    for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
      const v = grilleV[i][j], cx = x(x0) + i * cw, cy = y(y0) - (j + 1) * ch
      cases += `<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${(cw + 0.6).toFixed(1)}" height="${(ch + 0.6).toFixed(1)}" fill="${couleurScore(v)}"/>`
      if (i + 1 < nx && (v >= seuil) !== (grilleV[i + 1][j] >= seuil)) front += `M${(cx + cw).toFixed(1)},${cy.toFixed(1)}v${ch.toFixed(1)}`
      if (j + 1 < ny && (v >= seuil) !== (grilleV[i][j + 1] >= seuil)) front += `M${cx.toFixed(1)},${cy.toFixed(1)}h${cw.toFixed(1)}`
    }
    const pts = (points ?? []).map(([u, w, grave, ev]) => {
      const col = grave ? COUL.rouge : COUL.bleu, px = x(u).toFixed(1), py = y(w).toFixed(1), r = petit ? 1.5 : 2.5
      return ev ? `<circle cx="${px}" cy="${py}" r="${r}" fill="white" stroke="${col}" stroke-width="1.2"/>` : `<circle cx="${px}" cy="${py}" r="${r}" fill="${col}" fill-opacity=".7"/>`
    }).join('')
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${cases}${fond}<path d="${front}" stroke="#17181a" stroke-width="1.6" fill="none"/>${pts}
      ${titre ? `<text x="${petit ? 32 : 60}" y="${petit ? 13 : 24}" font-size="${petit ? 11 : 12}" font-weight="700" fill="#3d434c">${titre}</text>` : ''}</svg>`
  }
  const legendeCarte = () => `<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:12.5px;margin-top:6px">
    <span><svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="${COUL.rouge}"/></svg> grave, apprentissage</span>
    <span><svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="white" stroke="${COUL.rouge}" stroke-width="1.5"/></svg> grave, évaluation (jamais vu)</span>
    <span><svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="${COUL.bleu}"/></svg> non grave, apprentissage</span>
    <span><svg width="12" height="12"><circle cx="6" cy="6" r="4" fill="white" stroke="${COUL.bleu}" stroke-width="1.5"/></svg> non grave, évaluation</span>
    <span><svg width="26" height="12"><rect width="12" height="12" fill="${couleurScore(0.15)}"/><rect x="13" width="12" height="12" fill="${couleurScore(0.85)}"/></svg> zone classée non grave / grave</span>
    <span><svg width="22" height="12"><path d="M0 6h22" stroke="#17181a" stroke-width="2"/></svg> frontière de décision</span></div>`
  function courbes({ W, H, series, xs, titreX, titreY, logX = false, zones = null, marque = null }) {
    const tx = (v) => (logX ? Math.log10(v) : v), xv = xs.map(tx), tous = series.flatMap((s) => s.y).filter(Number.isFinite)
    const ymin = Math.max(0, Math.min(...tous) - 0.03), ymax = Math.min(1, Math.max(...tous) + 0.03)
    const { x, y, fond } = cadre({ W, H, xmin: Math.min(...xv), xmax: Math.max(...xv), ymin, ymax, titreX, titreY, mb: 58, sansX: logX })
    const graduX = logX ? xs.map((v, i) => `<text x="${x(xv[i])}" y="${H - 58 + 16}" text-anchor="middle" font-size="11" fill="#8a9099">${nf(v, 3)}</text>`).join('') : ''
    const zz = (zones ?? []).filter((z) => z.b > z.a).map((z) => `<rect x="${x(tx(z.a))}" y="${y(ymax)}" width="${x(tx(z.b)) - x(tx(z.a))}" height="${y(ymin) - y(ymax)}" fill="${z.c}" fill-opacity=".10"/><text x="${(x(tx(z.a)) + x(tx(z.b))) / 2}" y="${y(ymax) + 15}" text-anchor="middle" font-size="11.5" font-weight="700" fill="${z.c}">${z.t}</text>`).join('')
    const lignes = series.map((s) => `<path d="${s.y.map((v, i) => `${i ? 'L' : 'M'}${x(xv[i]).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${s.c}" stroke-width="2.2" ${s.tirets ? 'stroke-dasharray="6 4"' : ''}/>${s.points === false ? '' : s.y.map((v, i) => `<circle cx="${x(xv[i]).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" fill="${s.c}"><title>${s.nom} : ${nf(v, 3)}</title></circle>`).join('')}`).join('')
    const mq = marque !== null ? `<line x1="${x(tx(marque))}" x2="${x(tx(marque))}" y1="${y(ymax)}" y2="${y(ymin)}" stroke="#17181a" stroke-dasharray="3 3"/><text x="${x(tx(marque)) + 4}" y="${y(ymin) - 6}" font-size="11" fill="#17181a">meilleur réglage</text>` : ''
    const leg = series.map((s, i) => `<g transform="translate(${60 + i * 240},${H - 14})"><path d="M0 -4h22" stroke="${s.c}" stroke-width="2.2" ${s.tirets ? 'stroke-dasharray="6 4"' : ''}/><text x="28" y="0" font-size="12" fill="#3d434c">${s.nom}</text></g>`).join('')
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${zz}${fond}${graduX}${mq}${lignes}${leg}</svg>`
  }

  // ── Options et bandeau communs ──────────────────────────────────────────────────────────
  const modeleDe = (c, R) => { if (!R.frontieres[c.opts.apModele]) c.opts.apModele = Object.keys(R.frontieres)[0]; return c.opts.apModele }
  function options(c, R, avecModele = true) {
    const g = groupeDe(c), mods = R ? Object.entries(R.frontieres).map(([k, v]) => [k, v.libelle]) : []
    if (R && !R.frontieres[c.opts.apModele]) c.opts.apModele = mods[0]?.[0]
    return `${libelle('Patients', choix('apGroupe', g, [['adulte', 'adultes'], ['enfant', 'enfants']]))}
      ${avecModele && R ? libelle('Modèle', choix('apModele', c.opts.apModele, mods)) : ''}${boutonImport}`
  }
  const bandeau = (R, F) => bandeauStats([['Passages', R.passages], ['Apprentissage (75 % anciens)', R.apprentissage], ['Évaluation (25 % récents)', R.evaluation],
    ['Variables du modèle principal', R.variables], ...(F ? [['AUC apprentissage (plan)', nf(F.auc_apprentissage, 3)], ['AUC évaluation (plan)', nf(F.auc_evaluation, 3)]] : []), ['Calculé le', fmtHeure(R.genere)]])
  const fortes = (R, k) => R.plan.fortes[k].map((f) => `${echapper(f.variable)} (${nf(f.poids, 2)})`).join(', ')

  // ── Sections ────────────────────────────────────────────────────────────────────────────
  function rendreFrontiere(c, W, H) {
    const g = groupeDe(c), R = lire(g); if (!R) return { options: options(c, null), html: absent(g), lecture: '' }
    const nom = modeleDe(c, R), F = R.frontieres[nom]
    const texte = { svm_lineaire: 'le <b>SVM linéaire</b> trace une <b>droite</b> : il ne peut dire que « plus on va dans ce sens, plus c’est grave ».', logistique: 'la <b>régression logistique</b> trace aussi une <b>droite</b> ; elle diffère du SVM linéaire par sa perte (log au lieu de la charnière).',
      svm_rbf: 'le <b>SVM à noyau RBF</b> : f(x) = Σ αⱼ K(xⱼ, x) + b, K(xⱼ, x) = exp(−γ‖xⱼ − x‖²) ; chaque passage d’apprentissage vote pour les points qui lui ressemblent, la frontière peut se <b>courber</b> et entourer une zone.',
      svm_laplacien: 'le <b>SVM à noyau laplacien</b> : même principe que le RBF avec K = exp(−γ‖xⱼ − x‖₁), une ressemblance qui décroît moins vite ; frontière courbe, plus anguleuse.',
      arbre: 'l’<b>arbre de décision</b> pose des questions « axe ≤ seuil ? » choisies pour séparer au mieux graves et non-graves (impureté de Gini) ; la frontière est en <b>escalier</b>.', foret: 'la <b>forêt aléatoire</b> fait la moyenne de 200 arbres appris sur des tirages des passages : l’escalier s’adoucit.' }[nom] ?? ''
    return { options: options(c, R), avant: bandeau(R, F), html: carte(R, F.grille, F.seuil, { W, H: Math.max(430, H), points: R.plan.points }) + legendeCarte(),
      lecture: `chaque point est un passage réel aux urgences (${R.groupe}s ; cible : ${echapper(R.cible)}). Pour pouvoir dessiner, les ${R.variables} variables du modèle sont résumées par les deux premiers axes d’une ACP apprise sur l’apprentissage : l’axe 1 est surtout porté par ${fortes(R, 0)} ; l’axe 2 par ${fortes(R, 1)}. Le modèle choisi a été appris <b>par le code Python du modèle NERA</b> sur ces deux axes. Le fond montre sa décision en chaque point : rouge, grave ; bleu, non grave ; plus la couleur est franche, plus il est sûr. Le trait noir est la frontière de décision. Points pleins : passages d’apprentissage (75 % les plus anciens) ; cercles vides : passages récents jamais vus, sur lesquels se lit la vraie qualité (AUC d’évaluation). Ici, ${texte} Ce plan est une vue simplifiée : le modèle principal utilise toutes les variables et fait mieux qu’un modèle à deux axes.` }
  }
  function rendre3D(c, W, H) {
    const g = groupeDe(c), R = lire(g); if (!R) return { options: options(c, null), html: absent(g), lecture: '' }
    const F = R.frontieres[modeleDe(c, R)], [x0, y0, x1, y1] = R.plan.bornes, [nx, ny] = R.plan.grille
    const P = R.plan.points, haut = F.points
    const plan = (norm) => { const seg = [], gx = (i) => x0 + (x1 - x0) * i / (nx - 1), gy = (j) => y0 + (y1 - y0) * j / (ny - 1), pas = 4
      const Q = (i, j) => [norm(0, gx(i)), Math.max(-1.25, Math.min(1.25, norm(1, F.grille[i][j]))), norm(2, gy(j))], S = (i, j) => [norm(0, gx(i)), norm(1, F.seuil), norm(2, gy(j))]
      for (let i = 0; i < nx; i += pas) for (let j = 0; j + pas < ny; j += pas) seg.push([Q(i, j), Q(i, j + pas)])
      for (let j = 0; j < ny; j += pas) for (let i = 0; i + pas < nx; i += pas) seg.push([Q(i, j), Q(i + pas, j)])
      for (let k = 0; k <= 4; k++) { const i = Math.round(k * (nx - 1) / 4), j = Math.round(k * (ny - 1) / 4); seg.push([S(i, 0), S(i, ny - 1)], [S(0, j), S(nx - 1, j)]) }
      return seg }
    const { id } = nuage3D({ x: P.map((p) => p[0]), y: haut, z: P.map((p) => p[1]), noms: ['axe 1', 'score', 'axe 2'], plan, halos: false,
      groupes: [{ nom: 'non grave', couleur: COUL.bleu, n: P.filter((p) => !p[2]).length }, { nom: 'grave', couleur: COUL.rouge, n: P.filter((p) => p[2]).length }],
      groupesDe: P.map((p) => p[2]), infos: P.map((p, i) => `${p[2] ? 'grave' : 'non grave'}${p[3] ? ' (évaluation)' : ''} · score ${nf(haut[i], 2)}`) })
    return { options: options(c, R), avant: bandeau(R, F), html: cadre3D(id, Math.max(480, H), ['axe 1 × score', 'axe 1 × axe 2', 'score × axe 2']),
      lecture: `la même décision en <b>relief</b>. Au sol, les deux axes du plan ; en hauteur, le score du modèle (${c.opts.apModele === 'arbre' || c.opts.apModele === 'foret' ? 'part de graves' : 'σ(2f), entre 0 et 1'}). La nappe est le score en chaque point du plan, le quadrillage horizontal est le seuil de décision : là où la nappe passe au-dessus, le modèle classe grave. Chaque passage est posé à la hauteur de son score : un bon modèle met les points rouges en haut et les bleus en bas. Glisser pour tourner ; « axe 1 × axe 2 » donne la carte vue de dessus.` }
  }
  function rendreApprentissage(c, W, H) {
    const g = groupeDe(c), R = lire(g); if (!R) return { options: options(c, null, false), html: absent(g), lecture: '' }
    const A = R.apprentissage_principal, w = Math.floor((W - 30) / 4)
    const photos = A.photos.map((p) => carte(R, p.grille, 0.5, { W: w, H: 200, petit: true, titre: `après ${p.t} pas`, points: R.plan.points }))
    const its = A.J.map((_, i) => 1 + i * A.pas), Jmax = Math.max(...A.J)
    const gJ = courbes({ W: Math.floor(W / 2) - 8, H: 300, xs: its, titreX: 'pas d’Adam', titreY: 'J / J max', series: [{ nom: 'fonction minimisée J', c: COUL.violet, points: false, y: A.J.map((v) => v / Jmax) }] })
    const gA = courbes({ W: Math.floor(W / 2) - 8, H: 300, xs: A.suivi.map((s) => s.t), logX: true, titreX: 'pas d’Adam (échelle log)', titreY: 'AUC',
      series: [{ nom: 'apprentissage', c: COUL.bleu, y: A.suivi.map((s) => s.auc_apprentissage) }, { nom: 'évaluation (jamais vu)', c: COUL.rouge, tirets: true, y: A.suivi.map((s) => s.auc_evaluation) }] })
    return { options: options(c, R, false), avant: bandeauStats([['Modèle', A.modele], ['Arrêt', A.arret], ['AUC finale (évaluation)', nf(A.suivi.at(-1)?.auc_evaluation, 3)]]),
      html: `<div style="display:flex;gap:10px;flex-wrap:wrap">${photos.join('')}</div>${legendeCarte()}<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:12px">${gJ}${gA}</div>`,
      lecture: `comment le SVM <b>apprend</b>, d’après l’entraînement réel du modèle Python. Au départ α = 0 et b = 0 : le modèle ne sait rien. À chaque pas, Adam calcule le gradient de J(α, b) = ½ αᵀKα + Σ Cᵢ max(0, 1 − yᵢ fᵢ) — seuls les passages mal classés ou trop près de la frontière (yᵢ fᵢ < 1) le tirent — et déplace α et b : m ← 0,9 m + 0,1 g ; v ← 0,999 v + 0,001 g² ; θ ← θ − η m̂/(√v̂ + 10⁻⁸). Les quatre cartes montrent la frontière du SVM RBF du plan après ${A.photos.map((p) => p.t).join(', ')} pas. À gauche, J du modèle principal (toutes les variables) baisse puis se stabilise : l’optimisation a convergé. À droite, l’AUC du modèle arrêté après t pas, sur l’apprentissage (trait plein) et sur des passages jamais vus (tirets) : tant qu’elles montent ensemble, le modèle apprend quelque chose de général ; si la première continue de monter quand la seconde baisse, il apprend par cœur.` }
  }
  function rendreCourbes(c, W, H) {
    const g = groupeDe(c), R = lire(g); if (!R) return { options: options(c, null, false), html: absent(g), lecture: '' }
    const cles = Object.keys(R.complexite); if (!cles.includes(c.opts.apComplexite)) c.opts.apComplexite = cles[0]
    const K = R.complexite[c.opts.apComplexite], pts = K.points, xs = pts.map((p) => p.valeur), best = pts.reduce((a, b) => (b.erreur_evaluation < a.erreur_evaluation ? b : a))
    const logX = c.opts.apComplexite !== 'arbre'
    const zones = [{ a: xs[0], b: best.valeur, c: COUL.bleu, t: 'sous-apprentissage' }, { a: best.valeur, b: xs.at(-1), c: COUL.rouge, t: 'sur-apprentissage' }]
    const gC = courbes({ W, H: 330, xs, logX, titreX: K.reglage, titreY: 'erreur = 1 − AUC', zones, marque: best.valeur,
      series: [{ nom: 'erreur d’apprentissage', c: COUL.bleu, y: pts.map((p) => p.erreur_apprentissage) }, { nom: 'erreur d’évaluation (jamais vu)', c: COUL.rouge, tirets: true, y: pts.map((p) => p.erreur_evaluation) }] })
    const T = R.taille, gT = T.length ? courbes({ W, H: 300, xs: T.map((p) => p.passages), titreX: 'passages d’apprentissage', titreY: 'erreur = 1 − AUC',
      series: [{ nom: 'erreur d’apprentissage', c: COUL.bleu, y: T.map((p) => p.erreur_apprentissage) }, { nom: 'erreur d’évaluation (jamais vu)', c: COUL.rouge, tirets: true, y: T.map((p) => p.erreur_evaluation) }] }) : vide('Courbe d’apprentissage absente du fichier.')
    const noms = { svm_rbf: 'SVM RBF', svm_lineaire: 'SVM linéaire', arbre: 'Arbre de décision' }
    return { options: `${libelle('Patients', choix('apGroupe', g, [['adulte', 'adultes'], ['enfant', 'enfants']]))}${libelle('Modèle', choix('apComplexite', c.opts.apComplexite, cles.map((k) => [k, noms[k] ?? k])))}${boutonImport}`,
      avant: bandeauStats([['Meilleur réglage', `${K.reglage.split(' (')[0]} = ${nf(best.valeur, 3)}`], ['Erreur d’évaluation au meilleur', nf(best.erreur_evaluation, 3)], ['Écart évaluation − apprentissage (toutes les données)', nf(T.at(-1) ? T.at(-1).erreur_evaluation - T.at(-1).erreur_apprentissage : NaN, 3)]]),
      html: `<div style="font-weight:700;margin:4px 0">Courbe de complexité</div>${gC}<div style="font-weight:700;margin:14px 0 4px">Courbe d’apprentissage (SVM RBF, taille des données)</div>${gT}`,
      lecture: `<b>Courbe de complexité</b>, calculée par le modèle Python sur toutes les variables : on rend le modèle de plus en plus souple (${echapper(K.reglage)}). L’erreur sur les passages d’apprentissage (trait plein) baisse toujours : un modèle assez souple finit par épouser chaque passage. L’erreur sur les passages jamais vus (tirets) baisse d’abord, puis remonte. À gauche du meilleur réglage, le modèle est <b>trop simple</b> : les deux erreurs restent hautes, il rate la forme des données (<b>sous-apprentissage</b>). À droite, il est <b>trop souple</b> : l’erreur d’apprentissage continue de baisser mais celle d’évaluation remonte, il apprend le bruit (<b>sur-apprentissage</b>). La limite est le réglage qui minimise l’erreur d’évaluation (trait vertical). <b>Courbe d’apprentissage</b> : même réglage, de plus en plus de passages. Si les deux courbes se rejoignent à un niveau élevé, ajouter des passages n’aidera plus : il faut de meilleures variables. Si un grand écart demeure, le modèle a besoin de plus de données ou d’être simplifié. Erreur = 1 − AUC : 0 = parfait, 0,5 = hasard.` }
  }

  // ── Film de l'apprentissage : la frontière du SVM pas après pas, en 2D et en 3D, avec lecture et curseur ──
  const FILMS = new Map()
  function rendreFilm(c, W, H) {
    const g = groupeDe(c), R = lire(g); if (!R) return { options: options(c, null, false), html: absent(g), lecture: '' }
    const F = R.apprentissage_principal?.film; if (!F?.length) return { options: options(c, R, false), html: vide('Ce fichier n’a pas de film : relancez exporter_apprentissage.py.'), lecture: '' }
    const id = `film${FILMS.size}`, W2 = Math.min(W, 620), H2 = 420
    const [x0, y0, x1, y1] = R.plan.bornes, [nx, ny] = R.plan.grille
    const { x, y, fond } = cadre({ W: W2, H: H2, xmin: x0, xmax: x1, ymin: y0, ymax: y1, titreX: nomAxe(R, 0), titreY: nomAxe(R, 1) })
    const cw = (x(x1) - x(x0)) / nx, ch = (y(y0) - y(y1)) / ny
    const images = F.map((im, k) => {
      let cases = '', front = ''
      for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) {
        const v = im.grille[i][j], cx = x(x0) + i * cw, cy = y(y0) - (j + 1) * ch
        cases += `<rect x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" width="${(cw + 0.6).toFixed(1)}" height="${(ch + 0.6).toFixed(1)}" fill="${couleurScore(v)}"/>`
        if (i + 1 < nx && (v >= 0.5) !== (im.grille[i + 1][j] >= 0.5)) front += `M${(cx + cw).toFixed(1)},${cy.toFixed(1)}v${ch.toFixed(1)}`
        if (j + 1 < ny && (v >= 0.5) !== (im.grille[i][j + 1] >= 0.5)) front += `M${cx.toFixed(1)},${cy.toFixed(1)}h${cw.toFixed(1)}`
      }
      return `<g data-image="${k}" style="display:${k ? 'none' : 'inline'}">${cases}<path d="${front}" stroke="#17181a" stroke-width="1.8" fill="none"/></g>`
    }).join('')
    const pts = R.plan.points.map(([u, w, grave, ev]) => { const col = grave ? COUL.rouge : COUL.bleu, px = x(u).toFixed(1), py = y(w).toFixed(1)
      return ev ? `<circle cx="${px}" cy="${py}" r="2.4" fill="white" stroke="${col}" stroke-width="1.2"/>` : `<circle cx="${px}" cy="${py}" r="2.4" fill="${col}" fill-opacity=".7"/>` }).join('')
    const svg2d = `<svg data-film="${id}" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}">${images}${fond}${pts}</svg>`
    // 3D : nappe du score de l'image k et passages posés à la hauteur de leur score.
    let normCap = null
    const P = R.plan.points, gx = (i) => x0 + (x1 - x0) * i / (nx - 1), gy = (j) => y0 + (y1 - y0) * j / (ny - 1), pas = 4
    const segments = (k) => { const G = F[k].grille, seg = [], Q = (i, j) => [normCap(0, gx(i)), Math.max(-1.25, Math.min(1.25, normCap(1, G[i][j]))), normCap(2, gy(j))], S = (i, j) => [normCap(0, gx(i)), normCap(1, 0.5), normCap(2, gy(j))]
      for (let i = 0; i < nx; i += pas) for (let j = 0; j + pas < ny; j += pas) seg.push([Q(i, j), Q(i, j + pas)])
      for (let j = 0; j < ny; j += pas) for (let i = 0; i + pas < nx; i += pas) seg.push([Q(i, j), Q(i + pas, j)])
      for (let q = 0; q <= 4; q++) { const i = Math.round(q * (nx - 1) / 4), j = Math.round(q * (ny - 1) / 4); seg.push([S(i, 0), S(i, ny - 1)], [S(0, j), S(nx - 1, j)]) }
      return seg }
    const fin = F.at(-1).points
    const v3 = nuage3D({ x: P.map((p) => p[0]), y: fin, z: P.map((p) => p[1]), noms: ['axe 1', 'score', 'axe 2'], halos: false, plan: (norm) => { normCap = norm; return [] },
      groupes: [{ nom: 'non grave', couleur: COUL.bleu, n: P.filter((p) => !p[2]).length }, { nom: 'grave', couleur: COUL.rouge, n: P.filter((p) => p[2]).length }],
      groupesDe: P.map((p) => p[2]), infos: P.map((p) => `${p[2] ? 'grave' : 'non grave'}${p[3] ? ' (évaluation)' : ''}`) })
    FILMS.set(id, { F, id3d: v3.id, segments, normCap: () => normCap, k: 0, minuteur: null })
    montrerImage(id, 0, true)
    const info = (k) => `pas ${F[k].t} · J = ${nf(F[k].J, 2)} · AUC apprentissage ${nf(F[k].auc_apprentissage, 3)} · évaluation ${nf(F[k].auc_evaluation, 3)}`
    FILMS.get(id).info = info
    return { options: options(c, R, false),
      avant: `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:6px 0">
        <button type="button" class="btn" data-ap-jouer="${id}">▶ Lire</button>
        <input type="range" min="0" max="${F.length - 1}" value="0" data-ap-curseur="${id}" style="width:260px">
        <span data-ap-info="${id}" style="font-weight:600">${info(0)}</span></div>`,
      html: `<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start"><div>${svg2d}${legendeCarte()}</div><div style="flex:1;min-width:380px">${cadre3D(v3.id, 440, ['axe 1 × score', 'axe 1 × axe 2', 'score × axe 2'])}</div></div>`,
      lecture: `le <b>film de l’apprentissage</b> du SVM à noyau RBF, calculé par le modèle Python : chaque image est le modèle réel arrêté après t pas d’Adam (de 1 à ${F.at(-1).t}), parti de α = 0 et b = 0. <b>Lire</b> fait défiler les images ; le curseur permet d’aller à un pas précis. À gauche, la carte vue de dessus : au début, le score est presque partout le même et la frontière n’existe pas ou coupe au hasard ; puis les passages mal classés tirent sur α (gradient K(α + g)), la frontière se forme, se courbe autour des zones de graves, et se stabilise quand J ne baisse plus. À droite, la même chose en relief : la nappe du score se soulève là où sont les graves et s’abaisse là où sont les non-graves ; chaque passage monte ou descend avec son score. Le bandeau donne J et l’AUC à chaque pas : si l’AUC d’évaluation cesse de monter alors que celle d’apprentissage continue, l’apprentissage par cœur commence.` }
  }
  function montrerImage(id, k, avantAffichage = false) {
    const f = FILMS.get(id); if (!f) return
    f.k = k
    const d = VUES3D.get(f.id3d), norm = f.normCap()
    if (d && norm) {
      d.plan = f.segments(k)
      d.points.forEach((p, i) => { p.p[1] = Math.max(-1.25, Math.min(1.25, norm(1, f.F[k].points[i]))) })
    }
    if (avantAffichage) return
    document.querySelectorAll(`svg[data-film="${id}"] [data-image]`).forEach((gr) => { gr.style.display = +gr.dataset.image === k ? 'inline' : 'none' })
    const cur = document.querySelector(`[data-ap-curseur="${id}"]`); if (cur) cur.value = k
    const inf = document.querySelector(`[data-ap-info="${id}"]`); if (inf && f.info) inf.textContent = f.info(k)
    document.querySelector(`[data-vue3d="${f.id3d}"]`)?.dispatchEvent(new Event('vue3d-redessiner'))
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-ap-jouer]'); if (!b) return
    const f = FILMS.get(b.dataset.apJouer); if (!f) return
    if (f.minuteur) { clearInterval(f.minuteur); f.minuteur = null; b.textContent = '▶ Lire'; return }
    if (f.k >= f.F.length - 1) montrerImage(b.dataset.apJouer, 0)
    b.textContent = '❚❚ Pause'
    f.minuteur = setInterval(() => {
      if (!document.body.contains(b)) { clearInterval(f.minuteur); f.minuteur = null; return }
      if (f.k >= f.F.length - 1) { clearInterval(f.minuteur); f.minuteur = null; b.textContent = '▶ Lire'; return }
      montrerImage(b.dataset.apJouer, f.k + 1)
    }, 500)
  })
  document.addEventListener('input', (e) => { const r = e.target.closest('[data-ap-curseur]'); if (r) montrerImage(r.dataset.apCurseur, +r.value) })

  ICONES.apprentissage =['#d7263d', '<circle cx="6" cy="7" r="1.6" fill="currentColor"/><circle cx="9" cy="16" r="1.6" fill="currentColor"/><circle cx="17" cy="6" r="1.6"/><circle cx="18" cy="15" r="1.6"/><path d="M4 20C9 15 11 9 20 3"/>']
  ONGLETS.push({ nom: 'Apprentissage : SVM et arbres', ico: 'apprentissage', desc: 'Résultats du modèle Python : frontières, apprentissage, sous- et sur-apprentissage', sections: [
    { t: 'Comment chaque modèle sépare les patients (frontière de décision)', h: 440, rendre: rendreFrontiere },
    { t: 'La même décision en 3D : le score en relief', h: 480, rendre: rendre3D },
    { t: 'Film de l’apprentissage du SVM, en 2D et en 3D', h: 480, rendre: rendreFilm },
    { t: 'Comment le modèle apprend, pas après pas', h: 520, rendre: rendreApprentissage },
    { t: 'Courbes de complexité et d’apprentissage : sous- et sur-apprentissage', h: 640, rendre: rendreCourbes },
  ] })
})()
