// ═══════════════════════════════════════════════════════════════════════════════════════════
// Rubrique « Durées inconnues : kNN et XGBoost » : COMMENT un séjour sans date de sortie ni nombre de jours
// reçoit une durée, montré pas à pas sur les séjours saisis (rien d'inventé, tout est recalculé ici).
//
// Pour pouvoir DESSINER, deux variables seulement : le prix payé et l'âge. Le modèle Python
// (traitement/imputation.py) utilise la même mécanique avec plus de colonnes (sexe, nouveau / ancien,
// issue, mois, et les familles de diagnostics pour XGBoost).
//
//   kNN  z-scores calculés sur les séjours connus : z_prix = (ln prix − moyenne) / écart-type, z_âge idem ;
//        distance d = √((Δz_prix)² + (Δz_âge)²) ; durée estimée = médiane des durées des k plus proches,
//        arrondie au pair comme round() en Python ; k choisi par validation croisée en 5 plis.
//   XGBoost  y = ln(1 + durée), F₀ = moyenne de y ; à chaque arbre g_i = F(x_i) − y_i, h_i = 1 ;
//        coupure gardée si gain = ½ [G_G²/(H_G + λ) + G_D²/(H_D + λ) − G²/(H + λ)] > 0, au moins 5 séjours
//        par côté ; feuille w = −G/(H + λ) ; F ← F + η w (η = 0,1, λ = 1) ; durée = e^F − 1, bornée par la
//        plus longue durée vue. Profondeur (2, 3, 4) et nombre d'arbres (25 à 200) choisis par validation
//        croisée en 3 plis, comme en Python. Différence assumée : le Python tire 80 % des séjours pour chaque
//        arbre ; ici tous les séjours servent, pour que chaque somme se vérifie à la main.
// ═══════════════════════════════════════════════════════════════════════════════════════════
(function () {
  const hasard = (graine) => () => { graine |= 0; graine = (graine + 0x6d2b79f5) | 0; let t = Math.imul(graine ^ (graine >>> 15), 1 | graine); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }
  const somme = (t) => t.reduce((a, b) => a + b, 0)
  const moyenne = (t) => somme(t) / t.length
  const ecartType = (t) => { const m = moyenne(t); return Math.sqrt(somme(t.map((v) => (v - m) ** 2)) / t.length) }
  // Quantile de type 7 (numpy, pandas) ; médiane = quantile 0,5.
  const quantile = (v, q) => { const t = v.slice().sort((a, b) => a - b), pos = q * (t.length - 1), b = Math.floor(pos), h = Math.ceil(pos); return t[b] + (t[h] - t[b]) * (pos - b) }
  // Arrondi « au pair » de round() en Python : 2,5 → 2 ; 3,5 → 4.
  const arrondiPair = (x) => { const f = Math.floor(x), d = x - f; return d > 0.5 + 1e-9 ? f + 1 : d < 0.5 - 1e-9 ? f : (f % 2 === 0 ? f : f + 1) }
  const fcfa = (v) => `${nf(v, 0)} FCFA`
  const K_GRILLE = [1, 3, 5, 7, 9, 11, 15, 21, 31, 51]
  const PROFONDEURS = [2, 3, 4], ARBRES = 200, ETA = 0.1, LAMBDA = 1, MIN_FEUILLE = 5
  const ETAPES_CHOIX = [25, 50, 75, 100, 125, 150, 175, 200]
  const ETAPES_FILM = [0, 1, 2, 3, 5, 10, 20, 30, 50, 75, 100, 150, 200]

  // ── Séjours : prix et âge écrits ; durée connue ou non ───────────────────────────────────
  let cache = { cle: null, D: null }
  function donnees() {
    const S = []
    for (const x of lignesPeriode()) {
      const prix = nombre(x.l.prix), age = ageEnMois(x.l.age), duree = dureeEcrite(x.l)
      if (prix !== null && prix > 0 && age !== null && Number.isFinite(age)) S.push({ prix, age, duree, j: x.j })
    }
    const connus = S.filter((s) => s.duree !== null)
    const cle = `${etat.service}|${S.length}|${connus.length}|${somme(S.map((s, i) => (i + 1) * (s.prix % 9973 + 7 * s.age + 13 * (s.duree ?? -1))))}`
    if (cache.cle === cle) return cache.D
    const lp = connus.map((s) => Math.log(s.prix)), ag = connus.map((s) => s.age)
    const D = { S, connus, inconnus: S.filter((s) => s.duree === null) }
    if (connus.length >= 20) {
      Object.assign(D, { mp: moyenne(lp), ep: ecartType(lp) || 1, ma: moyenne(ag), ea: ecartType(ag) || 1 })
      for (const s of S) { s.lp = Math.log(s.prix); s.zp = (s.lp - D.mp) / D.ep; s.za = (s.age - D.ma) / D.ea; s.y = s.duree === null ? null : Math.log1p(s.duree) }
      D.max = Math.max(...connus.map((s) => s.duree)); D.p95 = Math.max(1, quantile(connus.map((s) => s.duree), 0.95))
    }
    cache = { cle, D }
    return D
  }
  const manque = (D) => vide(`Il faut au moins 20 séjours de durée connue avec le prix et l’âge écrits (actuellement ${D.connus.length}). Saisissez d’autres pages.`)
  const quand = (s) => fmtDate(versDate(s.j))
  const libSejour = (s) => `entré le ${quand(s)} · ${fcfa(s.prix)} · ${nf(s.age, 1)} mois${s.duree === null ? ' · sans durée' : ` · ${s.duree} j (cachée)`}`
  // Séjour à estimer : d'abord ceux sans durée, puis des séjours connus dont on cache la durée.
  function choixSejour(c, D) {
    const sans = D.S.map((s, i) => [i, s]).filter(([, s]) => s.duree === null).slice(0, 50)
    const avec = D.S.map((s, i) => [i, s]).filter(([, s]) => s.duree !== null).slice(0, 50)
    const liste = [...sans, ...avec]
    if (!liste.some(([i]) => i === c.opts.ivSejour)) c.opts.ivSejour = liste[0][0]
    return { cible: D.S[c.opts.ivSejour], html: libelle('Séjour à estimer', choix('ivSejour', c.opts.ivSejour, liste.map(([i, s]) => [i, libSejour(s)]), 'style="max-width:420px"')) }
  }
  const choixK = (c, D) => { const g = K_GRILLE.filter((k) => k < D.connus.length); if (!g.includes(c.opts.ivK)) c.opts.ivK = meilleurK(D) ?? 5; return libelle('k (voisins)', choix('ivK', c.opts.ivK, g.map((k) => [k, k]))) }

  // Couleur d'une durée : clair = court, foncé = long (au-delà du 95e centile : la plus foncée).
  const couleurDuree = (v, vmax) => { const t = Math.max(0, Math.min(1, v / (vmax || 1))), a = [214, 228, 255], b = [10, 38, 104]; return `rgb(${a.map((u, i) => Math.round(u + (b[i] - u) * t)).join(',')})` }
  const legendeDuree = (vmax, extra = '') => `<div style="display:flex;gap:16px;flex-wrap:wrap;align-items:center;font-size:12.5px;margin-top:6px">
    <span style="display:inline-flex;align-items:center;gap:6px">durée connue : 0 j <svg width="120" height="12"><defs><linearGradient id="ivGrad"><stop offset="0" stop-color="${couleurDuree(0, 1)}"/><stop offset="1" stop-color="${couleurDuree(1, 1)}"/></linearGradient></defs><rect width="120" height="12" rx="2" fill="url(#ivGrad)"/></svg> ${nf(vmax, 0)} j et plus</span>${extra}</div>`

  // ── kNN ─────────────────────────────────────────────────────────────────────────────────
  const d2 = (a, b) => (a.zp - b.zp) ** 2 + (a.za - b.za) ** 2
  // Les k plus proches de `cible` dans `base` (la cible elle-même exclue), tri stable par distance.
  const plusProches = (cible, base, k) => base.filter((s) => s !== cible).map((s) => ({ s, d2: d2(s, cible) })).sort((a, b) => a.d2 - b.d2).slice(0, k)
  // Durées des voisins, déjà rangées : en clair jusqu'à 12, au-delà comptées par valeur (« 2 j ×7 »).
  const listeDurees = (t) => (t.length <= 12 ? t.join(' ; ') : [...new Set(t)].map((v) => `${v} j ×${t.filter((u) => u === v).length}`).join(' ; '))
  function voteVoisins(vs) {
    const t = vs.map((v) => v.s.duree), med = quantile(t, 0.5), nuits = arrondiPair(med)
    return { t: t.slice().sort((a, b) => a - b), med, nuits, q1: Math.min(Math.floor(quantile(t, 0.25)), nuits), q3: Math.max(Math.ceil(quantile(t, 0.75)), nuits) }
  }
  // Plis : séjours mélangés (graine fixe) puis distribués comme des cartes (positions f, f + p, f + 2p…).
  function plis(n, nb, graine) {
    const r = hasard(graine), o = [...Array(n).keys()]
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [o[i], o[j]] = [o[j], o[i]] }
    return Array.from({ length: nb }, (_, f) => o.filter((_, p) => p % nb === f))
  }
  function cvKnn(D) {
    if (D.cvKnn) return D.cvKnn
    const C = D.connus, n = C.length, P = plis(n, 5, 1), grille = K_GRILLE.filter((k) => k <= n - Math.ceil(n / 5))
    const ev = Object.fromEntries(grille.map((k) => [k, []])), ap = Object.fromEntries(grille.map((k) => [k, []])), mediane = []
    for (const test of P) {
      const dansTest = new Set(test), entr = C.filter((_, i) => !dansTest.has(i)), medEntr = arrondiPair(quantile(entr.map((s) => s.duree), 0.5))
      for (const i of test) {
        const tri = entr.map((s) => ({ s, d2: d2(s, C[i]) })).sort((a, b) => a.d2 - b.d2)
        for (const k of grille) ev[k].push(Math.abs(voteVoisins(tri.slice(0, k)).nuits - C[i].duree))
        mediane.push(Math.abs(medEntr - C[i].duree))
      }
    }
    // Erreur « sur l'apprentissage » : chaque séjour cherche ses voisins parmi TOUS les séjours, lui compris
    // (il est son propre plus proche voisin, à distance 0) : c'est la mesure trompeuse.
    for (const s of C) {
      const tri = C.map((t) => ({ s: t, d2: d2(t, s), moi: t === s })).sort((a, b) => a.d2 - b.d2 || b.moi - a.moi)
      for (const k of grille) ap[k].push(Math.abs(voteVoisins(tri.slice(0, k)).nuits - s.duree))
    }
    const em = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, moyenne(v)]))
    const E = em(ev), best = grille.reduce((a, k) => (E[k] < E[a] - 1e-12 ? k : a), grille[0])
    D.cvKnn = { grille, ev: E, ap: em(ap), best, mediane: moyenne(mediane), tailles: P.map((p) => p.length) }
    return D.cvKnn
  }
  const meilleurK = (D) => (D.connus.length >= 20 ? cvKnn(D).best : null)

  // Repère commun aux deux nuages plats : même échelle sur les deux axes (un cercle reste un cercle).
  function repereEgal(W, H, xs, ys) {
    const ml = 56, mr = 14, mt = 12, mb = 40
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys)
    const px = (x1 - x0) * 0.06 || 1, py = (y1 - y0) * 0.06 || 1; x0 -= px; x1 += px; y0 -= py; y1 += py
    const s = Math.min((W - ml - mr) / (x1 - x0), (H - mt - mb) / (y1 - y0)), cx = (x0 + x1) / 2, cy = (y0 + y1) / 2
    const dx = (W - ml - mr) / s / 2, dy = (H - mt - mb) / s / 2
    return { xmin: cx - dx, xmax: cx + dx, ymin: cy - dy, ymax: cy + dy, s }
  }

  function rendreKnnPlan(c, W, H) {
    const D = donnees(); if (D.connus.length < 20) return { html: manque(D), lecture: '' }
    const { cible, html: optSejour } = choixSejour(c, D), optK = choixK(c, D), k = c.opts.ivK
    const vs = plusProches(cible, D.connus, k), vote = voteVoisins(vs), rayon = Math.sqrt(vs.at(-1).d2)
    const Hh = Math.max(440, H), R = repereEgal(W, Hh, D.S.map((s) => s.zp), D.S.map((s) => s.za))
    const { x, y, fond } = cadre({ W, H: Hh, ...R, titreX: 'prix payé : z = (ln prix − moyenne) / écart-type', titreY: 'âge : z = (âge − moyenne) / écart-type' })
    const voisin = new Set(vs.map((v) => v.s))
    const pts = D.connus.filter((s) => s !== cible).map((s) => `<circle cx="${x(s.zp).toFixed(1)}" cy="${y(s.za).toFixed(1)}" r="${voisin.has(s) ? 4.2 : 3.2}" fill="${couleurDuree(s.duree, D.p95)}" stroke="${voisin.has(s) ? COUL.orange : '#fff'}" stroke-width="${voisin.has(s) ? 2 : 0.6}"><title>${libSejour(s).replace(' (cachée)', '')} · z prix ${nf(s.zp, 2)} · z âge ${nf(s.za, 2)}</title></circle>`).join('')
    const liens = vs.map((v) => `<line x1="${x(cible.zp)}" y1="${y(cible.za)}" x2="${x(v.s.zp)}" y2="${y(v.s.za)}" stroke="${COUL.orange}" stroke-width="1.2" stroke-opacity=".75"/>`).join('')
    const cercle = `<ellipse cx="${x(cible.zp)}" cy="${y(cible.za)}" rx="${rayon * R.s}" ry="${rayon * R.s}" fill="${COUL.orange}" fill-opacity=".06" stroke="${COUL.orange}" stroke-dasharray="5 4"/>`
    const etoile = (cx, cy, r) => `<path d="${Array.from({ length: 10 }, (_, i) => { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; return `${i ? 'L' : 'M'}${(cx + rr * Math.cos(a)).toFixed(1)},${(cy + rr * Math.sin(a)).toFixed(1)}` }).join('')}Z" fill="${COUL.rouge}" stroke="#fff" stroke-width="1.2"/>`
    const clip = `ivclip${Math.round(cible.zp * 1e4)}_${k}`   // le cercle s'arrête au cadre du graphique
    const svg = `<svg width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}"><defs><clipPath id="${clip}"><rect x="56" y="12" width="${W - 70}" height="${Hh - 52}"/></clipPath></defs>${fond}<g clip-path="url(#${clip})">${cercle}${liens}</g>${pts}${etoile(x(cible.zp), y(cible.za), 9)}</svg>`
    const zCalc = `<div style="font-size:13px;margin:8px 0;line-height:1.6"><b>1. Position du séjour à estimer.</b> Prix ${fcfa(cible.prix)} : ln(${nf(cible.prix, 0)}) = ${nf(cible.lp, 3)} ; z_prix = (${nf(cible.lp, 3)} − ${nf(D.mp, 3)}) / ${nf(D.ep, 3)} = <b>${nf(cible.zp, 3)}</b>. Âge ${nf(cible.age, 1)} mois : z_âge = (${nf(cible.age, 1)} − ${nf(D.ma, 2)}) / ${nf(D.ea, 2)} = <b>${nf(cible.za, 3)}</b>. (Moyennes et écarts-types calculés sur les ${D.connus.length} séjours de durée connue.)</div>`
    const lignes = vs.map((v, r) => [r + 1, quand(v.s), fcfa(v.s.prix), nf(v.s.age, 1), nf(v.s.zp, 3), nf(v.s.za, 3), nf((v.s.zp - cible.zp) ** 2, 4), nf((v.s.za - cible.za) ** 2, 4), `<b>${nf(Math.sqrt(v.d2), 3)}</b>`, `<b>${v.s.duree}</b>`])
    const tab = tableau(['Rang', 'Entré le', 'Prix', 'Âge (mois)', 'z prix', 'z âge', '(Δz prix)²', '(Δz âge)²', 'd = √(somme)', 'Durée (j)'], lignes, { hauteur: 300 })
    const verdict = cible.duree === null ? 'Ce séjour n’a pas de durée écrite : c’est cette valeur que la méthode lui donnerait.'
      : `La vraie durée de ce séjour (cachée pendant le calcul) est <b>${cible.duree} j</b> : erreur |${vote.nuits} − ${cible.duree}| = <b>${Math.abs(vote.nuits - cible.duree)} j</b>.`
    const vot = `<div style="font-size:13px;margin:8px 0;line-height:1.6"><b>3. Vote des voisins.</b> Durées des ${k} voisins rangées : ${listeDurees(vote.t)}. Médiane = <b>${nf(vote.med, 1)}</b>, arrondie au pair : <b>${vote.nuits} j</b> estimés ; fourchette du 1er au 3e quartile : ${vote.q1} à ${vote.q3} j. ${verdict}</div>`
    return { options: `${optSejour}${optK}`, mesures: { k, nuits: vote.nuits, q1: vote.q1, q3: vote.q3, vraie: cible.duree },
      avant: bandeauStats([['Séjours connus (prix et âge écrits)', D.connus.length], ['Séjours sans durée (prix et âge écrits)', D.inconnus.length], ['k choisi par validation croisée', meilleurK(D)], ['Rayon du cercle (distance du k-ième)', nf(rayon, 3)], ['Durée estimée', `${vote.nuits} j (${vote.q1}–${vote.q3})`]]),
      html: `${svg}${legendeDuree(D.p95, `<span><svg width="14" height="14"><circle cx="7" cy="7" r="4.5" fill="${couleurDuree(0.5, 1)}" stroke="${COUL.orange}" stroke-width="2"/></svg> voisin retenu</span><span><svg width="16" height="16"><path d="M8 0l2 5.5h5.5l-4.5 3.5 1.8 5.5L8 11l-4.8 3.5L5 9 .5 5.5H6z" fill="${COUL.rouge}"/></svg> séjour à estimer</span>`)}${zCalc}<div style="font-size:13px;margin:8px 0 4px"><b>2. Les ${k} plus proches</b> (distance d au séjour à estimer, calcul complet) :</div>${tab}${vot}`,
      lecture: `chaque point est un <b>séjour de durée connue</b>, placé selon son <b>prix</b> (en abscisse) et son <b>âge</b> (en ordonnée) ; sa couleur donne sa durée (clair : court, foncé : long). L’<b>étoile rouge</b> est le séjour à estimer. <b>Étape 1</b> : on ramène chaque variable à la même unité, le z-score (combien d’écarts-types au-dessus ou au-dessous de la moyenne) ; sans cela, le prix, qui se compte en milliers de FCFA, écraserait l’âge dans la distance. Le prix passe d’abord par le logarithme : un écart de 5 000 à 10 000 FCFA compte autant qu’un écart de 50 000 à 100 000 (c’est le même « doublement »). <b>Étape 2</b> : on calcule la distance de Pythagore d = √((Δz_prix)² + (Δz_âge)²) entre l’étoile et <b>chaque</b> séjour connu, et l’on garde les k plus petites : ce sont les points cerclés d’orange, reliés à l’étoile. Le <b>cercle pointillé</b> a pour rayon la distance du k-ième voisin : tous les voisins sont dedans, tous les autres dehors. Les deux axes ont la <b>même échelle</b> : une même distance compte autant dans les deux sens, c’est pourquoi le cercle est rond. <b>Étape 3</b> : la durée estimée est la <b>médiane</b> des durées des voisins (et non la moyenne : un voisin resté 30 jours ne fait pas basculer l’estimation). Choisissez un séjour <b>connu</b> dans la liste : sa durée est cachée pendant le calcul, ce qui permet de voir l’erreur, exactement comme le fait la validation croisée. Ici deux variables pour pouvoir dessiner ; le modèle Python ajoute le sexe, nouveau / ancien, l’issue et le mois avec la même formule (une somme de carrés de plus par variable).` }
  }

  function rendreKnn3D(c, W, H) {
    const D = donnees(); if (D.connus.length < 20) return { html: manque(D), lecture: '' }
    const { cible, html: optSejour } = choixSejour(c, D), optK = choixK(c, D), k = c.opts.ivK
    const vs = plusProches(cible, D.connus, k), vote = voteVoisins(vs), voisin = new Set(vs.map((v) => v.s))
    const base = D.connus.filter((s) => s !== cible)
    const pts = [...base.map((s) => ({ s, g: voisin.has(s) ? 1 : 0, h: s.duree, info: `${libSejour(s).replace(' (cachée)', '')}${voisin.has(s) ? ' · VOISIN' : ''}` })),
      { s: cible, g: 2, h: vote.nuits, info: `séjour à estimer · durée estimée ${vote.nuits} j (médiane des ${k} voisins)` },
      ...(cible.duree !== null ? [{ s: cible, g: 3, h: cible.duree, info: `vraie durée du séjour à estimer : ${cible.duree} j (cachée pendant le calcul)` }] : [])]
    let normCap = null
    const { id } = nuage3D({ x: pts.map((p) => p.s.zp), y: pts.map((p) => p.h), z: pts.map((p) => p.s.za), noms: ['z prix', 'durée (j)', 'z âge'], halos: false,
      plan: (norm) => { normCap = norm; return [] }, groupesDe: pts.map((p) => p.g), infos: pts.map((p) => p.info),
      groupes: [{ nom: 'autres séjours connus', couleur: '#aab4c3', n: base.length - k }, { nom: `les ${k} voisins`, couleur: COUL.orange, n: k }, { nom: 'séjour à estimer (hauteur = estimation)', couleur: COUL.rouge, n: 1 }, ...(cible.duree !== null ? [{ nom: 'sa vraie durée', couleur: COUL.vert, n: 1 }] : [])] })
    const V = VUES3D.get(id), P = (s, h) => [normCap(0, s.zp), normCap(1, h), normCap(2, s.za)], sol = (s) => [normCap(0, s.zp), -V.L, normCap(2, s.za)]
    V.plan = [...vs.map((v) => [P(cible, vote.nuits), P(v.s, v.s.duree)]), [P(cible, vote.nuits), sol(cible)], ...vs.map((v) => [P(v.s, v.s.duree), sol(v.s)])]
    V.couleurPlan = 'rgba(224,123,0,.75)'; V.epaisseurPlan = 1.4
    return { options: `${optSejour}${optK}`, mesures: { k, nuits: vote.nuits, q1: vote.q1, q3: vote.q3, vraie: cible.duree }, avant: bandeauStats([['Voisins', k], ['Durées des voisins', listeDurees(vote.t)], ['Médiane → estimation', `${nf(vote.med, 1)} → ${vote.nuits} j`], ...(cible.duree !== null ? [['Vraie durée (cachée)', `${cible.duree} j`]] : [])]),
      html: cadre3D(id, Math.max(480, H), ['z prix × durée', 'z prix × z âge (carte)', 'durée × z âge']),
      lecture: `le même calcul <b>en relief</b>. Au sol, les deux variables du kNN (z prix, z âge) ; en <b>hauteur</b>, la durée. Chaque séjour connu est posé à la hauteur de sa durée ; les <b>voisins</b> (orange) sont reliés au sol par un fil et au séjour à estimer par un trait. Le séjour à estimer (rouge) est posé à la hauteur de la <b>médiane</b> de ses voisins : c’est l’estimation. ${cible.duree !== null ? 'Le point vert est sa vraie durée : l’écart vertical rouge-vert est l’erreur. ' : ''}<b>Comment lire</b> : la vue « z prix × z âge (carte) » (de dessus) montre qui est voisin de qui : la distance ne regarde que le sol, jamais la hauteur. Les autres vues montrent si les voisins ont des durées proches (fils de même longueur : estimation sûre) ou très différentes (fils de longueurs variées : estimation fragile, la fourchette q1–q3 s’élargit). Augmentez k : le cercle de voisins s’élargit, on prend des séjours de moins en moins ressemblants, et l’estimation se rapproche de la médiane de tout le service.` }
  }

  // Petit graphique de courbes (axes réels, échelle libre).
  function courbesIV({ W, H, xs, series, titreX, titreY, marque = null, texteMarque = 'choix' }) {
    const tous = series.flatMap((s) => s.y).filter(Number.isFinite), ymax = Math.max(...tous) * 1.1 || 1
    const { x, y, fond } = cadre({ W, H, xmin: Math.min(...xs), xmax: Math.max(...xs), ymin: 0, ymax, titreX, titreY, mb: 60 })
    const lignes = series.map((s) => `<path d="${s.y.map((v, i) => `${i ? 'L' : 'M'}${x(xs[i]).toFixed(1)},${y(v).toFixed(1)}`).join('')}" fill="none" stroke="${s.c}" stroke-width="2.2" ${s.tirets ? 'stroke-dasharray="6 4"' : ''}/>${s.points === false ? '' : s.y.map((v, i) => `<circle cx="${x(xs[i]).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3.2" fill="${s.c}"><title>${s.nom} · ${titreX} ${nf(xs[i], 0)} : ${nf(v, 3)}</title></circle>`).join('')}`).join('')
    const mq = marque !== null ? `<line x1="${x(marque)}" x2="${x(marque)}" y1="${y(ymax)}" y2="${y(0)}" stroke="#17181a" stroke-dasharray="3 3"/><text x="${x(marque) + 5}" y="${y(ymax) + 14}" font-size="11.5" font-weight="700" fill="#17181a">${texteMarque}</text>` : ''
    const leg = series.map((s, i) => `<g transform="translate(${60 + (i % 3) * Math.floor((W - 70) / 3)},${H - 26 + Math.floor(i / 3) * 16})"><path d="M0 -4h22" stroke="${s.c}" stroke-width="2.2" ${s.tirets ? 'stroke-dasharray="6 4"' : ''}/><text x="28" y="0" font-size="12" fill="#3d434c">${s.nom}</text></g>`).join('')
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${fond}${mq}${lignes}${leg}</svg>`
  }

  function rendreKnnCv(c, W, H) {
    const D = donnees(); if (D.connus.length < 20) return { html: manque(D), lecture: '' }
    const V = cvKnn(D), g = V.grille
    const svg = courbesIV({ W, H: Math.max(320, H), xs: g, titreX: 'k', titreY: 'erreur moyenne (jours)', marque: V.best, texteMarque: `k choisi = ${V.best}`,
      series: [{ nom: 'erreur sur des séjours jamais vus (validation croisée)', c: COUL.rouge, y: g.map((k) => V.ev[k]) }, { nom: 'erreur sur les séjours appris (trompeuse)', c: COUL.bleu, tirets: true, y: g.map((k) => V.ap[k]) }, { nom: 'médiane de tout le service', c: COUL.gris, points: false, tirets: true, y: g.map(() => V.mediane) }] })
    const tab = tableau(['k', 'Erreur en validation croisée (j)', 'Erreur sur les séjours appris (j)'], g.map((k) => [k, nf(V.ev[k], 3), nf(V.ap[k], 3)]), { gras: (i) => g[i] === V.best })
    return { mesures: { k: V.best, erreur: V.ev[V.best], mediane: V.mediane, app1: V.ap[1] ?? NaN, kmax: g.at(-1) },
      avant: bandeauStats([['Séjours connus', D.connus.length], ['Taille des 5 plis', V.tailles.join(' ; ')], ['k choisi', V.best], ['Erreur au k choisi', `${nf(V.ev[V.best], 3)} j`], ['Médiane du service (référence)', `${nf(V.mediane, 3)} j`]]),
      html: `${svg}<div style="margin-top:10px">${tab}</div>`,
      lecture: `<b>Pourquoi on ne choisit pas k « à l’œil »</b> : on l’essaie. Les ${D.connus.length} séjours connus sont mélangés (graine fixe) puis distribués comme des cartes en <b>5 paquets</b> (tailles ${V.tailles.join(', ')}). Tour à tour, un paquet est caché : ses séjours sont estimés avec leurs voisins pris <b>seulement</b> dans les 4 autres paquets, et l’on note |durée estimée − vraie durée|. Après 5 tours, chaque séjour a été estimé une fois par un calcul qui ne le connaissait pas ; la moyenne de ces erreurs est la <b>courbe rouge</b>, pour chaque k de la grille ${g.join(', ')}. <b>Courbe bleue en tirets</b> : la même mesure faite sur les séjours appris eux-mêmes ; chaque séjour est alors son propre voisin, à distance 0, et avec k = 1 l’erreur vaut 0 : un score parfait et faux, celui d’un élève qui récite le corrigé. C’est la raison d’être de la validation croisée. <b>Forme de la courbe rouge</b> : avec k petit, l’estimation dépend d’un ou deux séjours, elle saute au hasard (instable) ; avec k grand, on prend des séjours qui ne ressemblent plus au séjour estimé, et l’on retombe sur la médiane de tout le service (<b>trait gris</b>). Le bon k est au <b>creux</b> ; en cas d’égalité, le plus petit. Le modèle Python fait exactement ce calcul (même grille, 5 plis) sur toutes ses variables.` }
  }

  // ── XGBoost : arbres du second ordre, perte carrée ──────────────────────────────────────
  // X[i] = [ln prix, âge] (un arbre ne dépend que de l'ORDRE des valeurs : z-score inutile).
  const NOMS_VAR = ['prix', 'âge']
  const texteSeuil = (j, s) => (j === 0 ? `prix ≤ ${fcfa(Math.exp(s))}` : `âge ≤ ${nf(s, 1)} mois`)
  // `ordres` : les séjours du nœud rangés par chaque variable (rangés une fois à la racine ; un filtre garde
  // l'ordre, ce qui évite de retrier dans chaque nœud).
  const ordresDe = (X, idx) => [0, 1].map((j) => idx.slice().sort((a, b) => X[a][j] - X[b][j]))
  function construireArbre(X, g, ordres, prof, p = 0) {
    const idx = ordres[0], H = idx.length; let G = 0; for (const i of idx) G += g[i]
    const nd = { G, H, w: -G / (H + LAMBDA), feuille: true, prof: p }
    if (p >= prof || H < 2 * MIN_FEUILLE) return nd
    const base = G * G / (H + LAMBDA); let best = null
    for (let j = 0; j < 2; j++) {
      const o = ordres[j]; let GG = 0
      for (let k = 0; k < H - 1; k++) {
        GG += g[o[k]]; const HG = k + 1, HD = H - HG
        if (HG < MIN_FEUILLE || HD < MIN_FEUILLE || X[o[k + 1]][j] - X[o[k]][j] <= 1e-9) continue
        const GD = G - GG, gain = 0.5 * (GG * GG / (HG + LAMBDA) + GD * GD / (HD + LAMBDA) - base)
        if (gain > (best?.gain ?? 0)) best = { gain, j, seuil: (X[o[k]][j] + X[o[k + 1]][j]) / 2, GG, HG, GD, HD }
      }
    }
    if (!best) return nd
    Object.assign(nd, { feuille: false, ...best })
    const aGauche = (i) => X[i][best.j] <= best.seuil
    nd.g = construireArbre(X, g, ordres.map((o) => o.filter(aGauche)), prof, p + 1)
    nd.d = construireArbre(X, g, ordres.map((o) => o.filter((i) => !aGauche(i))), prof, p + 1)
    return nd
  }
  const predireArbre = (nd, x) => { while (!nd.feuille) nd = x[nd.j] <= nd.seuil ? nd.g : nd.d; return nd.w }
  function apprendreXgb(X, y, prof, M = ARBRES) {
    const n = y.length, F0 = moyenne(y), F = new Array(n).fill(F0), arbres = [], ordres = ordresDe(X, [...Array(n).keys()])
    for (let m = 0; m < M; m++) {
      const a = construireArbre(X, F.map((f, i) => f - y[i]), ordres, prof)
      arbres.push(a); for (let i = 0; i < n; i++) F[i] += ETA * predireArbre(a, X[i])
    }
    return { F0, arbres }
  }
  const nuitsDe = (D, f) => Math.min(D.max, Math.max(0, Math.expm1(f)))
  const XDe = (s) => [s.lp, s.age]
  // Validation croisée en 3 plis pour chaque profondeur ; erreur lue après chaque arbre (une seule passe).
  function cvXgb(D) {
    if (D.cvXgb) return D.cvXgb
    const C = D.connus, P = plis(C.length, 3, 1), ev = {}, ap = {}
    for (const prof of PROFONDEURS) {
      const err = new Array(ARBRES + 1).fill(0)
      for (const test of P) {
        const dansTest = new Set(test), entr = C.filter((_, i) => !dansTest.has(i))
        const mod = apprendreXgb(entr.map(XDe), entr.map((s) => s.y), prof), F = test.map(() => mod.F0)
        test.forEach((i, t) => { err[0] += Math.abs(Math.round(nuitsDe(D, F[t])) - C[i].duree) })
        mod.arbres.forEach((a, m) => test.forEach((i, t) => { F[t] += ETA * predireArbre(a, XDe(C[i])); err[m + 1] += Math.abs(Math.round(nuitsDe(D, F[t])) - C[i].duree) }))
      }
      ev[prof] = err.map((e) => e / C.length)
      const tout = apprendreXgb(C.map(XDe), C.map((s) => s.y), prof), F = C.map(() => tout.F0), ea = [moyenne(C.map((s, i) => Math.abs(Math.round(nuitsDe(D, F[i])) - s.duree)))]
      tout.arbres.forEach((a) => { C.forEach((s, i) => { F[i] += ETA * predireArbre(a, XDe(s)) }); ea.push(moyenne(C.map((s, i) => Math.abs(Math.round(nuitsDe(D, F[i])) - s.duree)))) })
      ap[prof] = { err: ea, modele: tout }
    }
    let best = null
    for (const prof of PROFONDEURS) for (const m of ETAPES_CHOIX) if (!best || ev[prof][m] < best.e - 1e-12) best = { prof, m, e: ev[prof][m] }
    D.cvXgb = { ev, ap, best, tailles: P.map((p) => p.length) }
    return D.cvXgb
  }
  const choixProf = (c, D) => { const b = cvXgb(D).best; if (!PROFONDEURS.includes(c.opts.ivProf)) c.opts.ivProf = b.prof; return libelle('Profondeur des arbres', choix('ivProf', c.opts.ivProf, PROFONDEURS.map((p) => [p, `${p}${p === b.prof ? ' (choisie par la validation croisée)' : ''}`]))) }

  // Toutes les coupures possibles à la racine (pour le tableau du calcul du gain).
  function candidatsRacine(X, g) {
    const n = g.length, G = somme(g), base = G * G / (n + LAMBDA), res = []
    for (let j = 0; j < 2; j++) {
      const o = [...Array(n).keys()].sort((a, b) => X[a][j] - X[b][j]); let GG = 0
      for (let k = 0; k < n - 1; k++) {
        GG += g[o[k]]; const HG = k + 1, HD = n - HG
        if (HG < MIN_FEUILLE || HD < MIN_FEUILLE || X[o[k + 1]][j] - X[o[k]][j] <= 1e-9) continue
        const GD = G - GG
        res.push({ j, seuil: (X[o[k]][j] + X[o[k + 1]][j]) / 2, GG, HG, GD, HD, tG: GG * GG / (HG + LAMBDA), tD: GD * GD / (HD + LAMBDA), base, gain: 0.5 * (GG * GG / (HG + LAMBDA) + GD * GD / (HD + LAMBDA) - base) })
      }
    }
    return res.sort((a, b) => b.gain - a.gain)
  }
  // Dessin de l'arbre : feuilles rangées de gauche à droite, chaque nœud au milieu de ses feuilles.
  function dessinArbre(D, F0, racine, W) {
    const feuilles = [], placer = (nd) => { if (nd.feuille) { nd.ordre = feuilles.length; feuilles.push(nd); return nd.ordre } nd.ordre = (placer(nd.g) + placer(nd.d)) / 2; return nd.ordre }
    placer(racine)
    const pmax = Math.max(...feuilles.map((f) => f.prof)), larg = Math.max(W - 10, feuilles.length * 168), hN = 122, Ht = (pmax + 1) * hN + 10, bw = 156, bh = 92
    const px = (nd) => (nd.ordre + 0.5) * larg / feuilles.length, py = (nd) => 8 + nd.prof * hN
    let traits = '', boites = ''
    const parcours = (nd) => {
      const x0 = px(nd) - bw / 2, y0 = py(nd)
      if (!nd.feuille) for (const [f, t] of [[nd.g, 'oui'], [nd.d, 'non']]) {
        traits += `<path d="M${px(nd)},${y0 + bh} C${px(nd)},${y0 + bh + 18} ${px(f)},${py(f) - 18} ${px(f)},${py(f)}" fill="none" stroke="#9aa1ab" stroke-width="1.4"/><text x="${(px(nd) + px(f)) / 2 + (t === 'oui' ? -8 : 8)}" y="${(y0 + bh + py(f)) / 2 + 4}" text-anchor="${t === 'oui' ? 'end' : 'start'}" font-size="11.5" font-weight="700" fill="${t === 'oui' ? COUL.vert : COUL.rouge}">${t}</text>`
        parcours(f)
      }
      const t = nd.feuille
        ? [`<tspan font-weight="700">feuille · ${nd.H} séjours</tspan>`, `G = ${nf(nd.G, 3)} · H = ${nd.H}`, `w = −G/(H + 1) = <tspan font-weight="700">${nf(nd.w, 4)}</tspan>`, `F₀ + 0,1·w = ${nf(F0 + ETA * nd.w, 3)}`, `→ e^F − 1 = <tspan font-weight="700">${nf(nuitsDe(D, F0 + ETA * nd.w), 2)} j</tspan>`]
        : [`<tspan font-weight="700">${texteSeuil(nd.j, nd.seuil)} ?</tspan>`, `${nd.H} séjours · G = ${nf(nd.G, 3)}`, `gauche ${nd.HG} · droite ${nd.HD}`, `gain = <tspan font-weight="700">${nf(nd.gain, 3)}</tspan>`]
      const fondB = nd.feuille ? (nd.w >= 0 ? '#fff4e6' : '#eaf1ff') : '#f6f7f9', bord = nd.feuille ? (nd.w >= 0 ? COUL.orange : COUL.bleu) : '#c3c8cf'
      boites += `<rect x="${x0}" y="${y0}" width="${bw}" height="${bh}" rx="7" fill="${fondB}" stroke="${bord}" stroke-width="1.3"/>${t.map((l, i) => `<text x="${px(nd)}" y="${y0 + 17 + i * 16}" text-anchor="middle" font-size="11" fill="#2b3038">${l}</text>`).join('')}`
    }
    parcours(racine)
    return { svg: `<div style="overflow-x:auto"><svg width="${larg}" height="${Ht}" viewBox="0 0 ${larg} ${Ht}">${traits}${boites}</svg></div>`, feuilles }
  }
  // Carte du plan découpé par l'arbre : un rectangle par feuille (bornes héritées des questions).
  function carteArbre(D, racine, W, H) {
    const xs = D.connus.map((s) => s.lp), ys = D.connus.map((s) => s.age)
    const X0 = Math.min(...xs) - 0.05, X1 = Math.max(...xs) + 0.05, Y0 = Math.min(...ys) - 1, Y1 = Math.max(...ys) + 1
    const { x, y, fond } = cadre({ W, H, xmin: X0, xmax: X1, ymin: Y0, ymax: Y1, titreX: 'prix payé (échelle logarithmique : graduations en ln prix)', titreY: 'âge (mois)' })
    const wmax = Math.max(1e-9, ...D._feuilles.map((f) => Math.abs(f.w)))
    let rects = ''
    const zone = (nd, b) => {
      if (nd.feuille) {
        const a = Math.min(1, Math.abs(nd.w) / wmax), coul = nd.w >= 0 ? COUL.orange : COUL.bleu, rx = x(b[0]), ry = y(b[3]), rw = x(b[1]) - x(b[0]), rh = y(b[2]) - y(b[3])
        rects += `<rect x="${rx}" y="${ry}" width="${rw}" height="${rh}" fill="${coul}" fill-opacity="${(0.08 + 0.32 * a).toFixed(2)}" stroke="#17181a" stroke-width="1.2"/>`
        if (rw > 70 && rh > 30) rects += `<text x="${rx + rw / 2}" y="${ry + rh / 2 + 4}" text-anchor="middle" font-size="11.5" font-weight="700" fill="#2b3038">w = ${nf(nd.w, 3)} · ${nd.H} séj.</text>`
        return
      }
      const bg = b.slice(), bd = b.slice()
      if (nd.j === 0) { bg[1] = nd.seuil; bd[0] = nd.seuil } else { bg[3] = nd.seuil; bd[2] = nd.seuil }
      zone(nd.g, bg); zone(nd.d, bd)
    }
    zone(racine, [X0, X1, Y0, Y1])
    const pts = D.connus.map((s) => `<circle cx="${x(s.lp).toFixed(1)}" cy="${y(s.age).toFixed(1)}" r="2.6" fill="${couleurDuree(s.duree, D.p95)}" stroke="#fff" stroke-width=".5"><title>${libSejour(s).replace(' (cachée)', '')}</title></circle>`).join('')
    return `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">${rects}${fond}${pts}</svg>`
  }

  function rendreXgbArbre(c, W, H) {
    const D = donnees(); if (D.connus.length < 20) return { html: manque(D), lecture: '' }
    const optProf = choixProf(c, D), prof = c.opts.ivProf, C = D.connus
    const X = C.map(XDe), y = C.map((s) => s.y), F0 = moyenne(y), g = y.map((v) => F0 - v)
    const racine = construireArbre(X, g, ordresDe(X, [...Array(C.length).keys()]), prof)
    const { svg, feuilles } = dessinArbre(D, F0, racine, W); D._feuilles = feuilles
    const ex = C.slice(0, 4).map((s, i) => [quand(s), fcfa(s.prix), nf(s.age, 1), s.duree, `ln(1 + ${s.duree}) = ${nf(s.y, 3)}`, `${nf(F0, 3)} − ${nf(s.y, 3)} = <b>${nf(g[i], 3)}</b>`])
    const cands = candidatsRacine(X, g), b = cands[0]
    const meilleurs = [0, 1].map((j) => cands.find((k) => k.j === j)).filter(Boolean)
    const tabC = tableau(['Question', 'Séjours à gauche H_G', 'G_G', 'Séjours à droite H_D', 'G_D', 'G_G²/(H_G+1)', 'G_D²/(H_D+1)', 'gain = ½(… + … − G²/(H+1))'],
      cands.slice(0, 8).map((k) => [texteSeuil(k.j, k.seuil), k.HG, nf(k.GG, 3), k.HD, nf(k.GD, 3), nf(k.tG, 3), nf(k.tD, 3), `<b>${nf(k.gain, 4)}</b>`]), { gras: (i) => i === 0 })
    const Wc = Math.min(W, 760), Hc = 380
    const etape = (n, t) => `<div style="font-size:13px;margin:10px 0 4px;line-height:1.6"><b>${n}.</b> ${t}</div>`
    return { options: optProf,
      mesures: b ? { question: texteSeuil(b.j, b.seuil), gain: b.gain, gPrix: meilleurs.find((k) => k.j === 0)?.gain ?? 0, gAge: meilleurs.find((k) => k.j === 1)?.gain ?? 0 } : null,
      avant: bandeauStats([['Séjours connus', C.length], ['F₀ = moyenne de ln(1 + durée)', `${nf(F0, 4)} (soit ${nf(Math.expm1(F0), 2)} j)`], ['Coupures essayées à la racine', cands.length], ['Meilleure question', b ? texteSeuil(b.j, b.seuil) : '—'], ['Feuilles', feuilles.length]]),
      html: `${etape(1, `<b>Départ.</b> Avant tout arbre, chaque séjour reçoit la même prévision F₀ = moyenne des y = ln(1 + durée) = <b>${nf(F0, 4)}</b>. On travaille sur ln(1 + durée) pour la même raison que pour le prix : les longues durées sont rares et étirées.`)}
        ${etape(2, `<b>Ce qu’il reste à expliquer.</b> Pour chaque séjour, la dérivée de la perte carrée ½(F − y)² donne g = F₀ − y (positive si le séjour a été plus court que prévu, négative s’il a été plus long) et la dérivée seconde h = 1. Les quatre premiers séjours :`)}
        ${tableau(['Entré le', 'Prix', 'Âge (mois)', 'Durée (j)', 'y', 'g = F₀ − y'], ex)}
        ${etape(3, `<b>Chercher la meilleure question.</b> À la racine, G = Σg = ${nf(Math.abs(racine.G) < 1e-9 ? 0 : racine.G, 6)} (toujours 0 : F₀ est la moyenne) et H = Σh = ${racine.H}. Pour chaque variable, on range les séjours et l’on essaie <b>toutes</b> les coupures entre deux valeurs voisines (au moins ${MIN_FEUILLE} séjours de chaque côté) ; le seuil est placé au milieu des deux valeurs (pour le prix, au milieu en logarithme : entre 10 000 et 15 000 FCFA, √(10 000 × 15 000) ≈ 12 247). Pour chacune : gain = ½ [G_G²/(H_G + λ) + G_D²/(H_D + λ) − G²/(H + λ)] avec λ = ${LAMBDA}. Les huit meilleures sur ${cands.length} :`)}
        ${tabC}
        ${b ? etape(4, `<b>Lecture de la meilleure.</b> « ${texteSeuil(b.j, b.seuil)} ? » : à gauche ${b.HG} séjours dont les g s’additionnent à ${nf(b.GG, 3)}, à droite ${b.HD} séjours (${nf(b.GD, 3)}). Un G loin de 0 veut dire « ce groupe a des durées qui s’écartent toutes dans le même sens » : la question sépare des courts et des longs. ${meilleurs.length === 2 ? `Meilleure question sur le prix : gain ${nf(meilleurs.find((k) => k.j === 0).gain, 3)} ; sur l’âge : ${nf(meilleurs.find((k) => k.j === 1).gain, 3)}. ` : ''}On recommence dans chaque moitié jusqu’à la profondeur ${prof}, ou jusqu’à ce qu’aucune coupure n’ait un gain positif.`) : ''}
        ${etape(5, '<b>L’arbre obtenu</b> (vert : la réponse est oui, on va à gauche ; rouge : non). Chaque feuille reçoit w = −G/(H + λ) : la correction moyenne de ses séjours, un peu rétrécie vers 0 par λ. Orange : séjours plus longs que F₀ ; bleu : plus courts.')}
        ${svg}
        ${etape(6, '<b>Le même arbre vu comme une carte</b> : chaque question coupe le plan par un trait vertical (prix) ou horizontal (âge) ; chaque rectangle est une feuille. Les points sont les séjours, colorés par leur vraie durée.')}
        ${carteArbre(D, racine, Wc, Hc)}${legendeDuree(D.p95, `<span><svg width="26" height="12"><rect width="12" height="12" fill="${COUL.orange}" fill-opacity=".35"/><rect x="14" width="12" height="12" fill="${COUL.bleu}" fill-opacity=".35"/></svg> feuille : séjours plus longs / plus courts que F₀</span>`)}`,
      lecture: `<b>Un seul arbre, calculé à la main sous vos yeux.</b> XGBoost ne cherche pas des voisins : il pose des <b>questions</b> du type « prix ≤ 7 500 FCFA ? » ou « âge ≤ 24 mois ? », et range chaque séjour dans une case (une <b>feuille</b>). La meilleure question est celle qui sépare le mieux les séjours plus longs que prévu (g négatif) des séjours plus courts (g positif) : c’est ce que mesure le <b>gain</b>. Quand un côté rassemble des g de même signe, G_G² est grand et le gain monte ; si la question mélange tout, G_G et G_D restent proches de 0 et le gain est nul. λ = 1 au dénominateur empêche une feuille de quelques séjours de prendre une valeur extrême. Ce premier arbre corrige très peu (×η = 0,1) : XGBoost en empile <b>des centaines</b>, chacun corrigeant ce que les précédents ont raté (rubrique suivante, en 3D). Pas besoin de z-score pour un arbre : il ne regarde que l’<b>ordre</b> des valeurs. Le modèle Python fait le même calcul sur toutes ses variables, avec en plus une direction par défaut pour les cases vides et un tirage de 80 % des séjours par arbre.` }
  }

  // ── Film : la surface des durées après 0, 1, 2, … 200 arbres ────────────────────────────
  const FILMS_IV = new Map()
  function rendreXgbFilm(c, W, H) {
    const D = donnees(); if (D.connus.length < 20) return { html: manque(D), lecture: '' }
    const optProf = choixProf(c, D), prof = c.opts.ivProf, CV = cvXgb(D), mod = CV.ap[prof].modele, C = D.connus
    const xs = C.map((s) => s.lp), ys = C.map((s) => s.age), N = 26
    const [xa, xb, ya, yb] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
    const gx = (i) => xa + (xb - xa) * i / (N - 1), gy = (j) => ya + (yb - ya) * j / (N - 1)
    // Prévision sur la grille et sur les séjours, cumulée arbre après arbre, gardée aux étapes du film.
    const F = Array.from({ length: N }, () => new Array(N).fill(mod.F0)), Fs = C.map(() => mod.F0), images = []
    const photo = (m) => images.push({ m, G: F.map((l) => l.map((f) => nuitsDe(D, f))), P: Fs.map((f) => nuitsDe(D, f)), err: moyenne(C.map((s, i) => Math.abs(Math.round(nuitsDe(D, Fs[i])) - s.duree))) })
    photo(0)
    mod.arbres.forEach((a, t) => {
      for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) F[i][j] += ETA * predireArbre(a, [gx(i), gy(j)])
      C.forEach((s, i) => { Fs[i] += ETA * predireArbre(a, XDe(s)) })
      if (ETAPES_FILM.includes(t + 1)) photo(t + 1)
    })
    let normCap = null
    const v3 = nuage3D({ x: xs, y: C.map((s) => s.duree), z: ys, noms: ['prix', 'durée (j)', 'âge (mois)'], halos: false, plan: (norm) => { normCap = norm; return [] },
      groupesDe: C.map(() => 0), infos: C.map((s) => libSejour(s).replace(' (cachée)', '')),
      groupes: [{ nom: 'séjour plus long que la surface', couleur: COUL.orange }, { nom: 'séjour plus court que la surface', couleur: COUL.bleu }] })
    const V = VUES3D.get(v3.id)
    V.bornes[0] = [fcfa(Math.exp(Math.min(...xs))), fcfa(Math.exp(Math.max(...xs)))]
    const segments = (k) => {
      const G = images[k].G, seg = [], Q = (i, j) => [normCap(0, gx(i)), Math.max(-1.2, Math.min(1.2, normCap(1, G[i][j]))), normCap(2, gy(j))]
      for (let i = 0; i < N; i++) for (let j = 0; j + 1 < N; j++) seg.push([Q(i, j), Q(i, j + 1)])
      for (let j = 0; j < N; j++) for (let i = 0; i + 1 < N; i++) seg.push([Q(i, j), Q(i + 1, j)])
      return seg
    }
    const id = `ivfilm${FILMS_IV.size}`
    // Vue de dessus 2D : la durée prévue en chaque point du plan, une image par étape.
    const W2 = Math.min(W, 560), H2 = 380
    const { x, y, fond } = cadre({ W: W2, H: H2, xmin: gx(0), xmax: gx(N - 1), ymin: gy(0), ymax: gy(N - 1), titreX: 'prix payé (graduations en ln prix)', titreY: 'âge (mois)' })
    const cw = (x(gx(N - 1)) - x(gx(0))) / (N - 1), ch = (y(gy(0)) - y(gy(N - 1))) / (N - 1)
    const imgs2d = images.map((im, k) => `<g data-ivimage="${k}" style="display:${k ? 'none' : 'inline'}">${im.G.map((l, i) => l.map((v, j) => `<rect x="${(x(gx(i)) - cw / 2).toFixed(1)}" y="${(y(gy(j)) - ch / 2).toFixed(1)}" width="${(cw + 0.6).toFixed(1)}" height="${(ch + 0.6).toFixed(1)}" fill="${couleurDuree(v, D.p95)}"/>`).join('')).join('')}</g>`).join('')
    const pts2d = C.map((s) => `<circle cx="${x(s.lp).toFixed(1)}" cy="${y(s.age).toFixed(1)}" r="2.6" fill="${couleurDuree(s.duree, D.p95)}" stroke="#17181a" stroke-width=".7"><title>${libSejour(s).replace(' (cachée)', '')}</title></circle>`).join('')
    const svg2d = `<svg data-ivfilm="${id}" width="${W2}" height="${H2}" viewBox="0 0 ${W2} ${H2}">${imgs2d}${fond}${pts2d}</svg>`
    const info = (k) => { const im = images[k], e = im.m ? CV.ev[prof][im.m] : CV.ev[prof][0]; return `après ${im.m} arbre${im.m > 1 ? 's' : ''} · erreur sur les séjours appris ${nf(im.err, 3)} j · sur des séjours jamais vus (3 plis) ${nf(e, 3)} j` }
    FILMS_IV.set(id, { images, segments, id3d: v3.id, k: 0, minuteur: null, info, normCap: () => normCap })
    montrer(id, 0, true)
    return { options: optProf, mesures: { prof, m: CV.best.m, e0: CV.ev[prof][0], eChoix: CV.ev[prof][CV.best.m], eApp: CV.ap[prof].err[CV.best.m] },
      avant: `<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;margin:6px 0">
        <button type="button" class="btn" data-iv-jouer="${id}">▶ Lire</button>
        <input type="range" min="0" max="${images.length - 1}" value="0" data-iv-curseur="${id}" style="width:260px" aria-label="Nombre d’arbres">
        <span data-iv-info="${id}" style="font-weight:600">${info(0)}</span></div>
        ${bandeauStats([['Profondeur', prof], ['Nombre d’arbres choisi (validation croisée)', CV.best.prof === prof ? CV.best.m : `${CV.best.m} (à la profondeur ${CV.best.prof})`], ['η (pas)', '0,1'], ['λ', LAMBDA]])}`,
      html: `<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:flex-start"><div>${svg2d}${legendeDuree(D.p95, '<span>fond : durée prévue · points : vraie durée</span>')}</div><div style="flex:1;min-width:380px">${cadre3D(v3.id, 440, ['prix × durée', 'prix × âge (carte)', 'durée × âge'])}</div></div>`,
      lecture: `XGBoost <b>construit sa réponse petit à petit</b>. Le curseur fait défiler le modèle après 0, 1, 2, 3, 5, 10, 20… 200 arbres (▶ Lire pour le film). <b>À droite, en relief</b> : au sol le prix et l’âge, en hauteur la durée. La <b>nappe</b> quadrillée est la durée que le modèle prévoirait en chaque point du plan ; chaque séjour connu est posé à la hauteur de sa <b>vraie</b> durée, en orange s’il est au-dessus de la nappe (le modèle le sous-estime), en bleu s’il est en dessous. <b>Après 0 arbre</b>, la nappe est plate : tout le monde reçoit e^F₀ − 1. <b>Chaque arbre</b> ajoute 0,1 × w de sa feuille : la nappe se plie en <b>marches d’escalier</b> (un arbre découpe le plan en rectangles), de plus en plus fines à mesure que les arbres s’empilent, et elle monte vers les séjours orange et descend vers les bleus. <b>À gauche</b>, la même nappe vue de dessus (vue « carte »). Le bandeau donne l’erreur moyenne en jours : sur les séjours appris, elle baisse toujours ; sur des séjours jamais vus (validation croisée en 3 plis), elle baisse puis se stabilise ou remonte : au-delà, le modèle apprend le <b>bruit</b> des séjours (sur-apprentissage). C’est pour cela que le nombre d’arbres est choisi par validation croisée (rubrique suivante) et non « le plus possible ». La durée prévue est bornée par la plus longue durée vue (${D.max} j).` }
  }
  function montrer(id, k, avantAffichage = false) {
    const f = FILMS_IV.get(id); if (!f) return
    f.k = k
    const d = VUES3D.get(f.id3d), norm = f.normCap()
    if (d && norm) { d.plan = f.segments(k); d.couleurPlan = 'rgba(123,63,228,.42)'; d.epaisseurPlan = 0.9; d.points.forEach((p, i) => { p.g = f.images[k].P[i] <= cache.D.connus[i].duree ? 0 : 1 }) }
    if (avantAffichage) return
    document.querySelectorAll(`svg[data-ivfilm="${id}"] [data-ivimage]`).forEach((gr) => { gr.style.display = +gr.dataset.ivimage === k ? 'inline' : 'none' })
    const cur = document.querySelector(`[data-iv-curseur="${id}"]`); if (cur) cur.value = k
    const inf = document.querySelector(`[data-iv-info="${id}"]`); if (inf) inf.textContent = f.info(k)
    document.querySelector(`[data-vue3d="${f.id3d}"]`)?.dispatchEvent(new Event('vue3d-redessiner'))
  }
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-iv-jouer]'); if (!b) return
    const f = FILMS_IV.get(b.dataset.ivJouer); if (!f) return
    if (f.minuteur) { clearInterval(f.minuteur); f.minuteur = null; b.textContent = '▶ Lire'; return }
    if (f.k >= f.images.length - 1) montrer(b.dataset.ivJouer, 0)
    b.textContent = '❚❚ Pause'
    f.minuteur = setInterval(() => {
      if (!document.body.contains(b) || f.k >= f.images.length - 1) { clearInterval(f.minuteur); f.minuteur = null; b.textContent = '▶ Lire'; return }
      montrer(b.dataset.ivJouer, f.k + 1)
    }, 700)
  })
  document.addEventListener('input', (e) => { const r = e.target.closest('[data-iv-curseur]'); if (r) montrer(r.dataset.ivCurseur, +r.value) })

  function rendreXgbCv(c, W, H) {
    const D = donnees(); if (D.connus.length < 20) return { html: manque(D), lecture: '' }
    const CV = cvXgb(D), b = CV.best, xs = Array.from({ length: ARBRES }, (_, i) => i + 1)
    const coul = { 2: COUL.bleu, 3: COUL.vert, 4: COUL.violet }
    const svg = courbesIV({ W, H: Math.max(340, H), xs, titreX: 'nombre d’arbres', titreY: 'erreur moyenne (jours)', marque: b.m, texteMarque: `choix : profondeur ${b.prof}, ${b.m} arbres`,
      series: PROFONDEURS.flatMap((p) => [{ nom: `profondeur ${p}, séjours jamais vus`, c: coul[p], points: false, y: xs.map((m) => CV.ev[p][m]) }, { nom: `profondeur ${p}, séjours appris`, c: coul[p], tirets: true, points: false, y: xs.map((m) => CV.ap[p].err[m]) }]) })
    const kb = meilleurK(D), cvk = cvKnn(D)
    const tab = tableau(['Nombre d’arbres', ...PROFONDEURS.map((p) => `Profondeur ${p} (j)`)], ETAPES_CHOIX.map((m) => [m, ...PROFONDEURS.map((p) => (p === b.prof && m === b.m ? `<b>${nf(CV.ev[p][m], 3)}</b>` : nf(CV.ev[p][m], 3)))]))
    return { mesures: { prof: b.prof, m: b.m, xgb: b.e, knn: cvk.ev[kb], k: kb, med: cvk.mediane },
      avant: bandeauStats([['Taille des 3 plis', CV.tailles.join(' ; ')], ['Réglage choisi', `profondeur ${b.prof}, ${b.m} arbres`], ['Erreur XGBoost (jamais vus)', `${nf(b.e, 3)} j`], [`Erreur kNN (k = ${kb}, 5 plis)`, `${nf(cvk.ev[kb], 3)} j`], ['Médiane du service', `${nf(cvk.mediane, 3)} j`]]),
      html: `${svg}<div style="margin-top:10px">${tab}</div>`,
      lecture: `deux réglages à choisir : la <b>profondeur</b> des arbres (combien de questions à la suite : 2, 3 ou 4) et le <b>nombre d’arbres</b>. Les séjours connus sont distribués en <b>3 paquets</b> ; tour à tour, un paquet est caché, ${ARBRES} arbres sont appris sur les deux autres, et l’erreur |durée prévue − vraie durée| des séjours cachés est lue <b>après chaque arbre</b> (une seule passe suffit, puisqu’un modèle à 100 arbres est le début d’un modèle à 200). <b>Traits pleins</b> : erreur sur des séjours jamais vus, la seule qui compte ; <b>tirets</b> : erreur sur les séjours appris, qui baisse toujours (l’élève qui apprend par cœur). Au début, les deux baissent : les arbres apprennent la vraie forme (le prix et l’âge comptent). Puis les tirets continuent de descendre alors que les traits pleins s’aplatissent ou remontent : le modèle apprend le bruit. Le choix est la plus petite erreur pleine parmi 25, 50, … 200 arbres (comme en Python ; en cas d’égalité, la profondeur la plus faible puis le moins d’arbres). Le bandeau compare, sur ces deux seules variables, XGBoost, le kNN et la médiane du service : ces erreurs sont un peu optimistes (le réglage est choisi sur les mêmes séjours) ; les vraies comparaisons, avec toutes les variables et une évaluation séparée, sont celles du banc P1 et de la validation des durées (chapitre 4 du mémoire).` }
  }

  ICONES.voisins = ['#e07b00', '<circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="7" stroke-dasharray="2.5 2.5"/><circle cx="6" cy="5" r="1.4"/><circle cx="19" cy="8" r="1.4"/><circle cx="16" cy="18" r="1.4"/><path d="M12 12 6 5M12 12l7-4M12 12l4 6"/>']
  ONGLETS.push({ nom: 'Durées inconnues : kNN et XGBoost', ico: 'voisins', desc: 'Comment un séjour sans durée est estimé : voisins, arbres, validation croisée, en 2D et en 3D', sections: [
    { t: 'kNN pas à pas : un séjour et ses k plus proches voisins', h: 460, rendre: rendreKnnPlan },
    { t: 'kNN en 3D : la durée des voisins en hauteur', h: 480, d3: true, rendre: rendreKnn3D },
    { t: 'kNN : choisir k par validation croisée (5 plis)', h: 340, rendre: rendreKnnCv },
    { t: 'XGBoost pas à pas : le premier arbre, calcul par calcul', h: 420, rendre: rendreXgbArbre },
    { t: 'XGBoost en 3D : la surface des durées, arbre après arbre', h: 480, d3: true, rendre: rendreXgbFilm },
    { t: 'XGBoost : profondeur et nombre d’arbres par validation croisée (3 plis)', h: 340, rendre: rendreXgbCv },
  ] })
})()
