'use strict';

const state = {
    repos: [], devs: [], bots: [],
    tab: 'repos',
    search: '', category: 'all', stackLayer: 'all', sort: '',
    page: 1, perPage: 50,
    filtered: [],
    updatedAt: '',
};

function classifyStackLayer(repo) {
    const cat = repo.category || '';
    const name = (repo.name || '').toLowerCase();
    const desc = (repo.description || '').toLowerCase();
    const topics = (repo.topics || []).map(t => t.toLowerCase());
    const text = name + ' ' + desc + ' ' + topics.join(' ');

    if (/\b(infrastructure|inference|serving|deploy|gateway|orchestrat|compute|hosting|runtime|engine)\b/.test(text)) return 'Infra';
    if (/\b(framework|sdk|library|api|sdk|agent.*framework|orchestrat|protocol)\b/.test(text) && !/\b(demo|app|ui|dashboard|cli)\b/.test(text)) return 'Framework';
    if (/\b(dataset|benchmark|evaluation|eval|data.*pipeline|embedding|vector.*db|chroma|milvus|qdrant)\b/.test(text)) return 'Data';
    if (/\b(design|creative|media|video|image|audio|3d|render|animate|art|photo|music)\b/.test(text)) return 'Creative';
    if (/\b(dev.?tool|cli|plugin|extension|editor|terminal|git|ci|cd)\b/.test(text) || cat === 'Developer Tools') return 'Tool';
    if (/\b(app|platform|dashboard|studio|desktop|web.?ui|ui.?ux|demo|product|launcher)\b/.test(text) && cat !== 'Infrastructure') return 'Product';
    if (cat === 'Applications' || cat === 'Vision & Media') return 'Product';
    if (cat === 'Agents & Automation' || cat === 'AI Engineering') return 'Framework';
    if (cat === 'Infrastructure' || cat === 'Models & Inference') return 'Infra';
    if (cat === 'Data & Evaluation') return 'Data';
    if (cat === 'Research & Knowledge') return 'Framework';
    return 'Other';
}

const DATA_URL = 'data/ailist.json?v=' + Date.now();

const TAB_CONFIG = {
    repos: {
        label: 'repos',
        hasCategory: true,
        sorts: [
            ['stars_desc', 'Stars'],
            ['forks_desc', 'Forks'],
            ['name_asc', 'Name'],
        ],
        searchFields: (r) => [r.name, r.description, r.language, r.category, (r.topics || []).join(' ')].join(' '),
    },
    devs: {
        label: 'developers',
        hasCategory: false,
        sorts: [
            ['weighted_desc', 'Weighted'],
            ['contributions_desc', 'Contributions'],
            ['repos_desc', 'Repos'],
            ['login_asc', 'Name'],
        ],
        searchFields: (a) => [a.login, (a.top_repos || []).map((t) => t.name).join(' ')].join(' '),
    },
    bots: {
        label: 'bots',
        hasCategory: false,
        sorts: [
            ['weighted_desc', 'Weighted'],
            ['contributions_desc', 'Contributions'],
            ['repos_desc', 'Repos'],
            ['login_asc', 'Name'],
        ],
        searchFields: (a) => [a.login, (a.top_repos || []).map((t) => t.name).join(' ')].join(' '),
    },
};

function escapeHtml(v) {
    return String(v ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}
function fmt(n) {
    n = Number(n || 0);
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return n.toLocaleString();
}

function currentRows() {
    return state[state.tab];
}

// ── Filtering / sorting ───────────────────────────────────────────────────────
function applyFilters() {
    const cfg = TAB_CONFIG[state.tab];
    const q = state.search.trim().toLowerCase();
    let rows = currentRows().slice();

    if (state.tab === 'repos' && state.category !== 'all') {
        rows = rows.filter((r) => r.category === state.category);
    }
    if (state.tab === 'repos' && state.stackLayer !== 'all') {
        rows = rows.filter((r) => classifyStackLayer(r) === state.stackLayer);
    }
    if (q) {
        const terms = q.split(',').map((t) => t.trim()).filter(Boolean);
        rows = rows.filter((r) => {
            const hay = cfg.searchFields(r).toLowerCase();
            return terms.every((t) => hay.includes(t));
        });
    }

    rows.sort((a, b) => {
        switch (state.sort) {
            case 'stars_desc': return b.stars - a.stars;
            case 'forks_desc': return b.forks - a.forks;
            case 'weighted_desc': return b.weighted - a.weighted;
            case 'contributions_desc': return b.contributions - a.contributions;
            case 'repos_desc': return b.repos - a.repos;
            case 'name_asc': return a.name.localeCompare(b.name);
            case 'login_asc': return a.login.localeCompare(b.login);
            default: return 0;
        }
    });

    state.filtered = rows;
    const totalPages = Math.max(1, Math.ceil(rows.length / state.perPage));
    if (state.page > totalPages) state.page = totalPages;
    render();
    syncUrl();
}

// ── Rendering ─────────────────────────────────────────────────────────────────
function render() {
    renderHead();
    renderBody();
    renderPagination();
    document.getElementById('ail-meta').textContent = state.filtered.length.toLocaleString() + ' ' + TAB_CONFIG[state.tab].label;
    renderCopyLabel();
}

function renderHead() {
    const thead = document.getElementById('ail-thead');
    if (state.tab === 'repos') {
        thead.innerHTML = `<tr><th class="ail-num">#</th><th>Repo</th><th class="ail-right">Stars</th><th class="ail-right ail-hide-sm">Forks</th><th class="ail-hide-sm">Language</th><th class="ail-hide-sm">Category</th><th class="ail-hide-sm">Description</th></tr>`;
    } else {
        const who = state.tab === 'bots' ? 'Bot' : 'Developer';
        thead.innerHTML = `<tr><th class="ail-num">#</th><th>${who}</th><th class="ail-right">Repos</th><th class="ail-right">Contributions</th><th class="ail-right ail-hide-sm">Weighted</th><th class="ail-hide-sm">Top repos</th></tr>`;
    }
}

function renderBody() {
    const tbody = document.getElementById('ail-tbody');
    const start = (state.page - 1) * state.perPage;
    const page = state.filtered.slice(start, start + state.perPage);
    const colspan = state.tab === 'repos' ? 7 : 6;

    if (!page.length) {
        tbody.innerHTML = `<tr><td colspan="${colspan}" class="ail-empty">No matches. Try a broader search.</td></tr>`;
        return;
    }

    if (state.tab === 'repos') {
        tbody.innerHTML = page.map((r) => `
            <tr>
                <td class="ail-num">${r.rank}</td>
                <td>
                    <a class="ail-repo-name" href="${escapeHtml(r.url)}" target="_blank" rel="noreferrer">${escapeHtml(r.repo_name)}</a>
                    <div class="ail-owner">${escapeHtml(r.owner)}</div>
                </td>
                <td class="ail-right">${fmt(r.stars)}</td>
                <td class="ail-right ail-hide-sm">${fmt(r.forks)}</td>
                <td class="ail-hide-sm">${escapeHtml(r.language || '—')}</td>
                <td class="ail-hide-sm"><span class="ail-pill">${escapeHtml(r.category)}</span></td>
                <td class="ail-hide-sm"><div class="ail-desc">${escapeHtml(r.description)}</div></td>
            </tr>`).join('');
        return;
    }

    tbody.innerHTML = page.map((a) => {
        const top = (a.top_repos || []).map((t) =>
            `<a class="ail-pill" href="https://github.com/${escapeHtml(t.name)}" target="_blank" rel="noreferrer">${escapeHtml(t.name)}</a>`).join('');
        return `
            <tr>
                <td class="ail-num">${a.rank}</td>
                <td>
                    <div class="ail-acct">
                        <img class="ail-avatar" src="${escapeHtml(a.avatar_url)}" alt="" loading="lazy" width="34" height="34">
                        <a class="ail-acct-name" href="${escapeHtml(a.profile_url)}" target="_blank" rel="noreferrer">${escapeHtml(a.login)}</a>
                    </div>
                </td>
                <td class="ail-right">${a.repos.toLocaleString()}</td>
                <td class="ail-right">${a.contributions.toLocaleString()}</td>
                <td class="ail-right ail-hide-sm">${a.weighted.toLocaleString()}</td>
                <td class="ail-hide-sm"><div class="ail-toprepos">${top}</div></td>
            </tr>`;
    }).join('');
}

function renderPagination() {
    const total = Math.max(1, Math.ceil(state.filtered.length / state.perPage));
    document.getElementById('ail-page-info').textContent = state.page + ' / ' + total;
    document.getElementById('ail-prev').disabled = state.page <= 1;
    document.getElementById('ail-next').disabled = state.page >= total;
}

function renderTabs() {
    document.querySelectorAll('.ail-tab').forEach((b) => b.classList.toggle('active', b.dataset.tab === state.tab));
    const showCat = TAB_CONFIG[state.tab].hasCategory;
    document.getElementById('category-wrap').style.display = showCat ? '' : 'none';
    document.getElementById('ail-stack').closest('.control').style.display = showCat ? '' : 'none';
}

function populateControls() {
    // sort
    const sortSel = document.getElementById('ail-sort');
    sortSel.innerHTML = TAB_CONFIG[state.tab].sorts.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');
    if (!state.sort || !TAB_CONFIG[state.tab].sorts.some(([v]) => v === state.sort)) {
        state.sort = TAB_CONFIG[state.tab].sorts[0][0];
    }
    sortSel.value = state.sort;

    // category (repos only)
    const catSel = document.getElementById('ail-category');
    const cats = [...new Set(state.repos.map((r) => r.category))].sort();
    catSel.innerHTML = `<option value="all">All categories (${state.repos.length})</option>` +
        cats.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)} (${state.repos.filter((r) => r.category === c).length})</option>`).join('');
    catSel.value = state.category;

    document.getElementById('ail-search').value = state.search;
    document.getElementById('ail-stack').value = state.stackLayer;
}

// ── Export / copy / share ─────────────────────────────────────────────────────
function rowsForExport() { return state.filtered; }

function buildRows() {
    const rows = rowsForExport();
    if (state.tab === 'repos') {
        return { header: ['rank', 'repo', 'url', 'stars', 'forks', 'language', 'category'], lines: rows.map((r) => [r.rank, r.name, r.url, r.stars, r.forks, r.language, r.category]) };
    }
    return { header: ['rank', 'login', 'profile', 'repos', 'contributions', 'weighted', 'top_repos'], lines: rows.map((a) => [a.rank, a.login, a.profile_url, a.repos, a.contributions, a.weighted, (a.top_repos || []).map((t) => t.name).join('|')]) };
}

function csvCell(v) { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s; }
function buildCsv() { const { header, lines } = buildRows(); return [header.join(','), ...lines.map((l) => l.map(csvCell).join(','))].join('\n'); }
function buildMd() {
    const { header, lines } = buildRows();
    return [`# AI Landscape — ${state.tab} (${lines.length})`, '', '| ' + header.join(' | ') + ' |', '| ' + header.map(() => '---').join(' | ') + ' |',
        ...lines.map((l) => '| ' + l.map((c) => String(c ?? '').replaceAll('|', '\\|')).join(' | ') + ' |')].join('\n');
}

async function copyText(t) {
    try { await navigator.clipboard.writeText(t); return true; } catch { return false; }
}
function download(name, content) {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
function flash(id, label, restore) {
    const el = document.querySelector(`#${id} span`) || document.getElementById(id);
    if (!el) return;
    const span = el.querySelector ? el : el;
    const target = span.tagName === 'SPAN' ? span : (span.querySelector('span') || span);
    const old = restore ?? target.textContent;
    target.textContent = label;
    setTimeout(() => { target.textContent = old; }, 1400);
}
function renderCopyLabel() {
    const el = document.querySelector('#ail-copy span');
    if (el) el.textContent = `Copy filtered (${state.filtered.length})`;
}

// ── URL state ─────────────────────────────────────────────────────────────────
function syncUrl() {
    const p = new URLSearchParams();
    if (state.tab !== 'repos') p.set('tab', state.tab);
    if (state.search.trim()) p.set('q', state.search.trim());
    if (state.category !== 'all') p.set('category', state.category);
    if (state.stackLayer !== 'all') p.set('stack', state.stackLayer);
    const url = new URL(window.location.href);
    url.search = p.toString();
    window.history.replaceState({}, '', url);
}
function restoreUrl() {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('tab');
    if (t && TAB_CONFIG[t]) state.tab = t;
    state.search = p.get('q') || '';
    state.category = p.get('category') || 'all';
    state.stackLayer = p.get('stack') || 'all';
}

// ── Ask AI ────────────────────────────────────────────────────────────────────
const AI_URL_SOFT_LIMIT = 7500;
const PROMPTS_STORAGE_KEY = 'ai-list-custom-prompts';
const BUILTIN_PROMPTS = {
    repos: [
        ['🔥 Landscape', [
            ['What are the major themes in this AI list and which repos define each? Group them and name the standout project per theme.', 'Themes & standouts'],
            ['Which of these repos are the de-facto standards vs the promising challengers? Tell me when to pick the challenger.', 'Standard vs challenger'],
            ['Identify fast-rising or underrated repos here that are not yet mainstream, and explain why each is worth watching.', 'Underrated / rising'],
        ]],
        ['🛠️ Build', [
            ['I want to build an AI app. Which of these repos make the best foundation, and how would they fit together in a stack?', 'Best foundation stack'],
            ['Which repos are easiest to self-host with minimal setup? Prioritize good docs, Docker, low dependencies.', 'Easy to self-host'],
        ]],
    ],
    devs: [
        ['👤 People', [
            ['Who are the most influential developers in this list and what are they known for? Summarize each in one line.', 'Who are they'],
            ['Group these developers by the area they work in (frameworks, models, agents, infra, tooling) and name the leaders in each.', 'Group by area'],
            ['Which of these developers would be most valuable to follow or learn from, and why?', 'Who to follow'],
        ]],
    ],
    bots: [
        ['🤖 Automation', [
            ['What does each of these bots do, and which are worth adding to my own AI repo? Rank by usefulness.', 'What & worth adding'],
            ['Group these bots by purpose (dependencies, CI, code review, security) and recommend a minimal set for a healthy repo.', 'Minimal bot setup'],
        ]],
    ],
};

function aiRows() {
    const limit = Number(document.getElementById('ail-ask-count').value);
    const rows = state.filtered;
    return limit > 0 ? rows.slice(0, limit) : rows;
}
function defaultQuestion() {
    if (state.tab === 'repos') return 'Here is a list of open-source AI repositories. Give me a concise overview, group them by purpose, highlight the strongest, and recommend which to try first.';
    if (state.tab === 'devs') return 'Here is a list of top open-source AI developers and what they work on. Summarize who the key people are and what each is known for.';
    return 'Here is a list of bots active across open-source AI repos. Explain what each does and which are worth adopting.';
}
function buildAiList(rows) {
    if (state.tab === 'repos') {
        return rows.map((r, i) => `${i + 1}. ${r.name} (${fmt(r.stars)}★) — https://github.com/${r.name} — ${(r.description || '').slice(0, 140)}`).join('\n');
    }
    return rows.map((a, i) => `${i + 1}. ${a.login} — ${a.contributions.toLocaleString()} contributions across ${a.repos} AI repos — top: ${(a.top_repos || []).map((t) => t.name).join(', ')} — ${a.profile_url}`).join('\n');
}
function buildPrompt() {
    const q = (document.getElementById('ail-ask-question').value || defaultQuestion()).trim();
    const rows = aiRows();
    return `${q}\n\n${state.tab[0].toUpperCase() + state.tab.slice(1)} (${rows.length}):\n${buildAiList(rows)}`;
}
function aiUrl(query) { return 'https://www.google.com/search?q=' + encodeURIComponent(query.trim()) + '&udm=50'; }

function renderAiPreview() {
    const prompt = buildPrompt();
    const rows = aiRows();
    document.getElementById('ail-ask-preview').value = prompt;
    const len = aiUrl(prompt).length;
    document.getElementById('ail-ask-meter').textContent = `${rows.length} ${state.tab} • ${prompt.length.toLocaleString()} chars • URL ~${len.toLocaleString()}`;
    document.getElementById('ail-ask-context').textContent = state.filtered.length === rows.length
        ? `Asking about all ${rows.length} filtered ${state.tab}.`
        : `Asking about the top ${rows.length} of ${state.filtered.length} filtered ${state.tab}.`;
    const warn = document.getElementById('ail-ask-warning');
    if (len > AI_URL_SOFT_LIMIT) { warn.hidden = false; warn.textContent = 'Long prompt — Google may trim it. It is copied to your clipboard as a backup.'; }
    else { warn.hidden = true; }
}
function renderPromptsMenu() {
    const menu = document.getElementById('ail-prompts-menu');
    const groups = BUILTIN_PROMPTS[state.tab] || [];
    let html = groups.map(([title, items]) =>
        `<div class="prompts-group"><div class="prompts-group-title">${title}</div>` +
        items.map(([prompt, label]) => `<button class="prompts-item" data-prompt="${escapeHtml(prompt)}">${escapeHtml(label)}</button>`).join('') +
        `</div>`).join('');
    const custom = loadCustomPrompts();
    html += `<div class="prompts-divider"></div>`;
    if (custom.length) {
        html += `<div class="prompts-group"><div class="prompts-group-title">📝 Your Prompts</div>` +
            custom.map((p, i) => `<div class="prompts-custom-item" data-index="${i}"><span class="prompts-custom-text">${escapeHtml(p)}</span><button class="prompts-del" data-index="${i}" type="button" aria-label="Delete">✕</button></div>`).join('') +
            `</div>`;
    }
    html += `<button class="prompts-add-btn" id="ail-prompts-add" type="button">➕ Add your own prompt</button>`;
    menu.innerHTML = html;

    menu.querySelectorAll('.prompts-item[data-prompt]').forEach((el) => el.addEventListener('click', () => injectPrompt(el.dataset.prompt)));
    menu.querySelectorAll('.prompts-custom-item').forEach((el) => el.addEventListener('click', (e) => {
        if (e.target.closest('.prompts-del')) return;
        const c = loadCustomPrompts(); if (c[el.dataset.index]) injectPrompt(c[el.dataset.index]);
    }));
    menu.querySelectorAll('.prompts-del').forEach((b) => b.addEventListener('click', (e) => {
        e.stopPropagation(); const c = loadCustomPrompts(); c.splice(Number(b.dataset.index), 1); saveCustomPrompts(c); renderPromptsMenu();
    }));
    document.getElementById('ail-prompts-add').addEventListener('click', () => {
        const t = window.prompt('Enter your custom prompt:');
        if (t && t.trim()) { const c = loadCustomPrompts(); c.push(t.trim()); saveCustomPrompts(c); renderPromptsMenu(); injectPrompt(t.trim()); }
    });
}
function loadCustomPrompts() { try { return JSON.parse(localStorage.getItem(PROMPTS_STORAGE_KEY)) || []; } catch { return []; } }
function saveCustomPrompts(p) { localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(p)); }
function injectPrompt(text) { const ta = document.getElementById('ail-ask-question'); ta.value = text; renderAiPreview(); closePromptsMenu(); }
function closePromptsMenu() { document.getElementById('ail-prompts-menu').hidden = true; document.getElementById('ail-prompts-btn').classList.remove('open'); }
function togglePromptsMenu() { const m = document.getElementById('ail-prompts-menu'); const open = !m.hidden; if (open) { closePromptsMenu(); } else { renderPromptsMenu(); m.hidden = false; document.getElementById('ail-prompts-btn').classList.add('open'); } }

function openAsk() {
    if (!state.filtered.length) return;
    closePromptsMenu();
    const qta = document.getElementById('ail-ask-question');
    qta.value = defaultQuestion();
    document.getElementById('ail-ask-title').textContent = 'Ask AI about these ' + state.tab;
    renderAiPreview();
    document.getElementById('ail-ask-backdrop').hidden = false;
    const m = document.getElementById('ail-ask-modal'); m.classList.add('open'); m.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
}
function closeAsk() {
    closePromptsMenu();
    document.getElementById('ail-ask-backdrop').hidden = true;
    const m = document.getElementById('ail-ask-modal'); m.classList.remove('open'); m.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
}
async function launchAsk() {
    const prompt = buildPrompt();
    await copyText(prompt);
    window.open(aiUrl(prompt), '_blank', 'noopener');
    const span = document.querySelector('#ail-ask-open span');
    if (span) { span.textContent = 'Opened ✓ (copied)'; setTimeout(() => { span.textContent = 'Open in Google AI Mode'; }, 1800); }
}

// ── Wiring ────────────────────────────────────────────────────────────────────
function switchTab(tab) {
    if (tab === state.tab) return;
    state.tab = tab;
    state.page = 1;
    state.search = '';
    state.category = 'all';
    renderTabs();
    populateControls();
    applyFilters();
}

function bind() {
    document.querySelectorAll('.ail-tab').forEach((b) => b.addEventListener('click', () => switchTab(b.dataset.tab)));

    let timer;
    document.getElementById('ail-search').addEventListener('input', (e) => {
        clearTimeout(timer); timer = setTimeout(() => { state.search = e.target.value; state.page = 1; applyFilters(); }, 250);
    });
    document.getElementById('ail-category').addEventListener('change', (e) => { state.category = e.target.value; state.page = 1; applyFilters(); });
    document.getElementById('ail-stack').addEventListener('change', (e) => { state.stackLayer = e.target.value; state.page = 1; applyFilters(); });
    document.getElementById('ail-sort').addEventListener('change', (e) => { state.sort = e.target.value; applyFilters(); });
    document.getElementById('ail-prev').addEventListener('click', () => { if (state.page > 1) { state.page--; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });
    document.getElementById('ail-next').addEventListener('click', () => { const t = Math.ceil(state.filtered.length / state.perPage); if (state.page < t) { state.page++; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); } });

    document.getElementById('ail-copy').addEventListener('click', async () => {
        const ok = await copyText(buildMd());
        flash('ail-copy', ok ? 'Copied ✓' : 'Failed', `Copy filtered (${state.filtered.length})`);
    });
    document.getElementById('ail-share').addEventListener('click', async () => { const ok = await copyText(window.location.href); flash('ail-share', ok ? 'Copied URL' : 'Failed', 'Share URL'); });
    document.getElementById('ail-csv').addEventListener('click', () => { download(`ai-landscape-${state.tab}.csv`, buildCsv()); flash('ail-csv', 'Done', 'CSV'); });
    document.getElementById('ail-md').addEventListener('click', () => { download(`ai-landscape-${state.tab}.md`, buildMd()); flash('ail-md', 'Done', 'MD'); });

    document.getElementById('ail-ask-ai').addEventListener('click', openAsk);
    document.getElementById('ail-ask-close').addEventListener('click', closeAsk);
    document.getElementById('ail-ask-backdrop').addEventListener('click', closeAsk);
    document.getElementById('ail-ask-count').addEventListener('change', renderAiPreview);
    document.getElementById('ail-ask-question').addEventListener('input', renderAiPreview);
    document.getElementById('ail-ask-open').addEventListener('click', launchAsk);
    document.getElementById('ail-ask-copy').addEventListener('click', async () => { const ok = await copyText(buildPrompt()); flash('ail-ask-copy', ok ? 'Copied ✓' : 'Failed', 'Copy prompt'); });
    document.getElementById('ail-prompts-btn').addEventListener('click', (e) => { e.stopPropagation(); togglePromptsMenu(); });
    document.addEventListener('click', (e) => { const w = document.querySelector('.ai-ask-prompts-wrapper'); if (w && !w.contains(e.target)) closePromptsMenu(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && document.getElementById('ail-ask-modal').classList.contains('open')) closeAsk(); });
}

async function load() {
    const res = await fetch(DATA_URL);
    if (!res.ok) throw new Error('ailist.json HTTP ' + res.status);
    const d = await res.json();
    state.repos = d.repos || [];
    state.devs = d.devs || [];
    state.bots = d.bots || [];
    state.updatedAt = d.updated_at || '';

    document.getElementById('stat-repos').textContent = fmt(state.repos.length);
    document.getElementById('stat-devs').textContent = fmt(state.devs.length);
    document.getElementById('stat-bots').textContent = fmt(state.bots.length);
    document.getElementById('stat-updated').textContent = state.updatedAt ? new Date(state.updatedAt).toLocaleDateString() : '-';
    document.getElementById('count-repos').textContent = state.repos.length.toLocaleString();
    document.getElementById('count-devs').textContent = state.devs.length.toLocaleString();
    document.getElementById('count-bots').textContent = state.bots.length.toLocaleString();

    renderTabs();
    populateControls();
    applyFilters();
}

document.addEventListener('DOMContentLoaded', () => {
    restoreUrl();
    bind();
    load().catch((e) => {
        document.getElementById('ail-tbody').innerHTML = `<tr><td colspan="7" class="ail-empty">Failed to load data: ${escapeHtml(e.message)}</td></tr>`;
    });
});
