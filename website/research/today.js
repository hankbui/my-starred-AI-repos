(function () {
  const DATA_URL = 'json/index.json'
  const TREND_COLORS = {
    breakout: 'rd-trend-breakout',
    rising: 'rd-trend-rising',
    emerging: 'rd-trend-emerging',
    peak: 'rd-trend-peak',
    maturing: 'rd-trend-rising',
  }

  let report = null

  function el(id) { return document.getElementById(id) }

  function renderMeta(r) {
    const m = r.meta || {}
    el('rd-meta-date').textContent = m.date || '-'
    el('rd-meta-techs').textContent = m.technologies_discovered || 0
    el('rd-meta-opps').textContent = m.opportunities_identified || 0
    el('rd-meta-papers').textContent = m.papers_tracked || 0
    el('rd-meta-updated').textContent = m.last_update || '-'

    el('rd-stat-techs').textContent = m.technologies_discovered || 0
    el('rd-stat-opps').textContent = m.opportunities_identified || 0
    el('rd-stat-papers').textContent = m.papers_tracked || 0
    el('rd-stat-date').textContent = m.date || '-'
  }

  function renderBrief(r) {
    const grid = el('rd-brief-grid')
    const brief = r.brief || []
    if (!brief.length) {
      grid.innerHTML = '<div class="rd-empty">No intelligence brief generated yet. Pipeline will regenerate with the next cron run.</div>'
      return
    }
    grid.innerHTML = brief.map(s => `<div class="brief-card"><div class="brief-text">${escHtml(s)}</div></div>`).join('')
  }

  function renderTopTechs(r) {
    const container = el('rd-top-techs')
    const techs = (r.technologies || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, 12)
    if (!techs.length) {
      container.innerHTML = '<div class="rd-empty">No technologies extracted yet.</div>'
      return
    }
    const maxConf = Math.max(...techs.map(t => t.confidence || 0), 0.01)
    container.innerHTML = techs.map(t => {
      const pct = Math.round((t.confidence || 0) / maxConf * 100)
      return `<div class="top-tech-card">
        <div class="top-tech-name">${escHtml(t.name)}</div>
        <div class="top-tech-bar-wrap"><div class="top-tech-bar" style="width:${pct}%"></div></div>
        <div class="top-tech-meta">
          <span>Confidence: ${(t.confidence || 0).toFixed(2)}</span>
          <span>${t.papers || 1} paper${t.papers !== 1 ? 's' : ''}</span>
          <span class="${TREND_COLORS[t.trend] || 'rd-trend-emerging'}">${t.trend || 'emerging'}</span>
        </div>
      </div>`
    }).join('')
  }

  function renderOpps(r) {
    const container = el('rd-top-opps')
    const opps = r.product_opportunities || []
    if (!opps.length) {
      container.innerHTML = '<div class="rd-empty">No product opportunities yet. Pipeline will regenerate with the next cron run.</div>'
      return
    }
    container.innerHTML = opps.slice(0, 10).map(o => {
      const bv = o.business_value || 0
      const diff = o.engineering_difficulty || 0
      return `<div class="opp-card">
        <div class="opp-tech">${escHtml(o.technology)}</div>
        <div class="opp-idea">${escHtml(o.idea)}</div>
        <div class="opp-meta">
          <span class="opp-tag opp-tag-value">Value: ${bv}/10</span>
          <span class="opp-tag opp-tag-difficulty">Difficulty: ${diff}/10</span>
          <span class="opp-tag opp-tag-adv">${escHtml(o.competitive_advantage || 'medium')}</span>
          <span class="opp-tag">${escHtml(o.development_time || '2-4 weeks')}</span>
        </div>
      </div>`
    }).join('')
  }

  function renderPapers(r) {
    const container = el('rd-papers-list')
    const papers = r.papers || []
    if (!papers.length) {
      container.innerHTML = '<div class="rd-empty">No papers in this scan.</div>'
      return
    }
    container.innerHTML = papers.slice(0, 10).map(p => {
      const techs = (p.technologies || []).slice(0, 6)
      const authors = (p.authors || []).slice(0, 3).join(', ') + ((p.authors || []).length > 3 ? ' et al.' : '')
      return `<div class="paper-card">
        <div class="paper-title"><a href="${escHtml(p.pdf_url || '#')}" target="_blank" rel="noopener">${escHtml(p.title)}</a></div>
        <div class="paper-authors">${escHtml(authors)}</div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <div class="paper-techs">${techs.map(t => `<span class="paper-tech">${escHtml(t)}</span>`).join('')}</div>
          <span class="paper-conf">${p.confidence ? `confidence ${(p.confidence * 100).toFixed(0)}%` : ''}</span>
        </div>
      </div>`
    }).join('')
  }

  function escHtml(s) {
    if (!s) return ''
    const d = document.createElement('div')
    d.textContent = String(s)
    return d.innerHTML
  }

  function buildPrompt(count) {
    if (!report) return ''
    const lines = [`You are an AI CTO. Here is today's research intelligence report (${report.meta.date}).`]
    const brief = report.brief || []
    if (brief.length) {
      lines.push('', '=== INTELLIGENCE BRIEF ===')
      brief.slice(0, count || 5).forEach(s => lines.push(`- ${s}`))
    }
    const techs = (report.technologies || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, count || 10)
    if (techs.length) {
      lines.push('', '=== TOP TECHNOLOGIES ===')
      techs.forEach(t => lines.push(`- ${t.name} (confidence: ${(t.confidence || 0).toFixed(2)}, trend: ${t.trend || 'emerging'}, papers: ${t.papers || 1})`))
    }
    const opps = (report.product_opportunities || []).slice(0, count || 8)
    if (opps.length) {
      lines.push('', '=== PRODUCT OPPORTUNITIES ===')
      opps.forEach(o => lines.push(`- ${o.technology}: ${o.idea} (value: ${o.business_value || 0}, difficulty: ${o.engineering_difficulty || 0})`))
    }
    return lines.join('\n')
  }

  function buildContextText(count) {
    if (!report) return ''
    const snippets = []
    const techs = (report.technologies || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, count || 10)
    techs.forEach(t => {
      snippets.push(`Technology: ${t.name}`)
      if (t.maturity) snippets.push(`  Maturity: ${t.maturity}`)
      if (t.confidence) snippets.push(`  Confidence: ${(t.confidence * 100).toFixed(0)}%`)
      if (t.trend) snippets.push(`  Trend: ${t.trend}`)
      if (t.applications && t.applications.length) snippets.push(`  Applications: ${t.applications.join(', ')}`)
    })
    return snippets.join('\n')
  }

  async function init() {
    try {
      const resp = await fetch(DATA_URL + '?t=' + Date.now())
      report = await resp.json()
    } catch (e) {
      const els = ['rd-brief-grid', 'rd-top-techs', 'rd-top-opps', 'rd-papers-list']
      els.forEach(id => { const e = el(id); if (e) e.innerHTML = '<div class="rd-empty">Failed to load report data.</div>' })
      return
    }

    renderMeta(report)
    renderBrief(report)
    renderTopTechs(report)
    renderOpps(report)
    renderPapers(report)
  }

  window.buildPrompt = buildPrompt
  window.buildContextText = buildContextText
  document.addEventListener('DOMContentLoaded', init)
  if (document.readyState === 'complete' || document.readyState === 'interactive') init()
})()
