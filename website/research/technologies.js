'use strict';

const state = {
    meta: {},
    technologies: [],
    filtered: [],
    search: '',
    trendFilter: 'all',
    maturityFilter: 'all',
    sortBy: 'confidence',
};

const DATA_URL = 'json/index.json?v=' + Date.now();

const TREND_LABELS = {
    emerging: { label: 'Emerging', cls: 'rd-trend-emerging' },
    rising: { label: 'Rising', cls: 'rd-trend-rising' },
    breakout: { label: 'Breakout', cls: 'rd-trend-breakout' },
    peak: { label: 'Peak', cls: 'rd-trend-peak' },
};

const MATURITY_LABELS = {
    early: { label: 'Early', cls: 'rd-maturity-early' },
    medium: { label: 'Medium', cls: 'rd-maturity-medium' },
    high: { label: 'High', cls: 'rd-maturity-high' },
};

function esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function applyFilters() {
    const q = state.search.trim().toLowerCase();
    state.filtered = state.technologies.filter((t) => {
        if (q && !t.name.toLowerCase().includes(q) && !(t.applications || []).some((a) => a.toLowerCase().includes(q))) return false;
        if (state.trendFilter !== 'all' && t.trend !== state.trendFilter) return false;
        if (state.maturityFilter !== 'all' && t.maturity !== state.maturityFilter) return false;
        return true;
    });
    sortTechs();
    render();
}

function sortTechs() {
    const s = state.sortBy;
    state.filtered.sort((a, b) => {
        if (s === 'name') return a.name.localeCompare(b.name);
        if (s === 'papers') return (b.papers || 0) - (a.papers || 0);
        return (b.confidence || 0) - (a.confidence || 0);
    });
}

function computeInnovationScore(t) {
    const conf = t.confidence || 0;
    const papers = Math.min(t.papers || 1, 20);
    const maturityScore = t.maturity === 'high' ? 1.0 : t.maturity === 'medium' ? 0.7 : 0.4;
    const trendScore = t.trend === 'breakout' ? 1.0 : t.trend === 'rising' ? 0.8 : t.trend === 'emerging' ? 0.5 : 0.6;
    const raw = (conf * 0.35 + (papers / 20) * 0.25 + maturityScore * 0.2 + trendScore * 0.2) * 100;
    return Math.round(Math.min(raw, 100));
}

function innovationScoreColor(score) {
    if (score >= 80) return 'var(--success)';
    if (score >= 60) return 'var(--accent)';
    if (score >= 40) return 'var(--warning)';
    return 'var(--text-muted)';
}

function render() {
    const grid = document.getElementById('rd-tech-grid');
    const count = document.getElementById('rd-count');
    const items = state.filtered;

    count.textContent = items.length === state.technologies.length
        ? `${items.length} technologies`
        : `${items.length} of ${state.technologies.length} technologies`;

    if (!items.length) {
        grid.innerHTML = '<div class="rd-empty">No technologies match your filters.</div>';
        return;
    }

    grid.innerHTML = items.map((t) => {
        const trend = TREND_LABELS[t.trend] || TREND_LABELS.emerging;
        const maturity = MATURITY_LABELS[t.maturity] || MATURITY_LABELS.early;
        const apps = (t.applications || []).map((a) => `<span class="rd-tech-app">${esc(a)}</span>`).join('');
        const innovScore = computeInnovationScore(t);
        const innovColor = innovationScoreColor(innovScore);

        return `
            <div class="rd-tech-card">
                <div class="rd-tech-meta">
                    <span class="rd-trend-badge ${trend.cls}">${trend.label}</span>
                    <span class="rd-maturity-badge ${maturity.cls}">${maturity.label}</span>
                    <span class="rd-innov-badge" style="margin-left:auto;padding:2px 8px;border-radius:999px;font-size:0.68rem;font-weight:700;border:1px solid ${innovColor};color:${innovColor};background:rgba(0,0,0,0.2)">${innovScore}</span>
                </div>
                <div class="rd-tech-name">${esc(t.name)}</div>
                <div class="rd-tech-meta">
                    <span class="rd-tech-stat">Confidence: ${Math.round((t.confidence || 0) * 100)}%</span>
                    <span class="rd-tech-stat">&middot;</span>
                    <span class="rd-tech-stat">${t.papers || 1} paper${(t.papers || 1) !== 1 ? 's' : ''}</span>
                    <span class="rd-tech-stat">&middot;</span>
                    <span class="rd-tech-stat" style="color:${innovColor};font-weight:700">Innovation ${innovScore}/100</span>
                </div>
                ${apps ? `<div class="rd-tech-apps">${apps}</div>` : ''}
            </div>`;
    }).join('');
}

function renderStats() {
    document.getElementById('rd-stat-total').textContent = state.technologies.length.toLocaleString();
    document.getElementById('rd-stat-updated').textContent = state.meta.last_update || '-';
    const emerging = state.technologies.filter((t) => t.trend === 'emerging').length;
    const rising = state.technologies.filter((t) => t.trend === 'rising' || t.trend === 'breakout').length;
    document.getElementById('rd-stat-emerging').textContent = emerging.toLocaleString();
    document.getElementById('rd-stat-rising').textContent = rising.toLocaleString();
}

async function loadData() {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    state.meta = d.meta || {};
    state.technologies = d.technologies || [];

    document.getElementById('rd-eyebrow').textContent = 'AI Technology Radar · ' + (state.meta.date || '');

    renderStats();
    applyFilters();
}

function bindControls() {
    let timer;
    document.getElementById('rd-search').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => { state.search = e.target.value; applyFilters(); }, 200);
    });
    document.getElementById('rd-filter-trend').addEventListener('change', (e) => {
        state.trendFilter = e.target.value; applyFilters();
    });
    document.getElementById('rd-filter-maturity').addEventListener('change', (e) => {
        state.maturityFilter = e.target.value; applyFilters();
    });
    document.getElementById('rd-sort').addEventListener('change', (e) => {
        state.sortBy = e.target.value; applyFilters();
    });
}

function bindBackToTop() {
    const btn = document.getElementById('rd-back-to-top');
    window.addEventListener('scroll', () => { btn.hidden = window.scrollY < 300; }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

window.buildPrompt = function () {
    const count = parseInt(document.getElementById('rd-ai-count').value, 10);
    const techs = count > 0 ? state.technologies.slice(0, count) : state.technologies;

    let text = `Technology Explorer — ${state.meta.date || 'latest'}\n\n`;
    text += `Technologies (${techs.length}):\n`;
    techs.forEach((t, i) => {
        text += `\n${i + 1}. ${t.name}`;
        text += `\n   Maturity: ${t.maturity} | Confidence: ${Math.round((t.confidence || 0) * 100)}% | Trend: ${t.trend}`;
        text += `\n   Papers: ${t.papers || 1}`;
        if ((t.applications || []).length) text += `\n   Applications: ${t.applications.slice(0, 5).join(', ')}`;
        text += '\n';
    });

    const question = document.getElementById('rd-ai-question').value.trim();
    if (question) text += `\nMy question: ${question}`;
    return text;
};

window.buildContextText = function () {
    return `Based on ${state.technologies.length} technologies from ${state.meta.date || 'latest scan'}.`;
};

async function init() {
    bindControls();
    bindBackToTop();
    bindAskAi();
    try {
        await loadData();
    } catch (e) {
        document.getElementById('rd-tech-grid').innerHTML =
            `<div class="rd-empty">Research data not available yet: ${esc(e.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);