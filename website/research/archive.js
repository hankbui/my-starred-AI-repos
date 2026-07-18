(function () {
  const ARCHIVE_URL = 'json/archive/'
  const TREND_COLORS = {
    breakout: 'rd-trend-breakout',
    rising: 'rd-trend-rising',
    emerging: 'rd-trend-emerging',
    peak: 'rd-trend-peak',
    maturing: 'rd-trend-rising',
  }

  let availableDates = []

  function el(id) { return document.getElementById(id) }

  function escHtml(s) {
    if (!s) return ''
    const d = document.createElement('div')
    d.textContent = String(s)
    return d.innerHTML
  }

  async function loadArchiveList() {
    try {
      const resp = await fetch(ARCHIVE_URL)
      const text = await resp.text()
      const parser = new DOMParser()
      const doc = parser.parseFromHTML ? parser.parseFromHTML(text, 'text/html') : null
      if (doc) {
        availableDates = Array.from(doc.querySelectorAll('a'))
          .map(a => a.getAttribute('href'))
          .filter(h => h && h.endsWith('.json'))
          .map(h => h.replace('.json', ''))
          .sort()
          .reverse()
      } else {
        await fallbackList()
      }
    } catch (e) {
      await fallbackList()
    }
    renderDateList()
    if (availableDates.length) loadReport(availableDates[0])
  }

  async function fallbackList() {
    try {
      const r = await fetch('json/index.json?t=' + Date.now())
      const data = await r.json()
      const date = data.meta && data.meta.date
      if (date) availableDates = [date]
    } catch (e) {}
  }

  function renderDateList() {
    const list = el('rd-archive-list')
    if (!availableDates.length) {
      list.innerHTML = '<div class="archive-empty">No archived reports yet.</div>'
      return
    }
    list.innerHTML = availableDates.map(d =>
      `<button class="archive-date-btn" data-date="${d}" type="button">${d}</button>`
    ).join('')

    list.querySelectorAll('.archive-date-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        list.querySelectorAll('.archive-date-btn').forEach(b => b.classList.remove('active'))
        btn.classList.add('active')
        loadReport(btn.dataset.date)
      })
    })
    if (list.firstChild) list.firstChild.classList.add('active')
  }

  async function loadReport(date) {
    const container = el('rd-archive-report')
    container.innerHTML = '<div class="rd-empty">Loading...</div>'

    try {
      let data
      const archiveResp = await fetch(`${ARCHIVE_URL}${date}.json?t=${Date.now()}`)
      if (archiveResp.ok) {
        data = await archiveResp.json()
      } else {
        const mainResp = await fetch('json/index.json?t=' + Date.now())
        data = await mainResp.json()
      }

      renderReport(container, data)
      container.scrollIntoView({ behavior: 'smooth', block: 'start' })
    } catch (e) {
      container.innerHTML = '<div class="rd-empty">Failed to load report for this date.</div>'
    }
  }

  function renderReport(container, r) {
    const m = r.meta || {}
    const brief = r.brief || []
    const techs = (r.technologies || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    const opps = r.product_opportunities || []
    const papers = r.papers || []

    let html = `<div style="display:flex;flex-wrap:wrap;gap:12px;padding:14px 16px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--bg-panel);margin-bottom:18px">
      <div style="flex:1;min-width:120px"><div style="font-weight:700;font-size:1rem;color:var(--text-primary)">${escHtml(m.date || '?')}</div><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Report date</div></div>
      <div style="flex:1;min-width:120px"><div style="font-weight:700;font-size:1rem;color:var(--text-primary)">${m.technologies_discovered || 0}</div><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Technologies</div></div>
      <div style="flex:1;min-width:120px"><div style="font-weight:700;font-size:1rem;color:var(--text-primary)">${m.opportunities_identified || 0}</div><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Opportunities</div></div>
      <div style="flex:1;min-width:120px"><div style="font-weight:700;font-size:1rem;color:var(--text-primary)">${m.papers_tracked || 0}</div><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Papers</div></div>
      <div style="flex:1;min-width:120px"><div style="font-weight:700;font-size:0.85rem;color:var(--text-primary)">${escHtml(m.last_update || '')}</div><div style="font-size:0.72rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em">Last updated</div></div>
    </div>`

    // Brief
    html += '<section class="report-section"><h2>🧠 Intelligence Brief</h2><div class="brief-list">'
    if (brief.length) {
      html += brief.map(s => {
        const text = typeof s === 'string' ? s : (s.technology ? `🔬 ${s.technology} — ${s.why_it_matters || ''}` : JSON.stringify(s));
        return `<div class="brief-item">${escHtml(text)}</div>`;
      }).join('')
    } else {
      html += '<div class="brief-item" style="color:var(--text-muted)">No brief generated for this date.</div>'
    }
    html += '</div></section>'

    // Top techs
    html += '<section class="report-section" style="margin-top:18px"><h2>🔥 Technologies</h2><div class="tech-mini-list">'
    if (techs.length) {
      const maxConf = Math.max(...techs.map(t => t.confidence || 0), 0.01)
      techs.slice(0, 18).forEach(t => {
        const pct = Math.round((t.confidence || 0) / maxConf * 100)
        html += `<div class="tech-mini-card">
          <div class="tech-mini-name">${escHtml(t.name)}</div>
          <div class="tech-mini-bar"><div class="tech-mini-fill" style="width:${pct}%"></div></div>
          <div class="tech-mini-meta">${(t.confidence || 0).toFixed(2)} conf · ${t.trend || 'emerging'} · ${t.papers || 1} paper${t.papers !== 1 ? 's' : ''}</div>
        </div>`
      })
    } else {
      html += '<div class="rd-empty" style="padding:20px">No technologies.</div>'
    }
    html += '</div></section>'

    // Opportunities
    html += '<section class="report-section" style="margin-top:18px"><h2>💡 Opportunities</h2><div class="opp-mini-list">'
    if (opps.length) {
      opps.slice(0, 8).forEach(o => {
        html += `<div class="opp-mini-card">
          <div class="opp-mini-tech">${escHtml(o.technology)}</div>
          <div class="opp-mini-idea">${escHtml(o.idea)}</div>
          <div style="display:flex;gap:8px;margin-top:4px;font-size:0.7rem;color:var(--text-muted)">
            <span>Value: ${o.business_value || 0}/10</span>
            <span>Difficulty: ${o.engineering_difficulty || 0}/10</span>
            <span>${escHtml(o.competitive_advantage || 'medium')}</span>
            <span>${escHtml(o.development_time || '2-4 weeks')}</span>
          </div>
        </div>`
      })
    } else {
      html += '<div class="rd-empty" style="padding:20px">No opportunities.</div>'
    }
    html += '</div></section>'

    container.innerHTML = html
  }

  document.addEventListener('DOMContentLoaded', loadArchiveList)
  if (document.readyState === 'complete' || document.readyState === 'interactive') loadArchiveList()
})()
