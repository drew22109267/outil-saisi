// ═══════════════════════════════════════════════════════════════════════════════════════════
// Design de l'onglet Indicateurs : cartes de chiffres avec leur petit graphique (Synthèse), et style commun
// de toutes les rubriques (cartes blanches arrondies, bandeaux de chiffres en pilule, tableaux à en-tête gris).
// Charte NERA : le bleu de la marque (--brand) et le noir (--ink), avec des gris pour ce qui est secondaire.
// Chaque petit graphique est une vraie donnée de la saisie (aucune valeur décorative) ; le survol de chaque
// barre ou point donne la valeur exacte.
// ═══════════════════════════════════════════════════════════════════════════════════════════
(function () {
  // ── Style ─────────────────────────────────────────────────────────────────────────────
  const css = `
  /* Un seul fond, blanc, comme une page : plus de plateau gris autour du panneau blanc */
  .main, .vue { background: var(--surface) !important; }
  .ind-panneau { background: none !important; border: 0 !important; box-shadow: none !important; }
  #indZone { padding: 4px 2px 8px; }
  .topbar-ind #indPeriode { display: none !important; }
  /* Barre de filtres : des pilules de même hauteur, bord gris, coins arrondis, texte noir */
  .ind-tete-droite { gap: 10px; }
  .ind-filtre { display: inline-flex; align-items: center; gap: 10px; }
  .ind-filtre-k { font-size: 13px; font-weight: 600; color: var(--muted); }
  .ind-filtre-groupe { height: 40px; padding: 3px; gap: 2px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 12px; }
  .ind-fleche { width: 30px; border-radius: 9px; color: var(--ink); }
  .ind-fleche:hover:not(:disabled) { background: var(--surface-2); color: var(--ink); }
  .ind-menu-btn { border-radius: 9px; box-shadow: none; background: none; color: var(--ink); padding: 4px 10px; }
  .ind-menu-btn:hover, .ind-menu-btn[aria-expanded=true] { background: var(--surface-2); }
  .ind-filtre .nb { border-radius: 999px; padding: 1px 7px; background: var(--brand); }
  .ind-menu-liste, .ind-pop { border-radius: 14px; border: 1px solid var(--line-strong); }
  .ind-tete .ind-tete-droite .seg[hidden] { display: inline-flex; }
  .ind-tete .seg { height: 40px; align-items: stretch; padding: 3px; gap: 2px; background: var(--surface); border: 1px solid var(--line-strong); border-radius: 12px; }
  .ind-tete .seg-opt { padding: 0 14px; font-size: 13px; border-radius: 9px; color: var(--muted); }
  .ind-tete .seg-opt:has(input:checked) { background: var(--noir); color: #fff; box-shadow: none; }
  .ind-tete .seg-opt:has(input:focus-visible) { outline: 2px solid var(--brand); outline-offset: 1px; }
  .ind-par { display: none !important; }
  .ind-pop-btn { height: 40px; padding: 0 14px; border-radius: 12px; color: var(--ink); border-color: var(--line-strong); }
  .ind-pop-btn:hover, .ind-pop-btn[aria-expanded=true] { background: var(--surface-2); border-color: var(--line-strong); }
  .ind-section { background: var(--surface); border: 1px solid var(--line-strong); border-radius: 16px; padding: 18px 20px 20px; margin-bottom: 16px; }
  .ind-section:last-child { margin-bottom: 4px; border-bottom: 1px solid var(--line-strong); }
  #indModalCorps .ind-section { border: 0; padding: 0; }
  .ind-section h5 { font-size: 16px; font-weight: 650; letter-spacing: -0.01em; margin: 0 0 14px; align-items: center; }
  .ind-section h5 .ind-agrandir { background: var(--surface-2); border: 1px solid var(--line); border-radius: 999px; padding: 5px 12px; font-size: 12.5px; font-weight: 600; color: var(--ink); }
  .ind-section h5 .ind-agrandir:hover { background: var(--brand-soft); color: var(--brand-ink); border-color: var(--brand-soft-2); }
  /* Bandeau de chiffres : une pilule, valeur en gras puis libellé, séparateurs verticaux */
  .ind-stats { display: flex; flex-wrap: wrap; align-items: stretch; gap: 0; padding: 0; margin: 0 0 14px; border: 1px solid var(--line-strong); border-radius: 14px; background: var(--surface-2); width: fit-content; max-width: 100%; }
  .ind-stats div { flex-direction: row-reverse; justify-content: flex-end; align-items: baseline; gap: 6px; padding: 10px 16px; border-left: 1px solid var(--line-strong); }
  .ind-stats div:first-child { border-left: 0; }
  .ind-stats b { font-size: 16px; font-weight: 700; color: var(--ink); white-space: nowrap; }
  .ind-stats span { font-size: 12.5px; color: var(--muted); }
  /* Plus de 4 chiffres : une grille de petites tuiles (libellé puis valeur), qui reste alignée sur toutes les largeurs */
  .ind-stats:has(> div:nth-child(5)) { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; width: auto; border: 0; background: none; }
  .ind-stats:has(> div:nth-child(5)) > div { flex-direction: column; justify-content: flex-start; align-items: flex-start; gap: 3px; padding: 10px 12px;
    border: 1px solid var(--line-strong); border-radius: 12px; background: var(--surface-2); }
  .ind-stats:has(> div:nth-child(5)) > div:first-child { border-left: 1px solid var(--line-strong); }
  .ind-stats:has(> div:nth-child(5)) b { white-space: normal; font-size: 15px; }
  /* Tableaux */
  .ind-section .table-wrap { border: 1px solid var(--line-strong); border-radius: 12px; }
  .ind-section .table th { background: var(--surface-2); color: var(--ink); font-weight: 600; font-size: 12.5px; padding: 10px 12px; border-bottom: 1px solid var(--line-strong); }
  .ind-section .table td { padding: 9px 12px; border-bottom: 1px solid var(--line); }
  .ind-section .table tbody tr:last-child td { border-bottom: 0; }
  .ind-section .table tbody tr:hover td { background: var(--surface-2); }
  /* Options d'une rubrique : une ligne de commandes discrète */
  .ind-options { background: transparent; border: 0; padding: 0; margin: 0 0 12px; }
  /* Cartes de chiffres */
  .cartes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
  .carte { background: var(--surface); border: 1px solid var(--line-strong); border-radius: 14px; padding: 14px 16px 12px; display: flex; flex-direction: column; min-width: 0; }
  .carte-tete { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; font-weight: 500; }
  .carte-tete svg { flex: none; color: var(--ink); }
  .carte-valeur { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; color: var(--ink); line-height: 1.1; margin-top: 8px; }
  .carte-valeur small { font-size: 14px; font-weight: 600; color: var(--muted-2); letter-spacing: 0; margin-left: 2px; }
  .carte-note { font-size: 12.5px; color: var(--muted); margin-top: 2px; }
  .carte-graphe { margin-top: auto; padding-top: 12px; }
  .carte-graphe svg { display: block; width: 100%; overflow: visible; }
  .carte-axe { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted-2); margin-top: 4px; }
  .carte-legende { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--muted); margin-top: 8px; }
  .carte-legende i { display: inline-block; width: 9px; height: 9px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
  .carte-legende b { color: var(--ink); font-weight: 650; margin-left: 3px; }
  .carte.l2 { grid-column: span 2; } .carte.l4 { grid-column: span 4; }
  @media (max-width: 1240px) { .cartes { grid-template-columns: repeat(2, minmax(0, 1fr)); } .carte.l4 { grid-column: span 2; } }
  @media (max-width: 680px) { .cartes { grid-template-columns: minmax(0, 1fr); } .carte.l2, .carte.l4 { grid-column: auto; } }
  `
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: css }))
  // Sélecteur de période : libellés courts (« Jour », « Semaine »…), précédés de « Par ».
  for (const o of document.querySelectorAll('.ind-tete .seg-opt')) {
    const t = [...o.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim())
    if (t) t.textContent = t.textContent.trim().replace(/^Par\s+/, '').replace(/^./, (c) => c.toUpperCase())
  }
  const seg = document.querySelector('.ind-tete .seg')
  if (seg && !seg.previousElementSibling?.classList.contains('ind-filtre-k')) seg.before(Object.assign(document.createElement('span'), { className: 'ind-filtre-k', textContent: 'Par' }))

  // ── Icônes (traits, couleur du texte) ─────────────────────────────────────────────────
  const I = (d) => `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`
  const ICO = {
    lit: I('<path d="M2 18V6M2 14h20v4M22 14v-2a3 3 0 0 0-3-3h-8v5"/><circle cx="6.5" cy="10.5" r="1.8"/>'),
    personnes: I('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 4.5a3 3 0 0 1 0 6M21 20c0-2.6-1.6-4.6-4-5.2"/>'),
    entree: I('<path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><path d="M10 17l5-5-5-5M15 12H3"/>'),
    sablier: I('<path d="M6 2h12M6 22h12M7 2c0 5 5 6 5 10s-5 5-5 10M17 2c0 5-5 6-5 10s5 5 5 10"/>'),
    calendrier: I('<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>'),
    alerte: I('<path d="M12 3 2 20h20L12 3z"/><path d="M12 10v4M12 17.5v.01"/>'),
    rotation: I('<path d="M21 12a9 9 0 1 1-2.6-6.4"/><path d="M21 3v6h-6"/>'),
    pause: I('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
    lignes: I('<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>'),
    coche: I('<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.7 2.7L16.5 9"/>'),
    croix: I('<path d="M12 2v20M5 8h14"/>'),
    sortie: I('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5M21 12H9"/>'),
    envoi: I('<path d="M5 12h14M13 6l6 6-6 6"/>'),
    oeil: I('<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
    goutte: I('<path d="M12 3c3.5 4.4 6 7.7 6 11a6 6 0 0 1-12 0c0-3.3 2.5-6.6 6-11z"/>'),
    age: I('<circle cx="12" cy="7" r="3.5"/><path d="M5 21c0-3.9 3.1-7 7-7s7 3.1 7 7"/>'),
    bebe: I('<circle cx="12" cy="9" r="5.5"/><path d="M9.8 9h.01M14.2 9h.01M10 11.5c1.2.9 2.8.9 4 0M8 20h8"/>'),
    sexe: I('<circle cx="9" cy="14" r="5"/><circle cx="16" cy="8" r="4"/><path d="M19 5l2-2M21 3h-3M21 3v3"/>'),
  }

  // ── Petits graphiques ─────────────────────────────────────────────────────────────────
  const W = 260, BLEU = 'var(--brand)', BLEU_PALE = 'var(--brand-soft-2)', NOIR = 'var(--ink)', GRIS = 'var(--line-strong)'
  const fin = (v) => v !== null && v !== undefined && Number.isFinite(v)
  const ech = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
  const nb = (v, k = 1) => (fin(v) ? v.toLocaleString('fr-FR', { maximumFractionDigits: k }) : '—')

  // Barres mensuelles : la dernière période en bleu, les précédentes en bleu pâle (historique).
  function barres(points, { H = 44, unite = '', fmt = (v) => nb(v) } = {}) {
    const p = points.filter((q) => fin(q.v)); if (p.length < 2) return ''
    const max = Math.max(...p.map((q) => q.v), 1e-9), n = points.length, pas = W / n, lb = Math.max(2, Math.min(18, pas - 3))
    return `<svg viewBox="0 0 ${W} ${H}" height="${H}" preserveAspectRatio="none">${points.map((q, i) => {
      if (!fin(q.v)) return ''
      const h = Math.max(q.v > 0 ? 2 : 0, (q.v / max) * (H - 2)), x = i * pas + (pas - lb) / 2
      return `<rect x="${x.toFixed(1)}" y="${(H - h).toFixed(1)}" width="${lb.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${i === n - 1 ? BLEU : BLEU_PALE}"><title>${ech(q.l)} : ${fmt(q.v)}${unite}</title></rect>`
    }).join('')}</svg>${axe(points)}`
  }
  // Courbe avec aire : trait bleu, aire bleu très pâle, dernier point marqué ; ligne de repère en pointillés.
  function courbe(points, { H = 44, unite = '', repere = null, nomRepere = '', fmt = (v) => nb(v) } = {}) {
    const p = points.map((q, i) => ({ ...q, i })).filter((q) => fin(q.v)); if (p.length < 2) return ''
    const vals = p.map((q) => q.v), lo = Math.min(...vals, ...(fin(repere) ? [repere] : [])), hi = Math.max(...vals, ...(fin(repere) ? [repere] : []))
    const m = (hi - lo) * 0.12 || 1, y0 = lo - m, y1 = hi + m, n = points.length
    const X = (i) => (n === 1 ? W / 2 : (i / (n - 1)) * W), Y = (v) => H - ((v - y0) / (y1 - y0)) * H
    const ligne = p.map((q, k) => `${k ? 'L' : 'M'}${X(q.i).toFixed(1)},${Y(q.v).toFixed(1)}`).join('')
    const aire = `${ligne}L${X(p.at(-1).i).toFixed(1)},${H}L${X(p[0].i).toFixed(1)},${H}Z`, der = p.at(-1)
    const cibles = p.map((q) => `<rect x="${(X(q.i) - W / n / 2).toFixed(1)}" y="0" width="${(W / n).toFixed(1)}" height="${H}" fill="transparent"><title>${ech(q.l)} : ${fmt(q.v)}${unite}</title></rect>`).join('')
    return `<svg viewBox="0 0 ${W} ${H}" height="${H}" preserveAspectRatio="none">
      <path d="${aire}" fill="var(--brand-soft)"/>
      ${fin(repere) ? `<line x1="0" x2="${W}" y1="${Y(repere).toFixed(1)}" y2="${Y(repere).toFixed(1)}" stroke="${NOIR}" stroke-width="1" stroke-dasharray="3 3" vector-effect="non-scaling-stroke" opacity="0.55"><title>${ech(nomRepere)}</title></line>` : ''}
      <path d="${ligne}" fill="none" stroke="${BLEU}" stroke-width="2" vector-effect="non-scaling-stroke" stroke-linejoin="round" stroke-linecap="round"/>
      <circle cx="${X(der.i).toFixed(1)}" cy="${Y(der.v).toFixed(1)}" r="3.5" fill="${BLEU}" stroke="var(--surface)" stroke-width="2" vector-effect="non-scaling-stroke"/>
      ${cibles}</svg>${axe(points)}`
  }
  // Jauge : piste bleu pâle, remplissage bleu, repère éventuel (trait noir).
  function jauge(part, { repere = null, nomRepere = '' } = {}) {
    const f = Math.max(0, Math.min(1, part ?? 0))
    return `<svg viewBox="0 0 ${W} 12" height="12" preserveAspectRatio="none"><rect x="0" y="2" width="${W}" height="8" rx="4" fill="var(--brand-soft)"/>
      <rect x="0" y="2" width="${(W * f).toFixed(1)}" height="8" rx="4" fill="${BLEU}"><title>${nb(100 * f, 1)} %</title></rect>
      ${fin(repere) ? `<rect x="${(W * repere - 1).toFixed(1)}" y="0" width="2" height="12" rx="1" fill="${NOIR}"><title>${ech(nomRepere)}</title></rect>` : ''}</svg>`
  }
  // Barre de répartition : segments séparés par un espace de 2 px, couleurs de la charte, légende chiffrée.
  function repartition(parts) {
    const tot = parts.reduce((a, b) => a + b.v, 0); if (!tot) return ''
    let x = 0; const vis = parts.filter((q) => q.v > 0), gap = 2, utile = W - gap * (vis.length - 1)
    const segs = vis.map((q, k) => { const w = (q.v / tot) * utile, s = `<rect x="${x.toFixed(1)}" y="0" width="${Math.max(1, w).toFixed(1)}" height="12" rx="3" fill="${q.c}"><title>${ech(q.l)} : ${q.v} (${nb(100 * q.v / tot, 1)} %)</title></rect>`; x += w + gap; return s })
    return `<svg viewBox="0 0 ${W} 12" height="12" preserveAspectRatio="none">${segs.join('')}</svg>
      <div class="carte-legende">${parts.map((q) => `<span><i style="background:${q.c}"></i>${ech(q.l)}<b>${q.v}</b> · ${nb(100 * q.v / tot, 0)} %</span>`).join('')}</div>`
  }
  function axe(points) {
    if (points.length < 2) return ''
    return `<div class="carte-axe"><span>${ech(points[0].l)}</span><span>${ech(points.at(-1).l)}</span></div>`
  }
  const carte = ({ ico, titre, valeur, note = '', graphe = '', large = 0, info = '' }) =>
    `<div class="carte${large ? ` l${large}` : ''}"${info ? ` title="${ech(info)}"` : ''}><div class="carte-tete">${ICO[ico] ?? ''}<span>${titre}</span></div>
      <div class="carte-valeur">${valeur}</div>${note ? `<div class="carte-note">${note}</div>` : ''}${graphe ? `<div class="carte-graphe">${graphe}</div>` : ''}</div>`

  // Séries par période (regroupement choisi en haut : jour, semaine, mois, année), sans la ligne « Total ».
  const periodes = (d) => (d.lignes ?? []).filter((x) => x.periode !== 'Total')
  const parPeriode = (d, f) => periodes(d).map((x) => ({ l: etiquettePeriode(x.periode), v: f(x) }))
  // Moyennes hebdomadaires d'une série journalière (courbe lisible même sur deux ans).
  function hebdo(d, serie) {
    const out = []; for (let i = 0; i < serie.length; i += 7) {
      const t = serie.slice(i, i + 7).filter(fin); if (t.length) out.push({ l: `sem. du ${fmtDate(versDate(d.debutNum + i))}`, v: t.reduce((a, b) => a + b, 0) / t.length })
    }
    return out
  }
  const moisSt = (st) => Object.keys(st.parMois ?? {}).sort()
  const parMoisSt = (st, k) => moisSt(st).map((m) => ({ l: etiquettePeriode(m), v: st.parMois[m][k] ?? 0 }))

  // ── Votre saisie ──────────────────────────────────────────────────────────────────────
  htmlSaisie = function ({ d, st }) {      // eslint-disable-line no-global-assign
    const mois = moisSt(st), s = d.statuts ?? {}, trous = []
    for (let a = +(mois[0] ?? '0').slice(0, 4), m = +(mois[0] ?? '00-00').slice(5); mois.length && `${a}-${String(m).padStart(2, '0')}` <= mois.at(-1); m === 12 ? (a++, m = 1) : m++) {
      const k = `${a}-${String(m).padStart(2, '0')}`; if (!st.parMois[k]) trous.push(k)
    }
    // Mois couverts : un carré par mois, bleu s'il a des lignes, gris s'il est vide (trou de saisie).
    const tous = [...mois, ...trous].sort(), pas = W / Math.max(1, tous.length)
    const frise = tous.length ? `<svg viewBox="0 0 ${W} 14" height="14" preserveAspectRatio="none">${tous.map((m, i) => `<rect x="${(i * pas + 1).toFixed(1)}" y="0" width="${Math.max(1, pas - 2).toFixed(1)}" height="14" rx="2.5" fill="${st.parMois[m] ? BLEU : GRIS}"><title>${etiquettePeriode(m)} : ${st.parMois[m] ? `${st.parMois[m].malades} lignes` : 'aucune ligne'}</title></rect>`).join('')}</svg>${axe(tous.map((m) => ({ l: etiquettePeriode(m) })))}` : ''
    const connues = (s.observee ?? 0) + (s.calculee ?? 0), partConnue = st.n ? connues / st.n : 0
    const derniere = s.imputee ? { l: 'Durée estimée', v: s.imputee, c: 'var(--muted-2)' } : { l: 'Durée inconnue', v: s.inconnue ?? 0, c: GRIS }
    return `<div class="cartes">
      ${carte({ ico: 'lignes', titre: 'Lignes saisies', valeur: st.n, note: 'lignes par mois d’enregistrement', graphe: barres(parMoisSt(st, 'malades'), { unite: ' lignes' }) })}
      ${carte({ ico: 'calendrier', titre: 'Période saisie', large: 2, valeur: `${d.premierSaisi ? fmtDate(d.premierSaisi) : '—'} <small>→</small> ${d.dernierSaisi ? fmtDate(d.dernierSaisi) : '—'}`,
        note: `${mois.length} mois saisis${trous.length ? ` · <b style="color:var(--ink)">${trous.length} mois sans aucune ligne</b> (gris)` : ' · aucun mois vide'} ; les calculs s’arrêtent au dernier jour saisi`, graphe: frise })}
      ${carte({ ico: 'coche', titre: 'Durée de séjour connue', valeur: `${Math.round(100 * partConnue)}<small>%</small>`, note: `${st.sortiesEcrites} dates de sortie · ${st.nbJoursEcrits} nombres de jours`, graphe: jauge(partConnue, { repere: d.reglages?.seuil ?? 0.9, nomRepere: `seuil de la période exploitable : ${Math.round(100 * (d.reglages?.seuil ?? 0.9))} %` }) })}
      ${carte({ ico: 'lit', titre: 'Ce que l’on sait de la fin de chaque séjour', large: 4, valeur: `${connues + (s.censuree ?? 0)}<small>séjours comptés dans l’occupation sur ${st.n}</small>`,
        note: s.imputee ? `durées estimées d’après le prix (${d.reglages.sources.prix}), l’issue (${d.reglages.sources.issue}) ou la médiane (${d.reglages.sources.mediane})`
          : `durée inconnue : exclus de l’occupation${d.reglages?.partisSansDuree ? ` · dont ${d.reglages.partisSansDuree} partis (SCAM, sortie, MEO…) sans date ni nombre de jours` : ''}`,
        graphe: repartition([{ l: 'Sortie écrite', v: s.observee ?? 0, c: NOIR }, { l: 'Sortie calculée', v: s.calculee ?? 0, c: BLEU }, { l: `Encore hospitalisés (entrés depuis moins de ${d.reglages?.fenetreCensure ?? 30} j)`, v: s.censuree ?? 0, c: BLEU_PALE }, derniere]) })}
    </div>
    ${d.message ? `<div class="alert warn" style="margin-top:12px;display:block">${d.message}</div>` : ''}
    ${alertePeriode(d)}${alerteTrous(d)}${alerteDoublons(d)}
    ${trous.length ? `<div class="alert warn" style="margin-top:12px;display:block">Mois sans aucune ligne entre le premier et le dernier jour saisi : <b>${trous.map((t) => t.split('-').reverse().join('/')).join(', ')}</b>. L’occupation de ces mois (et des semaines suivantes) sera fausse tant qu’ils ne sont pas saisis.</div>` : ''}`
  }

  // ── Chiffres clés de l'occupation ─────────────────────────────────────────────────────
  htmlCles = function ({ d, lits }) {      // eslint-disable-line no-global-assign
    const t = d.lignes.at(-1), sx = statsSerie(d.presents), unite = uniteParNom(document.querySelector('input[name=indPar]:checked')?.value)
    const present = typeof nomPresents === 'function' ? nomPresents() : 'Présents'
    return `${alertePeriode(d)}${d.reglages?.trouFinal ? alerteTrous({ reglages: { ...d.reglages, trous: [d.reglages.trouFinal] } }) : ''}<div class="cartes" style="margin-top:4px">
      ${carte({ ico: 'lit', titre: 'Taux d’occupation moyen', valeur: lits ? `${aff(t.tom)}<small>%</small>` : '—',
        note: lits ? `fourchette ${aff(t.tomBas)} – ${aff(t.tomHaut)} % · repère 85 % (service tendu)` : 'indiquez le nombre de lits',
        graphe: lits ? courbe(parPeriode(d, (x) => x.tom), { unite: ' %', repere: 85, nomRepere: '85 % : service tendu' }) : '' })}
      ${carte({ ico: 'personnes', titre: `${present} (moyenne)`, valeur: aff(arrondi(t.JH / Math.max(1, t.J))),
        note: `écart-type ${aff(arrondi(sx.s))} · maximum ${Math.round(t.max)} · moyenne par semaine`,
        graphe: courbe(hebdo(d, d.presents), { repere: lits || null, nomRepere: `${lits} lits` }) })}
      ${carte({ ico: 'entree', titre: 'Admissions par jour', valeur: aff(arrondi(t.adm / Math.max(1, t.J))), note: `${t.adm} admissions en ${t.J} jours · par ${unite}`,
        graphe: barres(parPeriode(d, (x) => (x.J ? x.adm / x.J : null)), { unite: ' par jour' }) })}
      ${carte({ ico: 'sablier', titre: 'Durée moyenne de séjour', valeur: `${aff(t.dms)}<small>nuits</small>`, note: `${Math.round(t.ns)} séjours terminés · par ${unite}`,
        graphe: courbe(parPeriode(d, (x) => x.dms), { unite: ' nuits' }) })}
      ${carte({ ico: 'calendrier', titre: 'Journées d’hospitalisation', valeur: Math.round(t.JH).toLocaleString('fr-FR'), note: `en ${t.J} jours · par ${unite}`,
        graphe: barres(parPeriode(d, (x) => x.JH), { unite: ' journées', fmt: (v) => nb(v, 0) }) })}
      ${carte({ ico: 'alerte', titre: 'Jours en sureffectif', valeur: lits ? t.sur : '—', note: lits ? `plus de présents que de lits · ${nb(t.J ? 100 * t.sur / t.J : 0, 1)} % des jours` : 'indiquez le nombre de lits',
        graphe: lits ? barres(parPeriode(d, (x) => x.sur), { unite: ' jours', fmt: (v) => nb(v, 0) }) : '' })}
      ${carte({ ico: 'rotation', titre: 'Rotation des lits', valeur: aff(t.rot), note: `patients par lit · par ${unite}`,
        graphe: lits ? barres(parPeriode(d, (x) => x.rot), { unite: ' patients par lit', fmt: (v) => nb(v, 2) }) : '' })}
      ${carte({ ico: 'pause', titre: 'Intervalle de rotation', valeur: `${aff(t.inter)}<small>j</small>`, note: 'jours où un lit reste vide entre deux patients',
        graphe: lits ? courbe(parPeriode(d, (x) => x.inter), { unite: ' j', repere: 0, nomRepere: '0 : aucun lit vide (en dessous : sureffectif)' }) : '' })}
    </div>${htmlRepartition(d)}`
  }

  // ── Patients et qualité des soins ─────────────────────────────────────────────────────
  htmlQualite = function ({ st }) {      // eslint-disable-line no-global-assign
    const n = st.n || 0, pct = (k) => (n ? 100 * (st.issues[k] ?? 0) / n : null)
    const transf = Object.values(st.parMois).reduce((a, s) => a + s.transf, 0)
    const ages = Object.entries(st.ages), totAge = ages.reduce((a, [, s]) => a + s.M + s.F, 0)
    const moins5 = (st.ages['0 – 11 mois']?.M ?? 0) + (st.ages['0 – 11 mois']?.F ?? 0) + (st.ages['12 – 59 mois']?.M ?? 0) + (st.ages['12 – 59 mois']?.F ?? 0)
    const G = ages.reduce((a, [, s]) => a + s.M, 0), F = ages.reduce((a, [, s]) => a + s.F, 0)
    const issue = (ico, titre, cle, champ) => carte({ ico, titre, valeur: `${st.issues[cle] ?? 0}`, note: `${nb(pct(cle), 1)} % des séjours · par mois`, graphe: barres(parMoisSt(st, champ), { fmt: (v) => nb(v, 0) }) })
    const histoAge = barres(ages.map(([k, s]) => ({ l: k, v: s.M + s.F })), { fmt: (v) => nb(v, 0), unite: ' enfants' })
    return `<div class="cartes">
      ${issue('croix', 'Décès', 'Décès', 'dcd')}
      ${issue('sortie', 'Sorties contre avis (SCAM)', 'Sortie contre avis (SCAM)', 'scam')}
      ${issue('envoi', 'Référés / transférés', 'Référé / transféré', 'ref')}
      ${issue('oeil', 'Mises en observation (MEO)', 'Mise en observation (MEO)', 'meo')}
      ${carte({ ico: 'goutte', titre: 'Transfusions', valeur: transf, note: `${n ? nb(100 * transf / n, 1) : '—'} % des enfants · par mois`, graphe: barres(parMoisSt(st, 'transf'), { fmt: (v) => nb(v, 0) }) })}
      ${carte({ ico: 'age', titre: 'Âge médian', valeur: st.ageMedian === null ? '—' : st.ageMedian < 24 ? `${Math.round(st.ageMedian)}<small>mois</small>` : `${arrondi(st.ageMedian / 12)}<small>ans</small>`,
        note: 'répartition par tranche d’âge', graphe: histoAge })}
      ${carte({ ico: 'bebe', titre: 'Moins de 5 ans', valeur: `${totAge ? Math.round(100 * moins5 / totAge) : 0}<small>%</small>`, note: `${moins5} enfants sur ${totAge} d’âge connu`, graphe: jauge(totAge ? moins5 / totAge : 0) })}
      ${carte({ ico: 'sexe', titre: 'Garçons / filles', valeur: `${G}<small>/</small> ${F}`, note: `${F ? nb(G / F, 2) : '—'} garçon(s) par fille`, graphe: repartition([{ l: 'Garçons', v: G, c: NOIR }, { l: 'Filles', v: F, c: BLEU }]) })}
    </div>`
  }
})()
