/* Hugging Face Daily — render trending models, papers, spaces, datasets.
 *
 * Data source: website/data/hf-daily.json (generated daily by scripts/generate_hf_daily.py).
 * Zero dependencies. Vanilla JS, same patterns as automation.js.
 */
(function () {
    'use strict';

    const DATA_URL = 'data/hf-daily.json?v=' + Date.now();
    const MAX_RENDER = 60;   // cap per-tab to keep DOM light

    const state = {
        data: null,
        tab: 'models',
        search: '',
    };

    // ---- helpers ------------------------------------------------------------

    const $ = (id) => document.getElementById(id);

    function esc(s) {
        if (s === null || s === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    function fmtNum(n) {
        n = Number(n) || 0;
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
        return String(n);
    }

    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function relativeUpdated(iso) {
        if (!iso) return '';
        try {
            const ms = Date.now() - new Date(iso).getTime();
            const hrs = Math.floor(ms / 36e5);
            if (hrs < 1) return 'just now';
            if (hrs < 24) return `${hrs}h ago`;
            const days = Math.floor(hrs / 24);
            return `${days}d ago`;
        } catch { return ''; }
    }

    // ---- render: header stats ----------------------------------------------

    function renderStats(d) {
        const s = d.sources || {};
        $('hf-updated').textContent = '· updated ' + relativeUpdated(d.updated_at);
        $('hf-stats').innerHTML = `
            <div class="hf-stat"><div class="hf-stat-val">${s.models || 0}</div><div class="hf-stat-lbl">models</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${s.papers || 0}</div><div class="hf-stat-lbl">papers</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${s.spaces || 0}</div><div class="hf-stat-lbl">spaces</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${s.datasets || 0}</div><div class="hf-stat-lbl">datasets</div></div>
        `;
        $('hf-c-models').textContent = `(${s.models || 0})`;
        $('hf-c-papers').textContent = `(${s.papers || 0})`;
        $('hf-c-spaces').textContent = `(${s.spaces || 0})`;
        $('hf-c-datasets').textContent = `(${s.datasets || 0})`;
    }

    // ---- render: 30-second digest ------------------------------------------

    function renderHighlight(d) {
        const h = (d.digest && d.digest.highlights) || {};
        const maxTheme = Math.max(1, ...(h.hot_themes || []).map(t => t[1]));

        const themesHtml = (h.hot_themes || []).map(([name, count]) => `
            <div class="hf-theme-row">
                <span class="hf-theme-name">${esc(name)}</span>
                <span class="hf-theme-bar"><span class="hf-theme-fill" style="width:${(count / maxTheme * 100).toFixed(0)}%"></span></span>
                <span class="hf-theme-count">${count}</span>
            </div>
        `).join('');

        const topPaper = h.top_paper;
        const topModels = h.top_models || [];
        const topModel = topModels[0];

        const orgsHtml = (h.trending_orgs || []).map(o =>
            `<span class="hf-org-chip">${esc(o.name)} <span class="n">${o.count}</span></span>`
        ).join('');

        const keywordsHtml = ((d.digest && d.digest.keyword_cloud) || []).slice(0, 20).map(k =>
            `<span class="hf-kw">${esc(k.word)} <span style="opacity:0.6">${k.count}</span></span>`
        ).join('');

        $('hf-highlight').innerHTML = `
            <div class="hf-card">
                <div class="hf-card-title">📊 What's hot today</div>
                ${themesHtml || '<div class="hf-empty">No theme data.</div>'}
                <div style="margin-top:14px;font-size:0.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:700;margin-bottom:6px">🏆 Trending orgs</div>
                <div>${orgsHtml || '<span style="color:var(--text-muted);font-size:0.84rem">—</span>'}</div>
            </div>
            <div class="hf-card">
                <div class="hf-card-title">⚡ Headlines</div>
                ${topPaper ? `
                    <div style="font-size:0.72rem;color:#ffb857;font-weight:700;margin-bottom:2px">TOP PAPER · ${topPaper.upvotes} upvotes</div>
                    <a href="${esc(topPaper.url)}" target="_blank" rel="noopener" style="color:var(--text-primary);text-decoration:none;font-weight:700;font-size:0.92rem;line-height:1.35">${esc(topPaper.title)}</a>
                    <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:4px;line-height:1.45">${esc((topPaper.summary || '').slice(0, 180))}${topPaper.summary && topPaper.summary.length > 180 ? '…' : ''}</div>
                ` : ''}
                ${topModel ? `
                    <div style="margin-top:12px;font-size:0.72rem;color:var(--accent);font-weight:700;margin-bottom:2px">🔥 TOP MODEL · trending ${fmtNum(topModel.trending_score)}</div>
                    <a href="${esc(topModel.url)}" target="_blank" rel="noopener" style="color:var(--text-primary);text-decoration:none;font-weight:700;font-size:0.92rem">${esc(topModel.id)}</a>
                    <div style="font-size:0.76rem;color:var(--text-muted);margin-top:2px">${esc(topModel.pipeline_tag || 'model')} · ${fmtNum(topModel.downloads)} downloads</div>
                ` : ''}
                <div style="margin-top:14px;font-size:0.72rem;text-transform:uppercase;letter-spacing:.05em;color:var(--text-muted);font-weight:700;margin-bottom:6px">🔤 Keyword cloud</div>
                <div class="hf-keyword-cloud">${keywordsHtml || '<span style="color:var(--text-muted);font-size:0.84rem">—</span>'}</div>
            </div>
        `;
    }

    // ---- render: tab grids --------------------------------------------------

    function filterItems(items) {
        const q = state.search.trim().toLowerCase();
        if (!q) return items;
        const terms = q.split(/\s+/);
        return items.filter(it => {
            const hay = [
                it.name, it.id, it.author, it.title,
                Array.isArray(it.tags) ? it.tags.join(' ') : '',
                it.pipeline_tag || '',
                it.summary || '',
            ].filter(Boolean).join(' ').toLowerCase();
            return terms.every(t => hay.includes(t));
        });
    }

    function renderModelCard(m) {
        const tags = (m.tags || []).slice(0, 4).map(t => `<span class="hf-item-tag">${esc(t)}</span>`).join('');
        const libs = (m.library || []).map(l => `<span class="hf-item-tag lib">${esc(l)}</span>`).join('');
        const lic = m.license ? `<span class="hf-item-tag license">${esc(m.license)}</span>` : '';
        return `
            <div class="hf-item">
                <div class="hf-item-head">
                    <a class="hf-item-name" href="${esc(m.url)}" target="_blank" rel="noopener">${esc(m.name)}</a>
                    <span class="hf-item-meta"><span class="hot">🔥 ${fmtNum(m.trending_score)}</span></span>
                </div>
                <div class="hf-item-author">${esc(m.author)} · ${esc(m.pipeline_tag || 'model')}</div>
                <div class="hf-item-meta">
                    <span>❤️ ${fmtNum(m.likes)}</span>
                    <span>⬇ ${fmtNum(m.downloads)}</span>
                    ${m.last_modified ? `<span>· ${fmtDate(m.last_modified)}</span>` : ''}
                </div>
                <div class="hf-item-tags">${tags}${libs}${lic}</div>
            </div>
        `;
    }

    function renderPaperCard(p) {
        const authors = (p.authors || []).slice(0, 3).join(', ') + ((p.authors || []).length > 3 ? ' et al.' : '');
        return `
            <div class="hf-item">
                <div class="hf-item-head">
                    <a class="hf-item-name" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>
                    <span class="hf-paper-upvotes">▲ ${p.upvotes || 0}</span>
                </div>
                <div class="hf-item-author">${esc(authors)}${p.published ? ' · ' + fmtDate(p.published) : ''}</div>
                ${p.summary ? `<div class="hf-item-desc">${esc(p.summary)}</div>` : ''}
                <div class="hf-item-tags">
                    ${p.github ? `<a class="hf-item-tag" href="${esc(p.github)}" target="_blank" rel="noopener">code ↗</a>` : ''}
                    <a class="hf-item-tag license" href="${esc(p.pdf_url)}" target="_blank" rel="noopener">pdf ↗</a>
                </div>
            </div>
        `;
    }

    function renderSpaceCard(s) {
        const tags = (s.tags || []).slice(0, 4).map(t => `<span class="hf-item-tag">${esc(t)}</span>`).join('');
        return `
            <div class="hf-item">
                <div class="hf-item-head">
                    <a class="hf-item-name" href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.name)}</a>
                    <span class="hf-item-meta"><span class="hot">🔥 ${fmtNum(s.trending_score)}</span></span>
                </div>
                <div class="hf-item-author">${esc(s.author)}</div>
                <div class="hf-item-meta">
                    <span>❤️ ${fmtNum(s.likes)}</span>
                    ${s.last_modified ? `<span>· ${fmtDate(s.last_modified)}</span>` : ''}
                </div>
                <div class="hf-item-tags">${tags}</div>
            </div>
        `;
    }

    function renderDatasetCard(ds) {
        const tags = (ds.tags || []).slice(0, 4).map(t => `<span class="hf-item-tag">${esc(t)}</span>`).join('');
        const lic = ds.license ? `<span class="hf-item-tag license">${esc(ds.license)}</span>` : '';
        return `
            <div class="hf-item">
                <div class="hf-item-head">
                    <a class="hf-item-name" href="${esc(ds.url)}" target="_blank" rel="noopener">${esc(ds.name)}</a>
                    <span class="hf-item-meta"><span class="hot">🔥 ${fmtNum(ds.trending_score)}</span></span>
                </div>
                <div class="hf-item-author">${esc(ds.author)}</div>
                <div class="hf-item-meta">
                    <span>⬇ ${fmtNum(ds.downloads)}</span>
                    <span>❤️ ${fmtNum(ds.likes)}</span>
                    ${ds.last_modified ? `<span>· ${fmtDate(ds.last_modified)}</span>` : ''}
                </div>
                <div class="hf-item-tags">${tags}${lic}</div>
            </div>
        `;
    }

    function renderTab() {
        if (!state.data) return;
        const grid = $('hf-grid');
        const items = state.data[state.tab] || [];
        const filtered = filterItems(items).slice(0, MAX_RENDER);

        $('hf-visible-count').textContent = `${filtered.length}${filtered.length === MAX_RENDER ? '+' : ''} shown`;

        if (!filtered.length) {
            grid.innerHTML = '<div class="hf-empty">No items match your search.</div>';
            return;
        }

        const renderer = {
            models: renderModelCard,
            papers: renderPaperCard,
            spaces: renderSpaceCard,
            datasets: renderDatasetCard,
        }[state.tab];
        grid.innerHTML = filtered.map(renderer).join('');
    }

    function setActiveTab(tab) {
        state.tab = tab;
        document.querySelectorAll('.hf-tab').forEach(b => {
            b.classList.toggle('active', b.dataset.tab === tab);
        });
        renderTab();
    }

    // ---- LLM7 AI Daily Brief -----------------------------------------------

    const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';

    async function llm7(messages, temperature) {
        const res = await fetch(LLM7_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer unused' },
            body: JSON.stringify({ model: 'default', messages, temperature: temperature ?? 0.5 }),
        });
        if (!res.ok) throw new Error('LLM7 HTTP ' + res.status);
        const d = await res.json();
        return d?.choices?.[0]?.message?.content || '';
    }

    function buildBriefPrompt(d) {
        const papers = (d.papers || []).slice(0, 5).map(p =>
            `- "${p.title}" (${p.upvotes} upvotes) — ${(p.summary || '').slice(0, 150)}`
        ).join('\n');
        const topModels = (d.digest?.highlights?.top_models || []).slice(0, 5).map(m =>
            `- ${m.id} (🔥 ${m.trending_score}) — ${m.pipeline_tag || 'model'}, ${fmtNum(m.downloads)} downloads`
        ).join('\n');
        const themes = (d.digest?.highlights?.hot_themes || []).map(([t, c]) =>
            `- ${t}: ${c} items`
        ).join('\n');
        const orgs = (d.digest?.highlights?.trending_orgs || []).map(o =>
            `- ${o.name} (${o.count} trending models)`
        ).join('\n');
        return `You are a senior AI research analyst. Write a concise daily brief (3-4 paragraphs) summarizing what's happening on HuggingFace today. Use a confident, informed tone. Focus on what actually matters — skip filler.

Today's data:

TOP PAPERS:
${papers}

TRENDING MODELS:
${topModels}

HOT THEMES:
${themes}

TOP ORGS:
${orgs}

Write a brief that covers: (1) the biggest story of the day, (2) notable model releases, (3) what the trending themes tell us about where the field is going, (4) one concrete takeaway for a practitioner. Keep it under 400 words. Use **bold** for key terms. No fluff.`;
    }

    async function generateBrief() {
        const btn = $('hf-brief-btn');
        const box = $('hf-brief-box');
        const body = $('hf-brief-body');
        const meta = $('hf-brief-meta');
        if (!state.data) return;
        btn.disabled = true;
        btn.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite">⟳</span> Generating…';
        box.hidden = false;
        body.textContent = 'Thinking…';

        try {
            const prompt = buildBriefPrompt(state.data);
            const raw = await llm7([
                { role: 'system', content: 'You are a concise AI research analyst. Write clear, opinionated daily briefs.' },
                { role: 'user', content: prompt },
            ], 0.4);
            const brief = raw.replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();
            const paras = brief.split(/\n{2,}/).filter(Boolean);
            body.innerHTML = '<p>' + paras.map(p =>
                p.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\*\*(.*?)\*\*/g, '<em>$1</em>').replace(/\n/g, '<br>')
            ).join('</p><p>') + '</p>';
            meta.textContent = 'Generated via LLM7 · ' + new Date().toLocaleTimeString();
        } catch (e) {
            body.innerHTML = '⚠️ Brief generation failed: ' + esc(e.message);
        }
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0-7.74 13.55L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="M8.5 11h7"/><path d="M8.5 14h4"/></svg> Generate Daily Brief`;
    }

    // ---- bootstrap ----------------------------------------------------------

    function bindControls() {
        document.querySelectorAll('.hf-tab').forEach(btn => {
            btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
        });
        $('hf-search').addEventListener('input', (e) => {
            state.search = e.target.value;
            renderTab();
        });

        $('hf-brief-btn').addEventListener('click', generateBrief);

        const backBtn = $('back-to-top');
        if (backBtn) {
            window.addEventListener('scroll', () => {
                backBtn.hidden = window.scrollY < 600;
            });
            backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        }
    }

    async function load() {
        try {
            const resp = await fetch(DATA_URL);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            state.data = await resp.json();
        } catch (e) {
            $('hf-grid').innerHTML = `<div class="hf-empty">Failed to load Hugging Face data: ${esc(e.message)}</div>`;
            return;
        }
        renderStats(state.data);
        renderHighlight(state.data);
        renderTab();
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindControls();
        load();
    });
})();
