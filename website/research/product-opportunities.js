'use strict';

const state = {
    meta: {},
    opportunities: [],
    filtered: [],
    search: '',
    valueFilter: 'all',
    sortBy: 'business_value',
};

const DATA_URL = 'json/index.json?v=' + Date.now();

const ADV_LABELS = {
    high: { label: 'High advantage', cls: 'rd-adv-high' },
    medium: { label: 'Medium advantage', cls: 'rd-adv-medium' },
    low: { label: 'Low advantage', cls: 'rd-adv-low' },
};

const DIFFICULTY_LABELS = {
    1: 'Trivial',
    2: 'Easy',
    3: 'Moderate',
    4: 'Hard',
    5: 'Very hard',
};

function esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function difficultyClass(d) {
    const n = parseInt(d, 10);
    if (n <= 1) return 'rd-opp-difficulty-1';
    if (n <= 2) return 'rd-opp-difficulty-2';
    if (n <= 3) return 'rd-opp-difficulty-3';
    if (n <= 4) return 'rd-opp-difficulty-4';
    return 'rd-opp-difficulty-5';
}

function applyFilters() {
    const q = state.search.trim().toLowerCase();
    state.filtered = state.opportunities.filter((o) => {
        if (q && !o.idea.toLowerCase().includes(q) && !o.technology.toLowerCase().includes(q)) return false;
        if (state.valueFilter !== 'all' && (o.business_value || 0) !== parseInt(state.valueFilter, 10)) return false;
        return true;
    });
    sortOpps();
    render();
}

function sortOpps() {
    const s = state.sortBy;
    state.filtered.sort((a, b) => {
        if (s === 'idea') return a.idea.localeCompare(b.idea);
        if (s === 'difficulty') return (a.engineering_difficulty || 5) - (b.engineering_difficulty || 5);
        return (b.business_value || 0) - (a.business_value || 0);
    });
}

function render() {
    const grid = document.getElementById('rd-opp-grid');
    const count = document.getElementById('rd-count');
    const items = state.filtered;

    count.textContent = items.length === state.opportunities.length && items.length > 0
        ? `${items.length} opportunities`
        : `${items.length} of ${state.opportunities.length} opportunities`;

    if (!items.length) {
        if (!state.opportunities.length) {
            grid.innerHTML = `
                <div class="rd-opp-empty">
                    <svg class="rd-opp-empty-icon" viewBox="0 0 24 24"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="6"/><path d="M12 9v3l2 1.5"/></svg>
                    <h3>No product opportunities yet</h3>
                    <p>The pipeline is analyzing papers to generate product ideas. Once the next scan completes,<br>concrete app concepts, SaaS ideas, and feature suggestions will appear here.</p>
                    <span style="font-size:0.82rem;color:var(--text-muted)">Last scan: ${esc(state.meta.last_update || '-')} &middot; ${state.meta.papers_tracked || 0} papers tracked</span>
                </div>`;
        } else {
            grid.innerHTML = '<div class="rd-empty">No opportunities match your filters.</div>';
        }
        return;
    }

    grid.innerHTML = '<div class="rd-opp-grid">' + items.map((o) => {
        const adv = ADV_LABELS[o.competitive_advantage] || ADV_LABELS.medium;
        const diff = parseInt(o.engineering_difficulty, 10) || 3;
        const diffLabel = DIFFICULTY_LABELS[diff] || 'Moderate';
        const devTime = o.development_time || '2-4 weeks';

        return `
            <div class="rd-opp-card">
                <div class="rd-opp-tech">${esc(o.technology)}</div>
                <div class="rd-opp-idea">${esc(o.idea)}</div>
                <div class="rd-opp-metrics">
                    <div class="rd-opp-metric">
                        <span class="rd-opp-metric-label">Business Value</span>
                        <span class="rd-opp-metric-value">${'★'.repeat(Math.min(o.business_value || 0, 5))}${'☆'.repeat(Math.max(5 - (o.business_value || 0), 0))}</span>
                    </div>
                    <div class="rd-opp-metric">
                        <span class="rd-opp-metric-label">Difficulty</span>
                        <span class="rd-opp-metric-value rd-opp-difficulty ${difficultyClass(diff)}">${diff}/5 ${diffLabel}</span>
                    </div>
                    <div class="rd-opp-metric">
                        <span class="rd-opp-metric-label">Advantage</span>
                        <span class="rd-adv-badge ${adv.cls}">${adv.label}</span>
                    </div>
                    <div class="rd-opp-metric">
                        <span class="rd-opp-metric-label">Est. Time</span>
                        <span class="rd-opp-metric-value">${esc(devTime)}</span>
                    </div>
                </div>
            </div>`;
    }).join('') + '</div>';
}

function renderStats() {
    document.getElementById('rd-stat-opps').textContent = state.opportunities.length.toLocaleString();
    document.getElementById('rd-stat-updated').textContent = state.meta.last_update || '-';
    const techs = new Set(state.opportunities.map((o) => o.technology));
    document.getElementById('rd-stat-tech').textContent = techs.size.toLocaleString();
}

async function loadData() {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    state.meta = d.meta || {};
    state.opportunities = d.product_opportunities || [];

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
    document.getElementById('rd-filter-value').addEventListener('change', (e) => {
        state.valueFilter = e.target.value; applyFilters();
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
    const opps = count > 0 ? state.opportunities.slice(0, count) : state.opportunities;

    let text = `Product Opportunities — ${state.meta.date || 'latest'}\n\n`;
    if (!opps.length) {
        text += '(No product opportunities generated yet.)\n\n';
    } else {
        opps.forEach((o, i) => {
            text += `\n${i + 1}. [${o.technology}] ${o.idea}`;
            text += `\n   Business value: ${o.business_value}/5 | Difficulty: ${o.engineering_difficulty}/5 | Advantage: ${o.competitive_advantage}`;
            text += `\n   Est. time: ${o.development_time || '2-4 weeks'}`;
            text += '\n';
        });
    }

    const question = document.getElementById('rd-ai-question').value.trim();
    if (question) text += `\nMy question: ${question}`;
    return text;
};

window.buildContextText = function () {
    const opps = state.opportunities.length;
    return `Based on ${opps} product opportunities from ${state.meta.date || 'latest scan'}.`;
};

async function init() {
    bindControls();
    bindBackToTop();
    bindAskAi();
    try {
        await loadData();
    } catch (e) {
        document.getElementById('rd-opp-grid').innerHTML =
            `<div class="rd-empty">Research data not available: ${esc(e.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);