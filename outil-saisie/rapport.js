// ═══════════════════════════════════════════════════════════════════════════════════════════
// Rapport pour le mémoire : les rubriques des Indicateurs, mises en page pour l'impression (« Enregistrer en PDF »),
// et la liste des corrections de saisie à faire (CSV).
// Deux contenus : la Synthèse seule (saisie, chiffres clés, prétraitement étape par étape, tableau des conclusions)
// ou toutes les rubriques. Chaque page porte le service, la période calculée, les réglages et la date du calcul :
// les chiffres repris dans le mémoire restent traçables. Les vues 3D (interactives) ne sont pas imprimées.
// ═══════════════════════════════════════════════════════════════════════════════════════════
(function () {
  const LARGEUR = 880

  function contexteRapport() {
    if (!cacheIndicateurs || signatureIndicateurs !== signatureSaisie()) afficherIndicateurs()
    const { d, st, lits, par, pat, brut, jour } = cacheIndicateurs
    const opts = { ...OPTIONS_DEFAUT, ...(etat.indOptions?.[etat.service] ?? {}) }
    opts.sarima = { p: 1, d: 0, q: 1, P: 1, D: 0, Q: 1, ...(opts.sarima ?? {}) }
    return { d, st, lits, par, pat, brut, jour, W: LARGEUR, opts }
  }

  function genererRapport(tout) {
    const c = contexteRapport(), sansOcc = !!c.d.message
    const onglets = (tout ? ONGLETS : ONGLETS.filter((o) => o.nom === 'Synthèse')).filter((o) => !(o.occ && sansOcc))
    const html = onglets.map((o) => {
      const secs = o.sections.filter((s) => !(s.occ && sansOcc) && !s.d3)
      return `<h2 class="r-rubrique">${echapper(o.nom)}</h2>` + secs.map((s, k) => htmlSection(s, k, { ...c }, LARGEUR)).join('')
    }).join('')
    const g = c.d.reglages ?? {}, m = { ...METHODE_DEFAUT, ...(etat.indMethode?.[etat.service] ?? {}) }
    const reglages = [
      `Service : ${echapper(registre().nom)}`,
      c.d.debut ? `Période calculée : ${fmtDate(c.d.debut)} → ${fmtDate(c.d.fin)}` : `${c.st.n} lignes saisies`,
      c.lits ? `${c.lits} lits` : 'Lits non indiqués',
      `Seuil de saisie ${Math.round(100 * m.seuil)} %`, `Durées inconnues : ${m.inconnues}`, `Censure : ${m.censure}`,
      `Comptage : ${NOMS_COMPTAGE[g.comptage ?? m.comptage] ?? m.comptage}`,
      `Période de test verrouillée à partir du ${fmtDate(CONFIG.dateVerrou)}`,
    ]
    const styles = [...document.querySelectorAll('style, link[rel=stylesheet]')].map((n) => n.outerHTML).join('\n')
    const w = window.open('', '_blank')
    if (!w) { alert('La fenêtre du rapport a été bloquée par le navigateur : autorisez les fenêtres pour cette page.'); return }
    w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><base href="${location.href}">
      <title>Rapport NERA — ${echapper(registre().nom)} — ${new Date().toLocaleDateString('fr-FR')}</title>${styles}
      <style>
        body { background: #fff !important; color: #17181a; margin: 0; padding: 24px 32px; overflow: auto !important; height: auto !important; }
        .r-tete { border-bottom: 2px solid #0055f7; padding-bottom: 12px; margin-bottom: 18px; }
        .r-tete h1 { font-size: 22px; margin: 0 0 6px; }
        .r-tete ul { display: flex; flex-wrap: wrap; gap: 4px 16px; margin: 0; padding: 0; list-style: none; font-size: 12.5px; color: #5a606a; }
        .r-rubrique { font-size: 18px; margin: 28px 0 10px; padding-top: 6px; border-top: 1px solid #d5d8dd; break-after: avoid; }
        .ind-section { max-width: ${LARGEUR + 40}px; margin: 0 0 18px; padding: 14px 16px; border: 1px solid #e3e5e8; border-radius: 10px; break-inside: avoid-page; }
        .ind-section h5 { font-size: 15px; margin: 0 0 8px; }
        .ind-tete-actions, .ind-agrandir, .ind-options { display: none !important; }
        .ind-lecture[hidden] { display: block !important; }
        .ind-graphe svg { max-width: 100%; height: auto; }
        .r-pied { margin-top: 24px; font-size: 11.5px; color: #5a606a; }
        .r-imprimer { position: fixed; top: 14px; right: 18px; }
        @media print { body { padding: 0; } .r-imprimer { display: none; } .ind-section { border: 0; padding: 0 0 8px; } @page { margin: 14mm; } }
      </style></head><body>
      <button type="button" class="btn r-imprimer" onclick="print()">Imprimer ou enregistrer en PDF</button>
      <header class="r-tete"><h1>Modèle NERA — ${tout ? 'rapport complet des indicateurs' : 'synthèse, prétraitement et conclusions'}</h1>
        <ul>${reglages.map((x) => `<li>${x}</li>`).join('')}</ul></header>
      ${html}
      <p class="r-pied">Calculé le ${new Date().toLocaleString('fr-FR')} par l’outil de saisie, à partir de ${c.st.n} lignes saisies. Aucune donnée nominative (nom, téléphone, médecin, facture) n’est saisie ni imprimée.</p>
      </body></html>`)
    w.document.close()
    setTimeout(() => { try { w.focus(); w.print() } catch (e) { /* bouton « Imprimer » dans la page */ } }, 700)
  }
  window.genererRapport = genererRapport

  // ── Liste des corrections à faire (CSV, à garder à côté des photos) ─────────────────────────────
  // Tout ce qui fausse l'occupation ou les durées, ligne par ligne, avec le mois et le N° d'ordre pour retrouver la
  // page : N° manquants, doublons probables, enregistrement avant l'entrée, sortie avant l'entrée, durée aberrante,
  // issue non renseignée. Seulement des repères (mois, N°, dates) : aucun nom, téléphone ni médecin.
  function exporterCorrections() {
    const r = registre(), d = calculerIndicateurs(null, 'mois', { ...METHODE_DEFAUT, ...(etat.indMethode?.[etat.service] ?? {}) }), g = d.reglages ?? {}
    const L = lignesService(), out = [['Type', 'Mois', 'N° d’ordre', 'Date d’enregistrement', 'Détail', 'À faire'].join(';')]
    const ajouter = (...c) => out.push(c.map(csvCellule).join(';'))
    const mois = (l) => { const x = lireDateSouple(l[r.dateReference]); return x ? versDate(jourNum(x.d)).slice(0, 7) : '' }
    const plage = (t) => (t.de === t.a ? `${t.de}` : `${t.de}-${t.a}`)
    for (const t of g.manquants ?? []) ajouter('N° manquant(s)', t.mois, plage(t), '', `${t.a - t.de + 1} ligne(s), entre le ${fmtDate(versDate(t.apres))} et le ${fmtDate(versDate(t.avant))}`, 'Retrouver la page sur les photos ; si le numéro est sauté dans le registre, le noter en remarque.')
    const n = (x) => String(x ?? '').toLowerCase().replace(/\s+/g, ''), groupes = {}
    for (const l of L) { if (!n(l.age)) continue; (groupes[[l.date_entree || l[r.dateReference], n(l.age), l.sexe, n(l.domicile)].join('|')] ??= []).push(l) }
    for (const gr of Object.values(groupes).filter((x) => x.length > 1))
      ajouter('Doublon probable', mois(gr[0]), gr.map((l) => l[r.ordre] || '?').join(' et '), gr.map((l) => l[r.dateReference] || '?').join(' et '), 'Même date d’entrée, sexe, âge et quartier', 'Comparer les deux lignes sur la photo ; supprimer celle qui est en trop.')
    for (const l of L) {
      const en = lireDateSouple(l[r.dateReference]), e = lireDateSouple(l.date_entree), so = lireDateSouple(l.date_sortie), jours = String(l.nb_jours ?? '')
      const base = [mois(l), l[r.ordre] || '?', l[r.dateReference] || '?']
      if (r.dateReference !== 'date_entree' && en && e && jourNum(en.d) < jourNum(e.d)) ajouter('Enregistré avant l’entrée', ...base, `entrée écrite ${l.date_entree}`, 'Vérifier le jour ou le mois de la date d’entrée.')
      if (e && so && jourNum(so.d) < jourNum(e.d)) ajouter('Sortie avant l’entrée', ...base, `entrée ${l.date_entree}, sortie ${l.date_sortie}`, 'Corriger le mois ou l’année : la ligne est écartée de l’occupation.')
      const nj = parseInt((jours.match(/\d+/) ?? [])[0], 10)
      if (!Number.isNaN(nj) && (jours.includes('/') || nj > MAX_NUITS)) ajouter('Durée aberrante', ...base, `« ${jours} » dans Nbre de jours`, 'Relire la case : une date ou un prix y a été recopié.')
      if (r.sortieCalculee && issueDe(l) === 'Non renseignée') ajouter('Issue non renseignée', ...base, 'Observation vide ou non reconnue', 'Relire la colonne Observation sur la photo.')
    }
    telecharger(`corrections-a-faire-${etat.service}-${new Date().toISOString().slice(0, 10)}.csv`, out)
    message(`${out.length - 1} correction(s) à vérifier exportée(s).`)
  }
  window.exporterCorrections = exporterCorrections
})()
