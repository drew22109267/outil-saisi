// ═══════════════════════════════════════════════════════════════════════════════════════════
// Navigation dans le temps pour TOUS les graphes jour par jour (ceux dessinés par lignesSvg) :
//   - regroupement : jour, semaine (lundi → dimanche), mois, année — chaque point est la MOYENNE des jours
//     de la période (présents moyens, admissions moyennes par jour…), pour garder la même unité ;
//   - zoom : boutons − / + , molette de la souris à l'endroit pointé ; déplacement : ‹ › ou glisser ;
//   - animation : la courbe avance dans le temps, jour après jour (ou semaine, mois…), comme un graphique
//     de cours en direct, sur des axes fixes, avec un curseur (date, valeurs) ; « Tout » revient à la période entière.
// La vue de chaque rubrique est gardée (etat.vuesTemps) et s'applique aussi aux trois méthodes de comptage.
// ═══════════════════════════════════════════════════════════════════════════════════════════
(function () {
  let vueCourante = null                       // vue de la rubrique en cours de dessin
  const vues = () => (etat.vuesTemps ??= {})
  const PAS = [['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois'], ['annee', 'Année']]
  const cleDe = (pas, j) => (pas === 'semaine' ? Math.floor((j + 3) / 7) : pas === 'mois' ? versDate(j).slice(0, 7) : pas === 'annee' ? versDate(j).slice(0, 4) : j)

  // Fenêtre et regroupement appliqués aux données d'un graphe, avant de le dessiner.
  function appliquerVue(p) {
    const v = vueCourante
    if (!v || !p.series) return p
    const N = Math.max(...p.series.map((s) => s.valeurs.length), p.barres ? p.barres.valeurs.length : 0)
    if (N < 3) return p
    v.n = N
    let i0 = Math.max(0, Math.min(v.i0 ?? 0, N - 2)), i1 = Math.min(N - 1, v.i1 ?? N - 1)
    if (i1 <= i0) i1 = Math.min(N - 1, i0 + 1)
    v.vu = [i0, i1]
    const groupes = []; let der = null
    for (let i = i0; i <= i1; i++) { const k = cleDe(v.pas ?? 'jour', p.debutNum + i); if (k !== der) { groupes.push([]); der = k } groupes.at(-1).push(i) }
    const moy = (t) => groupes.map((g) => { const x = g.map((i) => t[i]).filter((z) => z !== null && z !== undefined && Number.isFinite(z)); return x.length ? x.reduce((a, b) => a + b, 0) / x.length : null })
    return { ...p, debutNum: p.debutNum + i0, jours: groupes.map((g) => p.debutNum + g[0]), pas: v.pas ?? 'jour',
      series: p.series.map((s) => ({ ...s, valeurs: moy(s.valeurs) })), bandes: (p.bandes ?? []).map((b) => ({ ...b, bas: moy(b.bas), haut: moy(b.haut) })),
      barres: p.barres ? { ...p.barres, valeurs: moy(p.barres.valeurs) } : null,
      verticales: (p.verticales ?? []).map((x) => ({ ...x, i: groupes.findIndex((g) => g.includes(x.i)) })).filter((x) => x.i >= 0) }
  }
  const lignesOrigine = lignesSvg
  lignesSvg = (p) => lignesOrigine(appliquerVue(p))      // eslint-disable-line no-global-assign

  // Barre d'outils au-dessus des graphes jour par jour d'une rubrique.
  function barre(titre, v) {
    const [i0, i1] = v.vu ?? [0, v.n - 1], d0 = contexteVue?.d?.debutNum
    const periode = d0 !== undefined ? `${fmtDate(versDate(d0 + i0))} → ${fmtDate(versDate(d0 + i1))}` : ''
    return `<div class="ind-temps" data-vue="${echapper(titre)}">
      <span class="ind-temps-seg">${PAS.map(([k, l]) => `<button type="button" data-tz-pas="${k}" class="${(v.pas ?? 'jour') === k ? 'actif' : ''}">${l}</button>`).join('')}</span>
      <span class="ind-temps-seg"><button type="button" data-tz="moins" title="Dézoomer (voir plus de jours)">−</button><button type="button" data-tz="plus" title="Zoomer (voir moins de jours, plus de détail)">+</button>
        <button type="button" data-tz="gauche" title="Reculer dans le temps">‹</button><button type="button" data-tz="droite" title="Avancer dans le temps">›</button>
        <button type="button" data-tz="tout" title="Toute la période">Tout</button></span>
      <span class="ind-temps-seg"><button type="button" data-tz="anim" class="ind-temps-lecture" title="Faire avancer les courbes dans le temps, jour après jour (axes fixes)">Animation</button><button type="button" data-tz="vitesse" title="Vitesse de l'animation">×1</button><button type="button" data-tz="rejouer" title="Recommencer l'animation depuis le début">Rejouer</button></span>
      <span class="ind-temps-periode">${periode}${(v.pas ?? 'jour') !== 'jour' ? ` · moyenne par ${{ semaine: 'semaine', mois: 'mois', annee: 'année' }[v.pas]}` : ''} · molette : zoom, glisser : déplacer</span>
    </div>`
  }
  const sectionOrigine = htmlSection
  htmlSection = function (s, k, c, W, agrandi = false) {      // eslint-disable-line no-global-assign
    vueCourante = vues()[s.t] ?? (vues()[s.t] = { pas: 'jour' })
    vueCourante.n = null
    let html
    try { html = sectionOrigine(s, k, c, W, agrandi) } finally { var v = vueCourante; vueCourante = null }
    if (!v.n || !html.includes('survol-zone')) return html
    const i = html.indexOf('<div class="ind-graphe">') >= 0 && html.indexOf('<div class="ind-variante') >= 0 ? html.indexOf('<div class="ind-variante') : html.indexOf('<div class="ind-graphe">')
    return i < 0 ? html : html.slice(0, i) + barre(s.t, v) + html.slice(i)
  }

  // Redessine une seule rubrique (zoom, déplacement, regroupement), sans redessiner toute la page.
  function redessiner(sec) {
    if (sec.closest('#indModalCorps')) { const m = $('#indModalCorps'), h = m.scrollTop; ouvrirModal(modalK); m.scrollTop = h; return }
    const k = +sec.dataset.k, s = sectionsVue[k]; if (!s || !contexteVue) return
    const W = contexteVue.W, tmp = document.createElement('div')
    tmp.innerHTML = htmlSection(s, k, contexteVue, W)
    const nouv = tmp.firstElementChild; if (!nouv) return
    sec.replaceWith(nouv)
    if (typeof convertirTitres === 'function') convertirTitres(nouv)
  }
  const vueDe = (el) => { const b = el.closest('.ind-section')?.querySelector('.ind-temps'); return b ? vues()[b.dataset.vue] : null }
  function changer(sec, f) { const b = sec.querySelector('.ind-temps'); if (!b) return; const v = vues()[b.dataset.vue]; if (!v?.n) return; f(v, v.n); sauver(); redessiner(sec) }
  const fenetre = (v, N) => { const i0 = v.i0 ?? 0, i1 = v.i1 ?? N - 1; return [i0, i1, i1 - i0] }
  function zoomer(v, N, facteur, centre = 0.5) {
    const [i0, i1, l] = fenetre(v, N), nl = Math.max(14, Math.min(N - 1, Math.round(l * facteur))), c = i0 + centre * l
    v.i0 = Math.max(0, Math.round(c - centre * nl)); v.i1 = Math.min(N - 1, v.i0 + nl); v.i0 = Math.max(0, v.i1 - nl)
  }
  // ── Animation « comme une application de trading » ─────────────────────────────────────────
  // Le graphe est dessiné une seule fois, sur toute la fenêtre affichée : axes et échelles restent FIXES.
  // Un masque (clipPath) dévoile les courbes, bandes et barres de gauche à droite, jour après jour (ou
  // semaine, mois…), avec un curseur vertical qui donne la date et la valeur de chaque courbe. Rien n'est
  // recalculé pendant l'animation : elle reste fluide même sur plusieurs années, et les trois méthodes de
  // comptage d'une rubrique avancent ensemble. Elle agit sur le graphe affiché (page ou fenêtre « Agrandir »).
  for (const v of Object.values(vues())) delete v.anim          // ancien état d'animation enregistré : effacé
  const NS = 'http://www.w3.org/2000/svg', DUREE = 12000           // durée d'un passage complet à la vitesse ×1 (ms)
  const anims = new WeakMap()                                      // section → { p, vitesse, joue, dernier }
  let numClip = 0
  const svgsDe = (sec) => [...sec.querySelectorAll('svg')].filter((s) => s.querySelector('.survol-zone'))
  function preparer(svg) {
    if (svg.__anim) return svg.__anim
    const z = svg.querySelector('.survol-zone'), g = GRAPHES.get(+z.dataset.g)
    const W = +svg.getAttribute('width'), H = +svg.getAttribute('height'), ml = +z.dataset.ml, mr = +z.dataset.mr
    const id = `anim-clip-${++numClip}`
    const defs = svg.querySelector('defs') ?? svg.insertBefore(document.createElementNS(NS, 'defs'), svg.firstChild)
    const clip = document.createElementNS(NS, 'clipPath'); clip.id = id
    const rect = document.createElementNS(NS, 'rect'); rect.setAttribute('x', 0); rect.setAttribute('y', 0); rect.setAttribute('height', H); rect.setAttribute('width', ml)
    clip.appendChild(rect); defs.appendChild(clip)
    // Données seulement : courbes, bandes, barres (pas les axes, les repères, les étiquettes ni la légende).
    const donnees = [...svg.querySelectorAll('path, rect')].filter((el) => !el.closest('.leg-item') && !el.closest('defs') && !el.classList.contains('survol-zone'))
    donnees.forEach((el) => el.setAttribute('clip-path', `url(#${id})`))
    const curseur = document.createElementNS(NS, 'g'); curseur.setAttribute('class', 'anim-curseur'); curseur.setAttribute('pointer-events', 'none')
    svg.appendChild(curseur)
    return (svg.__anim = { g, W, H, ml, mr, rect, curseur, donnees, id })
  }
  function nettoyer(svg) {
    const a = svg.__anim; if (!a) return
    a.donnees.forEach((el) => el.removeAttribute('clip-path')); a.curseur.remove(); svg.querySelector(`#${a.id}`)?.remove(); delete svg.__anim
  }
  function dessinerImage(svg, p) {
    const a = preparer(svg), g = a.g; if (!g) return
    const n = g.n, i = Math.min(n - 1, Math.floor(p * (n - 1) + 1e-9))
    const x = a.ml + (i / Math.max(1, n - 1)) * (a.W - a.ml - a.mr)
    a.rect.setAttribute('width', x + 1)
    const y = (v) => g.mt + (1 - (v - g.ymin) / (g.ymax - g.ymin)) * (g.H - g.mt - g.mb)
    const jour = g.jours ? g.jours[i] : g.debutNum + i, d = versDate(jour)
    const date = g.pas === 'annee' ? d.slice(0, 4) : g.pas === 'mois' ? `${MOIS_COURTS[+d.slice(5, 7) - 1]} ${d.slice(0, 4)}` : `${g.pas === 'semaine' ? 'sem. du ' : ''}${fmtDate(d)}`
    const vals = g.series.filter((s) => s.valeurs && Number.isFinite(s.valeurs[i])).slice(0, 4)
    const points = vals.map((s) => `<circle cx="${x}" cy="${y(s.valeurs[i])}" r="4" fill="${s.couleur}" stroke="#fff" stroke-width="1.5"/>`).join('')
    const lignes = [date, ...vals.map((s) => `${s.nom.length > 22 ? s.nom.slice(0, 21) + '…' : s.nom} : ${nf(s.valeurs[i], 1)}${g.suffixe}`)]
    const lb = 8 + 6.4 * Math.max(...lignes.map((l) => l.length)), hb = 6 + 15 * lignes.length
    const bx = x + 10 + lb > a.W - a.mr ? x - 10 - lb : x + 10
    a.curseur.innerHTML = `<line x1="${x}" x2="${x}" y1="${g.mt}" y2="${g.H - g.mb}" stroke="#111827" stroke-width="1" stroke-dasharray="3 3"/>${points}
      <rect x="${bx}" y="${g.mt + 2}" width="${lb}" height="${hb}" rx="4" fill="#111827" fill-opacity="0.86"/>
      ${lignes.map((l, k) => `<text x="${bx + 6}" y="${g.mt + 16 + 15 * k}" font-size="11.5" fill="#fff" ${k ? '' : 'font-weight="700"'}>${echapper(l)}</text>`).join('')}`
  }
  function majBoutons(sec, an) {
    const b = sec.querySelector('[data-tz=anim]'), vt = sec.querySelector('[data-tz=vitesse]')
    if (b) { b.textContent = an?.joue ? 'Pause' : an && an.p > 0 && an.p < 1 ? 'Reprendre' : 'Animation'; b.classList.toggle('actif', !!an?.joue) }
    if (vt) vt.textContent = `×${an?.vitesse ?? 1}`
  }
  function boucle(sec, t, jeton) {
    const an = anims.get(sec); if (!an?.joue || an.jeton !== jeton) return      // une seule boucle par rubrique
    const svgs = svgsDe(sec)
    if (!sec.isConnected || !svgs.length) { an.joue = false; return }
    an.p = Math.min(1, an.p + (an.dernier ? (t - an.dernier) : 0) * an.vitesse / DUREE); an.dernier = t
    svgs.forEach((s) => dessinerImage(s, an.p))
    if (an.p >= 1) { an.joue = false; setTimeout(() => { svgs.forEach(nettoyer); majBoutons(sec, an) }, 600); majBoutons(sec, an); return }
    setTimeout(() => boucle(sec, performance.now(), jeton), 33)       // environ 30 images par seconde
  }
  function lancer(sec, depuisDebut) {
    const an = anims.get(sec) ?? { p: 0, vitesse: 1 }
    if (depuisDebut || an.p >= 1) an.p = 0
    an.joue = true; an.dernier = 0; an.jeton = (an.jeton ?? 0) + 1; anims.set(sec, an)
    majBoutons(sec, an); boucle(sec, performance.now(), an.jeton)
  }

  document.addEventListener('click', (e) => {
    const bt = e.target.closest('.ind-temps button'); if (!bt) return
    const sec = bt.closest('.ind-section'), v = vueDe(bt); if (!v) return
    if (bt.dataset.tzPas) return changer(sec, (vv) => { vv.pas = bt.dataset.tzPas })
    const a = bt.dataset.tz
    if (a === 'anim') {
      const an = anims.get(sec)
      if (an?.joue) { an.joue = false; majBoutons(sec, an); return }
      return lancer(sec, false)
    }
    if (a === 'rejouer') return lancer(sec, true)
    if (a === 'vitesse') {
      const an = anims.get(sec) ?? { p: 0, vitesse: 1, joue: false }
      an.vitesse = { 1: 2, 2: 4, 4: 1 }[an.vitesse] ?? 1; anims.set(sec, an); majBoutons(sec, an); return
    }
    changer(sec, (vv, N) => {
      const [i0, i1, l] = fenetre(vv, N)
      if (a === 'tout') { vv.i0 = null; vv.i1 = null }
      if (a === 'plus') zoomer(vv, N, 0.6)
      if (a === 'moins') zoomer(vv, N, 1 / 0.6)
      const dec = Math.max(1, Math.round(l * 0.4))
      if (a === 'gauche') { vv.i0 = Math.max(0, i0 - dec); vv.i1 = vv.i0 + l }
      if (a === 'droite') { vv.i1 = Math.min(N - 1, i1 + dec); vv.i0 = vv.i1 - l }
    })
  })
  // Molette : zoom autour du point visé ; glisser : déplacement.
  document.addEventListener('wheel', (e) => {
    const z = e.target.closest?.('.survol-zone'); if (!z || !z.closest('.ind-section')?.querySelector('.ind-temps')) return
    e.preventDefault()
    const r = z.getBoundingClientRect(), centre = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width))
    changer(z.closest('.ind-section'), (v, N) => zoomer(v, N, e.deltaY < 0 ? 0.8 : 1.25, centre))
  }, { passive: false })
  let glisse = null
  document.addEventListener('mousedown', (e) => {
    const z = e.target.closest?.('.survol-zone'); if (!z || e.button !== 0) return
    const sec = z.closest('.ind-section'), v = vueDe(z); if (!v?.n) return
    glisse = { sec, v, x: e.clientX, l: z.getBoundingClientRect().width, f: fenetre(v, v.n) }
  })
  document.addEventListener('mouseup', (e) => {
    if (!glisse) return
    const { sec, v, x, l, f } = glisse; glisse = null
    const dj = Math.round(-(e.clientX - x) / l * f[2]); if (Math.abs(dj) < 1) return
    changer(sec, (vv, N) => { vv.i0 = Math.max(0, Math.min(N - 1 - f[2], f[0] + dj)); vv.i1 = vv.i0 + f[2] })
  })
})()
