'use strict';

const state = {
    repos: [],
    search: '', category: 'all', sort: 'stars_desc',
    page: 1, perPage: 50,
    filtered: [],
};

const DATA_URL = 'data/china-landscape.json?v=' + Date.now();

function escapeHtml(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function fmt(n) {
    n = Number(n || 0);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return n.toLocaleString();
}

function applyFilters() {
    const q = state.search.trim().toLowerCase();
    let rows = state.repos.slice();

    if (state.category !== 'all') {
        rows = rows.filter(r => r.china_category === state.category);
    }
    if (q) {
        const terms = q.split(',').map(t => t.trim()).filter(Boolean);
        rows = rows.filter(r => {
            const hay = [r.name, r.description, r.language, r.owner, r.china_category, (r.topics || []).join(' ')].join(' ').toLowerCase();
            return terms.every(t => hay.includes(t));
        });
    }
    rows.sort((a, b) => {
        switch (state.sort) {
            case 'stars_desc': return b.stars - a.stars;
            case 'forks_desc': return b.forks - a.forks;
            case 'name_asc': return a.name.localeCompare(b.name);
            default: return 0;
        }
    });

    state.filtered = rows;
    const totalPages = Math.max(1, Math.ceil(rows.length / state.perPage));
    if (state.page > totalPages) state.page = totalPages;
    render();
}

function render() {
    const tbody = document.getElementById('cl-tbody');
    const start = (state.page - 1) * state.perPage;
    const page = state.filtered.slice(start, start + state.perPage);

    if (!page.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="cl-empty">No matches. Try a broader search.</td></tr>`;
        renderPagination();
        document.getElementById('cl-meta').textContent = '0 repos';
        return;
    }

    tbody.innerHTML = page.map((r, i) => {
        const sourceBadge = r.source === 'gitee'
            ? '<span class="cl-source-badge cl-source-gitee">Gitee</span>'
            : '<span class="cl-source-badge cl-source-github">GitHub</span>';
        return `<tr>
            <td class="cl-num">${r.rank}</td>
            <td>
                <a class="cl-repo-name" href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">${escapeHtml(r.repo_name)}</a>
                <div class="cl-owner">${escapeHtml(r.owner)} ${sourceBadge}</div>
            </td>
            <td class="cl-right">${fmt(r.stars)}</td>
            <td class="cl-right cl-hide-sm">${fmt(r.forks)}</td>
            <td class="cl-hide-sm">${escapeHtml(r.language || '—')}</td>
            <td class="cl-hide-sm"><span class="cl-pill">${escapeHtml(r.china_category || r.category)}</span></td>
            <td class="cl-hide-sm"><div class="cl-desc">${escapeHtml(r.description || '')}</div></td>
        </tr>`;
    }).join('');

    renderPagination();
    document.getElementById('cl-meta').textContent = state.filtered.length.toLocaleString() + ' repos';
    renderCopyLabel();
}

function renderPagination() {
    const total = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
    document.getElementById('cl-page-info').textContent = state.page + ' / ' + total;
    document.getElementById('cl-prev').disabled = state.page <= 1;
    document.getElementById('cl-next').disabled = state.page >= total;
}

function populateControls() {
    const catSel = document.getElementById('cl-category');
    const cats = [...new Set(state.repos.map(r => r.china_category || r.category))].sort();
    catSel.innerHTML = `<option value="all">All categories (${state.repos.length})</option>` +
        cats.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)} (${state.repos.filter(r => (r.china_category || r.category) === c).length})</option>`).join('');
    catSel.value = state.category;

    document.getElementById('cl-search').value = state.search;
    document.getElementById('cl-sort').value = state.sort;
}

function buildRows() {
    const rows = state.filtered;
    return {
        header: ['rank', 'repo', 'url', 'stars', 'forks', 'language', 'category', 'source'],
        lines: rows.map(r => [r.rank, r.name, r.url, r.stars, r.forks, r.language, r.china_category || r.category, r.source || 'github']),
    };
}
function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }
function buildCsv() { const { header, lines } = buildRows(); return [header.join(','), ...lines.map(l => l.map(csvCell).join(','))].join('\n'); }
function buildMd() {
    const { header, lines } = buildRows();
    return ['# China AI Landscape (' + lines.length + ')', '', '| ' + header.join(' | ') + ' |', '| ' + header.map(() => '---').join(' | ') + ' |',
        ...lines.map(l => '| ' + l.map(c => String(c ?? '').replaceAll('|', '\\|')).join(' | ') + ' |')].join('\n');
}

async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } }
function download(name, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
function flash(id, label, restore) {
    const el = document.querySelector(`#${id} span`) || document.getElementById(id);
    if (!el) return;
    const target = el.tagName === 'SPAN' ? el : (el.querySelector('span') || el);
    const old = restore ?? target.textContent;
    target.textContent = label;
    setTimeout(() => { target.textContent = old; }, 1400);
}
function renderCopyLabel() {
    const el = document.querySelector('#cl-copy span');
    if (el) el.textContent = 'Copy filtered (' + state.filtered.length + ')';
}

function bind() {
    let timer;
    document.getElementById('cl-search').addEventListener('input', e => {
        clearTimeout(timer); timer = setTimeout(() => { state.search = e.target.value; state.page = 1; applyFilters(); }, 250);
    });
    document.getElementById('cl-category').addEventListener('change', e => { state.category = e.target.value; state.page = 1; applyFilters(); });
    document.getElementById('cl-sort').addEventListener('change', e => { state.sort = e.target.value; applyFilters(); });
    document.getElementById('cl-prev').addEventListener('click', () => { if (state.page > 1) { state.page--; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
    document.getElementById('cl-next').addEventListener('click', () => { const t = Math.ceil(state.filtered.length / state.perPage); if (state.page < t) { state.page++; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });

    document.getElementById('cl-copy').addEventListener('click', async () => {
        const ok = await copyText(buildMd());
        flash('cl-copy', ok ? 'Copied ✓' : 'Failed', 'Copy filtered (' + state.filtered.length + ')');
    });
    document.getElementById('cl-share').addEventListener('click', async () => {
        const ok = await copyText(window.location.href);
        flash('cl-share', ok ? 'Copied URL' : 'Failed', 'Share URL');
    });
    document.getElementById('cl-csv').addEventListener('click', () => { download('china-ai-landscape.csv', buildCsv()); flash('cl-csv', 'Done', 'CSV'); });
    document.getElementById('cl-md').addEventListener('click', () => { download('china-ai-landscape.md', buildMd()); flash('cl-md', 'Done', 'MD'); });
}

async function load() {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    state.repos = d.repos || [];

    const counts = d.counts || {};
    document.getElementById('stat-repos').textContent = fmt(state.repos.length);
    document.getElementById('stat-github').textContent = fmt(counts.github || state.repos.filter(r => r.source !== 'gitee').length);
    document.getElementById('stat-gitee').textContent = fmt(counts.gitee || state.repos.filter(r => r.source === 'gitee').length);
    document.getElementById('stat-updated').textContent = d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '-';

    populateControls();
    applyFilters();
}

document.addEventListener('DOMContentLoaded', () => {
    bind();
    load().catch(e => {
        document.getElementById('cl-tbody').innerHTML = `<tr><td colspan="7" class="cl-empty">Failed to load data: ${escapeHtml(e.message)}</td></tr>`;
    });
});
