'use strict';

const state = {
    meta: {},
    brief: [],
    papers: [],
    technologies: [],
    product_opportunities: [],
    filtered: [],
    search: '',
};

const DATA_URL = 'json/index.json?v=' + Date.now();
const CARD_COLORS = {
    accent: { badge: 'rd-badge-accent' },
    green: { badge: 'rd-badge-green' },
    amber: { badge: 'rd-badge-amber' },
    purple: { badge: 'rd-badge-purple' },
    success: { badge: 'rd-badge-green' },
    blue: { badge: 'rd-badge-blue' },
};

function esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

function applyFilters() {
    const q = state.search.trim().toLowerCase();
    state.filtered = state.papers.filter((p) => {
        if (!q) return true;
        const hay = [p.title, p.summary, ...(p.authors || []), ...(p.technologies || []), ...(p.categories || [])].join(' ').toLowerCase();
        return hay.includes(q);
    });
    renderPapers();
}

function renderCards() {
    const grid = document.getElementById('rd-cards-grid');
    if (!state.top_cards || !state.top_cards.length) {
        grid.innerHTML = '<div class="rd-empty">No dashboard data available.</div>';
        return;
    }
    grid.innerHTML = state.top_cards.map((c) => {
        const color = CARD_COLORS[c.color] || CARD_COLORS.accent;
        const badges = c.detail ? c.detail.split(',').slice(0, 4).map((t) => `<span class="rd-badge ${color.badge}">${esc(t.trim())}</span>`).join('') : '';
        return `
            <div class="rd-card">
                <div class="rd-card-head">
                    <span class="rd-card-label">${esc(c.title)}</span>
                </div>
                <div class="rd-card-value" style="color:var(--${c.color === 'green' ? 'success' : c.color === 'amber' ? 'warning' : c.color === 'purple' ? '--' : c.color === 'blue' ? 'accent-strong' : 'accent'})">${esc(c.value)}</div>
                <div class="rd-card-sub">${esc(c.label)}</div>
                <div class="rd-card-detail">${esc(c.detail)}</div>
                ${badges ? `<div class="rd-card-badges">${badges}</div>` : ''}
            </div>`;
    }).join('');
}

function renderPapers() {
    const list = document.getElementById('rd-papers-list');
    const items = state.filtered;
    if (!items.length) {
        list.innerHTML = '<div class="rd-empty">No papers match your search.</div>';
        return;
    }
    list.innerHTML = items.map((p) => {
        const authors = (p.authors || []).join(', ');
        const techs = (p.technologies || []).map((t) => `<span class="rd-badge rd-badge-maturity">${esc(t)}</span>`).join('');
        const hanverse = (p.hanverse_applications || []).map((h) => `<li>${esc(h)}</li>`).join('');
        const products = (p.product_potential || []).slice(0, 2).map((h) => `<li>${esc(h)}</li>`).join('');
        return `
            <div class="rd-paper">
                <div class="rd-paper-head">
                    <a class="rd-paper-title" href="${esc(p.pdf_url)}" target="_blank" rel="noreferrer">${esc(p.title)}</a>
                </div>
                <div class="rd-paper-meta">
                    <span class="rd-paper-authors">${esc(authors)}</span>
                    <span>·</span>
                    <span>${esc(p.published)}</span>
                    <span>·</span>
                    <span>${esc((p.categories || []).join(', '))}</span>
                    <span>·</span>
                    <span>maturity: ${esc(p.maturity)}</span>
                    <span>·</span>
                    <span>confidence: ${Math.round((p.confidence || 0) * 100)}%</span>
                </div>
                <div class="rd-paper-summary">${esc(p.summary)}</div>
                ${techs ? `<div class="rd-paper-techs">${techs}</div>` : ''}
                ${products ? `<div><b style="font-size:0.82rem;color:var(--text-muted)">Product potential:</b><ul class="rd-paper-apps">${products}</ul></div>` : ''}
                ${hanverse ? `<div><b style="font-size:0.82rem;color:var(--text-muted)">Hanverse applications:</b><ul class="rd-paper-apps">${hanverse}</ul></div>` : ''}
            </div>`;
    }).join('');
}

function renderBrief() {
    const box = document.getElementById('rd-brief');
    if (!state.brief || !state.brief.length) { box.hidden = true; return; }
    box.hidden = false;
    document.getElementById('rd-brief-list').innerHTML = state.brief.map((b) => `<li>${esc(b)}</li>`).join('');
}

function renderStats() {
    document.getElementById('rd-stat-papers').textContent = (state.meta.papers_tracked || 0).toLocaleString();
    document.getElementById('rd-stat-tech').textContent = (state.meta.technologies_discovered || 0).toLocaleString();
    document.getElementById('rd-stat-opps').textContent = (state.meta.opportunities_identified || 0).toLocaleString();
    document.getElementById('rd-stat-updated').textContent = state.meta.last_update || '-';
}

async function loadData() {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();
    state.meta = d.meta || {};
    state.brief = d.brief || [];
    state.top_cards = d.top_cards || [];
    state.papers = d.papers || [];
    state.technologies = d.technologies || [];
    state.product_opportunities = d.product_opportunities || [];
    state.filtered = [...state.papers];

    document.getElementById('rd-eyebrow').textContent = 'AI Technology Radar · ' + (state.meta.date || '');

    renderStats();
    renderBrief();
    renderCards();
    renderPapers();
}

// ── Ask AI (reuse same pattern as app.js / report.js) ─────────────────────────

function buildAiPrompt() {
    const count = parseInt(document.getElementById('rd-ai-count').value, 10);
    const includeDesc = document.getElementById('rd-ai-include-desc').checked;
    const papers = count > 0 ? state.papers.slice(0, count) : state.papers;

    let text = `Today's AI Research Intelligence Report — ${state.meta.date || 'latest'}\n\n`;
    if (state.brief.length) {
        text += 'Brief:\n' + state.brief.map((b) => '- ' + b).join('\n') + '\n\n';
    }
    text += `Papers (${papers.length}):\n`;
    papers.forEach((p, i) => {
        text += `\n${i + 1}. "${p.title}" by ${(p.authors || []).join(', ')}`;
        text += `\n   Categories: ${(p.categories || []).join(', ')}`;
        text += `\n   Maturity: ${p.maturity} | Confidence: ${Math.round((p.confidence || 0) * 100)}%`;
        if (includeDesc) text += `\n   Summary: ${p.summary}`;
        text += `\n   Technologies: ${(p.technologies || []).join(', ')}`;
        if ((p.product_potential || []).length) text += `\n   Product potential: ${p.product_potential.join('; ')}`;
        if ((p.hanverse_applications || []).length) text += `\n   Hanverse: ${p.hanverse_applications.join('; ')}`;
        text += '\n';
    });

    const question = document.getElementById('rd-ai-question').value.trim();
    if (question) text += `\n\nMy question: ${question}`;
    return text;
}

function updateAiPreview() {
    const preview = document.getElementById('rd-ai-preview');
    const meter = document.getElementById('rd-ai-meter');
    const warning = document.getElementById('rd-ai-warning');
    const prompt = buildAiPrompt();
    preview.value = prompt;
    const chars = prompt.length;
    const urlLength = chars + 'https://www.google.com/search?q=&udm=50'.length;
    meter.textContent = `${state.filtered.length} papers • ${chars.toLocaleString()} chars • URL ~${urlLength.toLocaleString()}`;
    warning.hidden = urlLength < 29000;
    warning.textContent = urlLength >= 29000 ? '⚠️ Prompt may exceed URL length limit' : '';
}

function bindAiAsk() {
    const backdrop = document.getElementById('rd-ai-backdrop');
    const modal = document.getElementById('rd-ai-modal');
    const openBtn = document.getElementById('rd-ask-ai');
    const closeBtn = document.getElementById('rd-ai-close');
    const copyBtn = document.getElementById('rd-ai-copy');
    const goBtn = document.getElementById('rd-ai-open');
    const question = document.getElementById('rd-ai-question');
    const count = document.getElementById('rd-ai-count');
    const includeDesc = document.getElementById('rd-ai-include-desc');

    function openModal() {
        document.getElementById('rd-ai-context').textContent =
            `Based on ${state.papers.length} papers from ${state.meta.date || 'latest scan'}. ` +
            `${state.technologies.length} technologies identified, ${state.product_opportunities.length} product opportunities.`;
        updateAiPreview();
        backdrop.hidden = false;
        modal.hidden = false;
        document.body.classList.add('drawer-open');
        setTimeout(() => question.focus(), 100);
    }
    function closeModal() {
        backdrop.hidden = true;
        modal.hidden = true;
        document.body.classList.remove('drawer-open');
    }

    openBtn.addEventListener('click', openModal);
    closeBtn.addEventListener('click', closeModal);
    backdrop.addEventListener('click', closeModal);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });
    question.addEventListener('input', updateAiPreview);
    count.addEventListener('change', updateAiPreview);
    includeDesc.addEventListener('change', updateAiPreview);

    copyBtn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(buildAiPrompt()); copyBtn.textContent = 'Copied ✓'; setTimeout(() => { copyBtn.textContent = 'Copy prompt'; }, 1400); }
        catch { copyBtn.textContent = 'Failed'; setTimeout(() => { copyBtn.textContent = 'Copy prompt'; }, 1400); }
    });
    goBtn.addEventListener('click', () => {
        const prompt = buildAiPrompt();
        const url = 'https://www.google.com/search?q=' + encodeURIComponent(prompt) + '&udm=50';
        window.open(url, '_blank', 'noopener');
    });

    // prompts menu
    const promptsBtn = document.getElementById('rd-prompts-btn');
    const promptsMenu = document.getElementById('rd-prompts-menu');
    promptsBtn.addEventListener('click', (e) => { e.stopPropagation(); promptsMenu.hidden = !promptsMenu.hidden; });
    document.addEventListener('click', () => { promptsMenu.hidden = true; });
    promptsMenu.addEventListener('click', (e) => e.stopPropagation());
    promptsMenu.querySelectorAll('.prompts-item').forEach((item) => {
        item.addEventListener('click', () => {
            question.value = item.dataset.prompt;
            promptsMenu.hidden = true;
            updateAiPreview();
        });
    });

    // add custom prompt
    const addBtn = document.getElementById('rd-prompts-add');
    addBtn.addEventListener('click', () => {
        const custom = prompt('Enter your custom prompt:');
        if (custom && custom.trim()) {
            const list = document.getElementById('prompts-custom-list');
            const group = document.getElementById('prompts-custom-group');
            group.hidden = false;
            const btn = document.createElement('button');
            btn.className = 'prompts-item';
            btn.textContent = custom.trim().slice(0, 60) + (custom.trim().length > 60 ? '…' : '');
            btn.dataset.prompt = custom.trim();
            btn.addEventListener('click', () => { question.value = btn.dataset.prompt; promptsMenu.hidden = true; updateAiPreview(); });
            list.appendChild(btn);
        }
    });
}

function bindSearch() {
    let timer;
    document.getElementById('rd-search').addEventListener('input', (e) => {
        clearTimeout(timer);
        timer = setTimeout(() => { state.search = e.target.value; applyFilters(); }, 220);
    });
}

function bindBackToTop() {
    const btn = document.getElementById('rd-back-to-top');
    window.addEventListener('scroll', () => { btn.hidden = window.scrollY < 300; }, { passive: true });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

async function init() {
    bindSearch();
    bindBackToTop();
    bindAiAsk();
    try {
        await loadData();
    } catch (e) {
        document.getElementById('rd-papers-list').innerHTML =
            `<div class="rd-empty">Research data not available yet: ${esc(e.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
