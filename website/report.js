'use strict';

const state = { items: [], brief: [], meta: {}, search: '', timing: 'all', filtered: [] };
const DATA_URL = 'data/report.json?v=' + Date.now();
const TIMING_LABEL = { breakout: '🚀 Breakout', emerging: '📈 Emerging', steady: '◦ Steady', saturated: '◦ Saturated' };

function esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function fmt(n) { n = Number(n || 0); return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toLocaleString(); }

function applyFilters() {
    const q = state.search.trim().toLowerCase();
    state.filtered = state.items.filter((it) => {
        if (state.timing === 'high' && !it.cross_signal) return false;
        if (state.timing !== 'all' && state.timing !== 'high' && it.timing !== state.timing) return false;
        if (q) {
            const hay = [it.name, it.one_liner, it.pain_point, it.monetization, (it.app_ideas || []).join(' '), it.category].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
        }
        return true;
    });
    render();
}

function render() {
    const grid = document.getElementById('rep-grid');
    if (!state.filtered.length) {
        grid.innerHTML = '<div class="rep-empty">No opportunities match this filter.</div>';
        return;
    }
    grid.innerHTML = state.filtered.map((it) => {
        const tcls = 't-' + (it.timing || 'steady');
        const delta = (typeof it.delta_7d === 'number') ? `+${it.delta_7d.toLocaleString()} stars / 7d` : '';
        const ideas = (it.app_ideas || []).map((a) => `<li>${esc(a)}</li>`).join('');
        return `
            <div class="rep-card">
                <div class="rep-card-head">
                    <div>
                        <a class="rep-repo" href="${esc(it.url)}" target="_blank" rel="noreferrer">${esc(it.name)}</a>
                        <div class="rep-sub">${fmt(it.stars)}★ · ${esc(it.category || '')}${delta ? ' · ' + esc(delta) : ''}</div>
                    </div>
                    <div class="rep-opp"><b>${it.opportunity}</b><span>opp</span></div>
                </div>
                <div class="rep-badges">
                    <span class="rep-badge ${tcls}">${TIMING_LABEL[it.timing] || it.timing}</span>
                    ${it.cross_signal ? '<span class="rep-badge b-high">⭐ High opportunity</span>' : ''}
                </div>
                ${it.one_liner ? `<div class="rep-oneliner">${esc(it.one_liner)}</div>` : ''}
                ${it.pain_point ? `<div class="rep-field"><b>Pain:</b> ${esc(it.pain_point)}</div>` : ''}
                ${ideas ? `<div class="rep-field"><b>Build ideas:</b><ul class="rep-ideas">${ideas}</ul></div>` : ''}
                ${it.monetization ? `<div class="rep-field"><b>Monetize:</b> ${esc(it.monetization)}</div>` : ''}
                ${it.why_now ? `<div class="rep-field"><b>Why now:</b> ${esc(it.why_now)}</div>` : ''}
            </div>`;
    }).join('');
}

function renderBrief() {
    if (!state.brief.length) return;
    document.getElementById('rep-brief').hidden = false;
    document.getElementById('rep-brief-list').innerHTML = state.brief.map((b) => `<li>${esc(b)}</li>`).join('');
}

// ── Export / share / Ask AI ───────────────────────────────────────────────────
function buildMd() {
    const lines = [`# Daily AI Opportunity Report — ${state.meta.date || ''}`, ''];
    if (state.brief.length) { lines.push('## Brief', ...state.brief.map((b) => `- ${b}`), ''); }
    state.filtered.forEach((it) => {
        lines.push(`## ${it.name}  (opp ${it.opportunity} · ${it.timing}${it.cross_signal ? ' · high opportunity' : ''})`);
        if (it.one_liner) lines.push(`*${it.one_liner}*`);
        if (it.pain_point) lines.push(`- **Pain:** ${it.pain_point}`);
        (it.app_ideas || []).forEach((a) => lines.push(`- **Idea:** ${a}`));
        if (it.monetization) lines.push(`- **Monetize:** ${it.monetization}`);
        if (it.why_now) lines.push(`- **Why now:** ${it.why_now}`);
        lines.push(`- ${it.url}`, '');
    });
    return lines.join('\n');
}
async function copyText(t) { try { await navigator.clipboard.writeText(t); return true; } catch { return false; } }
function download(name, content) {
    const url = URL.createObjectURL(new Blob([content], { type: 'text/plain' }));
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
function flash(id, label, restore) { const el = document.querySelector(`#${id} span`); if (!el) return; el.textContent = label; setTimeout(() => { el.textContent = restore; }, 1400); }

function buildAiPrompt() {
    const top = state.filtered.slice(0, 25);
    const lines = top.map((it, i) =>
        `${i + 1}. ${it.name} (opp ${it.opportunity}, ${it.timing}) — ${it.one_liner} — ideas: ${(it.app_ideas || []).join('; ')} — monetize: ${it.monetization}`);
    return `Here is today's distilled report of trending open-source AI opportunities. Help me pick the single best one to act on this week and outline a concrete 2-week build + go-to-market plan for it.\n\n${state.brief.length ? 'Brief:\n' + state.brief.map((b) => '- ' + b).join('\n') + '\n\n' : ''}Opportunities (${top.length}):\n${lines.join('\n')}`;
}

function bind() {
    let timer;
    document.getElementById('rep-search').addEventListener('input', (e) => { clearTimeout(timer); timer = setTimeout(() => { state.search = e.target.value; applyFilters(); }, 220); });
    document.querySelectorAll('.rep-chip').forEach((c) => c.addEventListener('click', () => {
        state.timing = c.dataset.timing;
        document.querySelectorAll('.rep-chip').forEach((b) => b.classList.toggle('active', b === c));
        applyFilters();
    }));
    document.getElementById('rep-md').addEventListener('click', () => { download(`ai-report-${state.meta.date || 'latest'}.md`, buildMd()); flash('rep-md', 'Done', 'MD'); });
    document.getElementById('rep-share').addEventListener('click', async () => { const ok = await copyText(window.location.href); flash('rep-share', ok ? 'Copied' : 'Failed', 'Share'); });
    document.getElementById('rep-ask').addEventListener('click', async () => {
        const prompt = buildAiPrompt();
        await copyText(prompt);
        window.open('https://www.google.com/search?q=' + encodeURIComponent(prompt) + '&udm=50', '_blank', 'noopener');
        flash('rep-ask', 'Opened ✓', 'Ask AI');
    });
}

async function load() {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('report.json HTTP ' + res.status);
    const d = await res.json();
    state.items = (d.items || []).slice();
    state.brief = d.brief || [];
    state.meta = { date: d.date, backend: d.backend, model: d.model };

    document.getElementById('rep-date').textContent = 'AI Opportunity Report · ' + (d.date || '');
    document.getElementById('stat-count').textContent = state.items.length;
    document.getElementById('stat-breakout').textContent = state.items.filter((i) => i.timing === 'breakout').length;
    document.getElementById('stat-model').textContent = d.backend === 'lmstudio' ? 'Local LLM' : 'LLM7';

    renderBrief();
    applyFilters();
}

document.addEventListener('DOMContentLoaded', () => {
    bind();
    load().catch((e) => { document.getElementById('rep-grid').innerHTML = `<div class="rep-empty">Report not available yet: ${esc(e.message)}</div>`; });
});
