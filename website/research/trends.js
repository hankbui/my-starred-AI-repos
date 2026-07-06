'use strict';

const state = {
    meta: {},
    technologies: [],
};

const DATA_URL = 'json/index.json?v=' + Date.now();

const TREND_ORDER = ['breakout', 'rising', 'emerging', 'peak'];
const TREND_LABELS = {
    breakout: { label: 'Breakout', cls: 'rd-bar-fill-breakout', icon: '🔥' },
    rising: { label: 'Rising', cls: 'rd-bar-fill-rising', icon: '📈' },
    emerging: { label: 'Emerging', cls: 'rd-bar-fill-emerging', icon: '🌱' },
    peak: { label: 'Peak', cls: 'rd-bar-fill-peak', icon: '⛰️' },
};

function esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function renderSummary(trendCounts) {
    const grid = document.getElementById('rd-summary');
    const total = state.technologies.length;
    const avgConf = state.technologies.length
        ? (state.technologies.reduce((s, t) => s + (t.confidence || 0), 0) / state.technologies.length * 100).toFixed(0)
        : 0;
    grid.innerHTML = `
        <div class="rd-summary-card">
            <div class="rd-summary-value" style="color:var(--text-primary)">${total}</div>
            <div class="rd-summary-label">Technologies</div>
        </div>
        <div class="rd-summary-card">
            <div class="rd-summary-value" style="color:var(--success)">${trendCounts.breakout || 0}</div>
            <div class="rd-summary-label">Breakout</div>
        </div>
        <div class="rd-summary-card">
            <div class="rd-summary-value" style="color:var(--accent)">${trendCounts.rising || 0}</div>
            <div class="rd-summary-label">Rising</div>
        </div>
        <div class="rd-summary-card">
            <div class="rd-summary-value" style="color:#7fc4ff">${trendCounts.emerging || 0}</div>
            <div class="rd-summary-label">Emerging</div>
        </div>
        <div class="rd-summary-card">
            <div class="rd-summary-value" style="color:#ff7878">${trendCounts.peak || 0}</div>
            <div class="rd-summary-label">Peak</div>
        </div>
        <div class="rd-summary-card">
            <div class="rd-summary-value" style="color:var(--warning)">${avgConf}%</div>
            <div class="rd-summary-label">Avg Confidence</div>
        </div>`;
}

function renderBarChart(trendCounts, maxVal) {
    const container = document.getElementById('rd-bar-chart');
    const max = maxVal || Math.max(...Object.values(trendCounts), 1);
    container.innerHTML = TREND_ORDER.map((key) => {
        const t = TREND_LABELS[key];
        const val = trendCounts[key] || 0;
        const pct = (val / max) * 100;
        return `
            <div class="rd-bar-row">
                <span class="rd-bar-label">${t.icon} ${t.label}</span>
                <div class="rd-bar-track">
                    <div class="rd-bar-fill ${t.cls}" style="width:${Math.max(pct, 2)}%">${val}</div>
                </div>
            </div>`;
    }).join('');
}

function renderConfidenceChart(trendAvgs, maxVal) {
    const container = document.getElementById('rd-bar-confidence');
    const max = maxVal || Math.max(...Object.values(trendAvgs).filter((v) => v > 0), 0.01);
    container.innerHTML = TREND_ORDER.map((key) => {
        const t = TREND_LABELS[key];
        const val = trendAvgs[key] || 0;
        const pct = (val / max) * 100;
        return `
            <div class="rd-bar-row">
                <span class="rd-bar-label">${t.icon} ${t.label}</span>
                <div class="rd-bar-track">
                    <div class="rd-bar-fill ${t.cls}" style="width:${Math.max(pct, 2)}%">${(val * 100).toFixed(0)}%</div>
                </div>
            </div>`;
    }).join('');
}

function renderTechClusters(trendCounts) {
    const container = document.getElementById('rd-trend-clusters');
    const byTrend = {};
    for (const t of state.technologies) {
        const key = t.trend || 'emerging';
        if (!byTrend[key]) byTrend[key] = [];
        byTrend[key].push(t);
    }

    container.innerHTML = TREND_ORDER.map((key) => {
        const t = TREND_LABELS[key];
        const items = byTrend[key] || [];
        if (!items.length) return '';
        const sorted = [...items].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        return `
            <div style="margin-bottom:18px">
                <h3 style="font-family:'Space Grotesk',sans-serif;font-size:0.95rem;color:var(--text-primary);margin:0 0 8px;display:flex;align-items:center;gap:6px">
                    <span>${t.icon}</span> ${t.label} <span style="font-size:0.78rem;color:var(--text-muted);font-weight:400">(${items.length})</span>
                </h3>
                <div class="rd-trend-tech-grid">
                    ${sorted.map((x) => `
                        <div class="rd-ttag">
                            <span class="rd-ttag-name">${esc(x.name)}</span>
                            <span class="rd-ttag-stat">${Math.round((x.confidence || 0) * 100)}% · ${x.papers || 1}p</span>
                        </div>
                    `).join('')}
                </div>
            </div>`;
    }).join('');
}

function render() {
    const trendCounts = { breakout: 0, rising: 0, emerging: 0, peak: 0 };
    const trendConf = { breakout: [], rising: [], emerging: [], peak: [] };

    for (const t of state.technologies) {
        const key = t.trend || 'emerging';
        trendCounts[key] = (trendCounts[key] || 0) + 1;
        trendConf[key].push(t.confidence || 0);
    }

    const trendAvgs = {};
    for (const key of Object.keys(trendConf)) {
        const vals = trendConf[key];
        trendAvgs[key] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    }

    const maxCount = Math.max(...Object.values(trendCounts), 1);
    const maxConf = Math.max(...Object.values(trendAvgs).filter((v) => v > 0), 0.01);

    renderSummary(trendCounts);
    renderBarChart(trendCounts, maxCount);
    renderConfidenceChart(trendAvgs, maxConf);

    document.getElementById('rd-count').textContent = `${state.technologies.length} technologies across ${TREND_ORDER.filter((k) => trendCounts[k]).length} trend categories`;

    renderTechClusters(trendCounts);
}

async function loadData() {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    state.meta = d.meta || {};
    state.technologies = d.technologies || [];

    document.getElementById('rd-eyebrow').textContent = 'AI Technology Radar · ' + (state.meta.date || '');
    render();
}

function bindBackToTop() {
    const btn = document.getElementById('rd-back-to-top');
    window.addEventListener('scroll', () => { btn.hidden = window.scrollY < 300; }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

async function init() {
    bindBackToTop();
    bindAskAi('Trend Analysis');
    try {
        await loadData();
    } catch (e) {
        document.getElementById('rd-trend-clusters').innerHTML =
            `<div class="rd-empty">Research data not available: ${esc(e.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);