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

function computePaperQuality(p) {
    const conf = p.confidence || 0;
    const curatorScore = p.curator_score || 0;
    const techCount = Math.min(p.technologies ? p.technologies.length : 0, 10);
    const hasCode = (p.comment && p.comment.includes('github')) || (p.summary || '').toLowerCase().includes('code') || (p.summary || '').toLowerCase().includes('github') ? 1 : 0;
    const maturityScore = p.maturity === 'high' ? 1.0 : p.maturity === 'medium' ? 0.7 : 0.4;
    const raw = (conf * 0.25 + (curatorScore / 10) * 0.25 + (techCount / 10) * 0.2 + hasCode * 0.15 + maturityScore * 0.15) * 100;
    return Math.round(Math.min(raw, 100));
}

function qualityColor(score) {
    if (score >= 75) return 'var(--success)';
    if (score >= 50) return 'var(--accent)';
    if (score >= 30) return 'var(--warning)';
    return 'var(--text-muted)';
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
        const products = (p.product_potential || []).slice(0, 3).map((h) => `<li>${esc(h)}</li>`).join('');
        const quality = computePaperQuality(p);
        const qColor = qualityColor(quality);
        return `
            <div class="rd-paper">
                <div class="rd-paper-head">
                    <a class="rd-paper-title" href="${esc(p.pdf_url)}" target="_blank" rel="noreferrer">${esc(p.title)}</a>
                    <span class="rd-badge" style="flex-shrink:0;background:rgba(0,0,0,0.2);border-color:${qColor};color:${qColor}">${quality}/100</span>
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
                    ${p.curator_score ? `<span>·</span><span>score: ${p.curator_score}/10</span>` : ''}
                </div>
                <div class="rd-paper-summary">${esc(p.summary)}</div>
                ${techs ? `<div class="rd-paper-techs">${techs}</div>` : ''}
                ${products ? `<div><b style="font-size:0.82rem;color:var(--text-muted)">Product opportunities:</b><ul class="rd-paper-apps">${products}</ul></div>` : ''}
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

// ── Ask AI (via shared research-ai.js) ──────────────────────────────────────
window.buildPrompt = function () {
    const count = parseInt(document.getElementById('rd-ai-count').value, 10);
    const includeDesc = document.getElementById('rd-ai-include-desc').checked;
    const papers = count > 0 ? state.papers.slice(0, count) : state.papers;

    let text = `Research Intelligence Report — ${state.meta.date || 'latest'}\n\n`;
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
        text += '\n';
    });

    const question = document.getElementById('rd-ai-question').value.trim();
    if (question) text += `\nMy question: ${question}`;
    return text;
};

window.buildContextText = function () {
    return `Based on ${state.papers.length} papers from ${state.meta.date || 'latest scan'}. ` +
        `${state.technologies.length} technologies identified, ${state.product_opportunities.length} product opportunities.`;
};

window.buildPromptShort = function () {
    const count = parseInt(document.getElementById('rd-ai-count').value, 10);
    const papers = count > 0 ? state.papers.slice(0, count) : state.papers;
    const limit = Math.min(papers.length, 5);

    let text = `Research Intelligence Report — ${state.meta.date || 'latest'}\n\n`;
    text += `Top ${limit} papers (summaries excluded for length):\n`;
    for (let i = 0; i < limit; i++) {
        const p = papers[i];
        text += `\n${i + 1}. "${p.title}" by ${(p.authors || []).join(', ')}`;
        text += `\n   Technologies: ${(p.technologies || []).join(', ')}`;
        text += '\n';
    }
    text += '\nFull prompt copied to clipboard — paste it if Google trims the URL.\n';

    const question = document.getElementById('rd-ai-question').value.trim();
    if (question) text += `\nMy question: ${question}`;
    return text;
};

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
    bindAskAi();
    try {
        await loadData();
    } catch (e) {
        document.getElementById('rd-papers-list').innerHTML =
            `<div class="rd-empty">Research data not available yet: ${esc(e.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
