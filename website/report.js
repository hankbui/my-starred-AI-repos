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

// ── Live Market Report (client-side generation) ──────────────────────────────
const REPORT_SYS = `You are a senior startup analyst and market intelligence expert. Your job is to analyze a dataset of trending open-source AI repositories and produce a structured market report.

Return STRICT JSON only — no markdown, no prose outside the JSON. Use this exact structure:
{
  "market_overview": "2-3 sentence summary of the overall market state",
  "key_stats": { "total_repos": number, "total_gainers": number, "total_weekly_stars": number, "top_category": "string" },
  "category_breakdown": [{"name":"string","count":number,"percent":number,"insight":"1 sentence"}],
  "opportunities": [{"title":"string","description":"1-2 sentences","why_now":"string","revenue":"string","difficulty":"easy|medium|hard","signal_repo":"string"}],
  "trends": [{"trend":"string","evidence":"string","opportunity":"string"}],
  "market_gaps": [{"gap":"string","why_untapped":"string","opportunity_size":"small|medium|large"}],
  "recommendations": [{"idea":"string","target":"string","revenue_model":"string","mvp_weeks":number,"why_win":"string"}],
  "risks": ["string"],
  "conclusion": "1-2 sentence final take"
}`;

function computeAnalytics(repos) {
    const cats = {}, langs = {}, catGrowth = {};
    let totalD7 = 0, gainers = 0;
    repos.forEach(r => {
        const c = r.category || 'Other';
        cats[c] = (cats[c] || 0) + 1;
        const l = r.language || 'Unknown';
        langs[l] = (langs[l] || 0) + 1;
        if (r.star_delta_7d) { totalD7 += r.star_delta_7d; if (r.star_delta_7d > 0) gainers++; }
        if (r.star_delta_7d) catGrowth[c] = (catGrowth[c] || 0) + r.star_delta_7d;
    });
    const sortedCats = Object.entries(cats).sort((a, b) => b[1] - a[1]);
    const catGrowthSorted = Object.entries(catGrowth).sort((a, b) => b[1] - a[1]);
    const topD7 = repos.filter(r => r.star_delta_7d).sort((a, b) => b.star_delta_7d - a.star_delta_7d).slice(0, 15);
    const topD1 = repos.filter(r => r.star_delta_1d).sort((a, b) => b.star_delta_1d - a.star_delta_1d).slice(0, 10);
    const langSorted = Object.entries(langs).sort((a, b) => b[1] - a[1]).slice(0, 8);
    return { categories: sortedCats, catGrowth: catGrowthSorted, topD7, topD1, languages: langSorted, totalRepos: repos.length, totalD7, gainers };
}

function buildReportPrompt(a) {
    const catLines = a.categories.map(([n, c]) => `${n}: ${c} (${(c / a.totalRepos * 100).toFixed(0)}%)`).join('\n');
    const growthLines = a.catGrowth.map(([n, c]) => `${n}: +${c.toLocaleString()} stars`).join('\n');
    const topRepoLines = a.topD7.map((r, i) => `${i + 1}. ${r.name} +${r.star_delta_7d}★ (${r.stars.toLocaleString()} total, ${r.category})`).join('\n');
    const topD1Lines = a.topD1.map((r, i) => `${i + 1}. ${r.name} +${r.star_delta_1d}★/day`).join('\n');
    const langLines = a.languages.map(([l, c]) => `${l}: ${c}`).join('\n');
    return `I analyzed ${a.totalRepos} trending open-source AI repositories. Here are the facts:\n\n` +
        `TOTAL: ${a.totalRepos} repos, ${a.gainers} gaining stars this week, +${a.totalD7.toLocaleString()} total weekly stars.\n\n` +
        `CATEGORIES:\n${catLines}\n\n` +
        `CATEGORY GROWTH (total stars gained):\n${growthLines}\n\n` +
        `TOP 15 GAINERS THIS WEEK:\n${topRepoLines}\n\n` +
        `TOP 10 DAILY GAINERS:\n${topD1Lines}\n\n` +
        `TOP LANGUAGES:\n${langLines}\n\n` +
        `Based on this data, generate a structured market report identifying: market overview, top opportunities for startups, emerging trends, market gaps, specific recommendations with revenue models, and risks. Focus on practical, actionable insights for a solo founder or small team looking to build something valuable.`;
}

async function generateLiveReport() {
    const btn = document.getElementById('rep-live-btn');
    const output = document.getElementById('rep-live-output');
    const loading = document.getElementById('rpt-loading');
    const loadingText = document.getElementById('rpt-loading-text');
    const label = btn.innerHTML;

    btn.disabled = true;
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:18px;height:18px;animation:spin .8s linear infinite;margin:0"><circle cx="12" cy="12" r="10" stroke="currentColor" fill="none" opacity="0.3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/></svg> Generating...';
    output.hidden = false;
    loading.hidden = false;
    document.getElementById('rpt-content').innerHTML = '';
    loadingText.textContent = 'Fetching repo data...';

    try {
        const res = await fetch('data/repos.json?v=' + Date.now());
        if (!res.ok) throw new Error('Failed to load repo data (HTTP ' + res.status + ')');
        const data = await res.json();
        const repos = data.starred_repos || data.repos || [];
        if (!repos.length) throw new Error('No repo data found');
        loadingText.textContent = `Computing analytics on ${repos.length} repos...`;

        const analytics = computeAnalytics(repos);
        loadingText.textContent = 'Generating report via LLM7 AI...';

        const prompt = buildReportPrompt(analytics);
        const raw = await llm7([{ role: 'system', content: REPORT_SYS }, { role: 'user', content: prompt }], 0.4);
        const report = parseJson(raw);
        if (!report) throw new Error('Could not parse AI response — try again');

        report._analytics = { totalRepos: analytics.totalRepos, gainers: analytics.gainers, totalD7: analytics.totalD7, topCat: analytics.categories[0]?.[0] || '' };
        const today = new Date().toISOString().slice(0, 10);
        saveLocalReport(today, report);
        showLiveReportView(true);
        renderLiveReport(report, analytics, false);
        loading.hidden = true;
        // Refresh the date dropdown to include this new report
        populateDates(await loadIndex());
    } catch (e) {
        document.getElementById('rpt-content').innerHTML = `<div class="rpt-error">
            <p>${esc(e.message)}</p>
            <button onclick="generateLiveReport()">Try again</button>
        </div>`;
        loading.hidden = true;
    } finally {
        btn.disabled = false;
        btn.innerHTML = label;
    }
}

function renderLiveReport(r, a, saved) {
    const content = document.getElementById('rpt-content');
    document.getElementById('rpt-loading').hidden = true;
    const cats = r.category_breakdown || (a ? a.categories.map(([n, c]) => ({ name: n, count: c, percent: Math.round(c / (a.totalRepos || 1) * 100), insight: '' })) : []);
    const maxCatCount = Math.max(...cats.map(c => c.count), 1);

    const catHtml = cats.map(c => `
        <div class="rpt-cat-item">
            <span class="rpt-cat-name">${esc(c.name)}</span>
            <div class="rpt-cat-bar"><div class="rpt-cat-fill" style="width:${(c.count / maxCatCount * 100).toFixed(0)}%"></div></div>
            <span class="rpt-cat-count">${c.count}</span>
            <span style="font-size:0.74rem;color:var(--text-muted)">${c.percent}%</span>
        </div>
        ${c.insight ? `<div class="rpt-cat-insight" style="padding-left:110px">${esc(c.insight)}</div>` : ''}
    `).join('');

    const stats = r.key_stats || (a ? { total_repos: a.totalRepos, total_gainers: a.gainers, total_weekly_stars: a.totalD7, top_category: a.categories[0]?.[0] || '' } : {});

    const oppHtml = (r.opportunities || []).map(o => `
        <div class="rpt-card">
            <h3>${esc(o.title)}</h3>
            <p>${esc(o.description)}</p>
            <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
                ${o.why_now ? `<span class="rpt-tag">⚡ ${esc(o.why_now)}</span>` : ''}
                ${o.revenue ? `<span class="rpt-tag rev">💰 ${esc(o.revenue)}</span>` : ''}
                ${o.difficulty ? `<span class="rpt-tag ${o.difficulty === 'easy' ? 'easy' : 'hard'}">${o.difficulty}</span>` : ''}
                ${o.signal_repo ? `<span class="rpt-tag">${esc(o.signal_repo)}</span>` : ''}
            </div>
        </div>
    `).join('');

    const trendHtml = (r.trends || []).map(t => `
        <div class="rpt-trend-item">
            <h3>📈 ${esc(t.trend)}</h3>
            <p>${esc(t.evidence)}</p>
            ${t.opportunity ? `<p style="margin-top:4px;color:var(--accent);font-weight:600">→ ${esc(t.opportunity)}</p>` : ''}
        </div>
    `).join('');

    const gapsHtml = (r.market_gaps || []).map(g => `
        <div class="rpt-card" style="border-color:rgba(77,224,168,0.2)">
            <h3>🕳️ ${esc(g.gap)}</h3>
            <p>${esc(g.why_untapped)}</p>
            ${g.opportunity_size ? `<span class="rpt-tag" style="background:rgba(77,224,168,0.1);color:var(--success)">${g.opportunity_size} opportunity</span>` : ''}
        </div>
    `).join('');

    const recoHtml = (r.recommendations || []).map((rec, i) => `
        <div class="rpt-reco-card">
            <div class="rpt-reco-num">${i + 1}</div>
            <h3>${esc(rec.idea)}</h3>
            <p>${esc(rec.target)}</p>
            <div class="rpt-reco-meta">
                ${rec.revenue_model ? `<span class="rev">💰 ${esc(rec.revenue_model)}</span>` : ''}
                ${rec.mvp_weeks ? `<span>⚡ ${rec.mvp_weeks} weeks to MVP</span>` : ''}
                <span>🎯 ${esc(rec.why_win || 'Validated signal')}</span>
            </div>
        </div>
    `).join('');

    const risksHtml = (r.risks || []).map(risk => `<span class="rpt-risk">⚠ ${esc(risk)}</span>`).join('');

    content.innerHTML = `<div class="rpt">
        <div class="rpt-section">
            <h2><span class="rpt-emoji">📊</span> Market Overview</h2>
            <p class="rpt-sub">${esc(r.market_overview || '')}</p>
            <div class="rpt-stat-row">
                <div class="rpt-stat"><div class="rpt-stat-val">${stats.total_repos}</div><div class="rpt-stat-lbl">Repos tracked</div></div>
                <div class="rpt-stat"><div class="rpt-stat-val">${stats.total_gainers}</div><div class="rpt-stat-lbl">Gainers this week</div></div>
                <div class="rpt-stat"><div class="rpt-stat-val">+${(stats.total_weekly_stars / 1000).toFixed(0)}k</div><div class="rpt-stat-lbl">Weekly stars</div></div>
                <div class="rpt-stat"><div class="rpt-stat-val">${esc(stats.top_category || '')}</div><div class="rpt-stat-lbl">Top category</div></div>
            </div>
        </div>

        <div class="rpt-section">
            <h2><span class="rpt-emoji">📂</span> Category Breakdown</h2>
            <p class="rpt-sub">Distribution of repos across AI categories — larger bars indicate more activity</p>
            <div class="rpt-cat-list">${catHtml}</div>
        </div>

        ${oppHtml ? `<div class="rpt-section">
            <h2><span class="rpt-emoji">🚀</span> Top Startup Opportunities</h2>
            <p class="rpt-sub">Based on growth signals, market gaps, and timing — ranked by potential</p>
            <div class="rpt-grid2">${oppHtml}</div>
        </div>` : ''}

        ${trendHtml ? `<div class="rpt-section">
            <h2><span class="rpt-emoji">📈</span> Emerging Trends</h2>
            <p class="rpt-sub">Patterns identified from repo growth and category shifts</p>
            <div class="rpt-trend-list">${trendHtml}</div>
        </div>` : ''}

        ${gapsHtml ? `<div class="rpt-section">
            <h2><span class="rpt-emoji">🕳️</span> Market Gaps</h2>
            <p class="rpt-sub">Underserved areas with high potential — few repos but strong demand signals</p>
            <div class="rpt-grid2">${gapsHtml}</div>
        </div>` : ''}

        ${recoHtml ? `<div class="rpt-section">
            <h2><span class="rpt-emoji">💡</span> Top Recommendations</h2>
            <p class="rpt-sub">Ranked startup ideas to act on right now</p>
            <div class="rpt-reco-grid">${recoHtml}</div>
        </div>` : ''}

        ${risksHtml ? `<div class="rpt-section">
            <h2><span class="rpt-emoji">⚠️</span> Risks to Watch</h2>
            <div class="rpt-risks">${risksHtml}</div>
        </div>` : ''}

        ${r.conclusion ? `<div class="rpt-conclusion"><p>${esc(r.conclusion)}</p></div>` : ''}

        <div style="text-align:center;padding:12px;font-size:0.74rem;color:var(--text-muted);display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:center">
            <span>Generated from ${stats.total_repos} repos via LLM7 AI</span>
            ${saved ? '<span class="rpt-tag rev">🔴 Saved</span>' : ''}
            <button class="action-btn" style="padding:4px 12px;font-size:0.74rem" onclick="downloadLiveReport()">💾 Download JSON</button>
            <button class="action-btn" style="padding:4px 12px;font-size:0.74rem" onclick="copyLiveReport()">📋 Copy JSON</button>
            <button class="rep-live-btn" style="min-height:32px;padding:0 14px;font-size:0.74rem" id="rep-publish-btn" onclick="publishLiveReport()">📤 Publish to GitHub</button>
            <button class="action-btn" style="padding:4px 12px;font-size:0.74rem" onclick="generateLiveReport()">🔄 Regenerate</button>
        </div>
    </div>`;
    content.querySelector('.rpt')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    // Store for download/publish
    window.__lastLiveReport = r;
}

// ── Download / Copy / Publish live report ─────────────────────────────────────
const GH_OWNER = 'hankbui';
const GH_REPO = 'my-starred-AI-repos';

function downloadLiveReport() {
    const r = window.__lastLiveReport;
    if (!r) return;
    const today = new Date().toISOString().slice(0, 10);
    const blob = new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `market-report-${today}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
async function copyLiveReport() {
    const r = window.__lastLiveReport;
    if (!r) return;
    try { await navigator.clipboard.writeText(JSON.stringify(r, null, 2)); } catch {}
}
async function publishLiveReport() {
    const r = window.__lastLiveReport;
    if (!r) return;
    let token = localStorage.getItem('gh_token');
    if (!token) {
        token = prompt('Enter a GitHub Personal Access Token with repo/content write access:');
        if (!token) return;
        localStorage.setItem('gh_token', token);
    }
    const today = new Date().toISOString().slice(0, 10);
    const path = `data/reports/${today}.json`;
    const indexPath = 'data/reports/index.json';
    const btn = document.getElementById('rep-publish-btn');
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Publishing...';
    try {
        // Get current index to merge dates
        let existingDates = [];
        try {
            const idxRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${indexPath}`);
            if (idxRes.ok) {
                const idxData = await idxRes.json();
                const idxContent = JSON.parse(atob(idxData.content));
                existingDates = idxContent.dates || [];
                r._indexSha = idxData.sha;
            }
        } catch {}

        if (!existingDates.includes(today)) existingDates.unshift(today);
        const newIndex = { dates: existingDates, updated_at: new Date().toISOString() };

        // Save report file
        const reportContent = btoa(unescape(encodeURIComponent(JSON.stringify(r, null, 2))));
        let reportSha = null;
        try {
            const check = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`);
            if (check.ok) reportSha = (await check.json()).sha;
        } catch {}

        const reportBody = { message: `Live market report ${today}`, content: reportContent };
        if (reportSha) reportBody.sha = reportSha;

        const reportRes = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${path}`, {
            method: 'PUT',
            headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(reportBody),
        });
        if (!reportRes.ok) {
            const err = await reportRes.json().catch(() => ({}));
            throw new Error(err.message || `HTTP ${reportRes.status}`);
        }

        // Save index file
        const idxContent = btoa(unescape(encodeURIComponent(JSON.stringify(newIndex, null, 2))));
        const idxBody = { message: `Update report index [live: ${today}]`, content: idxContent };
        if (r._indexSha) idxBody.sha = r._indexSha;

        const idxRes2 = await fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${indexPath}`, {
            method: 'PUT',
            headers: { Authorization: `token ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(idxBody),
        });
        if (!idxRes2.ok) {
            const err = await idxRes2.json().catch(() => ({}));
            throw new Error('Index update: ' + (err.message || `HTTP ${idxRes2.status}`));
        }

        btn.textContent = '✅ Published!';
        setTimeout(() => { btn.disabled = false; btn.textContent = label; }, 3000);
    } catch (e) {
        btn.textContent = '❌ Failed: ' + e.message;
        setTimeout(() => { btn.disabled = false; btn.textContent = label; }, 4000);
        if (e.message.includes('Bad credentials') || e.message.includes('401')) {
            localStorage.removeItem('gh_token');
        }
    }
}

// ── Date history + live report persistence ────────────────────────────────────
const LS_KEY = 'live_reports';

function getLocalReports() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch { return {}; }
}
function saveLocalReport(date, data) {
    const reports = getLocalReports();
    reports[date] = data;
    try { localStorage.setItem(LS_KEY, JSON.stringify(reports)); } catch {}
}

async function loadIndex() {
    let serverDates = [];
    try { const r = await fetch('data/reports/index.json?cb=' + Date.now()); if (r.ok) serverDates = (await r.json()).dates || []; } catch { }
    const localReports = getLocalReports();
    const localDates = Object.keys(localReports).sort().reverse();
    const merged = [...localDates];
    serverDates.forEach(d => { if (!merged.includes(d)) merged.push(d); });
    return { dates: merged, localDates };
}
function populateDates(result) {
    const sel = document.getElementById('rep-datesel');
    const { dates, localDates } = result;
    if (!dates.length) { document.querySelector('.rep-datebar').hidden = true; return; }
    sel.innerHTML = dates.map(d => {
        const isLocal = localDates.includes(d);
        return `<option value="${d}">${d}${isLocal ? ' · 🔴 saved' : d === dates[0] && !d.includes('saved') ? ' · latest' : ''}</option>`;
    }).join('');
    sel.value = dates[0];
}
async function loadReport(date) {
    const localReports = getLocalReports();
    if (localReports[date]) {
        showLiveReportView(true);
        renderLiveReport(localReports[date], localReports[date]._analytics || null, true);
        document.getElementById('rep-date').textContent = 'Live Market Report · ' + date;
        return;
    }
    showLiveReportView(false);
    const url = date ? `data/reports/${date}.json?cb=${Date.now()}` : DATA_URL;
    const res = await fetch(url);
    if (!res.ok) throw new Error('report HTTP ' + res.status);
    const d = await res.json();
    state.items = (d.items || []).slice();
    state.brief = d.brief || [];
    state.meta = { date: d.date || date, backend: d.backend, model: d.model };

    document.getElementById('rep-date').textContent = 'AI Opportunity Report · ' + (d.date || date || '');
    document.getElementById('stat-count').textContent = state.items.length;
    document.getElementById('stat-breakout').textContent = state.items.filter((i) => i.timing === 'breakout').length;
    document.getElementById('stat-model').textContent = d.backend === 'lmstudio' ? 'Local LLM' : 'LLM7';

    renderBrief();
    applyFilters();
}

function showLiveReportView(show) {
    document.getElementById('rep-brief').hidden = show;
    document.getElementById('rep-toolbar').style.display = show ? 'none' : '';
    document.getElementById('rep-grid').style.display = show ? 'none' : '';
    document.getElementById('rep-live-output').hidden = !show;
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
    document.getElementById('rep-live-btn').addEventListener('click', generateLiveReport);
    document.getElementById('rep-publish-btn')?.addEventListener('click', publishLiveReport);
    document.getElementById('rep-analyze-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') runAnalyze(); });
    document.getElementById('rep-datesel').addEventListener('change', (e) => {
        loadReport(e.target.value).catch((err) => {
            document.getElementById('rep-grid').innerHTML = `<div class="rep-empty">Could not load ${esc(e.target.value)}: ${esc(err.message)}</div>`;
            document.getElementById('rep-live-output').hidden = true;
        });
    });
}

async function init() {
    bind();
    const idxResult = await loadIndex();
    populateDates(idxResult);
    try {
        if (idxResult.dates.length) await loadReport(idxResult.dates[0]);
        else await loadReport(null, true);
    } catch (e) {
        document.getElementById('rep-grid').innerHTML = `<div class="rep-empty">Report not available yet: ${esc(e.message)}</div>`;
    }
}

document.addEventListener('DOMContentLoaded', init);
