'use strict';

const state = {
    meta: {},
    technologies: [],
};

const DATA_URL = 'json/index.json?v=' + Date.now();

function esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

const QUADRANTS = [
    {
        id: 'adopt',
        title: 'Adopt',
        desc: 'Production-ready technologies you should start using now. High maturity and confidence.',
        cls: 'rd-q-adopt',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
        match: (t) => t.maturity === 'high' || (t.confidence || 0) >= 0.8,
    },
    {
        id: 'trial',
        title: 'Trial',
        desc: 'Promising technologies worth piloting in low-risk projects. Medium maturity with positive signals.',
        cls: 'rd-q-trial',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>',
        match: (t) => t.maturity === 'medium' || ((t.confidence || 0) >= 0.5 && (t.trend === 'rising' || t.trend === 'breakout')),
    },
    {
        id: 'assess',
        title: 'Assess',
        desc: 'Technologies worth watching and prototyping. Early signals but not yet production-ready.',
        cls: 'rd-q-assess',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>',
        match: (t) => t.trend === 'emerging' || t.trend === 'rising',
    },
    {
        id: 'hold',
        title: 'Hold',
        desc: 'Technologies at peak, declining, or too immature. Revisit in 3–6 months.',
        cls: 'rd-q-hold',
        icon: '<svg width="22" height="22" viewBox="0 0 24 24" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>',
        match: () => true,
    },
];

function classify(techs) {
    const assigned = new Set();
    const buckets = { adopt: [], trial: [], assess: [], hold: [] };

    for (const q of QUADRANTS) {
        for (const t of techs) {
            if (assigned.has(t.name)) continue;
            if (q.match(t)) {
                buckets[q.id].push(t);
                assigned.add(t.name);
            }
        }
    }
    return buckets;
}

function render() {
    const layout = document.getElementById('rd-radar-layout');
    const count = document.getElementById('rd-count');
    const buckets = classify(state.technologies);
    const total = state.technologies.length;

    count.textContent = `${total} technologies mapped`;

    layout.innerHTML = QUADRANTS.map((q) => {
        const items = buckets[q.id];
        return `
            <div class="rd-radar-quadrant ${q.cls}">
                <div class="rd-radar-qhead">
                    ${q.icon}
                    <span class="rd-radar-qtitle">${q.title}</span>
                    <span class="rd-radar-qcount">${items.length} ${items.length === 1 ? 'item' : 'items'}</span>
                </div>
                <div class="rd-radar-qdesc">${q.desc}</div>
                ${items.length ? items.map((t) => `
                    <div class="rd-radar-item">
                        <span class="rd-radar-item-name">${esc(t.name)}</span>
                        <div class="rd-radar-item-meta">
                            <span class="rd-radar-item-stat">${Math.round((t.confidence || 0) * 100)}%</span>
                            <span class="rd-radar-item-stat">&middot;</span>
                            <span class="rd-radar-item-stat">${t.papers || 1}p</span>
                        </div>
                    </div>
                `).join('') : '<div style="font-size:0.82rem;color:var(--text-muted);padding:8px 0;">No items in this category</div>'}
            </div>`;
    }).join('');
}

function renderStats(buckets) {
    document.getElementById('rd-stat-adopt').textContent = buckets.adopt.length;
    document.getElementById('rd-stat-trial').textContent = buckets.trial.length;
    document.getElementById('rd-stat-assess').textContent = buckets.assess.length;
    document.getElementById('rd-stat-hold').textContent = buckets.hold.length;
}

async function loadData() {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    state.meta = d.meta || {};
    state.technologies = d.technologies || [];

    document.getElementById('rd-eyebrow').textContent = 'AI Technology Radar · ' + (state.meta.date || '');

    const buckets = classify(state.technologies);
    renderStats(buckets);
    render();
}

function bindBackToTop() {
    const btn = document.getElementById('rd-back-to-top');
    window.addEventListener('scroll', () => { btn.hidden = window.scrollY < 300; }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

window.buildPrompt = function () {
    const count = parseInt(document.getElementById('rd-ai-count').value, 10);
    const buckets = classify(state.technologies);
    const all = [...buckets.adopt, ...buckets.trial, ...buckets.assess, ...buckets.hold];
    const items = count > 0 ? all.slice(0, count) : all;

    let text = `Technology Radar — ${state.meta.date || 'latest'}\n\n`;
    text += `Adopt (${buckets.adopt.length}) | Trial (${buckets.trial.length}) | Assess (${buckets.assess.length}) | Hold (${buckets.hold.length})\n\n`;

    for (const q of QUADRANTS) {
        const list = buckets[q.id];
        if (!list.length) continue;
        text += `${q.title}:\n`;
        list.slice(0, 10).forEach((t) => {
            text += `- ${t.name} (${Math.round((t.confidence || 0) * 100)}% confidence, ${t.papers || 1} papers)\n`;
        });
        text += '\n';
    }

    const question = document.getElementById('rd-ai-question').value.trim();
    if (question) text += `\nMy question: ${question}`;
    return text;
};

window.buildContextText = function () {
    const buckets = classify(state.technologies);
    return `${state.technologies.length} technologies mapped · Adopt: ${buckets.adopt.length} · Trial: ${buckets.trial.length} · Assess: ${buckets.assess.length} · Hold: ${buckets.hold.length} · ${state.meta.date || 'latest scan'}`;
};

async function init() {
    bindBackToTop();
    bindAskAi();
    try {
        await loadData();
    } catch (e) {
        document.getElementById('rd-radar-layout').innerHTML =
            `<div class="rd-empty">Research data not available: ${esc(e.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);