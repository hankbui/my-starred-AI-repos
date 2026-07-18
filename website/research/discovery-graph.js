(function () {
  const DATA_URL = '../data/graph.json?v=' + Date.now();

  let graphData = null;
  let svg, simulation, gLinks, gNodes, gLabels;
  let nodeData = [];
  let linkData = [];
  let searchTerm = '';
  let selectedNode = null;
  let typeFilters = { repo: true, idea: true, tech: true, paper: true };

  function el(id) { return document.getElementById(id); }

  function buildGraph(g) {
    const nodes = g.nodes.map(n => ({ ...n }));
    const links = g.edges.map(e => ({ ...e }));
    return { nodes, links };
  }

  function nodeRadius(n) {
    const base = { repo: 7, idea: 6, tech: 8, paper: 5 };
    const r = base[n.type] || 5;
    const extra = n.stars ? Math.min(8, Math.log10(n.stars + 1)) : 0;
    const extra2 = n.composite_score ? n.composite_score / 20 : 0;
    return r + extra + extra2;
  }

  function nodeColor(n) {
    return { repo: '#4ac7ff', idea: '#5be0a8', tech: '#a78bfa', paper: '#ffb857' }[n.type] || '#888';
  }

  function nodeLabel(n) {
    if (n.type === 'repo') {
      const parts = n.label.split('/');
      return parts.length > 1 ? parts[1] : n.label;
    }
    return n.label.length > 25 ? n.label.slice(0, 22) + '...' : n.label;
  }

  function renderGraph() {
    const container = el('dg-svg');
    if (!nodeData.length) {
      const wrap = el('dg-canvas');
      wrap.innerHTML = '<div class="dg-empty">No graph data available. Run the data pipeline first.</div>';
      renderStats(null);
      return;
    }

    const width = container.clientWidth || 800;
    const height = 600;

    svg = d3.select(container)
      .attr('viewBox', [0, 0, width, height]);

    svg.selectAll('*').remove();

    const g = svg.append('g');

    // Zoom
    svg.call(d3.zoom()
      .scaleExtent([0.1, 8])
      .on('zoom', (event) => { g.attr('transform', event.transform); })
    );

    gLinks = g.append('g').selectAll('line');
    gNodes = g.append('g').selectAll('circle');
    gLabels = g.append('g').selectAll('text');

    const filteredNodes = nodeData.filter(n => typeFilters[n.type]);
    const filteredIds = new Set(filteredNodes.map(n => n.id));
    const filteredLinks = linkData.filter(l =>
      filteredIds.has(l.source.id !== undefined ? l.source.id : l.source) &&
      filteredIds.has(l.target.id !== undefined ? l.target.id : l.target)
    );

    // Search filter
    let visibleNodes = filteredNodes;
    if (searchTerm) {
      const matchIds = new Set();
      const term = searchTerm.toLowerCase();
      filteredNodes.forEach(n => {
        if (n.label.toLowerCase().includes(term)) matchIds.add(n.id);
      });
      // Also show 1-hop neighbors
      filteredLinks.forEach(l => {
        const sid = l.source.id !== undefined ? l.source.id : l.source;
        const tid = l.target.id !== undefined ? l.target.id : l.target;
        if (matchIds.has(sid)) matchIds.add(tid);
        if (matchIds.has(tid)) matchIds.add(sid);
      });
      visibleNodes = filteredNodes.filter(n => matchIds.has(n.id));
    }

    const visibleIds = new Set(visibleNodes.map(n => n.id));
    const visibleLinks = filteredLinks.filter(l => {
      const sid = l.source.id !== undefined ? l.source.id : l.source;
      const tid = l.target.id !== undefined ? l.target.id : l.target;
      return visibleIds.has(sid) && visibleIds.has(tid);
    });

    simulation = d3.forceSimulation(visibleNodes)
      .force('link', d3.forceLink(visibleLinks).id(d => d.id).distance(d => 120 / Math.min(d.weight, 5)).strength(d => d.weight / 15))
      .force('charge', d3.forceManyBody().strength(-180))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 3))
      .alphaDecay(0.02);

    const link = gLinks
      .data(visibleLinks, d => d.source.id + '-' + d.target.id)
      .join('line')
      .attr('class', 'link')
      .attr('stroke-width', d => Math.min(4, d.weight / 2))
      .attr('stroke-opacity', d => Math.min(0.4, 0.1 + d.weight / 20));

    const node = gNodes
      .data(visibleNodes, d => d.id)
      .join('circle')
      .attr('r', d => nodeRadius(d))
      .attr('class', d => 'node-' + d.type)
      .attr('stroke-width', 1.5)
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart();
          d.fx = d.x;
          d.fy = d.y;
        })
        .on('drag', (event, d) => {
          d.fx = event.x;
          d.fy = event.y;
        })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0);
          d.fx = null;
          d.fy = null;
        })
      );

    node.on('click', (event, d) => {
      event.stopPropagation();
      selectNode(d);
    });

    const label = gLabels
      .data(visibleNodes.filter(n => n.type !== 'paper'), d => d.id)
      .join('text')
      .attr('class', 'label')
      .text(d => nodeLabel(d));

    svg.on('click', () => {
      deselectNode();
    });

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y);
      node
        .attr('cx', d => d.x)
        .attr('cy', d => d.y);
      label
        .attr('x', d => d.x)
        .attr('y', d => d.y - nodeRadius(d) - 4);
    });

    renderStats(graphData);
  }

  function selectNode(d) {
    deselectNode();
    selectedNode = d;

    // Highlight connected
    const connectedIds = new Set([d.id]);
    linkData.forEach(l => {
      const sid = l.source.id !== undefined ? l.source.id : l.source;
      const tid = l.target.id !== undefined ? l.target.id : l.target;
      if (sid === d.id) connectedIds.add(tid);
      if (tid === d.id) connectedIds.add(sid);
    });

    gNodes.attr('opacity', n => connectedIds.has(n.id) ? 1 : 0.15);
    gLinks.attr('opacity', l => {
      const sid = l.source.id !== undefined ? l.source.id : l.source;
      const tid = l.target.id !== undefined ? l.target.id : l.target;
      return (sid === d.id || tid === d.id) ? 0.6 : 0.04;
    });
    gLabels.attr('opacity', n => connectedIds.has(n.id) ? 1 : 0.1);

    // Detail panel
    const connections = nodeData.filter(n => n.id !== d.id && connectedIds.has(n.id)).slice(0, 15);
    const connKeywords = linkData
      .filter(l => {
        const sid = l.source.id !== undefined ? l.source.id : l.source;
        const tid = l.target.id !== undefined ? l.target.id : l.target;
        return (sid === d.id || tid === d.id);
      })
      .flatMap(l => l.keywords || [])
      .filter((v, i, a) => a.indexOf(v) === i)
      .slice(0, 8);

    const typeNames = { repo: 'GitHub Repo', idea: 'Startup Idea', tech: 'Technology', paper: 'Research Paper' };
    const href = d.href ? `<a href="${d.href}" target="_blank" rel="noreferrer">${esc(d.label)}</a>` : esc(d.label);

    el('dg-detail').innerHTML = `
      <h3>Selected — ${typeNames[d.type] || d.type}</h3>
      <div class="dg-detail-name">${href}</div>
      <div class="dg-detail-meta">
        ${d.stars ? '⭐ ' + fmtStars(d.stars) + ' stars' : ''}
        ${d.revenue ? '💰 Revenue signal' : ''}
        ${d.confidence ? 'Confidence: ' + Math.round(d.confidence * 100) + '%' : ''}
        ${d.maturity ? 'Maturity: ' + d.maturity : ''}
        ${d.language ? 'Language: ' + d.language : ''}
        ${d.source ? 'Source: ' + d.source : ''}
      </div>
      ${connKeywords.length ? `
        <div style="margin-top:8px;font-size:0.78rem;color:var(--text-muted)">Shared keywords: ${connKeywords.map(k => '<span style="color:var(--accent)">' + esc(k) + '</span>').join(', ')}</div>
      ` : ''}
      ${connections.length ? `
        <div style="margin-top:10px">
          <div style="font-size:0.78rem;color:var(--text-muted);margin-bottom:4px">Connected to:</div>
          ${connections.map(n => {
            const typeNames2 = { repo: '⭐', idea: '💡', tech: '🔬', paper: '📄' };
            return `<div class="dg-conn-item">${typeNames2[n.type] || '•'} <a href="#" data-id="${n.id}">${esc(n.label)}</a></div>`;
          }).join('')}
        </div>
      ` : '<div class="dg-detail-empty">No connections found</div>'}
    `;
    el('dg-detail').querySelectorAll('[data-id]').forEach(a => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        const target = nodeData.find(n => n.id === a.dataset.id);
        if (target) selectNode(target);
      });
    });
  }

  function deselectNode() {
    selectedNode = null;
    gNodes && gNodes.attr('opacity', 1);
    gLinks && gLinks.attr('opacity', null);
    gLabels && gLabels.attr('opacity', 1);
    el('dg-detail').innerHTML = '<h3>Selected</h3><div class="dg-detail-empty">Click a node to see connections</div>';
  }

  function renderStats(g) {
    if (!g || !g.stats) {
      el('dg-stats').innerHTML = '<div class="dg-stat"><div class="dg-stat-val">-</div><div class="dg-stat-lbl">Loading...</div></div>';
      return;
    }
    const s = g.stats;
    const by = s.by_type || {};
    el('dg-stats').innerHTML = `
      <div class="dg-stat"><div class="dg-stat-val">${s.nodes}</div><div class="dg-stat-lbl">Nodes</div></div>
      <div class="dg-stat"><div class="dg-stat-val">${s.edges}</div><div class="dg-stat-lbl">Edges</div></div>
      <div class="dg-stat"><div class="dg-stat-val">${by.repo || 0}</div><div class="dg-stat-lbl">Repos</div></div>
      <div class="dg-stat"><div class="dg-stat-val">${by.idea || 0}</div><div class="dg-stat-lbl">Ideas</div></div>
      <div class="dg-stat"><div class="dg-stat-val">${by.tech || 0}</div><div class="dg-stat-lbl">Technologies</div></div>
      <div class="dg-stat"><div class="dg-stat-val">${by.paper || 0}</div><div class="dg-stat-lbl">Papers</div></div>
    `;
  }

  function esc(v) { return String(v ?? '').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;'); }

  function fmtStars(n) { if (n >= 1000) return (n/1000).toFixed(1) + 'k'; return String(n); }

  function loadGraph() {
    const wrap = el('dg-canvas');
    fetch(DATA_URL)
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(g => {
        graphData = g;
        const built = buildGraph(g);
        nodeData = built.nodes;
        linkData = built.links;
        renderGraph();
      })
      .catch(e => {
        wrap.innerHTML = `<div class="dg-empty">
          <p>Graph data not available yet.</p>
          <p style="font-size:0.84rem;color:var(--text-muted);margin-top:6px">${esc(e.message)}</p>
          <p style="margin-top:10px">The graph is generated by the research pipeline. Run the pipeline first or check back later.</p>
        </div>`;
      });
  }

  function initControls() {
    el('dg-search').addEventListener('input', e => {
      searchTerm = e.target.value;
      if (simulation) simulation.stop();
      renderGraph();
    });

    el('dg-reset').addEventListener('click', () => {
      el('dg-search').value = '';
      searchTerm = '';
      deselectNode();
      if (simulation) simulation.stop();
      renderGraph();
    });

    ['repo', 'idea', 'tech', 'paper'].forEach(type => {
      const btn = el('dg-filter-' + type);
      btn.addEventListener('click', () => {
        typeFilters[type] = !typeFilters[type];
        btn.classList.toggle('active', typeFilters[type]);
        if (simulation) simulation.stop();
        renderGraph();
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initControls();
    loadGraph();
  });
})();
