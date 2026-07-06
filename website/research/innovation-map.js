(function () {
  const DATA_URL = 'json/index.json'
  let report = null
  let svg, simulation, gLinks, gNodes, gLabels
  let nodeData = []
  let linkData = []
  let searchTerm = ''

  function el(id) { return document.getElementById(id) }

  function buildGraphData(r) {
    const papers = r.papers || []
    const techs = r.technologies || []
    const techSet = new Set(techs.map(t => t.name))

    const nodes = []
    const links = []
    const nodeMap = {}

    papers.forEach(p => {
      const pid = 'paper_' + p.id
      if (!nodeMap[pid]) {
        const conf = p.confidence || 0.5
        nodeMap[pid] = { id: pid, label: p.title.slice(0, 40), type: 'paper', paper: p, r: 6 + conf * 8 }
        nodes.push(nodeMap[pid])
      }
      ;(p.technologies || []).forEach(tn => {
        if (!techSet.has(tn)) return
        const tid = 'tech_' + tn
        if (!nodeMap[tid]) {
          const tech = techs.find(t => t.name === tn) || {}
          const conf = tech.confidence || 0.5
          nodeMap[tid] = { id: tid, label: tn, type: 'tech', tech, r: 5 + conf * 10 }
          nodes.push(nodeMap[tid])
        }
        links.push({ source: pid, target: tid, value: 1 })
      })
    })

    return { nodes, links }
  }

  function renderGraph() {
    const container = document.getElementById('rd-map-svg')
    if (!nodeData.length) {
      container.innerHTML = ''
      const empty = document.querySelector('.map-canvas-wrap')
      if (empty) empty.innerHTML = '<div class="rd-empty" style="padding:120px 40px">No graph data available. Run the research pipeline first.</div>'
      return
    }

    const width = container.clientWidth || 800
    const height = 600

    svg = d3.select(container)
      .attr('viewBox', [0, 0, width, height])

    svg.selectAll('*').remove()

    const g = svg.append('g')

    const zoom = d3.zoom()
      .scaleExtent([0.2, 4])
      .on('zoom', (event) => g.attr('transform', event.transform))

    svg.call(zoom)

    gLinks = g.append('g').selectAll('line')
    gNodes = g.append('g').selectAll('circle')
    gLabels = g.append('g').selectAll('text')

    simulation = d3.forceSimulation(nodeData)
      .force('link', d3.forceLink(linkData).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => d.r + 4))

    gLinks = gLinks.data(linkData).join('line')
      .attr('class', 'link')
      .attr('stroke-width', d => Math.sqrt(d.value))

    gNodes = gNodes.data(nodeData).join('circle')
      .attr('r', d => d.r)
      .attr('class', d => d.type === 'paper' ? 'node-paper' : 'node-tech')
      .attr('stroke', d => d.type === 'paper' ? '#1b374a' : '#3b2f6e')
      .attr('stroke-width', 1.5)
      .style('cursor', 'pointer')
      .on('click', (event, d) => showDetail(d))
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x
          d.fy = d.y
        })
        .on('drag', (event, d) => {
          d.fx = event.x
          d.fy = event.y
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null
          d.fy = null
        })
      )

    gLabels = gLabels.data(nodeData).join('text')
      .attr('class', 'label')
      .attr('dy', d => d.r + 12)
      .text(d => d.label)

    simulation.on('tick', () => {
      gLinks
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)
      gNodes
        .attr('cx', d => d.x)
        .attr('cy', d => d.y)
      gLabels
        .attr('x', d => d.x)
        .attr('y', d => d.y)
    })

    el('rd-map-reset').addEventListener('click', () => {
      svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity)
    })

    el('rd-map-collapse').addEventListener('click', () => {
      if (simulation) {
        nodeData.forEach(d => { d.fx = width / 2; d.fy = height / 2 })
        simulation.alpha(0.3).restart()
        setTimeout(() => nodeData.forEach(d => { d.fx = null; d.fy = null }), 800)
      }
    })
  }

  function showDetail(d) {
    const card = el('rd-map-detail')
    if (!card || !d) return
    if (d.type === 'paper') {
      const p = d.paper || {}
      card.innerHTML = `<h3>Paper</h3>
        <div class="map-detail-name">${escHtml(p.title || d.label)}</div>
        <div class="map-detail-meta">${(p.authors || []).slice(0, 3).join(', ')}${(p.authors || []).length > 3 ? ' et al.' : ''}</div>
        <div class="map-detail-meta" style="margin-top:6px">${p.categories ? p.categories.join(', ') : ''}</div>
        ${p.confidence ? `<div class="map-detail-meta">Confidence: ${(p.confidence * 100).toFixed(0)}%</div>` : ''}
        ${p.pdf_url ? `<div style="margin-top:8px"><a href="${escHtml(p.pdf_url)}" target="_blank" rel="noopener" style="color:var(--accent);font-size:0.82rem">Read paper →</a></div>` : ''}`
    } else {
      const t = d.tech || {}
      card.innerHTML = `<h3>Technology</h3>
        <div class="map-detail-name">${escHtml(t.name || d.label)}</div>
        <div class="map-detail-meta">Maturity: ${t.maturity || 'early'} | Confidence: ${(t.confidence || 0).toFixed(2)} | Trend: ${t.trend || 'emerging'}</div>
        ${(t.applications || []).length ? `<div class="map-detail-meta" style="margin-top:4px">Applications: ${t.applications.join(', ')}</div>` : ''}
        <div class="map-detail-meta">Referenced by ${t.papers || 1} paper${t.papers !== 1 ? 's' : ''}</div>`
    }
  }

  function filterGraph() {
    if (!report) return
    const term = searchTerm.toLowerCase().trim()
    if (!term) {
      const gd = buildGraphData(report)
      nodeData = gd.nodes
      linkData = gd.links
      if (simulation) simulation.stop()
      renderGraph()
      return
    }
    const gd = buildGraphData(report)
    const matchedIds = new Set()
    gd.nodes.forEach(n => {
      if (n.label.toLowerCase().includes(term)) matchedIds.add(n.id)
    })
    gd.links.forEach(l => {
      const sid = typeof l.source === 'object' ? l.source.id : l.source
      const tid = typeof l.target === 'object' ? l.target.id : l.target
      if (matchedIds.has(sid) || matchedIds.has(tid)) {
        matchedIds.add(sid)
        matchedIds.add(tid)
      }
    })
    nodeData = gd.nodes.filter(n => matchedIds.has(n.id))
    const validIds = new Set(nodeData.map(n => n.id))
    linkData = gd.links.filter(l => {
      const sid = typeof l.source === 'object' ? l.source.id : l.source
      const tid = typeof l.target === 'object' ? l.target.id : l.target
      return validIds.has(sid) && validIds.has(tid)
    })
    if (simulation) simulation.stop()
    renderGraph()
  }

  function escHtml(s) {
    if (!s) return ''
    const d = document.createElement('div')
    d.textContent = String(s)
    return d.innerHTML
  }

  function buildPrompt(count) {
    if (!report) return ''
    const lines = [`You are an AI CTO. Here is the innovation map from today's research scan (${report.meta.date}).`]
    const techs = (report.technologies || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, count || 15)
    if (techs.length) {
      lines.push('', '=== TECHNOLOGIES ===')
      techs.forEach(t => lines.push(`- ${t.name} (confidence: ${(t.confidence || 0).toFixed(2)}, trend: ${t.trend || 'emerging'}, maturity: ${t.maturity || 'early'})`))
    }
    const papers = (report.papers || []).slice(0, count || 10)
    if (papers.length) {
      lines.push('', '=== PAPERS ===')
      papers.forEach(p => lines.push(`- ${p.title} [technologies: ${(p.technologies || []).join(', ')}]`))
    }
    return lines.join('\n')
  }

  function buildContextText(count) {
    if (!report) return ''
    const parts = []
    const techs = (report.technologies || []).slice().sort((a, b) => (b.confidence || 0) - (a.confidence || 0)).slice(0, count || 15)
    techs.forEach(t => {
      parts.push(`${t.name}`)
      if (t.confidence) parts.push(`  Confidence: ${(t.confidence * 100).toFixed(0)}%`)
      if (t.trend) parts.push(`  Trend: ${t.trend}`)
      if (t.applications && t.applications.length) parts.push(`  Applications: ${t.applications.join(', ')}`)
    })
    return parts.join('\n')
  }

  async function init() {
    try {
      const resp = await fetch(DATA_URL + '?t=' + Date.now())
      report = await resp.json()
    } catch (e) {
      document.querySelector('.map-canvas-wrap').innerHTML = '<div class="rd-empty">Failed to load report data.</div>'
      return
    }

    if (report.meta && report.meta.date) {
      el('rd-map-date').textContent = `Report: ${report.meta.date}`
    }

    const gd = buildGraphData(report)
    nodeData = gd.nodes
    linkData = gd.links
    renderGraph()

    el('rd-map-search').addEventListener('input', (e) => {
      searchTerm = e.target.value
      filterGraph()
    })

    window.buildPrompt = buildPrompt
    window.buildContextText = buildContextText
  }

  document.addEventListener('DOMContentLoaded', init)
  if (document.readyState === 'complete' || document.readyState === 'interactive') init()
})()
