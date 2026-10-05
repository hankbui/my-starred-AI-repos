'use strict';

const RADAR_DATA_URL = 'data/ai-employees.json?v=' + Date.now();

const IMPACT_COLORS = {
    CRITICAL: { cls: 'ae-score-critical', label: '🔥 CRITICAL' },
    HIGH: { cls: 'ae-score-high', label: '⚡ HIGH' },
    MEDIUM: { cls: 'ae-score-medium', label: '📈 MEDIUM' },
    LOW: { cls: 'ae-score-low', label: '◦ LOW' },
};
const ACTION_LABELS = {
    ADOPT: { cls: 'ae-badge-action-adopt', label: '✅ ADOPT' },
    FORK: { cls: 'ae-badge-action-fork', label: '🍴 FORK' },
    TEST: { cls: '', label: '🧪 TEST' },
    WATCH: { cls: '', label: '👀 WATCH' },
    IGNORE: { cls: '', label: '⊘ IGNORE' },
};

let data = null;
let activeView = 'developments';
let activeImpact = 'all';
let searchQuery = '';
let filteredItems = [];

function esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function fmt(n) {
    n = Number(n || 0);
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toLocaleString();
}

function scoreHtml(score, impact) {
    const c = IMPACT_COLORS[impact] || IMPACT_COLORS.LOW;
    return `<span class="ae-score ${c.cls}" title="${c.label}">${score}</span>`;
}

function badgeHtml(type, label, cls) {
    return `<span class="ae-badge ae-badge-${type} ${cls || ''}">${label}</span>`;
}

function growthHtml(delta7d, delta1d) {
    const parts = [];
    if (delta7d) parts.push(`<span class="up">+${fmt(delta7d)}★ /7d</span>`);
    if (delta1d) parts.push(`+${fmt(delta1d)}★ /1d`);
    return parts.length ? `<div class="ae-item-growth">${parts.join(' · ')}</div>` : '';
}

function repoItemHtml(item) {
    const acl = ACTION_LABELS[item.action] || ACTION_LABELS.WATCH;
    const badges = [
        badgeHtml('impact', item.impact),
        badgeHtml('maturity', item.maturity),
        `<span class="ae-badge ae-badge-action ${acl.cls}">${acl.label}</span>`,
        `<span class="ae-badge ae-badge-maturity">${esc(item.ai_employee_role)}</span>`,
    ];
    return `<div class="ae-item">
        <div class="ae-item-top">
            <div style="display:flex;align-items:center;gap:8px;min-width:0">
                ${scoreHtml(item.score, item.impact)}
                <a class="ae-item-name" href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.name)}</a>
            </div>
            <span class="ae-item-stars">⭐ ${fmt(item.stars)}</span>
        </div>
        <div class="ae-item-badges">${badges.join(' ')}</div>
        ${item.description ? `<div class="ae-item-desc">${esc(item.description)}</div>` : ''}
        ${item.reason ? `<div class="ae-item-reason">${esc(item.reason)}</div>` : ''}
        ${growthHtml(item.star_delta_7d, item.star_delta_1d)}
        ${item.technical_highlight ? `<div class="ae-item-tech">${esc(item.technical_highlight)}</div>` : ''}
    </div>`;
}

// ── Filtering ──────────────────────────────────────────────────────────────

function filterItems() {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.top_developments.filter(item => {
        if (activeImpact !== 'all' && item.impact !== activeImpact.toUpperCase()) return false;
        if (q) {
            const hay = [item.name, item.description, item.ai_employee_role, item.reason, item.business_use].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

// ── View renderers ─────────────────────────────────────────────────────────

function renderDevelopments(items) {
    if (!items.length) return '<div class="ae-empty">No developments match this filter.</div>';
    return `<div class="ae-section">
        <div class="ae-section-header">
            <h2>🚨 Top Developments</h2>
            <span>${items.length} discoveries</span>
        </div>
        <div class="ae-list">${items.map(repoItemHtml).join('')}</div>
    </div>`;
}

function renderRoles() {
    if (!data) return '';
    const roles = data.employee_roles || {};
    const entries = Object.values(roles);
    if (!entries.length) return '<div class="ae-empty">No AI employee roles data.</div>';
    return `<div class="ae-section">
        <div class="ae-section-header">
            <h2>👤 AI Employee Roles</h2>
            <span>${entries.length} roles</span>
        </div>
        <div class="ae-section-desc">Every automation repo mapped to the AI employee role it best enables. Click a role to see its top repos.</div>
        <div class="ae-card-grid">${entries.map(r => {
            const top = (r.top || []).map(t =>
                `<div style="font-size:0.78rem;color:var(--text-secondary);padding:2px 0">${t.ai_employee_icon} <a href="${esc(t.url)}" target="_blank" style="color:var(--text-primary);text-decoration:none">${esc(t.name)}</a> <span style="color:var(--text-muted)">⭐${fmt(t.stars)}</span></div>`
            ).join('');
            return `<div class="ae-role-card">
                <div class="ae-role-head">
                    <span class="ae-role-icon">${r.icon}</span>
                    <span class="ae-role-name">${esc(r.role)}</span>
                    <span class="ae-role-count">${r.count} repos</span>
                </div>
                <div class="ae-role-desc">${esc(r.description)}</div>
                <div class="ae-role-use">${r.business_use}</div>
                ${top ? `<div style="margin-top:4px;border-top:1px solid var(--border);padding-top:6px">${top}</div>` : ''}
            </div>`;
        }).join('')}</div>
    </div>`;
}

function renderBuild() {
    if (!data) return '';
    const builds = data.what_to_build || [];
    if (!builds.length) return '<div class="ae-empty">No build suggestions yet.</div>';
    return `<div class="ae-section">
        <div class="ae-section-header">
            <h2>🧠 What I Should Build</h2>
            <span>${builds.length} systems</span>
        </div>
        <div class="ae-section-desc">Concrete AI employee systems you can build from today's discoveries. Each includes architecture, tools, and an MVP plan.</div>
        <div class="ae-list">${builds.map(b => {
            const aiEmps = (b.ai_employees || []).map(e => `<span class="ae-build-tag">${esc(e)}</span>`).join('');
            const tools = (b.tools || []).map(t => `<span class="ae-build-tag">${esc(t)}</span>`).join('');
            const repos = (b.example_repos || []).map(r => `<a href="https://github.com/${esc(r)}" target="_blank" style="color:var(--accent);font-size:0.78rem">${esc(r)}</a>`).join(', ');
            const complexityCls = b.complexity === 'HIGH' ? 'hard' : b.complexity === 'LOW' ? 'easy' : '';
            return `<div class="ae-build-card">
                <div class="ae-build-name">${esc(b.name)}</div>
                <div class="ae-build-problem">${esc(b.business_problem)}</div>
                <div class="ae-build-meta">
                    ${aiEmps}
                    <span class="ae-build-tag ${complexityCls}">${b.complexity}</span>
                    <span class="ae-build-tag rev">${b.business_value}</span>
                </div>
                <div class="ae-build-arch"><b>Architecture:</b> ${esc(b.architecture)}</div>
                <div class="ae-build-meta">${tools}</div>
                ${repos ? `<div style="font-size:0.78rem;color:var(--text-muted)"><b>Key repos:</b> ${repos}</div>` : ''}
                <div class="ae-build-detail"><b>MVP:</b> ${esc(b.mvp)}</div>
            </div>`;
        }).join('')}</div>
    </div>`;
}

function renderBusiness() {
    if (!data) return '';
    const uses = data.business_use_sections || {};
    const entries = Object.entries(uses);
    if (!entries.length) return '<div class="ae-empty">No business use data.</div>';
    return `<div class="ae-section">
        <div class="ae-section-header">
            <h2>💼 By Business Use Case</h2>
            <span>${entries.length} areas</span>
        </div>
        <div class="ae-section-desc">Discoveries grouped by which business function they automate — sales, marketing, operations, engineering, and more.</div>
        <div class="ae-use-grid">${entries.map(([key, u]) => {
            const top = (u.top || []).map(t =>
                `<div style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:0.8rem">
                    ${scoreHtml(t.score, t.impact)}
                    <a href="${esc(t.url)}" target="_blank" style="color:var(--text-primary);text-decoration:none;font-weight:600">${esc(t.name)}</a>
                    <span style="color:var(--text-muted);margin-left:auto">⭐${fmt(t.stars)}</span>
                </div>`
            ).join('');
            return `<div class="ae-use-card">
                <div class="ae-use-head">
                    <span class="ae-use-icon">${u.icon}</span>
                    <span class="ae-use-label">${esc(u.label)}</span>
                    <span class="ae-use-count">${u.count} repos</span>
                </div>
                <div style="font-size:0.78rem;color:var(--text-muted)">${esc(u.desc)}</div>
                ${top ? `<div style="border-top:1px solid var(--border);padding-top:6px">${top}</div>` : ''}
            </div>`;
        }).join('')}</div>
    </div>`;
}

function renderChanges() {
    if (!data) return '';
    const wc = data.what_changed || {};
    const hasData = Object.values(wc).some(v => v.length > 0);
    if (!hasData) return '<div class="ae-empty">No change data yet.</div>';
    return `<div class="ae-section">
        <div class="ae-section-header">
            <h2>📊 What Changed Since Last Report</h2>
        </div>
        <div class="ae-section-desc">Tracking what's new, rising, updated, breakthrough, and stalled across the AI automation ecosystem.</div>
        <div class="ae-changed-grid">${Object.entries(wc).map(([key, items]) => {
            const labels = { new: '🆕 New', rising: '📈 Rising', updated: '🔄 Updated', breakthrough: '💥 Breakthrough', stalled: '⚠️ Stalled' };
            const clsMap = { new: 'new', rising: 'rising', updated: 'updated', breakthrough: 'breakthrough', stalled: 'stalled' };
            return `<div class="ae-changed-card">
                <div class="ae-changed-label ${clsMap[key] || ''}">${labels[key] || key}</div>
                <div class="ae-changed-count">${items.length}</div>
                <div class="ae-changed-items">${items.length ? items.slice(0, 6).map(n => esc(n)).join('<br>') : '—'}</div>
            </div>`;
        }).join('')}</div>
    </div>`;
}

function renderImportant() {
    if (!data) return '';
    const repos = data.important_repos || [];
    if (!repos.length) return '<div class="ae-empty">No important repos data.</div>';
    return `<div class="ae-section">
        <div class="ae-section-header">
            <h2>🏆 Most Important Repositories</h2>
            <span>${repos.length} repos</span>
        </div>
        <div class="ae-section-desc">Highest-scored repos ranked by business impact, technical significance, and autonomy potential.</div>
        <div style="display:grid;gap:8px">${repos.map((r, i) => {
            const acl = ACTION_LABELS[r.action] || ACTION_LABELS.WATCH;
            return `<div class="ae-imp-row">
                <span class="ae-imp-rank">#${i + 1}</span>
                ${scoreHtml(r.score, r.impact)}
                <a class="ae-imp-name" href="${esc(r.url)}" target="_blank" rel="noreferrer">${esc(r.name)}</a>
                <span class="ae-imp-stars">⭐ ${fmt(r.stars)}</span>
                <span class="ae-badge ae-badge-action ${acl.cls}" style="font-size:0.65rem">${acl.label}</span>
            </div>`;
        }).join('')}</div>
    </div>`;
}

function renderSectionButtons() {
    const items = filterItems();
    const counts = {};
    for (const item of data.top_developments) {
        const imp = item.impact;
        counts[imp] = (counts[imp] || 0) + 1;
    }
    document.querySelectorAll('.ae-filter-btn').forEach(btn => {
        const sec = btn.dataset.impact;
        if (sec === 'all') {
            btn.textContent = `📋 All (${data.top_developments.length})`;
        } else if (counts[sec.toUpperCase()]) {
            const icon = sec === 'critical' ? '🔥' : sec === 'high' ? '⚡' : '📈';
            btn.textContent = `${icon} ${sec.charAt(0).toUpperCase() + sec.slice(1)} (${counts[sec.toUpperCase()]})`;
        }
    });
}

function render() {
    const container = document.getElementById('ae-content');
    filteredItems = filterItems();
    document.getElementById('ae-count').textContent = `${filteredItems.length} items`;

    let content = '';
    switch (activeView) {
        case 'developments':
            content = renderDevelopments(filteredItems);
            document.getElementById('ae-bar').style.display = '';
            break;
        case 'roles':
            content = renderRoles();
            document.getElementById('ae-bar').style.display = 'none';
            break;
        case 'build':
            content = renderBuild();
            document.getElementById('ae-bar').style.display = 'none';
            break;
        case 'business':
            content = renderBusiness();
            document.getElementById('ae-bar').style.display = 'none';
            break;
        case 'changes':
            content = renderChanges();
            document.getElementById('ae-bar').style.display = 'none';
            break;
        case 'important':
            content = renderImportant();
            document.getElementById('ae-bar').style.display = 'none';
            break;
        default:
            content = renderDevelopments(filteredItems);
    }
    container.innerHTML = content;
    renderSectionButtons();
}

async function loadData() {
    try {
        const res = await fetch(RADAR_DATA_URL);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        data = await res.json();

        // Stats
        const s = data.stats;
        document.getElementById('ae-stats').innerHTML = `
            <div class="ae-stat"><div class="ae-stat-val">${s.total}</div><div class="ae-stat-lbl">Automation repos</div></div>
            <div class="ae-stat"><div class="ae-stat-val">${fmt(s.total_stars)}</div><div class="ae-stat-lbl">Combined stars</div></div>
            <div class="ae-stat"><div class="ae-stat-val" style="color:var(--success)">+${fmt(s.growth_7d)}</div><div class="ae-stat-lbl">Stars this week</div></div>
            <div class="ae-stat"><div class="ae-stat-val">${s.categories}</div><div class="ae-stat-lbl">AI employee roles</div></div>
            <div class="ae-stat"><div class="ae-stat-val" style="color:#ff8a5e">${s.critical_count}</div><div class="ae-stat-lbl">Critical impact</div></div>
            <div class="ae-stat"><div class="ae-stat-val" style="color:var(--accent)">${s.high_count}</div><div class="ae-stat-lbl">High impact</div></div>
        `;

        // Updated time
        const updated = document.getElementById('ae-updated');
        if (data.generated_at) {
            const d = new Date(data.generated_at);
            updated.textContent = 'Updated ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        render();
    } catch (e) {
        document.getElementById('ae-content').innerHTML = `<div class="ae-empty">Failed to load radar data: ${esc(e.message)}</div>`;
    }
}

function bind() {
    // Nav buttons
    document.querySelectorAll('.ae-nav-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ae-nav-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeView = btn.dataset.view;
            render();
        });
    });

    // Filter buttons
    document.querySelectorAll('.ae-filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.ae-filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeImpact = btn.dataset.impact;
            render();
        });
    });

    // Search
    const searchEl = document.getElementById('ae-search');
    if (searchEl) {
        let timer;
        searchEl.addEventListener('input', () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                searchQuery = searchEl.value;
                render();
            }, 200);
        });
    }

    // Ask AI
    const askBtn = document.getElementById('ae-ask-ai');
    if (askBtn && typeof initAskAI === 'function') {
        initAskAI({
            prefix: 'ae',
            title: 'Ask AI about these AI employee discoveries',
            defaultQuestion: 'Give me a strategic overview of these AI employee discoveries: ranked priorities, what to build first, and which repos to test this week.',
            getItems: () => filteredItems,
            context: () => {
                const bits = [`View: ${activeView}`];
                if (activeImpact !== 'all') bits.push(`Impact: ${activeImpact}`);
                if (searchQuery.trim()) bits.push(`Search: ${searchQuery.trim()}`);
                return bits.join(' • ');
            },
            contextDetail: (n) => `Asking about ${n} AI employee discoveries.`,
            itemFields: (it) => ({ name: it.name, url: it.url, stars: it.stars, score: it.score, impact: it.impact, role: it.ai_employee_role }),
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    bind();
    loadData();
});