(function () {
  const DATA_URL = 'json/index.json'
  const ARCHIVE_URL = 'json/archive/'
  const TREND_CLASS = {
    breakout: 'breakout',
    rising: 'rising',
    emerging: '',
    peak: 'peak',
    maturing: 'maturing',
  }

  let allData = []

  function el(id) { return document.getElementById(id) }

  function escHtml(s) {
    if (!s) return ''
    const d = document.createElement('div')
    d.textContent = String(s)
    return d.innerHTML
  }

  async function loadAllData() {
    try {
      const [mainResp, archiveListResp] = await Promise.all([
        fetch(DATA_URL + '?t=' + Date.now()),
        fetch(ARCHIVE_URL),
      ])
      const main = await mainResp.json()
      allData = [main]

      const text = await archiveListResp.text()
      const dates = (text.match(/\d{4}-\d{2}-\d{2}\.json/g) || []).map(d => d.replace('.json', ''))
      const archiveFetch = dates.map(async d => {
        try {
          const r = await fetch(`${ARCHIVE_URL}${d}.json?t=${Date.now()}`)
          if (r.ok) return await r.json()
        } catch (e) {}
        return null
      })
      const archives = (await Promise.all(archiveFetch)).filter(Boolean)
      archives.forEach(a => {
        if (!allData.find(d => d.meta && d.meta.date === a.meta.date)) allData.push(a)
      })
    } catch (e) {
      el('rd-tl-bars').innerHTML = '<div class="rd-empty">Failed to load data.</div>'
      return
    }

    allData.sort((a, b) => (a.meta && a.meta.date || '').localeCompare(b.meta && b.meta.date || ''))
    render()
  }

  function render() {
    const latest = allData[allData.length - 1]
    if (!latest) return

    const techs = (latest.technologies || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0))
    const opps = latest.product_opportunities || []
    const papers = latest.papers || []

    // Summary stats
    el('rd-tl-summary').innerHTML = `
      <div class="tl-stat"><div class="tl-stat-val">${techs.length}</div><div class="tl-stat-label">Technologies</div></div>
      <div class="tl-stat"><div class="tl-stat-val">${opps.length}</div><div class="tl-stat-label">Opportunities</div></div>
      <div class="tl-stat"><div class="tl-stat-val">${papers.length}</div><div class="tl-stat-label">Papers</div></div>
      <div class="tl-stat"><div class="tl-stat-val">${allData.length}</div><div class="tl-stat-label">Snapshots</div></div>
      <div class="tl-stat"><div class="tl-stat-val">${latest.meta ? escHtml(latest.meta.date || '-') : '-'}</div><div class="tl-stat-label">Latest report</div></div>
    `

    // Confidence bars
    const maxConf = Math.max(...techs.map(t => t.confidence || 0), 0.01)
    el('rd-tl-bars').innerHTML = techs.slice(0, 20).map(t => {
      const pct = Math.round((t.confidence || 0) / maxConf * 100)
      const cls = TREND_CLASS[t.trend] || ''
      return `<div class="tl-bar-row">
        <div class="tl-bar-label" title="${escHtml(t.name)}">${escHtml(t.name)}</div>
        <div class="tl-bar-track"><div class="tl-bar-fill ${cls}" style="width:${pct}%"></div></div>
        <div class="tl-bar-value">${(t.confidence || 0).toFixed(2)}</div>
      </div>`
    }).join('')

    // Trend clusters
    const clusters = {}
    techs.forEach(t => {
      const trend = t.trend || 'emerging'
      if (!clusters[trend]) clusters[trend] = []
      clusters[trend].push(t.name)
    })
    const trendLabels = { breakout: '🔥 Breakout', rising: '📈 Rising', emerging: '🌱 Emerging', peak: '⛰️ Peak', maturing: '✅ Maturing' }
    el('rd-tl-clusters').innerHTML = Object.entries(trendLabels).map(([key, label]) => {
      const items = clusters[key] || []
      if (!items.length) return ''
      return `<div class="tl-cluster-card">
        <div class="tl-cluster-title">${label} (${items.length})</div>
        <div class="tl-cluster-items">${items.map(i => escHtml(i)).join(' · ')}</div>
      </div>`
    }).filter(Boolean).join('')

    // Timeline events
    const events = []
    allData.forEach(d => {
      const date = d.meta && d.meta.date
      if (!date) return
      const count = (d.technologies || []).length
      const oppCount = (d.product_opportunities || []).length
      events.push({ date, text: `${count} technologies, ${oppCount} product opportunities` })
    })
    el('rd-tl-events').innerHTML = events.length
      ? events.map(e => `<div class="tl-event"><div class="tl-event-date">${escHtml(e.date)}</div><div class="tl-event-text">${escHtml(e.text)}</div></div>`).join('')
      : '<div class="rd-empty" style="padding:40px">No timeline data yet. Data accumulates as the pipeline runs daily.</div>'
  }

  document.addEventListener('DOMContentLoaded', loadAllData)
  if (document.readyState === 'complete' || document.readyState === 'interactive') loadAllData()
})()
