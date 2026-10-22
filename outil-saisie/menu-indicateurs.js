// ═══════════════════════════════════════════════════════════════════════════════════════════
// Rubriques des Indicateurs dans un MENU FLOTTANT, à droite de la barre latérale, au lieu d'une liste dépliée
// qui allongeait la barre et la faisait défiler. Sous « Indicateurs », la barre ne garde que la rubrique en
// cours. Le menu s'ouvre au survol (court délai) ou au clic, se ferme quand la souris le quitte, après le choix
// d'une rubrique, avec Échap ou par un clic ailleurs. Il fonctionne aussi barre réduite (icônes seules).
// ═══════════════════════════════════════════════════════════════════════════════════════════
(function () {
  const nav = document.getElementById('indNav'), parent = document.querySelector('.nav-parent')
  if (!nav || !parent) return
  document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
  .nav-sous.nav-flyout { display: none !important; position: fixed; z-index: 300; width: 268px; max-height: calc(100vh - 24px); overflow-y: auto;
    flex-direction: column; gap: 2px; margin: 0; padding: 8px; border: 1px solid var(--line-strong); border-left: 1px solid var(--line-strong);
    border-radius: 14px; background: var(--surface); box-shadow: 0 12px 32px rgba(15, 18, 25, .14), 0 2px 6px rgba(15, 18, 25, .06); }
  .nav-sous.nav-flyout.ouvert { display: flex !important; animation: flyoutOuvrir .14s ease-out; }
  .nav-flyout-titre { padding: 6px 10px 8px; font-size: 11.5px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
  .nav-sous.nav-flyout .ind-groupe { margin-left: 0; border-left: 0; border-radius: 9px; padding: 8px 10px; min-height: 34px; }
  .nav-sous.nav-flyout .ind-groupe .nom { font-size: 13.5px; }
  .nav-sous.nav-flyout .ind-groupe.actif { background: var(--noir-soft); }
  .nav-sous.nav-flyout .ind-groupe .nb { min-width: 22px; text-align: center; padding: 1px 6px; border-radius: 999px; background: var(--surface-2); }
  .nav-sous.nav-flyout .ind-groupe.actif .nb { background: var(--surface); }
  @keyframes flyoutOuvrir { from { opacity: 0; transform: translateX(-4px) } to { opacity: 1; transform: none } }
  @media (prefers-reduced-motion: reduce) { .nav-sous.nav-flyout.ouvert { animation: none; } }
  .nav-ind-actif { display: none; align-items: center; gap: 6px; width: calc(100% - 21px); margin: 1px 0 6px 21px; padding: 6px 10px; border: 0; border-left: 2px solid var(--noir);
    background: var(--noir-soft); border-radius: 0 8px 8px 0; font: inherit; font-size: 13px; font-weight: 650; color: var(--noir); text-align: left; cursor: pointer; }
  .nav-ind-actif span { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nav-ind-actif svg { flex: none; color: var(--muted); }
  .nav-parent:has(input:checked) ~ .nav-ind-actif { display: flex; }
  .shell.collapsed .nav-ind-actif { display: none !important; }
  .nav-parent .nav-chevron { transform: rotate(-90deg) !important; }
  ` }))

  // La liste quitte la barre latérale (plus de défilement) ; ses boutons et leurs actions restent les mêmes.
  nav.classList.add('nav-flyout'); nav.setAttribute('role', 'menu')
  document.body.appendChild(nav)
  const titre = Object.assign(document.createElement('div'), { className: 'nav-flyout-titre', textContent: 'Rubriques des indicateurs' })
  const actif = Object.assign(document.createElement('button'), { type: 'button', className: 'nav-ind-actif', title: 'Changer de rubrique' })
  actif.setAttribute('aria-haspopup', 'menu')
  parent.after(actif)
  const majActif = () => {
    if (nav.firstChild !== titre) nav.prepend(titre)
    const a = nav.querySelector('.ind-groupe.actif .nom')
    actif.innerHTML = `<span>${a ? a.textContent : 'Synthèse'}</span><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6"/></svg>`
  }
  new MutationObserver(majActif).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  majActif()

  let minuterie = null
  function placer(ancre) {
    const sb = document.getElementById('sidebar').getBoundingClientRect(), r = ancre.getBoundingClientRect()
    nav.style.left = `${Math.max(8, Math.min(sb.right + 8, innerWidth - 276))}px`
    nav.style.top = '0px'; nav.classList.add('ouvert')
    const h = nav.offsetHeight
    nav.style.top = `${Math.max(12, Math.min(r.top - 8, innerHeight - h - 12))}px`
  }
  const ouvrir = (ancre = parent) => { clearTimeout(minuterie); placer(ancre); parent.setAttribute('aria-expanded', 'true') }
  const fermer = () => { clearTimeout(minuterie); nav.classList.remove('ouvert'); parent.setAttribute('aria-expanded', 'false') }
  const fermerBientot = () => { clearTimeout(minuterie); minuterie = setTimeout(fermer, 260) }
  const survol = matchMedia('(hover: hover) and (pointer: fine)')

  for (const el of [parent, actif]) {
    el.addEventListener('mouseenter', () => { if (!survol.matches) return; clearTimeout(minuterie); minuterie = setTimeout(() => ouvrir(el), 120) })
    el.addEventListener('mouseleave', fermerBientot)
  }
  nav.addEventListener('mouseenter', () => clearTimeout(minuterie))
  nav.addEventListener('mouseleave', () => { if (survol.matches) fermerBientot() })
  // Clic sur « Indicateurs » ou sur la rubrique en cours : ouvre le menu (le changement d'onglet se fait comme avant).
  parent.addEventListener('click', () => setTimeout(() => ouvrir(parent), 0))
  actif.addEventListener('click', (e) => { e.stopPropagation(); nav.classList.contains('ouvert') ? fermer() : ouvrir(actif) })
  // Choix d'une rubrique : le gestionnaire existant change de rubrique, puis le menu se ferme.
  nav.addEventListener('click', (e) => { if (e.target.closest('[data-onglet]:not(:disabled)')) setTimeout(fermer, 0) })
  document.addEventListener('click', (e) => { if (!nav.contains(e.target) && !parent.contains(e.target) && e.target !== actif && !actif.contains(e.target)) fermer() })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('ouvert')) { fermer(); parent.focus?.() } })
  addEventListener('resize', fermer)
  document.querySelector('.sidebar nav')?.addEventListener('scroll', fermer, { passive: true })
})()
