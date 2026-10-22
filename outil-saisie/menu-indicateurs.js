// ═══════════════════════════════════════════════════════════════════════════════════════════
// Rubriques des Indicateurs dans un MENU FLOTTANT, à droite de la barre latérale, au lieu d'une liste dépliée
// qui allongeait la barre et la faisait défiler. Le bouton « Indicateurs » a le même aspect que les autres liens
// de la barre (même état actif) et affiche en petit la rubrique en cours. Le menu s'ouvre au survol (court délai)
// ou au clic, se ferme quand la souris le quitte, après le choix d'une rubrique, avec Échap ou par un clic
// ailleurs. Il fonctionne aussi barre réduite (icônes seules).
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
  /* Le bouton « Indicateurs » se comporte comme les autres liens de la barre */
  .nav-parent:has(input:checked), .shell.ind-ferme .nav-parent:has(input:checked) { background: var(--noir-soft) !important; }
  .nav-parent:has(input:checked)::before, .shell.ind-ferme .nav-parent:has(input:checked)::before { display: block !important; }
  .nav-parent .nav-chevron { transform: none !important; margin-left: auto; color: var(--muted-2); transition: transform .15s; }
  .nav-parent[aria-expanded=true] .nav-chevron { transform: translateX(2px) !important; color: var(--noir); }
  .nav-ind-txt { display: flex; flex-direction: column; min-width: 0; line-height: 1.25; }
  .nav-ind-txt small { display: none; font-size: 12px; font-weight: 500; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .nav-parent:has(input:checked) .nav-ind-txt small { display: block; }
  .shell.collapsed .nav-ind-txt { display: none; }
  ` }))

  // La liste quitte la barre latérale (plus de défilement) ; ses boutons et leurs actions restent les mêmes.
  nav.classList.add('nav-flyout'); nav.setAttribute('role', 'menu')
  document.body.appendChild(nav)
  const titre = Object.assign(document.createElement('div'), { className: 'nav-flyout-titre', textContent: 'Rubriques des indicateurs' })
  // Chevron vers la droite : le menu s'ouvre à côté. Libellé sur deux lignes : « Indicateurs » et la rubrique en cours.
  parent.querySelector('.nav-chevron')?.setAttribute('viewBox', '0 0 24 24')
  parent.querySelector('.nav-chevron path')?.setAttribute('d', 'm9 6 6 6-6 6')
  const nomLien = [...parent.children].find((e) => e.tagName === 'SPAN')
  const txt = Object.assign(document.createElement('span'), { className: 'nav-ind-txt' })
  const sous = document.createElement('small')
  if (nomLien) { nomLien.replaceWith(txt); txt.append(nomLien, sous) }
  parent.setAttribute('aria-haspopup', 'menu')
  const majActif = () => {
    if (nav.firstChild !== titre) nav.prepend(titre)
    sous.textContent = nav.querySelector('.ind-groupe.actif .nom')?.textContent ?? 'Synthèse'
  }
  new MutationObserver(majActif).observe(nav, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] })
  majActif()

  let minuterie = null
  function placer() {
    const sb = document.getElementById('sidebar').getBoundingClientRect(), r = parent.getBoundingClientRect()
    nav.style.left = `${Math.max(8, Math.min(sb.right + 8, innerWidth - 276))}px`
    nav.style.top = '0px'; nav.classList.add('ouvert')
    const h = nav.offsetHeight
    nav.style.top = `${Math.max(12, Math.min(r.top - 8, innerHeight - h - 12))}px`
  }
  const ouvrir = () => { clearTimeout(minuterie); placer(); parent.setAttribute('aria-expanded', 'true') }
  const fermer = () => { clearTimeout(minuterie); nav.classList.remove('ouvert'); parent.setAttribute('aria-expanded', 'false') }
  const fermerBientot = () => { clearTimeout(minuterie); minuterie = setTimeout(fermer, 260) }
  const survol = matchMedia('(hover: hover) and (pointer: fine)')

  parent.addEventListener('mouseenter', () => { if (!survol.matches) return; clearTimeout(minuterie); minuterie = setTimeout(ouvrir, 120) })
  parent.addEventListener('mouseleave', fermerBientot)
  nav.addEventListener('mouseenter', () => clearTimeout(minuterie))
  nav.addEventListener('mouseleave', () => { if (survol.matches) fermerBientot() })
  // Clic sur « Indicateurs » : ouvre le menu (le changement d'onglet se fait comme avant). Le gestionnaire d'origine
  // repliait la liste au second clic (ind-ferme) : sans objet avec le menu flottant.
  parent.addEventListener('click', () => setTimeout(() => { document.getElementById('shell')?.classList.remove('ind-ferme'); ouvrir() }, 0))
  // Choix d'une rubrique : le gestionnaire existant change de rubrique, puis le menu se ferme.
  nav.addEventListener('click', (e) => { if (e.target.closest('[data-onglet]:not(:disabled)')) setTimeout(fermer, 0) })
  document.addEventListener('click', (e) => { if (!nav.contains(e.target) && !parent.contains(e.target)) fermer() })
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && nav.classList.contains('ouvert')) { fermer(); parent.focus?.() } })
  addEventListener('resize', fermer)
  document.querySelector('.sidebar nav')?.addEventListener('scroll', fermer, { passive: true })
})()
