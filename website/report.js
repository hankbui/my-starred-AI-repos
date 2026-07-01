'use strict';

const state = { items: [], brief: [], meta: {}, search: '', timing: 'all', filtered: [] };
const DATA_URL = 'data/report.json?v=' + Date.now();
const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';
const TIMING_LABEL = { breakout: '🚀 Breakout', emerging: '📈 Emerging', steady: '◦ Steady', saturated: '◦ Saturated' };

function esc(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function fmt(n) { n = Number(n || 0); return n >= 1000 ? (n / 1000).toFixed(1) + 'k' : n.toLocaleString(); }

function parseJson(text) {
    if (!text) return null;
    text = text.replace(/^```(?:json)?/im, '').replace(/```$/m, '').trim();
    const start = text.indexOf('{');
    if (start === -1) return null;
    let depth = 0;
    for (let i = start; i < text.length; i++) {
        if (text[i] === '{') depth++;
        else if (text[i] === '}') { depth--; if (depth === 0) { try { return JSON.parse(text.slice(start, i + 1)); } catch { return null; } } }
    }
    return null;
}

// ── Report rendering ──────────────────────────────────────────────────────────
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
        const sigs = (it.signals || []).map((s) => `<span class="rep-sig ${s === 'Open whitespace' ? 'whitespace' : ''}">${esc(s)}</span>`).join('');
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
                ${sigs ? `<div class="rep-signals">${sigs}</div>` : ''}
                ${it.one_liner ? `<div class="rep-oneliner">${esc(it.one_liner)}</div>` : ''}
                ${it.pain_point ? `<div class="rep-field"><b>Pain:</b> ${esc(it.pain_point)}</div>` : ''}
                ${ideas ? `<div class="rep-field"><b>Build ideas:</b><ul class="rep-ideas">${ideas}</ul></div>` : ''}
                ${it.monetization ? `<div class="rep-field"><b>Monetize:</b> ${esc(it.monetization)}</div>` : ''}
                ${it.why_now ? `<div class="rep-field"><b>Why now:</b> ${esc(it.why_now)}</div>` : ''}
            </div>`;
    }).join('');
}

function renderBrief() {
    const box = document.getElementById('rep-brief');
    if (!state.brief.length) { box.hidden = true; return; }
    box.hidden = false;
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

// ── Request analysis (client-side LLM7) ───────────────────────────────────────
const ANALYZE_SYS = 'You are a startup analyst who turns a GitHub repo or a raw product idea into a concrete, honest opportunity breakdown. Reply with STRICT JSON only, no markdown, no prose.';

function repoRef(input) {
    const t = input.trim();
    const m = t.match(/github\.com\/([\w.-]+\/[\w.-]+)/i);
    if (m) return m[1].replace(/\.git$/, '');
    if (/^[\w.-]+\/[\w.-]+$/.test(t)) return t;
    return null;
}
async function ghContext(ref) {
    try {
        const r = await fetch('https://api.github.com/repos/' + ref);
        if (!r.ok) return '';
        const d = await r.json();
        return `GitHub facts — ${d.full_name}, ${d.stargazers_count} stars, language ${d.language || 'n/a'}, topics ${(d.topics || []).join(', ') || 'n/a'}, description: ${d.description || 'n/a'}`;
    } catch { return ''; }
}
function analyzePrompt(input, gh) {
    return `Analyze this ${gh ? 'GitHub repo' : 'product idea'}: "${input}".\n${gh ? gh + '\n' : ''}\n` +
        'Return JSON with EXACTLY these keys:\n' +
        '{"title":"short name","one_liner":"<=12 words what it is",' +
        '"pain_point":"the core problem and who feels it",' +
        '"target_user":"who would pay for this",' +
        '"app_ideas":["2-3 concrete apps a solo dev can ship in ~2 weeks"],' +
        '"monetization":"best-fit revenue model",' +
        '"competitors":["2-4 existing tools or alternatives"],' +
        '"opportunity":<integer 1-10, higher = more open whitespace>,' +
        '"why_now":"timing rationale",' +
        '"risks":"main risk or moat concern"}';
}
async function llm7(messages, temperature) {
    const res = await fetch(LLM7_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer unused' },
        body: JSON.stringify({ model: 'default', messages, temperature: temperature ?? 0.5 }),
    });
    if (!res.ok) throw new Error('LLM7 HTTP ' + res.status);
    const d = await res.json();
    return d?.choices?.[0]?.message?.content || '';
}
function renderAnalysis(d) {
    const box = document.getElementById('rep-analyze-result');
    const ideas = (d.app_ideas || []).map((x) => `<li>${esc(x)}</li>`).join('');
    const comps = (d.competitors || []).map((x) => `<li>${esc(x)}</li>`).join('');
    const opp = Number.isFinite(+d.opportunity) ? +d.opportunity : '–';
    box.innerHTML = `
        <div class="rep-ares">
            <div class="rep-ares-head">
                <div class="rep-ares-title">${esc(d.title || 'Analysis')}<small>${esc(d.one_liner || '')}</small></div>
                <div class="rep-opp"><b>${opp}</b><span>opp</span></div>
            </div>
            <div class="rep-ares-grid">
                ${d.pain_point ? `<div class="rep-ares-block"><b>Pain point</b><div>${esc(d.pain_point)}</div></div>` : ''}
                ${d.target_user ? `<div class="rep-ares-block"><b>Who pays</b><div>${esc(d.target_user)}</div></div>` : ''}
                ${ideas ? `<div class="rep-ares-block"><b>Build ideas</b><ul>${ideas}</ul></div>` : ''}
                ${comps ? `<div class="rep-ares-block"><b>Competitors</b><ul>${comps}</ul></div>` : ''}
                ${d.monetization ? `<div class="rep-ares-block"><b>Monetize</b><div>${esc(d.monetization)}</div></div>` : ''}
                ${d.why_now ? `<div class="rep-ares-block"><b>Why now</b><div>${esc(d.why_now)}</div></div>` : ''}
                ${d.risks ? `<div class="rep-ares-block"><b>Risk / moat</b><div>${esc(d.risks)}</div></div>` : ''}
            </div>
            <div class="rep-note">Generated live via LLM7 — verify before acting.</div>
        </div>`;
    box.hidden = false;
}
async function runAnalyze() {
    const input = document.getElementById('rep-analyze-input').value.trim();
    if (!input) return;
    const btn = document.getElementById('rep-analyze-btn');
    const box = document.getElementById('rep-analyze-result');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Analyzing…';
    box.hidden = false; box.innerHTML = '<div class="rep-note">Distilling… (a few seconds)</div>';
    try {
        const ref = repoRef(input);
        const gh = ref ? await ghContext(ref) : '';
        const raw = await llm7([{ role: 'system', content: ANALYZE_SYS }, { role: 'user', content: analyzePrompt(input, gh) }], 0.5);
        const data = parseJson(raw);
        if (!data) throw new Error('could not parse the model response');
        renderAnalysis(data);
    } catch (e) {
        box.innerHTML = `<div class="rep-note">Analysis failed: ${esc(e.message)}. Please try again in a moment.</div>`;
    } finally {
        btn.disabled = false; btn.textContent = label;
    }
}

// ── Date history ──────────────────────────────────────────────────────────────
async function loadIndex() {
    try { const r = await fetch('data/reports/index.json?cb=' + Date.now()); if (r.ok) return (await r.json()).dates || []; } catch { }
    return [];
}
function populateDates(dates) {
    const sel = document.getElementById('rep-datesel');
    if (!dates.length) { document.querySelector('.rep-datebar').hidden = true; return; }
    sel.innerHTML = dates.map((d, i) => `<option value="${d}">${d}${i === 0 ? ' · latest' : ''}</option>`).join('');
    sel.value = dates[0];
}
async function loadReport(date, isLatest) {
    const url = isLatest ? DATA_URL : `data/reports/${date}.json?cb=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('report HTTP ' + res.status);
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
    document.getElementById('rep-analyze-btn').addEventListener('click', runAnalyze);
    document.getElementById('rep-analyze-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runAnalyze(); });
    document.getElementById('rep-datesel').addEventListener('change', (e) => {
        loadReport(e.target.value).catch((err) => { document.getElementById('rep-grid').innerHTML = `<div class="rep-empty">Could not load ${esc(e.target.value)}: ${esc(err.message)}</div>`; });
    });
}

async function init() {
    bind();
    const dates = await loadIndex();
    populateDates(dates);
    try {
        if (dates.length) await loadReport(dates[0]);
        else await loadReport(null, true);
    } catch (e) {
        document.getElementById('rep-grid').innerHTML = `<div class="rep-empty">Report not available yet: ${esc(e.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
