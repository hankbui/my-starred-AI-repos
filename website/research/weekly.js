(function () {
  const ARCHIVE_URL = 'json/archive/'
  const LATEST_URL = 'json/index.json'
  const DAYS_BACK = 7

  let allReports = []
  let merged = null
  let activeDay = 'all'

  function el(id) { return document.getElementById(id) }

  function esc(s) {
    if (!s) return ''
    const d = document.createElement('div')
    d.textContent = String(s)
    return d.innerHTML
  }

  function daysAgo(n) {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return d.toISOString().slice(0, 10)
  }

  function dateRange() {
    return Array.from({ length: DAYS_BACK }, (_, i) => daysAgo(i))
  }

  async function loadAllReports() {
    allReports = []
    const dates = dateRange()

    for (const date of dates) {
      try {
        const resp = await fetch(`${ARCHIVE_URL}${date}.json?t=${Date.now()}`)
        if (resp.ok) {
          const data = await resp.json()
          data._date = date
          allReports.push(data)
          continue
        }
      } catch {}
    }

    try {
      const resp = await fetch(`${LATEST_URL}?t=${Date.now()}`)
      if (resp.ok) {
        const latest = await resp.json()
        const latestDate = latest.meta && latest.meta.date
        if (latestDate && !allReports.find(r => r._date === latestDate)) {
          latest._date = latestDate
          allReports.push(latest)
        }
      }
    } catch {}

    allReports.sort((a, b) => (b._date || '').localeCompare(a._date || ''))
  }

  function mergeReports(reports) {
    const allTechs = new Map()
    const allOpps = []
    const allPapers = new Map()
    const allBriefs = []
    const allDates = new Set()

    for (const r of reports) {
      const date = r._date || ''
      if (date) allDates.add(date)

      if (r.brief && r.brief.length) allBriefs.push(...r.brief.map(b => ({ text: b, date })))

      if (r.technologies) {
        for (const t of r.technologies) {
          const key = t.name || ''
          if (!key) continue
          if (allTechs.has(key)) {
            const existing = allTechs.get(key)
            existing.papers = (existing.papers || 1) + (t.papers || 1)
            existing.confidence = Math.max(existing.confidence || 0, t.confidence || 0)
            existing.appearances = (existing.appearances || 1) + 1
            existing.dates.add(date)
            if (t.applications) {
              for (const a of t.applications) {
                if (!existing.applications.includes(a)) existing.applications.push(a)
              }
            }
          } else {
            allTechs.set(key, {
              name: key,
              papers: t.papers || 1,
              confidence: t.confidence || 0,
              maturity: t.maturity || 'early',
              trend: t.trend || 'emerging',
              applications: t.applications || [],
              appearances: 1,
              dates: new Set([date]),
            })
          }
        }
      }

      if (r.product_opportunities) {
        allOpps.push(...r.product_opportunities.map(o => ({ ...o, date })))
      }

      if (r.papers) {
        for (const p of r.papers) {
          const pid = p.id || p.title || ''
          if (!pid) continue
          if (!allPapers.has(pid)) {
            allPapers.set(pid, { ...p, dates: new Set([date]) })
          } else {
            allPapers.get(pid).dates.add(date)
          }
        }
      }
    }

    return {
      dates: [...allDates].sort().reverse(),
      briefs: allBriefs,
      technologies: [...allTechs.values()].sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
      opportunities: allOpps.sort((a, b) => (b.business_value || 0) - (a.business_value || 0)),
      papers: [...allPapers.values()].sort((a, b) => (b.confidence || 0) - (a.confidence || 0)),
      totalPapers: allPapers.size,
      totalTechs: allTechs.size,
      totalOpps: allOpps.length,
    }
  }

  function renderSummary(m) {
    el('wk-summary').innerHTML = `
      <div class="wk-summary-card">
        <div class="wk-summary-val" style="color:var(--text-primary)">${m.dates.length}</div>
        <div class="wk-summary-label">Days</div>
      </div>
      <div class="wk-summary-card">
        <div class="wk-summary-val" style="color:var(--accent)">${m.totalTechs}</div>
        <div class="wk-summary-label">Technologies</div>
      </div>
      <div class="wk-summary-card">
        <div class="wk-summary-val" style="color:var(--success)">${m.totalOpps}</div>
        <div class="wk-summary-label">Opportunities</div>
      </div>
      <div class="wk-summary-card">
        <div class="wk-summary-val" style="color:var(--warning)">${m.totalPapers}</div>
        <div class="wk-summary-label">Papers</div>
      </div>
    `
    el('wk-stat-days').textContent = m.dates.length
    el('wk-stat-techs').textContent = m.totalTechs
    el('wk-stat-opps').textContent = m.totalOpps
    el('wk-stat-papers').textContent = m.totalPapers
  }

  function renderDayButtons(dates) {
    const container = el('wk-days')
    const allLabel = dates.length > 1 ? `All ${dates.length} days` : 'All'
    container.innerHTML = `
      <button class="wk-day-btn active" data-date="all">${esc(allLabel)}</button>
      ${dates.map(d => `<button class="wk-day-btn" data-date="${d}">${esc(d)}</button>`).join('')}
    `
    container.querySelectorAll('.wk-day-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        container.querySelectorAll('.wk-day-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        activeDay = btn.dataset.date
        renderActiveView()
      })
    })
  }

  function renderCTOLetter() {
    const letter = el('wk-cto-letter')
    const body = el('wk-cto-body')

    const topTechs = merged.technologies.slice(0, 3)
    const risingTechs = merged.technologies.filter(t => t.trend === 'rising' || t.trend === 'breakout')
    const topOpp = merged.opportunities[0]

    if (!merged.technologies.length) {
      letter.hidden = true
      return
    }

    letter.hidden = false

    const signals = []
    if (topTechs.length) {
      signals.push({
        icon: '🔥',
        text: `${topTechs.length} technologies accelerated this week: ${topTechs.map(t => t.name).join(', ')}. ${topTechs[0].name} leads with ${Math.round((topTechs[0].confidence || 0) * 100)}% confidence.`
      })
    }
    if (risingTechs.length > topTechs.length) {
      signals.push({
        icon: '📈',
        text: `${risingTechs.length} technologies show rising/breakout momentum — worth evaluating for product integration in the next quarter.`
      })
    }
    if (topOpp) {
      signals.push({
        icon: '💡',
        text: `Top opportunity: ${topOpp.technology} → ${topOpp.idea}. Business value ${topOpp.business_value || 0}/10, difficulty ${topOpp.engineering_difficulty || 0}/10.`
      })
    }

    const hiddenGems = findHiddenGems()
    if (hiddenGems.length) {
      signals.push({
        icon: '💎',
        text: `${hiddenGems.length} hidden gem${hiddenGems.length > 1 ? 's' : ''} discovered — high potential papers with low visibility.`
      })
    }

    sleepers = findSleepingGiants()
    if (sleepers.length) {
      signals.push({
        icon: '💤',
        text: `${sleepers.length} sleeping giant${sleepers.length > 1 ? 's' : ''} detected — technologies re-emerging after quiet periods.`
      })
    }

    body.innerHTML = signals.map(s => `
      <div class="wk-signal">
        <div class="wk-signal-icon" style="background:rgba(99,207,255,0.1)">${s.icon}</div>
        <div class="wk-signal-text">${esc(s.text)}</div>
      </div>
    `).join('')
  }

  function renderActiveView() {
    const reports = activeDay === 'all' ? allReports : allReports.filter(r => r._date === activeDay)
    merged = mergeReports(reports)

    renderSummary(merged)
    renderCTOLetter()
    renderSignals(merged)
    renderTechnologies(merged)
    renderOpportunities(merged)
    renderSleepers(merged)
    renderGems(merged)
    renderPapers(merged)
  }

  function renderSignals(m) {
    const container = el('wk-signals')
    el('wk-signal-count').textContent = `${m.briefs.length} signals`

    if (!m.briefs.length) {
      container.innerHTML = '<div class="wk-empty">No intelligence signals this week.</div>'
      return
    }

    container.innerHTML = m.briefs.map(b => `
      <div class="wk-brief-item">
        <div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px">${esc(b.date)}</div>
        ${esc(b.text)}
      </div>
    `).join('')
  }

  function renderTechnologies(m) {
    const container = el('wk-techs')
    const techs = m.technologies
    el('wk-tech-count').textContent = `${techs.length} technologies`

    if (!techs.length) {
      container.innerHTML = '<div class="wk-empty">No technologies this week.</div>'
      return
    }

    container.innerHTML = techs.slice(0, 24).map(t => {
      const trendCls = t.trend === 'breakout' ? 'wk-trend-breakout' : t.trend === 'rising' ? 'wk-trend-rising' : 'wk-trend-emerging'
      const dates = [...t.dates].join(', ')
      return `
        <div class="wk-tech-card">
          <div class="wk-tech-name">${esc(t.name)}</div>
          <div class="wk-tech-meta">
            <span class="${trendCls}">${esc(t.trend)}</span>
            <span>${Math.round((t.confidence || 0) * 100)}% conf</span>
            <span>${t.papers}p</span>
            <span>${t.appearances}d</span>
          </div>
        </div>
      `
    }).join('')
  }

  function renderOpportunities(m) {
    const container = el('wk-opps')
    const opps = m.opportunities
    el('wk-opp-count').textContent = `${opps.length} opportunities`

    if (!opps.length) {
      container.innerHTML = '<div class="wk-empty">No product opportunities this week.</div>'
      return
    }

    container.innerHTML = opps.slice(0, 12).map(o => `
      <div class="wk-opp-card">
        <div class="wk-opp-tech">${esc(o.technology)}</div>
        <div class="wk-opp-idea">${esc(o.idea)}</div>
        <div class="wk-opp-meta">
          <span>Value: ${o.business_value || 0}/10</span>
          <span>Difficulty: ${o.engineering_difficulty || 0}/10</span>
          <span>${esc(o.competitive_advantage || 'medium')}</span>
          <span>${esc(o.development_time || '2-4 weeks')}</span>
          ${o.date ? `<span>${esc(o.date)}</span>` : ''}
        </div>
      </div>
    `).join('')
  }

  function findHiddenGems() {
    const all = []
    for (const report of allReports) {
      const papers = report.papers || []
      const top = [...papers].sort((a, b) => (b.curator_score || 0) - (a.curator_score || 0)).slice(0, 3)
      for (const p of top) {
        if (p.curator_score >= 6 && (p.confidence || 0) >= 0.5) {
          all.push({ ...p, date: report._date })
        }
      }
    }
    return all.slice(0, 5)
  }

  function findSleepingGiants() {
    if (allReports.length < 2) return []
    const allTechNames = new Set()
    const techByDate = {}
    for (const r of allReports) {
      const date = r._date
      if (!date) continue
      techByDate[date] = new Set()
      for (const t of r.technologies || []) {
        if (t.name) {
          allTechNames.add(t.name)
          techByDate[date].add(t.name)
        }
      }
    }

    const dates = Object.keys(techByDate).sort()
    if (dates.length < 2) return []

    const sleepers = []
    for (const tech of allTechNames) {
      let seenCount = 0
      for (const d of dates) {
        if (techByDate[d].has(tech)) seenCount++
      }
      if (seenCount === 1 && dates.length >= 2) {
        const t = merged.technologies.find(t => t.name === tech)
        if (t && t.confidence >= 0.3) {
          sleepers.push(t)
        }
      }
    }
    return sleepers.slice(0, 5)
  }

  let sleepers = []

  function renderSleepers(m) {
    const container = el('wk-sleepers')
    const found = findSleepingGiants()

    if (!found.length) {
      container.innerHTML = '<div class="wk-empty">Not enough data to detect sleeping giants yet. More daily scans needed.</div>'
      return
    }

    container.innerHTML = found.map(t => `
      <div class="wk-sleeper">
        <div class="wk-sleeper-name">${esc(t.name)}</div>
        <div class="wk-sleeper-desc">Re-emerging with ${Math.round((t.confidence || 0) * 100)}% confidence · ${t.papers} papers</div>
        <div class="wk-sleeper-meta">${esc(t.applications.slice(0, 3).join(' · '))}</div>
      </div>
    `).join('')
  }

  function renderGems(m) {
    const container = el('wk-gems')
    const gems = findHiddenGems()

    if (!gems.length) {
      container.innerHTML = '<div class="wk-empty">No hidden gems identified this week.</div>'
      return
    }

    container.innerHTML = gems.map(g => `
      <div class="wk-innovation">
        <div class="wk-innovation-title">
          <a href="${esc(g.pdf_url || '#')}" target="_blank" rel="noopener" style="color:inherit;text-decoration:none">${esc(g.title)}</a>
        </div>
        <div class="wk-innovation-desc">
          Score: ${g.curator_score || '?'}/10 · Confidence: ${Math.round((g.confidence || 0) * 100)}% · ${g.date || ''}
        </div>
        ${g.technologies && g.technologies.length ? `<div style="margin-top:4px;display:flex;gap:4px;flex-wrap:wrap">${g.technologies.slice(0, 4).map(t => `<span style="padding:1px 6px;border-radius:999px;font-size:0.68rem;font-weight:600;border:1px solid var(--border);color:var(--text-muted)">${esc(t)}</span>`).join('')}</div>` : ''}
      </div>
    `).join('')
  }

  function renderPapers(m) {
    const container = el('wk-papers')
    const papers = m.papers
    el('wk-paper-count').textContent = `${papers.length} papers`

    if (!papers.length) {
      container.innerHTML = '<div class="wk-empty">No papers this week.</div>'
      return
    }

    container.innerHTML = papers.slice(0, 15).map(p => {
      const authors = (p.authors || []).slice(0, 3).join(', ') + ((p.authors || []).length > 3 ? ' et al.' : '')
      const techs = (p.technologies || []).slice(0, 4)
      const daysActive = p.dates ? p.dates.size : 1
      return `
        <div class="wk-paper-card">
          <div class="wk-paper-title">
            <a href="${esc(p.pdf_url || '#')}" target="_blank" rel="noopener">${esc(p.title)}</a>
          </div>
          <div class="wk-paper-meta">
            <span>${esc(authors)}</span>
            <span>·</span>
            <span>${esc(p.published || '')}</span>
            ${p.confidence ? `<span>· ${Math.round(p.confidence * 100)}% conf</span>` : ''}
            <span>· ${daysActive}d active</span>
          </div>
          ${techs.length ? `<div style="margin-top:6px;display:flex;gap:4px;flex-wrap:wrap">${techs.map(t => `<span style="padding:1px 6px;border-radius:999px;font-size:0.68rem;font-weight:600;border:1px solid var(--border);color:var(--text-muted)">${esc(t)}</span>`).join('')}</div>` : ''}
        </div>
      `
    }).join('')
  }

  async function init() {
    el('wk-eyebrow').textContent = 'AI Technology Radar · Weekly'
    el('wk-summary').innerHTML = '<div class="wk-loading">Loading weekly report...</div>'

    await loadAllReports()

    if (!allReports.length) {
      el('wk-summary').innerHTML = '<div class="wk-empty">No research data available yet. The pipeline will generate reports with daily cron runs.</div>'
      return
    }

    renderDayButtons(allReports.map(r => r._date).filter(Boolean))
    renderActiveView()
  }

  document.addEventListener('DOMContentLoaded', init)
  if (document.readyState === 'complete' || document.readyState === 'interactive') init()
})()
