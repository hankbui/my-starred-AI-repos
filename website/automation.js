'use strict';

const AUTO_DATA_URL = 'data/automation.json?v=' + Date.now();
const SECTION_LABELS = {
    'agent-framework': { label: 'Agent Frameworks', icon: '🧠', cls: 'st-agent-framework' },
    'multi-agent': { label: 'Multi-Agent Teams', icon: '👥', cls: 'st-multi-agent' },
    'ai-coding': { label: 'AI Coding Agents', icon: '💻', cls: 'st-ai-coding' },
    'solo-founder': { label: 'Solo Founder Stack', icon: '🚀', cls: 'st-solo-founder' },
    'browser-auto': { label: 'Browser & Web Automation', icon: '🌐', cls: 'st-browser-auto' },
    'research-agent': { label: 'Research Agents', icon: '🔬', cls: 'st-research-agent' },
    'workflow': { label: 'Workflow Orchestration', icon: '⚙️', cls: 'st-workflow' },
    'chinese': { label: 'Chinese Ecosystem', icon: '🇨🇳', cls: 'st-chinese' },
};

let data = null;
let activeSection = 'all';
let searchQuery = '';

function esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function fmt(n) {
    n = Number(n || 0);
    return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toLocaleString();
}

function sectionTag(primary) {
    const s = SECTION_LABELS[primary];
    if (!s) return '';
    return `<span class="auto-section-tag ${s.cls}">${s.icon} ${s.label}</span>`;
}

function growthHtml(item) {
    const parts = [];
    if (item.star_delta_7d) parts.push(`<span class="up">+${fmt(item.star_delta_7d)}★ /7d</span>`);
    if (item.star_delta_1d) parts.push(`<span>+${fmt(item.star_delta_1d)}★ /1d</span>`);
    if (item.trend_score) parts.push(`<span>score ${item.trend_score}</span>`);
    if (!parts.length) return '';
    return `<div class="auto-card-growth">${parts.join(' · ')}</div>`;
}

function filterItems() {
    if (!data) return [];
    const q = searchQuery.trim().toLowerCase();
    return data.items.filter(item => {
        if (activeSection !== 'all' && !item.classes.includes(activeSection)) return false;
        if (q) {
            const hay = [item.name, item.description, ...item.topics, item.language, item.category].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
}

function groupBySection(items) {
    const groups = {};
    for (const item of items) {
        const primary = item.primary || 'agent-framework';
        if (!groups[primary]) groups[primary] = [];
        groups[primary].push(item);
    }
    // Sort sections by count descending
    return Object.entries(groups).sort((a, b) => b[1].length - a[1].length);
}

function render() {
    const container = document.getElementById('auto-content');
    const filtered = filterItems();

    document.getElementById('auto-count').textContent = `${filtered.length} repos`;

    if (!filtered.length) {
        container.innerHTML = '<div class="auto-empty">No automation repos match this filter.</div>';
        return;
    }

    let html = '';
    if (activeSection === 'all') {
        const groups = groupBySection(filtered);
        for (const [section, items] of groups) {
            const s = SECTION_LABELS[section] || { label: section, icon: '📦' };
            html += `<div class="auto-section">
                <div class="auto-section-header">
                    <h2>${s.icon} ${esc(s.label)}</h2>
                    <span>${items.length}</span>
                </div>
                <div class="auto-grid">${items.map(cardHtml).join('')}</div>
            </div>`;
        }
    } else {
        const s = SECTION_LABELS[activeSection] || { label: activeSection, icon: '📦' };
        html += `<div class="auto-section">
            <div class="auto-section-header">
                <h2>${s.icon} ${esc(s.label)}</h2>
                <span>${filtered.length}</span>
            </div>
            <div class="auto-grid">${filtered.map(cardHtml).join('')}</div>
        </div>`;
    }

    container.innerHTML = html;

    // Show section filter buttons
    renderSectionButtons();
}

function cardHtml(item) {
    const curated = item._curated ? '<span class="auto-card-tag curated">+ curated</span>' : '';
    return `<div class="auto-card">
        <div class="auto-card-head">
            <a class="auto-card-name" href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.name)}</a>
            <span class="auto-card-stars">⭐ ${fmt(item.stars)}</span>
        </div>
        <div class="auto-card-tags">
            ${sectionTag(item.primary)}
            ${item.language ? `<span class="auto-card-lang">${esc(item.language)}</span>` : ''}
            ${curated}
        </div>
        ${item.description ? `<div class="auto-card-desc">${esc(item.description)}</div>` : ''}
        ${growthHtml(item)}
        ${item.topics?.length ? `<div class="auto-card-tags">${item.topics.slice(0, 5).map(t => `<span class="auto-card-tag">${esc(t)}</span>`).join('')}</div>` : ''}
    </div>`;
}

function renderSectionButtons() {
    const bar = document.getElementById('auto-bar');
    // Only update the section chips (not the search input or count)
    const existingChips = bar.querySelectorAll('.auto-section-btn');
    const countEl = document.getElementById('auto-count');

    if (!data) return;

    // Build section counts
    const counts = {};
    for (const item of data.items) {
        for (const c of item.classes) {
            counts[c] = (counts[c] || 0) + 1;
        }
    }

    // Update section chip labels with counts
    existingChips.forEach(chip => {
        const sec = chip.dataset.section;
        if (sec === 'all') {
            chip.textContent = `📋 All (${data.items.length})`;
        } else if (counts[sec]) {
            const s = SECTION_LABELS[sec];
            chip.textContent = `${s ? s.icon + ' ' : ''}${sec.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')} (${counts[sec]})`;
        }
    });
}

async function loadAutomationData() {
    try {
        const res = await fetch(AUTO_DATA_URL);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        data = await res.json();

        // Stats bar
        const statsEl = document.getElementById('auto-stats');
        const s = data.stats;
        statsEl.innerHTML = `
            <div class="auto-stat"><div class="auto-stat-val">${s.total_repos}</div><div class="auto-stat-lbl">Automation repos</div></div>
            <div class="auto-stat"><div class="auto-stat-val">${fmt(s.total_stars)}</div><div class="auto-stat-lbl">Combined stars</div></div>
            <div class="auto-stat"><div class="auto-stat-val" style="color:var(--success)">+${fmt(s.total_stars_7d)}</div><div class="auto-stat-lbl">Stars this week</div></div>
            <div class="auto-stat"><div class="auto-stat-val">${Object.keys(s.by_section).length}</div><div class="auto-stat-lbl">Categories</div></div>
        `;

        // Update time
        const updated = document.getElementById('auto-updated');
        if (data.generated_at) {
            const d = new Date(data.generated_at);
            updated.textContent = 'Updated ' + d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
        }

        // Build section filter buttons — save existing search+count first
        const bar = document.getElementById('auto-bar');
        const searchEl = document.getElementById('auto-search');
        const countEl = document.getElementById('auto-count');
        const existingAll = bar.querySelector('.auto-section-btn[data-section="all"]');
        bar.innerHTML = '';
        bar.appendChild(existingAll || createChip('all', '📋 All'));
        for (const [sec, info] of Object.entries(SECTION_LABELS)) {
            if (s.by_section[sec]) {
                const btn = createChip(sec, `${info.icon} ${info.label}`, sec === activeSection);
                bar.appendChild(btn);
            }
        }
        // Re-append search + count
        if (searchEl) bar.appendChild(searchEl);
        bar.appendChild(document.createTextNode(' '));
        const flex = document.createElement('span');
        flex.style.cssText = 'flex:1';
        bar.appendChild(flex);
        if (countEl) bar.appendChild(countEl);

        // Re-bind section buttons
        bar.querySelectorAll('.auto-section-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.auto-section-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                activeSection = btn.dataset.section;
                render();
            });
        });

        render();
    } catch (e) {
        document.getElementById('auto-content').innerHTML = `<div class="auto-empty">Failed to load automation data: ${esc(e.message)}</div>`;
    }
}

function createChip(section, label, active) {
    const btn = document.createElement('button');
    btn.className = 'auto-section-btn' + (active ? ' active' : '');
    btn.dataset.section = section;
    btn.type = 'button';
    btn.textContent = label;
    return btn;
}

function bind() {
    const searchEl = document.getElementById('auto-search');
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
}

document.addEventListener('DOMContentLoaded', () => {
    bind();
    loadAutomationData();
});
