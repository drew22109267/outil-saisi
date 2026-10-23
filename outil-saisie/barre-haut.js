// ═══════════════════════════════════════════════════════════════════════════════════════════
// Barre du haut : les filtres des Indicateurs (Statistique, Par mois, Calcul) y passent, à gauche, au lieu d'occuper
// une ligne au-dessus du contenu ; on y retire ce qui faisait doublon (nombre de lignes, déjà à côté de « Saisie »
// dans la barre latérale ; titre de la page, déjà sous « Indicateurs »). À droite : Affichage, Service et un bouton
// profil (avatar à icône). Carte Sauvegarde : fond blanc, icône noire, plus compacte.
// ═══════════════════════════════════════════════════════════════════════════════════════════
(function () {
  const topbar = document.querySelector('.topbar'), titreInd = document.getElementById('topbarInd')
  if (!topbar) return
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .topbar #topbarInd, .topbar #compteur { display: none !important; }
  .topbar { gap: 10px; min-height: 64px; }
  .topbar .ind-tete-droite { flex: 0 0 auto; flex-wrap: nowrap; }
  .topbar #btnCalcul > #resumeCalcul { display: none; }
  .topbar #btnCalcul .lib-calcul { font-weight: 600; }
  .topbar .field { min-width: 0; flex: 0 1 auto; }
  .topbar #service { max-width: 210px; }
  .topbar .ind-tete-droite[hidden] { display: none !important; }
  .topbar .ind-filtre-groupe, .topbar .ind-pop-btn { height: 38px; }
  .topbar .ind-tete-droite .ind-pop, .topbar .ind-tete-droite .ind-menu-liste { left: 0; right: auto; }
  .topbar .field > span { color: var(--muted); }
  .ind-tete:empty, .ind-tete:not(:has(*)) { display: none; }
  /* Bouton profil : avatar rond à icône (pas d'initiales) */
  .profil-zone { position: relative; flex: none; }
  .profil-btn { display: grid; place-items: center; width: 38px; height: 38px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--surface-2);
    color: var(--ink); cursor: pointer; padding: 0; }
  .profil-btn:hover, .profil-btn[aria-expanded=true] { background: var(--surface); border-color: var(--ink); }
  .profil-btn:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  .profil-menu { position: absolute; right: 0; top: calc(100% + 8px); z-index: 60; min-width: 230px; padding: 6px; background: var(--surface);
    border: 1px solid var(--line-strong); border-radius: 14px; box-shadow: 0 12px 32px rgba(15, 18, 25, .14); }
  .profil-menu[hidden] { display: none; }
  .profil-menu .profil-k { padding: 8px 10px 6px; font-size: 12px; color: var(--muted); }
  .profil-menu .profil-k b { display: block; font-size: 13.5px; color: var(--ink); }
  .profil-menu button { display: flex; align-items: center; gap: 9px; width: 100%; padding: 8px 10px; border: 0; border-radius: 9px; background: none;
    font: inherit; font-size: 13.5px; color: var(--ink); cursor: pointer; text-align: left; }
  .profil-menu button:hover { background: var(--surface-2); }
  /* Carte Sauvegarde : blanche, compacte, icône noire */
  .carte-sauv { background: var(--surface) !important; color: var(--ink) !important; border: 1px solid var(--line-strong); padding: 10px 12px !important; gap: 4px !important; }
  .carte-sauv-tete { font-size: 13px !important; }
  .carte-sauv-ico { width: 24px !important; height: 24px !important; background: none !important; color: var(--noir) !important; }
  .carte-sauv p { color: var(--muted) !important; font-size: 11.5px !important; line-height: 1.35 !important; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .carte-sauv.a-faire p { color: var(--sev-2-ink) !important; }
  .carte-sauv .btn { background: var(--noir) !important; color: #fff !important; min-height: 32px; margin-top: 2px !important; }
  .carte-sauv .btn:hover { background: #2a2c30 !important; }
  /* Statistique : sans l'étiquette, bouton compact « 1 sur 9 » (le nom complet est dans l'info-bulle et la liste) */
  .topbar .ind-filtre-k { display: none; }
  .topbar .ind-menu-btn { max-width: none; padding: 4px 8px; }
  .topbar .ind-menu-btn .ind-sur { color: var(--muted); font-weight: 500; }
  .topbar .ind-menu-liste { width: min(400px, 90vw); }
  .topbar #service { min-width: 130px; }
  .topbar .spacer { min-width: 8px; }
  @media (max-width: 1500px) { .topbar .field > span { display: none; } }

  /* Barres de défilement : fines, sans flèches, piste transparente, comme dans les applications courantes */
  * { scrollbar-width: thin; scrollbar-color: #c4c8ce transparent; }
  /* Indicateurs : la zone qui défile va jusqu'au bord droit et au bas de la fenêtre, la barre y est collée */
  #vueIndicateurs #indZone { margin-right: -24px; padding-right: 24px; margin-bottom: -16px; padding-bottom: 24px; }
  @media (max-width: 700px) { .topbar { flex-wrap: wrap; } .topbar .ind-tete-droite { order: 10; flex-basis: 100%; flex-wrap: wrap; } }
  ` }))

  // Filtres des Indicateurs → barre du haut (mêmes éléments, mêmes actions), visibles seulement sur Indicateurs.
  const filtres = document.querySelector('.ind-tete-droite'), spacer = topbar.querySelector('.spacer')
  if (filtres && spacer) {
    spacer.before(filtres)
    // Calcul : libellé court dans la barre ; le résumé des réglages reste dans l'info-bulle.
    const calcul = document.getElementById('btnCalcul')
    if (calcul && !calcul.querySelector('.lib-calcul')) calcul.querySelector('svg')?.after(Object.assign(document.createElement('span'), { className: 'lib-calcul', textContent: 'Calcul' }))
    if (titreInd) {
      const suivre = () => { filtres.hidden = titreInd.hidden }
      new MutationObserver(suivre).observe(titreInd, { attributes: true, attributeFilter: ['hidden'] }); suivre()
    }
  }

  // Bouton profil (avatar à icône) et son menu : service affiché, sauvegarde, aide.
  const zone = Object.assign(document.createElement('div'), { className: 'profil-zone' })
  zone.innerHTML = `<button type="button" class="profil-btn" id="profilBtn" aria-haspopup="menu" aria-expanded="false" title="Profil" aria-label="Profil">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/></svg></button>
    <div class="profil-menu" role="menu" hidden>
      <div class="profil-k">Service affiché<b id="profilService">—</b></div>
      <button type="button" role="menuitem" data-profil="sauvegarde"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/></svg>Sauvegarde et restauration</button>
      <button type="button" role="menuitem" data-profil="aide"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/></svg>Aide</button>
    </div>`
  topbar.appendChild(zone)
  const btn = zone.querySelector('.profil-btn'), menu = zone.querySelector('.profil-menu')
  const fermer = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false') }
  btn.addEventListener('click', (e) => {
    e.stopPropagation()
    const sel = document.getElementById('service'); document.getElementById('profilService').textContent = sel?.selectedOptions?.[0]?.textContent ?? '—'
    menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden))
    if (!menu.hidden) menu.querySelector('button')?.focus()
  })
  menu.addEventListener('click', (e) => {
    const b = e.target.closest('[data-profil]'); if (!b) return
    fermer()
    if (b.dataset.profil === 'sauvegarde') document.getElementById('ouvrirSauvegarde')?.click()
    if (b.dataset.profil === 'aide') document.getElementById('ouvrirAide')?.click()
  })
  document.addEventListener('click', (e) => { if (!zone.contains(e.target)) fermer() })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !menu.hidden) { fermer(); btn.focus() } })
})()
