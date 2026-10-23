// ═══════════════════════════════════════════════════════════════════════════════════════════
// Résultats du modèle NERA dans l'outil : on importe le fichier resultats/resultats_nera_<SERVICE>.json écrit par
// nera-modele/module_lit/exporter_resultats.py (dernière étape de lancer_tout.sh). Il ne contient aucune donnée de
// patient : seulement les tableaux des bancs (erreurs, tests de Diebold-Mariano, réglages) et leurs conclusions.
//
// Ce qu'on en fait :
//   · une rubrique « Résultats du modèle » : chaque banc (P1–P8, D1–D11, niveaux, sensibilité, survie), son
//     tableau et son verdict (choix CONFIRMÉ ou À REVOIR) ;
//   · sous chaque conclusion des autres rubriques, la ligne « Résultat du banc » : ce que le banc cité a trouvé,
//     au lieu d'un simple « à vérifier par le banc » ;
//   · dans le tableau du prétraitement (Synthèse), le verdict à côté du code du banc.
// Le fichier est gardé dans ce navigateur (clé à part de la saisie), un par service.
// ═══════════════════════════════════════════════════════════════════════════════════════════
(function () {
  const CLE = (s) => `nera.resultats.${s}`
  const lire = () => { try { return JSON.parse(localStorage.getItem(CLE(etat.service)) ?? 'null') } catch { return null } }
  let cache = { service: null, r: null }
  const resultats = () => { if (cache.service !== etat.service) cache = { service: etat.service, r: lire() }; return cache.r }

  // Badge du verdict d'un banc (tous horizons confondus : à revoir si l'un des horizons l'est).
  const BADGE = { confirme: '<span class="ind-badge oui">confirmé</span>', a_revoir: '<span class="ind-badge non">à revoir</span>', null: '<span class="ind-badge neutre">sans verdict</span>' }
  const tablesDe = (code) => (resultats()?.tables ?? []).filter((t) => t.code === code)
  const verdictDe = (code) => { const ts = tablesDe(code); if (!ts.length) return undefined
    return ts.some((t) => t.verdict === 'a_revoir') ? 'a_revoir' : ts.some((t) => t.verdict === 'confirme') ? 'confirme' : null }

  // « Résultat du banc » sous une conclusion : codes P1, D4, T2… cités dans le champ banc de la règle.
  window.resultatBanc = (banc) => {
    const codes = [...String(banc ?? '').matchAll(/\b[PDT]\d+\b/g)].map((m) => m[0]); if (!codes.length) return ''
    const R = resultats()
    const parts = codes.map((code) => {
      const ts = tablesDe(code)
      if (!ts.length) return `<b>${code}</b> : ${R ? 'pas encore lancé (absent du fichier importé)' : 'pas encore importé'}`
      const v = verdictDe(code), txt = ts.map((t) => `J+${t.horizon ?? '?'} : ${echapper(t.conclusion ?? '')}`).filter((x) => x.length > 6).join(' · ')
      return `<b>${code}</b> ${BADGE[v ?? null]} ${txt}`
    })
    return `<p><b>Résultat du banc :</b> ${parts.join(' ; ')}${R ? ` <span class="text-muted">(résultats du ${fmtHeure(R.genere)})</span>` : ' — importez-les dans « Résultats du modèle ».'}</p>`
  }
  window.verdictBancCourt = (code) => { const v = verdictDe(code); return v === undefined ? '' : ` ${BADGE[v ?? null]}` }
  const fmtHeure = (iso) => (iso ? new Date(iso).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

  // ── Import ─────────────────────────────────────────────────────────────────────────────
  const entree = Object.assign(document.createElement('input'), { type: 'file', accept: '.json,application/json', hidden: true })
  document.body.appendChild(entree)
  entree.addEventListener('change', async () => {
    const f = entree.files?.[0]; entree.value = ''; if (!f) return
    try {
      const j = JSON.parse(await f.text())
      if (j.format !== 'resultats-nera/1' || !Array.isArray(j.tables)) throw new Error('ce n’est pas un fichier resultats_nera_<SERVICE>.json')
      const sv = String(j.service ?? '').split('_')[0]
      if (sv && sv !== etat.service && !confirm(`Ce fichier concerne le service ${j.service}, le service affiché est ${etat.service}. L’importer quand même pour ${etat.service} ?`)) return
      localStorage.setItem(CLE(etat.service), JSON.stringify(j)); cache = { service: null, r: null }
      message(`${j.tables.length} tableaux de résultats importés (calculés le ${fmtHeure(j.genere)}).`)
      afficherIndicateurs()
    } catch (e) { message(`Import des résultats impossible : ${echapper(e.message)}.`, 'alerte') }
  })
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-resultats-importer]')) entree.click()
    if (e.target.closest('[data-resultats-oublier]') && confirm('Retirer les résultats importés pour ce service ?')) {
      try { localStorage.removeItem(CLE(etat.service)) } catch {}
      cache = { service: null, r: null }; afficherIndicateurs()
    }
  })

  // ── Rubrique « Résultats du modèle » ──────────────────────────────────────────────────
  const nb = (v) => (typeof v === 'number' ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000).replace('.', ',')) : echapper(v ?? '—'))
  function tableau(t) {
    const j = t.colonnes.indexOf('vs choix retenu')
    return `<div class="table-wrap"><table class="table" style="font-size:12.5px"><thead><tr>${t.colonnes.map((c) => `<th>${echapper(c)}</th>`).join('')}</tr></thead><tbody>${t.lignes.map((l) => {
      const retenu = String(l[0] ?? '').includes('(retenu)') || l[j] === '— choix retenu', mieux = l[j] === 'meilleur'
      return `<tr style="${retenu ? 'font-weight:600;' : ''}${mieux ? 'background:var(--sev-1-soft);' : ''}">${l.map((v) => `<td${typeof v === 'number' ? ' class="num"' : ''}>${nb(v)}</td>`).join('')}</tr>`
    }).join('')}</tbody></table></div>`
  }
  const SENS = {
    pretraitement: 'chaque banc change UNE décision du prétraitement (des lignes du registre à la série des présents) et garde les autres. « MAE retenue » : erreur contre la série du choix retenu, mêmes jours pour toutes les variantes ; c’est sur elle que porte le test de Diebold-Mariano. Choix <b>confirmé</b> : aucune variante ne fait significativement mieux, le choix peut être gardé tel quel dans le mémoire. <b>À revoir</b> : une variante fait mieux ; il faut soit changer le choix, soit le justifier par autre chose que l’erreur (loi de Little, comptages réels, vraisemblance clinique).',
    choix: 'chaque banc compare des variantes d’UN choix de conception du modèle (modèles concurrents, noyau, perte, τ, variables, standardisation, fenêtre, optimisation, combinaison), en validation glissante sur les six mois avant la période verrouillée. La ligne en gras est le choix retenu ; une ligne colorée fait significativement mieux (Diebold-Mariano, 5 %).',
    niveaux: 'niveaux 0 à 5 : on ajoute un bloc de variables à la fois (retards, flux, calendrier, fériés…). Un niveau n’est utile que s’il baisse l’erreur de façon significative ; sinon le modèle plus simple est préféré.',
    niveaux_tests: 'tests de Diebold-Mariano entre niveaux successifs.',
    parametres: 'sensibilité : l’erreur quand chaque hyperparamètre s’écarte de sa valeur retenue. Une erreur qui varie peu = choix robuste ; une erreur très sensible = valeur à justifier avec soin.',
    sensibilite: 'sensibilité des prévisions à la convention du nombre de jours (nuits ou jours) : si les conclusions ne changent pas, l’incertitude sur la convention n’est pas un problème.',
    survie: 'modèle de survie : probabilité qu’un enfant présent reste encore J0, J1, J2 jours ; il sert à prévoir les sorties et à estimer les durées manquantes.',
  }
  const GROUPES = [['pretraitement', 'Banc du prétraitement (P1 à P8)'], ['choix', 'Banc des choix de conception (D1 à D11)'], ['niveaux', 'Niveaux 0 à 5 : ce que chaque bloc de variables apporte'],
    ['niveaux_tests', 'Niveaux : tests entre niveaux'], ['parametres', 'Sensibilité des hyperparamètres'], ['sensibilite', 'Sensibilité à la convention des jours'], ['survie', 'Modèle de survie (J0, J1, J2)']]

  function rendreEtat() {
    const R = resultats()
    const boutons = `<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="btn btn-sm" data-resultats-importer>Importer resultats_nera_${etat.service}.json</button>${R ? '<button type="button" class="btn btn-secondary btn-sm" data-resultats-oublier>Retirer</button>' : ''}</div>`
    if (!R) return { html: `<p style="margin:0">Aucun résultat importé pour ce service. Dans Ubuntu (WSL), dossier <code>nera-modele/module_lit</code> : <code>bash lancer_tout.sh</code>, puis importez <code>resultats/resultats_nera_${etat.service}.json</code>.</p>${boutons}`,
      lecture: 'les bancs d’essai tournent dans le dépôt nera-modele (Python, PyTorch) ; l’outil ne fait que lire leur résumé. Une fois importés, chaque conclusion des autres rubriques indique ce que le banc qu’elle cite a trouvé.' }
    const ts = R.tables, codes = [...new Set(ts.filter((t) => t.code).map((t) => t.code))]
    const conf = codes.filter((c) => verdictDe(c) === 'confirme'), rev = codes.filter((c) => verdictDe(c) === 'a_revoir')
    const lignes = codes.map((c) => { const t0 = tablesDe(c)[0]; return `<tr><td><b>${c}</b></td><td>${echapper(t0.titre ?? t0.titre_groupe)}</td><td>${BADGE[verdictDe(c) ?? null]}</td><td>${tablesDe(c).map((t) => `J+${t.horizon} : ${echapper(t.conclusion ?? '—')}`).join('<br>')}</td></tr>` }).join('')
    return { avant: bandeauStats([['Tableaux', ts.length], ['Bancs', codes.length], ['Confirmés', conf.length], ['À revoir', rev.length], ['Calculés le', fmtHeure(R.genere)]]),
      html: `<div class="table-wrap ind-recap"><table class="table"><thead><tr><th>Banc</th><th>Question</th><th>Verdict</th><th>Conclusion du banc</th></tr></thead><tbody>${lignes}</tbody></table></div>${boutons}`,
      lecture: `le verdict de chaque banc : <b>confirmé</b> si aucune variante ne bat significativement le choix retenu (le choix est gardé), <b>à revoir</b> sinon. ${rev.length ? `À traiter d’abord : ${rev.join(', ')}.` : 'Aucun choix à revoir : le prétraitement et la conception retenus peuvent être présentés tels quels.'}` }
  }
  function rendreGroupe(g) {
    const ts = (resultats()?.tables ?? []).filter((t) => t.groupe === g)
    if (!ts.length) return { html: vide(resultats() ? 'Ce banc n’est pas dans le fichier importé (pas encore lancé).' : 'Importez d’abord les résultats (première section).'), lecture: SENS[g] }
    return { html: ts.map((t) => `<div style="margin:0 0 16px"><div class="card-kicker" style="margin-bottom:6px">${t.code ? `${t.code} · ` : ''}${echapper(t.titre ?? t.titre_groupe)}${t.horizon ? ` · horizon J+${t.horizon}` : ''} ${t.verdict !== undefined && t.code ? BADGE[t.verdict ?? null] : ''}</div>
      ${tableau(t)}${t.conclusion ? `<p style="margin:6px 0 0;font-size:13px"><b>Conclusion du banc :</b> ${echapper(t.conclusion)}</p>` : ''}</div>`).join(''), lecture: SENS[g] }
  }
  // Icône : une cible (le banc vise le choix retenu).
  ICONES.banc = ['#d7263d', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/>']
  ONGLETS.push({ nom: 'Résultats du modèle', ico: 'banc', desc: 'Bancs d’essai de NERA : prétraitement, choix, niveaux, sensibilité', sections: [
    { t: 'Résultats importés et verdict de chaque banc', rendre: () => rendreEtat() },
    ...GROUPES.map(([g, titre]) => ({ t: titre, rendre: () => rendreGroupe(g) })),
  ] })
})()
