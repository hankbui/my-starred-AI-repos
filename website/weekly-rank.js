// ---- Weekly Ranking Engine ----
const STARS_DATA_URL = 'data/star_history.json?v=20260701-1';
const REPOS_DATA_URL = 'data/repos.json?v=20260328-5';

const state = {
    history: null,       // parsed star_history.json
    reposMap: null,      // name -> repo metadata
    rows: [],            // computed ranking rows
    filtered: [],
    period: 7,            // 1, 7, 30
    search: '',
    category: 'all',
    sortCol: 'delta',
    sortDir: 'desc',
    latestDate: null,
    weekDates: [],       // available dates for week picker
    weekIndex: 1,        // which week (0 = oldest, n = latest)
};

function repoName(r) { return r && (r.name || r.repo_name); }

function renderStats() {
    const rows = state.filtered;
    const gainers = rows.filter(r => r.delta > 0);
    const top = gainers[0];
    const avgDelta = gainers.length ? Math.round(gainers.reduce((s, r) => s + r.delta, 0) / gainers.length) : 0;

    document.getElementById('wr-stat-total').textContent = gainers.length;
    document.getElementById('wr-stat-top-delta').textContent = top ? `+${top.delta.toLocaleString()}` : '-';
    document.getElementById('wr-stat-avg-delta').textContent = `+${avgDelta.toLocaleString()}`;
    document.getElementById('wr-stat-updated').textContent = state.latestDate || '-';
}

function computeRows() {
    const dates = state.weekDates;
    if (dates.length < 2) { state.rows = []; return; }

    const latestDate = dates[dates.length - 1];
    const targetIdx = Math.max(0, dates.length - 1 - state.period);
    const startDate = dates[targetIdx];

    const latest = state.history[latestDate];
    const start = state.history[startDate];
    if (!latest || !start) { state.rows = []; return; }

    state.latestDate = latestDate;

    const rows = [];
    for (const [name, stars] of Object.entries(latest)) {
        const oldStars = start[name];
        if (oldStars === undefined) continue; // wasn't tracked at start date
        const delta = stars - oldStars;
        const meta = state.reposMap.get(name);
        const pct = oldStars > 0 ? (delta / oldStars) * 100 : 0;
        rows.push({
            name,
            stars,
            delta,
            pct,
            oldStars,
            meta,
            category: meta?.category || 'Other',
            description: meta?.description || '',
            language: meta?.language || '',
            url: meta?.url || `https://github.com/${name}`,
            topics: meta?.topics || [],
            trend_score: meta?.trend_score || 0,
        });
    }

    rows.sort((a, b) => b.delta - a.delta);
    state.rows = rows;
}

function applyFilters() {
    let rows = state.rows;

    if (state.category !== 'all') {
        rows = rows.filter(r => r.category === state.category);
    }

    if (state.search.trim()) {
        const q = state.search.trim().toLowerCase();
        rows = rows.filter(r =>
            r.name.toLowerCase().includes(q) ||
            (r.description && r.description.toLowerCase().includes(q)) ||
            r.category.toLowerCase().includes(q)
        );
    }

    const { sortCol, sortDir } = state;
    rows.sort((a, b) => {
        let va, vb;
        if (sortCol === 'delta') { va = a.delta; vb = b.delta; }
        else if (sortCol === 'stars') { va = a.stars; vb = b.stars; }
        else if (sortCol === 'pct') { va = a.pct; vb = b.pct; }
        else if (sortCol === 'category') { va = a.category; vb = b.category; }
        else if (sortCol === 'name') { va = a.name; vb = b.name; }
        else if (sortCol === 'trend_score') { va = a.trend_score; vb = b.trend_score; }
        else { va = a.delta; vb = b.delta; }

        if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        return sortDir === 'asc' ? (va - vb) : (vb - va);
    });

    state.filtered = rows;
}

function renderInfo() {
    const total = state.rows.length;
    const filtered = state.filtered.length;
    const el = document.getElementById('wr-info');
    if (total === filtered) {
        el.textContent = `${total.toLocaleString()} repos tracked • showing all`;
    } else {
        el.textContent = `${filtered.toLocaleString()} of ${total.toLocaleString()} repos`;
    }
}

function renderTable() {
    const wrap = document.getElementById('wr-table-wrap');
    const rows = state.filtered;

    if (!rows.length) {
        wrap.innerHTML = `<div class="wr-empty">No results match your filters.</div>`;
        return;
    }

    const sortIcon = (col) => {
        if (state.sortCol !== col) return `<span class="sort-arrow">↕</span>`;
        return `<span class="sort-arrow">${state.sortDir === 'asc' ? '↑' : '↓'}</span>`;
    };

    const periodLabel = state.period === 1 ? 'Daily' : state.period === 30 ? '30-day' : 'Weekly';
    const thead = `<table class="wr-table">
        <thead><tr>
            <th data-col="rank">#</th>
            <th data-col="name">Repo ${sortIcon('name')}</th>
            <th data-col="stars">Stars ${sortIcon('stars')}</th>
            <th data-col="delta">${periodLabel} Δ ${sortIcon('delta')}</th>
            <th data-col="pct">% ${sortIcon('pct')}</th>
            <th data-col="category" class="hide-mobile">Category ${sortIcon('category')}</th>
            <th data-col="trend_score" class="hide-mobile">Trend ${sortIcon('trend_score')}</th>
        </tr></thead>
        <tbody>${rows.map((r, i) => {
            const rank = i + 1;
            const rankClass = rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : '';
            const deltaClass = r.delta > 0 ? 'pos' : r.delta < 0 ? 'neg' : '';
            const pctStr = r.pct > 0 ? `+${r.pct.toFixed(1)}%` : `${r.pct.toFixed(1)}%`;
            const trendScore = r.trend_score ? r.trend_score.toFixed(1) : '-';
            const maxTrend = 1200;
            const barPct = Math.min(100, (r.trend_score / maxTrend) * 100);
            return `<tr>
                <td class="wr-rank ${rankClass}">${rank}</td>
                <td>
                    <a class="wr-repo" href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">${escapeHtml(r.name)}</a>
                    ${r.description ? `<div class="wr-repo-desc">${escapeHtml(r.description.slice(0, 100))}${r.description.length > 100 ? '…' : ''}</div>` : ''}
                </td>
                <td class="wr-stars">${r.stars.toLocaleString()}</td>
                <td class="wr-delta ${deltaClass}">${r.delta > 0 ? '+' : ''}${r.delta.toLocaleString()}</td>
                <td class="wr-pct">${pctStr}</td>
                <td class="hide-mobile"><span class="wr-category">${escapeHtml(r.category)}</span></td>
                <td class="hide-mobile"><div class="wr-trend-bar"><div class="wr-trend-fill" style="width:${barPct}%"></div></div> ${trendScore}</td>
            </tr>`;
        }).join('')}</tbody></table>`;

    wrap.innerHTML = thead;

    // Bind sort
    wrap.querySelectorAll('th[data-col]').forEach(th => {
        th.addEventListener('click', () => {
            const col = th.dataset.col;
            if (col === 'rank') return;
            if (state.sortCol === col) {
                state.sortDir = state.sortDir === 'asc' ? 'desc' : 'asc';
            } else {
                state.sortCol = col;
                state.sortDir = 'desc';
            }
            applyFilters();
            renderTable();
            renderDetailCards();
        });
    });
}

function renderDetailCards() {
    const section = document.getElementById('wr-detail-section');
    const grid = document.getElementById('wr-detail-grid');
    const count = document.getElementById('wr-detail-count');
    const rows = state.filtered.filter(r => r.delta > 0).slice(0, 20);

    if (!rows.length) {
        section.hidden = true;
        return;
    }

    section.hidden = false;
    count.textContent = `Top gainers • showing ${rows.length}`;

    grid.innerHTML = rows.map((r, i) => {
        const pctStr = r.pct > 0 ? `+${r.pct.toFixed(1)}%` : `${r.pct.toFixed(1)}%`;
        const langBadge = r.language ? `<span>🔹 ${escapeHtml(r.language)}</span>` : '';
        return `<div class="wr-detail-card">
            <div class="wr-detail-head">
                <div>
                    <a class="wr-detail-name" href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">#${i + 1} ${escapeHtml(r.name)}</a>
                    <div style="margin-top:2px;font-size:0.78rem;color:var(--text-muted)">${escapeHtml(r.category)}</div>
                </div>
                <div style="text-align:right">
                    <div class="wr-delta pos" style="font-size:1.05rem">+${r.delta.toLocaleString()}</div>
                    <div class="wr-pct">${pctStr}</div>
                </div>
            </div>
            ${r.description ? `<div class="wr-detail-desc">${escapeHtml(r.description)}</div>` : ''}
            <div class="wr-detail-meta">
                <span>⭐ ${r.stars.toLocaleString()}</span>
                ${langBadge}
                ${r.trend_score ? `<span>📊 Trend ${r.trend_score.toFixed(1)}</span>` : ''}
            </div>
        </div>`;
    }).join('');
}

function renderCategorySummary() {
    const el = document.getElementById('wr-summary');
    const rows = state.filtered.filter(r => r.delta > 0);
    const cats = {};
    rows.forEach(r => {
        cats[r.category] = (cats[r.category] || 0) + 1;
    });
    const sorted = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    el.innerHTML = sorted.map(([cat, count]) =>
        `<div class="wr-stat"><div class="wr-stat-val">${count}</div><div class="wr-stat-lbl">${escapeHtml(cat)}</div></div>`
    ).join('');
}

function render() {
    renderStats();
    renderInfo();
    renderTable();
    renderDetailCards();
    renderCategorySummary();
}

// ---- AI Ask Modal (adapted for weekly) ----
function getAiAskRepos() {
    const limitRaw = Number(document.getElementById('wr-ai-count')?.value ?? 25);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : state.filtered.length;
    return state.filtered.slice(0, limit);
}

function buildAiRepoList(repos, includeDesc) {
    return repos.map((r, i) => {
        const stars = `${r.stars.toLocaleString()}★`;
        const delta = r.delta > 0 ? `+${r.delta.toLocaleString()}` : r.delta.toLocaleString();
        const url = `https://github.com/${r.name}`;
        const growth = `(Δ ${delta} stars, ${r.delta > 0 ? '+' : ''}${r.pct.toFixed(1)}%)`;
        if (!includeDesc) {
            return `${i + 1}. ${r.name} ${growth} — ${url}`;
        }
        const desc = String(r.description || '').replace(/\s+/g, ' ').trim();
        const shortDesc = desc.length > 140 ? `${desc.slice(0, 139)}…` : desc;
        return `${i + 1}. ${r.name} ${growth} — ${url}${shortDesc ? ` — ${shortDesc}` : ''}`;
    }).join('\n');
}

function buildAiAskPrompt() {
    const includeDesc = document.getElementById('wr-ai-include-desc')?.checked ?? true;
    const repos = getAiAskRepos();
    const list = buildAiRepoList(repos, includeDesc);
    const periodLabel = state.period === 1 ? '1 day' : state.period === 30 ? '30 days' : '7 days';
    const filters = state.category !== 'all' ? ` • Category: ${state.category}` : '';
    const question = `I have the top GitHub repositories ranked by star growth over the last ${periodLabel}. Give me a concise overview of what each one does, group them by purpose, highlight the strongest options, and recommend which to try first for building an AI app. Focus on repos with significant growth momentum.`;
    return `${question}\n\nFilter: ${periodLabel} ranking${filters}\nRepositories (${repos.length}):\n${list}`;
}

function buildGoogleAiModeUrl(query) {
    return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}&udm=50`;
}

function renderAiAskPreview() {
    const prompt = buildAiAskPrompt();
    const repos = getAiAskRepos();
    const preview = document.getElementById('wr-ai-preview');
    const meter = document.getElementById('wr-ai-meter');
    const context = document.getElementById('wr-ai-context');
    const urlLength = buildGoogleAiModeUrl(prompt).length;

    if (preview) preview.value = prompt;
    if (meter) meter.textContent = `${repos.length} repos • ${prompt.length.toLocaleString()} chars • URL ~${urlLength.toLocaleString()}`;
    if (context) {
        context.textContent = state.filtered.length === repos.length
            ? `Asking about all ${repos.length} filtered repo${repos.length === 1 ? '' : 's'}.`
            : `Asking about the top ${repos.length} of ${state.filtered.length} filtered repos.`;
    }
}

function openAiAskModal() {
    if (state.filtered.length === 0) return;
    renderAiAskPreview();
    document.getElementById('wr-ai-backdrop').hidden = false;
    const modal = document.getElementById('wr-ai-modal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
}

function closeAiAskModal() {
    document.getElementById('wr-ai-backdrop').hidden = true;
    const modal = document.getElementById('wr-ai-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
}

async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch { /* fallback */ }
}

async function launchAiAsk() {
    const prompt = buildAiAskPrompt();
    try { await copyText(prompt); } catch {}
    window.open(buildGoogleAiModeUrl(prompt), '_blank', 'noopener');
    const span = document.querySelector('#wr-ai-open span');
    if (span) span.textContent = 'Opened ✓ (prompt copied)';
    setTimeout(() => { if (span) span.textContent = 'Open in Google AI Mode'; }, 1800);
}

// ---- Init ----
function escapeHtml(s) {
    if (!s) return '';
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function populateCategoryFilter() {
    const cats = new Set();
    state.rows.forEach(r => { if (r.category) cats.add(r.category); });
    const sel = document.getElementById('wr-category-filter');
    const sorted = Array.from(cats).sort();
    sel.innerHTML = '<option value="all">All categories</option>' +
        sorted.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
}

async function init() {
    try {
        const [histResp, reposResp] = await Promise.all([
            fetch(STARS_DATA_URL),
            fetch(REPOS_DATA_URL),
        ]);
        const history = await histResp.json();
        const reposData = await reposResp.json();

        state.history = history;
        const dates = Object.keys(history).sort();
        state.weekDates = dates;

        // Build repo map
        const repoMap = new Map();
        reposData.starred_repos.forEach(r => {
            const key = repoName(r);
            if (key) repoMap.set(key, r);
        });
        state.reposMap = repoMap;

        computeRows();
        applyFilters();
        populateCategoryFilter();
        render();
        bind();
    } catch (err) {
        document.getElementById('wr-table-wrap').innerHTML =
            `<div class="wr-empty">Failed to load data: ${escapeHtml(err.message)}</div>`;
    }
}

function bind() {
    // Search
    document.getElementById('wr-search').addEventListener('input', (e) => {
        state.search = e.target.value;
        applyFilters();
        render();
    });

    // Category filter
    document.getElementById('wr-category-filter').addEventListener('change', (e) => {
        state.category = e.target.value;
        applyFilters();
        render();
    });

    // Period buttons
    document.querySelectorAll('[data-period]').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('[data-period]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.period = Number(btn.dataset.period);
            computeRows();
            applyFilters();
            render();
        });
    });

    // Ask AI
    document.getElementById('wr-ask-ai').addEventListener('click', openAiAskModal);
    document.getElementById('wr-ai-close').addEventListener('click', closeAiAskModal);
    document.getElementById('wr-ai-backdrop').addEventListener('click', closeAiAskModal);
    document.getElementById('wr-ai-open').addEventListener('click', launchAiAsk);
    document.getElementById('wr-ai-copy').addEventListener('click', async () => {
        const prompt = buildAiAskPrompt();
        try {
            await copyText(prompt);
            const btn = document.getElementById('wr-ai-copy');
            btn.textContent = 'Copied!';
            setTimeout(() => { btn.textContent = 'Copy prompt'; }, 1200);
        } catch {}
    });
    document.getElementById('wr-ai-count').addEventListener('change', renderAiAskPreview);
    document.getElementById('wr-ai-include-desc').addEventListener('change', renderAiAskPreview);

    // Keyboard: Escape closes modal
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            const modal = document.getElementById('wr-ai-modal');
            if (modal.classList.contains('open')) closeAiAskModal();
        }
    });
}

document.addEventListener('DOMContentLoaded', init);
