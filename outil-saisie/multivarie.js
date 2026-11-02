// ═══════════════════════════════════════════════════════════════════════════════════════════
// Analyse multivariée au-delà de l'ACP : trois sections ajoutées à la rubrique « Analyse multivariée (ACP) ».
//
//   1. AFDM (analyse factorielle de données mixtes, Pagès 2004) : une ACP qui fait entrer ENSEMBLE les variables
//      numériques (centrées-réduites) et les variables qualitatives (chaque modalité de fréquence p devient
//      l'indicatrice recodée (1(modalité) − p)/√p, comme en analyse des correspondances multiples). L'ACP, elle,
//      n'utilise que les numériques et ne place les qualitatives qu'après coup (supplémentaires).
//   2. Classification k-means : les patients sont regroupés en g groupes sur leurs coordonnées d'ACP (axes
//      retenus) ; g est choisi entre 2 et 6 par la silhouette moyenne ; chaque groupe est décrit (profil).
//   3. Comparaison des méthodes (banc d'essai descriptif) : ACP, AFDM et k-means jugés sur les mêmes patients
//      par des critères chiffrés — information résumée par deux axes, nombre d'axes pour 80 %, STABILITÉ (la
//      méthode refaite sur deux moitiés tirées au hasard donne-t-elle les mêmes axes, les mêmes groupes ?),
//      variables prises en compte — plus la lisibilité.
// Tout est calculé à la main (Jacobi de statistiques.js pour les valeurs propres) ; graine fixe : résultats
// identiques d'un calcul à l'autre.
// ═══════════════════════════════════════════════════════════════════════════════════════════
(function () {
  const onglet = ONGLETS.find((o) => o.nom === 'Analyse multivariée (ACP)'); if (!onglet) return
  const hasard = (graine) => () => { graine |= 0; graine = (graine + 0x6d2b79f5) | 0; let t = Math.imul(graine ^ (graine >>> 15), 1 | graine); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const somme = (t) => t.reduce((a, b) => a + b, 0)

  // ACP sur une matrice déjà recodée (covariance, pas corrélation : le recodage fixe le poids de chaque colonne).
  function axesCovariance(Z) {
    const n = Z.length, p = Z[0].length
    const C = Array.from({ length: p }, (_, i) => Array.from({ length: p }, (_, j) => { let s = 0; for (const r of Z) s += r[i] * r[j]; return s / (n - 1) }))
    const { valeurs: v0, vecteurs: U0 } = Sx.jacobi(C), valeurs = v0.map((v) => Math.max(0, v))
    const U = U0.map((u) => { const m = u.reduce((a, v, j) => (Math.abs(v) > Math.abs(u[a]) ? j : a), 0); return u[m] < 0 ? u.map((v) => -v) : u })
    const total = somme(valeurs) || 1
    return { valeurs, vecteurs: U, inertie: valeurs.map((v) => 100 * v / total), scores: Z.map((z) => U.map((u) => z.reduce((a, v, j) => a + v * u[j], 0))) }
  }
  const QUALI_EXCLUES = new Set(['tranche', 'jour', 'mois', 'garde', 'scolaire', 'quartier'])
  const pour80 = (inertie) => { let s = 0; for (let k = 0; k < inertie.length; k++) { s += inertie[k]; if (s >= 80) return k + 1 } return inertie.length }

  // Matrice mixte : numériques actives de l'ACP (mêmes patients complets, même log) centrées-réduites, puis
  // une colonne par modalité (au moins 3 patients) de chaque qualitative, recodée (1 − p)/√p ou (0 − p)/√p.
  function matriceMixte(c, lignes) {
    const R = preparerAcp(c); if (R.erreur) return { erreur: R.erreur }
    lignes = lignes ?? R.lignes
    const cols = [], groupes = []
    R.act.forEach((v) => {
      const x = lignes.map((i) => (v.log ? Math.log1p(v.brut ? v.brut[i] : v.x[i]) : v.x[i]))
      const m = somme(x) / x.length, s = Math.sqrt(somme(x.map((e) => (e - m) ** 2)) / (x.length - 1)) || 1
      groupes.push({ nom: v.court, type: 'numérique', cols: [cols.length] }); cols.push(x.map((e) => (e - m) / s))
    })
    // Qualitatives cliniques seulement : la tranche d'âge répète l'âge, et le calendrier (jour, mois, garde, période
    // scolaire) et le quartier, avec beaucoup de modalités, dilueraient les axes sans rien dire du patient.
    for (const q of c.pat.quali.filter((q) => !QUALI_EXCLUES.has(q.k))) {
      // Modalités fixées sur TOUS les patients complets (mêmes colonnes quand on refait l'analyse sur une moitié).
      const mods = new Map(); R.lignes.forEach((i) => { const m = q.x[i]; if (m !== null && m !== undefined) mods.set(m, (mods.get(m) ?? 0) + 1) })
      const garde = [...mods.entries()].filter(([, k]) => k >= 3).sort((a, b) => String(a[0]).localeCompare(String(b[0]))); if (garde.length < 2) continue
      const g = { nom: q.nom, type: 'qualitative', cols: [], mods: [] }
      for (const [m] of garde) {
        const k = lignes.filter((i) => q.x[i] === m).length, p = Math.max(k, 1) / lignes.length, r = Math.sqrt(p)
        g.cols.push(cols.length); g.mods.push(m); cols.push(lignes.map((i) => ((q.x[i] === m ? 1 : 0) - p) / r))
      }
      groupes.push(g)
    }
    const Z = lignes.map((_, t) => cols.map((col) => col[t]))
    return { Z, groupes, lignes, R }
  }

  // AFDM : axes, contribution de chaque VARIABLE (somme des carrés des coefficients de ses colonnes).
  function afdm(c, lignes) {
    const M = matriceMixte(c, lignes); if (M.erreur) return M
    if (M.Z.length < M.Z[0].length + 3) return { erreur: `AFDM : ${M.Z.length} patients pour ${M.Z[0].length} colonnes, il en faut davantage.` }
    const A = axesCovariance(M.Z)
    const contrib = M.groupes.map((g) => A.vecteurs.map((u) => 100 * somme(g.cols.map((j) => u[j] ** 2))))
    return { ...M, A, contrib, k80: pour80(A.inertie) }
  }

  // k-means (Lloyd), départ k-means++, meilleur de 10 essais, graine fixe.
  function kmeans(X, g, graine = 20261025) {
    const rnd = hasard(graine), n = X.length, d2 = (a, b) => somme(a.map((v, j) => (v - b[j]) ** 2))
    let meilleur = null
    for (let essai = 0; essai < 10; essai++) {
      const centres = [X[Math.floor(rnd() * n)]]
      while (centres.length < g) {
        const dist = X.map((x) => Math.min(...centres.map((cc) => d2(x, cc)))), tot = somme(dist)
        let u = rnd() * tot, i = 0; while (i < n - 1 && (u -= dist[i]) > 0) i++
        centres.push(X[i])
      }
      let groupe = new Array(n).fill(0)
      for (let it = 0; it < 100; it++) {
        const nouv = X.map((x) => { let b = 0, bd = Infinity; centres.forEach((cc, k) => { const v = d2(x, cc); if (v < bd) { bd = v; b = k } }); return b })
        const fini = nouv.every((v, i) => v === groupe[i]) && it > 0; groupe = nouv
        for (let k = 0; k < g; k++) { const pts = X.filter((_, i) => groupe[i] === k); if (pts.length) centres[k] = pts[0].map((_, j) => somme(pts.map((p) => p[j])) / pts.length) }
        if (fini) break
      }
      const inertie = somme(X.map((x, i) => d2(x, centres[groupe[i]])))
      if (!meilleur || inertie < meilleur.inertie) meilleur = { inertie, centres: centres.map((cc) => [...cc]), groupe }
    }
    return meilleur
  }
  // Silhouette moyenne : pour chaque patient, (b − a)/max(a, b), a = distance moyenne à son groupe, b = au groupe
  // voisin le plus proche. 1 : groupes nets ; 0 : patients à cheval ; < 0 : mal classés. Calculée sur au plus 600
  // patients tirés au hasard (le calcul est en n²).
  function silhouette(X, groupe, g) {
    const rnd = hasard(7), idx = X.map((_, i) => i); for (let i = idx.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [idx[i], idx[k]] = [idx[k], idx[i]] }
    const S = idx.slice(0, 600), dist = (a, b) => Math.sqrt(somme(X[a].map((v, j) => (v - X[b][j]) ** 2)))
    const vals = S.map((i) => {
      const moy = Array.from({ length: g }, (_, k) => { const m = S.filter((j) => j !== i && groupe[j] === k); return m.length ? somme(m.map((j) => dist(i, j))) / m.length : Infinity })
      const a = moy[groupe[i]], b = Math.min(...moy.filter((_, k) => k !== groupe[i]))
      return Number.isFinite(a) && Number.isFinite(b) ? (b - a) / Math.max(a, b) : 0
    })
    return somme(vals) / vals.length
  }

  // Classification sur les axes retenus de l'ACP ; g choisi entre 2 et 6 par la silhouette.
  let cacheClassif = null
  function classification(c) {
    const R = preparerAcp(c); if (R.erreur) return { erreur: R.erreur }
    const cle = `${R.cle}|${R.A.n}`; if (cacheClassif?.cle === cle) return cacheClassif
    const k = Math.max(2, R.A.retenus), X = R.A.scores.map((s) => s.slice(0, k))
    const essais = []; for (let g = 2; g <= Math.min(6, X.length - 1); g++) { const km = kmeans(X, g); essais.push({ g, km, sil: silhouette(X, km.groupe, g) }) }
    const choix = essais.reduce((a, b) => (b.sil > a.sil + 1e-9 ? b : a))
    const profils = Array.from({ length: choix.g }, (_, gr) => {
      const membres = R.lignes.filter((_, t) => choix.km.groupe[t] === gr)
      const num = R.act.map((v) => ({ nom: v.court, moy: somme(membres.map((i) => v.brut ? v.brut[i] : v.x[i])) / (membres.length || 1),
        tous: somme(R.lignes.map((i) => v.brut ? v.brut[i] : v.x[i])) / R.lignes.length }))
      const quali = c.pat.quali.map((q) => {
        const n = {}; membres.forEach((i) => { const m = q.x[i]; if (m !== null && m !== undefined) n[m] = (n[m] ?? 0) + 1 })
        const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0]; return top ? { nom: q.nom, m: top[0], part: top[1] / membres.length } : null
      }).filter(Boolean)
      return { gr, n: membres.length, num, quali }
    })
    cacheClassif = { cle, k, X, essais, choix, profils, R }
    return cacheClassif
  }

  // Stabilité : la méthode refaite sur deux moitiés de patients tirées au hasard. Axes : congruence de Tucker
  // |u₁ · u₂| (1 = mêmes axes) des deux premiers axes. Groupes : indice de Rand (part des paires de patients
  // classées de la même façon — ensemble ou séparés — par les deux classifications), 1 = mêmes groupes.
  function stabilite(c) {
    const R = preparerAcp(c); if (R.erreur) return null
    const rnd = hasard(99), L = [...R.lignes]; for (let i = L.length - 1; i > 0; i--) { const k = Math.floor(rnd() * (i + 1)); [L[i], L[k]] = [L[k], L[i]] }
    const m1 = L.slice(0, L.length >> 1), m2 = L.slice(L.length >> 1)
    const congruence = (U1, U2) => [0, 1].map((k) => Math.abs(somme(U1[k].map((v, j) => v * U2[k][j]))))
    const sousAcp = (lignes) => Sx.acp(lignes.map((i) => R.act.map((v) => v.x[i])), R.act.map((v) => v.nom))
    const a1 = sousAcp(m1), a2 = sousAcp(m2)
    const f1 = afdm(c, m1), f2 = afdm(c, m2)
    const cl = classification(c)
    let rand = null
    if (!cl.erreur && a1 && a2) {
      // centres appris sur chaque moitié (dans le repère de l'ACP complète), puis appliqués à tous les patients
      const idx = new Map(R.lignes.map((i, t) => [i, t])), Xm = (m) => m.map((i) => cl.X[idx.get(i)])
      const c1 = kmeans(Xm(m1), cl.choix.g).centres, c2 = kmeans(Xm(m2), cl.choix.g).centres
      const affecte = (cs) => cl.X.map((x) => cs.reduce((b, cc, k) => (somme(x.map((v, j) => (v - cc[j]) ** 2)) < somme(x.map((v, j) => (v - cs[b][j]) ** 2)) ? k : b), 0))
      const g1 = affecte(c1), g2 = affecte(c2), rr = hasard(5); let accord = 0, paires = 0
      for (let t = 0; t < 20000; t++) { const i = Math.floor(rr() * g1.length), j = Math.floor(rr() * g1.length); if (i === j) continue; paires++; if ((g1[i] === g1[j]) === (g2[i] === g2[j])) accord++ }
      rand = accord / paires
    }
    return { acp: a1 && a2 ? congruence(a1.vecteurs, a2.vecteurs) : null, afdm: !f1.erreur && !f2.erreur ? congruence(f1.A.vecteurs, f2.A.vecteurs) : null, rand }
  }

  // ── Sections ─────────────────────────────────────────────────────────────────────────────
  function rendreAfdm(c) {
    const F = afdm(c); if (F.erreur) return { html: vide(F.erreur), lecture: '' }
    const A = F.A, nq = F.groupes.filter((g) => g.type === 'qualitative').length, cum = A.inertie.map((_, k) => somme(A.inertie.slice(0, k + 1)))
    const lignes = F.groupes.map((g, j) => [echapper(g.nom), g.type, g.cols.length, nf(F.contrib[j][0], 1), nf(F.contrib[j][1], 1)])
    return { mesures: { inertie: A.inertie, k80: F.k80, groupes: F.groupes.map((g, j) => ({ nom: g.nom, type: g.type, c1: F.contrib[j][0], c2: F.contrib[j][1] })), n: F.Z.length },
      avant: bandeauStats([['Patients', F.Z.length], ['Variables numériques', F.groupes.length - nq], ['Variables qualitatives', nq], ['Colonnes (modalités comprises)', F.Z[0].length], ['F1 + F2', `${nf(cum[1], 1)} %`], ['Axes pour 80 %', F.k80]]),
      html: `<div class="ind-deux"><div>${tableau(['Variable', 'Type', 'Colonnes', 'Contribution F1 (%)', 'Contribution F2 (%)'], lignes)}</div>
        <div>${tableau(['Axe', 'Valeur propre', 'Inertie (%)', 'Cumul (%)'], A.valeurs.slice(0, 8).map((v, k) => [`F${k + 1}`, nf(v, 3), nf(A.inertie[k], 1), nf(cum[k], 1)]))}</div></div>`,
      lecture: `l’<b>AFDM</b> (analyse factorielle de données mixtes) fait la même chose que l’ACP, mais avec <b>toutes</b> les variables à la fois : les numériques (âge, durée, prix…) et les qualitatives (sexe, cause, issue, quartier). Chaque modalité d’une variable qualitative devient une colonne 0/1, recodée (indicatrice − p)/√p où p est la part des patients qui ont cette modalité : une modalité rare pèse ainsi autant qu’une fréquente, et chaque variable, numérique ou qualitative, pèse à peu près autant dans la construction des axes. La <b>contribution</b> d’une variable à un axe est la part de l’axe qu’elle construit (somme sur ses modalités). Différence avec l’ACP : l’ACP construit les axes avec les seules variables numériques et ne place les qualitatives qu’après coup ; l’AFDM les fait participer aux axes. Si les deux donnent les mêmes axes, les qualitatives ne changent pas la structure ; si l’AFDM fait apparaître un axe nouveau (une cause, une issue), c’est une information que l’ACP ne voyait pas.` }
  }
  function rendreClassification(c) {
    const C = classification(c); if (C.erreur) return { html: vide(C.erreur), lecture: '' }
    const choix = C.choix, nf1 = (v) => nf(v, 1)
    const tabEssais = tableau(['Nombre de groupes g', 'Silhouette moyenne', 'Inertie intra-groupes', 'Retenu'], C.essais.map((e) => [e.g, nf(e.sil, 3), nf(e.km.inertie, 1), e === choix ? 'oui' : '']))
    const prof = tableau(['Groupe', 'Patients', ...C.profils[0].num.map((v) => `${echapper(v.nom)} (moyenne)`), 'Modalités dominantes'],
      C.profils.map((p) => [`G${p.gr + 1}`, `${p.n} (${nf(100 * p.n / C.X.length, 0)} %)`, ...p.num.map((v) => `${nf1(v.moy)}${v.moy > v.tous * 1.2 ? ' ▲' : v.moy < v.tous * 0.8 ? ' ▼' : ''}`), p.quali.map((q) => `${echapper(q.nom)} : ${echapper(q.m)} (${nf(100 * q.part, 0)} %)`).join(' · ')]))
    return { mesures: { g: choix.g, sil: choix.sil, essais: C.essais.map((e) => ({ g: e.g, sil: e.sil })), profils: C.profils, k: C.k },
      avant: bandeauStats([['Patients', C.X.length], ['Axes utilisés (ACP)', C.k], ['Groupes retenus', choix.g], ['Silhouette', `${nf(choix.sil, 3)} · ${choix.sil >= 0.5 ? 'groupes nets' : choix.sil >= 0.25 ? 'groupes modérés' : 'groupes peu séparés'}`]]),
      html: `${tabEssais}<div style="margin-top:12px">${prof}</div>`,
      lecture: `la <b>classification</b> range les patients en groupes de profils voisins. Méthode <b>k-means</b> : on place g centres, chaque patient rejoint le centre le plus proche, chaque centre se déplace au milieu de son groupe, et on recommence jusqu’à ce que plus rien ne bouge (10 départs différents, on garde le meilleur). Elle travaille sur les coordonnées des ${C.k} premiers axes de l’ACP, ce qui retire le bruit des petits axes. Le nombre de groupes est choisi par la <b>silhouette</b> : pour chaque patient, elle compare la distance moyenne à son propre groupe (a) à celle du groupe voisin (b), (b − a)/max(a, b) ; proche de 1, le patient est bien dans son groupe ; proche de 0, il est à cheval. Au-dessus de 0,5 les groupes sont nets, entre 0,25 et 0,5 modérés, en dessous peu séparés (la population forme plutôt un continuum). Le tableau des profils décrit chaque groupe : ▲ / ▼ = moyenne au moins 20 % au-dessus / au-dessous de celle de tous les patients.` }
  }
  function rendreComparaison(c) {
    const R = preparerAcp(c); if (R.erreur) return { html: vide(R.erreur), lecture: '' }
    const F = afdm(c), C = classification(c), S = stabilite(c), A = R.A
    const cumA = A.inertie[0] + A.inertie[1], cumF = F.erreur ? null : F.A.inertie[0] + F.A.inertie[1]
    const st = (v) => (v ? `${nf(v[0], 2)} / ${nf(v[1], 2)}` : '—'), qual = (v) => (!v ? '—' : Math.min(...v) >= 0.9 ? 'très stable' : Math.min(...v) >= 0.7 ? 'stable' : 'instable')
    const lignes = [
      ['ACP', `${R.act.length} numériques (qualitatives en supplémentaires)`, `${nf(cumA, 1)} %`, pour80(A.inertie), st(S?.acp), qual(S?.acp), 'axes = combinaisons de variables connues ; cercle des corrélations'],
      ['AFDM', F.erreur ? '—' : `${F.groupes.length} (numériques + qualitatives)`, F.erreur ? '—' : `${nf(cumF, 1)} %`, F.erreur ? '—' : F.k80, st(S?.afdm), qual(S?.afdm), 'mêmes lectures que l’ACP, plus les modalités ; axes plus difficiles à nommer'],
      ['k-means', `axes de l’ACP (${C.erreur ? '—' : C.k})`, '—', '—', S?.rand ? `Rand ${nf(S.rand, 2)}` : '—', S?.rand ? (S.rand >= 0.9 ? 'très stable' : S.rand >= 0.75 ? 'stable' : 'instable') : '—', C.erreur ? '—' : `${C.choix.g} groupes, silhouette ${nf(C.choix.sil, 2)}`],
      ['t-SNE / UMAP', '—', 'non mesurable', '—', '—', 'change à chaque calcul', 'écartées : axes sans signification, nouveaux patients impossibles à placer'],
    ]
    return { mesures: { cumA, cumF, k80A: pour80(A.inertie), k80F: F.erreur ? null : F.k80, stab: S, sil: C.erreur ? null : C.choix.sil, g: C.erreur ? null : C.choix.g },
      html: tableau(['Méthode', 'Variables utilisées', 'Information sur F1 + F2', 'Axes pour 80 %', 'Stabilité (moitiés : F1 / F2)', 'Verdict stabilité', 'Lisibilité'], lignes),
      lecture: `<b>banc d’essai des méthodes d’analyse multivariée</b>, sur les mêmes ${A.n} ${registre().dateReference === "date_passage" ? "passages" : "patients"}. Une méthode descriptive ne se juge pas à une erreur de prévision : elle n’en fait pas. On la juge sur quatre critères chiffrés. (1) <b>L’information résumée</b> par les deux premiers axes : plus elle est grande, plus un plan suffit à montrer l’essentiel. (2) <b>Le nombre d’axes pour 80 %</b> : peu d’axes = variables très redondantes. (3) <b>La stabilité</b> : on coupe les patients en deux moitiés au hasard et on refait la méthode sur chacune ; pour les axes, la <b>congruence</b> |u₁ · u₂| vaut 1 si les deux moitiés donnent exactement le même axe (au-dessus de 0,9 : très stable ; en dessous de 0,7 : l’axe dépend des patients tirés et ne doit pas être interprété) ; pour les groupes, l’<b>indice de Rand</b> est la part des paires de patients que les deux classifications traitent de la même façon (ensemble ou séparés). (4) <b>Les variables prises en compte</b> et la lisibilité. Une méthode n’est retenue pour le mémoire que si elle est stable : un résultat qui change quand on change de patients n’est pas un résultat.` }
  }
  window.analyseMultivariee = { afdm, classification, stabilite, pour80 }

  // Après « Interprétation des axes » : AFDM, classification, comparaison.
  const i = onglet.sections.findIndex((s) => s.t === 'Interprétation des axes')
  onglet.sections.splice(i + 1, 0,
    { t: 'AFDM : variables numériques et qualitatives ensemble', rendre: (c) => rendreAfdm(c) },
    { t: 'Classification des patients en groupes (k-means)', rendre: (c) => rendreClassification(c) },
    { t: 'Comparaison des méthodes d’analyse multivariée (banc d’essai)', rendre: (c) => rendreComparaison(c) })
  onglet.desc = 'ACP, AFDM, classification des patients et comparaison des méthodes'
})()
