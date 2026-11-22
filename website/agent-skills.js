(function () {
    'use strict';

    const scriptEl = document.currentScript;
    const DATA_URL = (scriptEl && scriptEl.dataset.src) || 'data/agent-skills.json';
    const INIT_TYPE = (scriptEl && scriptEl.dataset.initTab) || 'agents';
    const INIT_UC = (scriptEl && scriptEl.dataset.initUc) || '';
    const SINGLE_TYPE = INIT_TYPE === 'agents' || INIT_TYPE === 'skills';
    const PAGE_TITLE = SINGLE_TYPE
        ? (INIT_TYPE === 'agents' ? '🤖 AI Agents' : '🛠️ AI Skills')
        : '🤖 AI Agents & Skills';

    const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';
    const LLM7_TOKEN = 'LLM7_TOKEN_PLACEHOLDER';

    const $ = (id) => document.getElementById(id);

    const state = {
        data: null,
        type: SINGLE_TYPE ? INIT_TYPE : INIT_TYPE, // 'agents' | 'skills' | 'all'
        board: 'allTime',
        view: 'grid', // 'grid' | 'list'
        search: INIT_UC || '',
        useCase: INIT_UC || '',
        chipsCollapsed: window.innerWidth <= 640, // mobile mặc định collapse
        verifiedIds: new Set(), // skill IDs đã verified
        abortCtrl: null,
        selected: new Set(), // stack: skill ids selected
    };

    const STORAGE_KEY = `stack_selected_${state.type}`;

    const BOARD_TABS = [
        { key: 'allTime', label: 'All Time', icon: '⏱️' },
        { key: 'trending', label: 'Trending', icon: '📈' },
        { key: 'hot', label: 'Hot', icon: '🔥' },
        { key: 'allResource', label: 'All Resource', icon: '📦' },
    ];

    // ---------- helpers ----------
    function esc(s) {
        if (s === null || s === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    function fmtNum(n) {
        n = Number(n) || 0;
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
        return String(n);
    }

    function relativeTime(iso) {
        if (!iso) return '';
        try {
            const ms = Date.now() - new Date(iso).getTime();
            const hrs = Math.floor(ms / 36e5);
            if (hrs < 1) return 'just now';
            if (hrs < 24) return `${hrs}h ago`;
            return Math.floor(hrs / 24) + 'd ago';
        } catch { return ''; }
    }

    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // ---------- stack (selected skills) ----------
    function loadSelected() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const arr = JSON.parse(raw);
                if (Array.isArray(arr)) state.selected = new Set(arr);
            }
        } catch { /* ignore */ }
        // support ?stack=base64 in URL (shareable stack link, no backend needed)
        try {
            const params = new URLSearchParams(window.location.search);
            const stack = params.get('stack');
            if (stack) {
                const decoded = atob(stack.replace(/-/g, '+').replace(/_/g, '/'));
                const ids = decoded.split(',').filter(Boolean);
                ids.forEach(id => state.selected.add(id));
                // clean url without reloading
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch { /* ignore */ }
    }

    function saveSelected() {
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.selected])); } catch {}
    }

    function toggleSelect(id, checked) {
        if (checked) state.selected.add(id); else state.selected.delete(id);
        saveSelected();
        renderItems();
        renderFab();
        renderStackBadge();
    }

    function isSelected(id) {
        return state.selected.has(id);
    }

    function buildStackData() {
        const ids = [...state.selected];
        const items = (state.data && state.data.items) || [];
        const byId = {};
        items.forEach(it => { byId[it.name] = it; });
        const skills = ids.map(id => byId[id]).filter(Boolean);
        const b64 = btoa(ids.join(','))
            .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        const stackLink = window.location.origin + window.location.pathname + '?stack=' + b64;
        const installCmd = `npx claude-code-templates@latest --skill ${ids.join(',')}`;
        return { ids, skills, stackLink, installCmd };
    }

    // ---------- render: stats + chips ----------
    function renderStats(d) {
        const s = d.stats || {};
        const updatedEl = $('as-updated');
        if (updatedEl) updatedEl.textContent = '· updated ' + relativeTime(d.updated_at);

        const statsEl = $('as-stats');
        if (statsEl) {
            statsEl.innerHTML = `
                <div class="hf-stat"><div class="hf-stat-val">${s.count || s.agents || 0}</div><div class="hf-stat-lbl">${esc(PAGE_TITLE)}</div></div>
                <div class="hf-stat"><div class="hf-stat-val">${s.use_cases || 0}</div><div class="hf-stat-lbl">use cases</div></div>
            `;
        }

        const cAgents = $('as-c-agents');
        const cSkills = $('as-c-skills');
        if (cAgents) cAgents.textContent = `(${s.agents || 0})`;
        if (cSkills) cSkills.textContent = `(${s.skills || 0})`;
    }

    function renderStackBadge() {
        const el = $('stack-badge');
        if (!el) return;
        const n = state.selected.size;
        el.hidden = n === 0;
        el.textContent = n;
    }

    function renderChips(d) {
        const chips = $('as-chips');
        if (!chips) return;
        const ucs = d.use_cases || [];
        const icons = {
            ai: '🧠', coding: '💻', marketing: '📣', writing: '✍️', design: '🎨',
            sales: '💰', research: '🔬', data: '📊', finance: '🏦', legal: '⚖️',
            healthcare: '🏥', education: '📚', 'customer-support': '🎧', productivity: '⚡',
        };
        const pills = ucs.map(uc => `<button class="as-chip${uc === state.useCase ? ' active' : ''}" data-uc="${esc(uc)}" type="button">${icons[uc] || '📌'} ${esc(uc)}</button>`).join('');
        const clearBtn = '<button class="as-chip as-chip-clear" id="as-chip-clear" type="button"' + (state.useCase ? '' : ' hidden') + '>✕ Clear</button>';

        if (state.chipsCollapsed) {
            chips.innerHTML = `
                <div class="as-chips-title" role="button" aria-expanded="${state.useCase ? 'true' : 'false'}" aria-label="Filter by use case" onclick="appToggleChips()">
                    <span>🏷️ Filter by use case</span>
                    <span class="as-chips-arrow">▾</span>
                </div>
                <div class="as-chips-body${state.useCase ? '' : ' hidden'}">
                    ${pills}${clearBtn}
                </div>
            `;
        } else {
            chips.innerHTML = '<span class="as-chips-label">Filter by use case:</span> ' +
                pills +
                clearBtn;
        }
    }

    window.appToggleChips = function () {
        state.chipsCollapsed = !state.chipsCollapsed;
        if (state.data) renderChips(state.data);
    };

    function renderBoardTabs() {
        const board = $('as-board');
        if (!board) return;
        board.innerHTML = BOARD_TABS.map(b => {
            const active = state.board === b.key;
            return `<button class="as-board-tab${active ? ' active' : ''}" data-board="${esc(b.key)}" type="button" title="${esc(b.label)}">${b.icon} ${esc(b.label)}</button>`;
        }).join('');
    }

    // ---------- filter + render grid ----------
    function getItems() {
        if (!state.data) return [];
        if (state.data.items) {
            return state.data.items;
        }
        if (state.type === 'all') {
            return [...(state.data.agents || []), ...(state.data.skills || [])];
        }
        return state.type === 'agents' ? state.data.agents : state.data.skills;
    }

    function filterItems() {
        let items = getItems();
        const q = state.search.trim().toLowerCase();
        const uc = state.useCase;

        if (q) {
            const terms = q.split(/\s+/);
            items = items.filter(it => {
                const hay = [
                    it.name, it.description, it.category,
                    Array.isArray(it.topics) ? it.topics.join(' ') : '',
                    Array.isArray(it.use_cases) ? it.use_cases.join(' ') : '',
                    it.language || '',
                ].filter(Boolean).join(' ').toLowerCase();
                return terms.every(t => hay.includes(t));
            });
        }

        if (uc) {
            items = items.filter(it => Array.isArray(it.use_cases) && it.use_cases.includes(uc));
        }

        const sorted = [...items];
        if (state.board === 'trending') {
            sorted.sort((a, b) => (b.delta_7d || 0) - (a.delta_7d || 0));
        } else if (state.board === 'hot') {
            sorted.sort((a, b) => (b.stars || 0) - (a.stars || 0));
        } else {
            sorted.sort((a, b) => (b.value_score || b.stars || 0) - (a.value_score || a.stars || 0));
        }
        return sorted;
    }

    function valueBadge(item) {
        const v = Number(item.value_score || 0);
        if (!v) return '';
        return `<span class="as-card-value">💎 ${v.toFixed(1)}</span>`;
    }

    function selectTick(id) {
        const sel = isSelected(id);
        return `
            <button class="as-select-tick${sel ? ' selected' : ''}" type="button" aria-label="${sel ? 'Bỏ chọn' : 'Chọn'}" data-id="${esc(id)}">
                ${sel ? '✓' : '+'}
            </button>
        `;
    }

    function renderSelectAllBar(items) {
        const grid = $('as-grid');
        if (!grid) return;
        const old = $('as-select-all-bar');
        if (old) old.remove();
        if (!items.length) return;
        const allSelected = items.every(it => isSelected(it.name));
        const bar = document.createElement('div');
        bar.id = 'as-select-all-bar';
        bar.className = 'as-select-all-bar';
        bar.innerHTML = `
            <label class="as-select-all" style="display:inline-flex;align-items:center;gap:8px;cursor:pointer">
                <input type="checkbox" id="as-select-all-cb" ${allSelected ? 'checked' : ''}>
                <span>Chọn tất cả (${items.length})</span>
            </label>
            <span class="as-select-all-info" style="font-size:0.78rem;color:var(--text-muted);margin-left:auto">${state.selected.size} đã chọn</span>
        `;
        grid.parentNode.insertBefore(bar, grid);
        const cb = $('as-select-all-cb');
        if (cb) {
            cb.addEventListener('change', (e) => {
                const check = e.target.checked;
                items.forEach(it => toggleSelect(it.name, check));
            });
        }
    }

    function renderCard(item) {
        const tags = (item.topics || []).slice(0, 4).map(t => `<span class="as-tag">${esc(t)}</span>`).join('');
        const ucs = (item.use_cases || []).map(uc => `<span class="as-uc-tag">${esc(uc)}</span>`).join('');
        const lang = item.language ? `<span class="as-tag as-tag-lang">${esc(item.language)}</span>` : '';
        const typeTag = item.is_agent ? '<span class="as-tag as-tag-agent">Agent</span>' :
            item.is_skill ? '<span class="as-tag as-tag-skill">Skill</span>' : '';
        const popLabel = item.downloads ? '⬇' : '⭐';
        const popVal = item.downloads ? item.downloads : item.stars;
        const skillId = item._skill_id || item.name;
        const verifiedBadge = state.verifiedIds.has(skillId)
            ? '<span class="as-tag as-tag-verified" title="Đã xác thực">✅ Verified</span>'
            : '';
        return `
            <div class="as-card${isSelected(item.name) ? ' as-card-selected' : ''}">
                <div class="as-card-hd">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <a class="as-card-name" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.name)}</a>
                        ${verifiedBadge}
                        ${valueBadge(item)}
                    </div>
                    <div style="display:flex;align-items:center;gap:6px">
                        ${selectTick(item.name)}
                        <span class="as-card-stars">${popLabel} ${fmtNum(popVal)}</span>
                    </div>
                </div>
                <div class="as-card-desc">${esc(item.description || '')}</div>
                <div class="as-card-cat">${typeTag}${item.category} ${item.delta_7d > 0 ? `· <span class="as-up">+${fmtNum(item.delta_7d)}/wk</span>` : ''}</div>
                <div class="as-card-tags">${ucs}${tags}${lang}</div>
            </div>
        `;
    }

    function renderItems() {
        const grid = $('as-grid');
        const empty = $('as-empty');
        if (!grid) return;
        const items = filterItems();
        const count = items.length;

        const countEl = $('as-count');
        if (countEl) countEl.textContent = `${count} shown`;

        if (!count) {
            grid.innerHTML = '';
            if (empty) {
                empty.hidden = false;
                empty.innerHTML = `<div class="hf-empty">No items match your search. Try a different term or use case.</div>`;
            }
            const bar = $('as-select-all-bar');
            if (bar) bar.remove();
            return;
        }
        if (empty) empty.hidden = true;

        const isList = state.view === 'list';
        grid.classList.toggle('as-list', isList);
        grid.innerHTML = items.map(renderCard).join('');

        // event delegation for select ticks
        grid.querySelectorAll('.as-select-tick').forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                toggleSelect(id, !isSelected(id));
            });
        });

        renderSelectAllBar(items);
    }

    // ---------- LLM7 AI matching ----------
    async function llm7(messages, temperature, signal) {
        const res = await fetch(LLM7_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${LLM7_TOKEN}` },
            body: JSON.stringify({ model: 'default', messages, temperature: temperature ?? 0.5 }),
            signal,
        });
        if (!res.ok) throw new Error('LLM7 HTTP ' + res.status);
        const d = await res.json();
        return d?.choices?.[0]?.message?.content || '';
    }

    function setAskAILoading(loading) {
        const btn = $('as-ai-btn');
        const cancel = $('as-ai-cancel');
        if (!btn) return;
        if (loading) {
            btn.disabled = true;
            btn.hidden = true;
            if (cancel) cancel.hidden = false;
        } else {
            btn.disabled = false;
            btn.hidden = false;
            if (cancel) cancel.hidden = true;
        }
    }

    function buildMatchPrompt(items, query) {
        const list = items.slice(0, 30).map((r, i) =>
            `${i + 1}. ${r.name} ⭐${r.stars} | ${r.category} | ${(r.description || '').slice(0, 120)} | use-cases: ${(r.use_cases || []).join(', ')} | value=${(r.value_score || 0).toFixed(1)}`
        ).join('\n');
        const typeLabel = state.type === 'agents' ? 'agent/AI-agent' : 'tool/framework/skill';
        return `I have these ${typeLabel}s that could match the query "${query}". From this list, recommend the TOP 3 most relevant ones and explain WHY each fits. Be specific.

${list}

Return as: **Name** — why it fits (1-2 sentences). Focus on the query need: "${query}"`;
    }

    async function runAskAI() {
        if (state.abortCtrl) {
            state.abortCtrl.abort();
            state.abortCtrl = null;
            setAskAILoading(false);
            return;
        }

        const items = filterItems();

        if (!items.length) {
            const result = $('as-ai-result');
            if (result) {
                result.hidden = false;
                result.innerHTML = '<div class="as-ai-note" style="color:var(--warning)">No items to analyze. Try a broader search.</div>';
            }
            return;
        }

        state.abortCtrl = new AbortController();
        setAskAILoading(true);
        const result = $('as-ai-result');
        if (result) {
            result.hidden = false;
            result.innerHTML = '<div class="rep-note">Analyzing…</div>';
        }

        try {
            const query = state.search.trim() || (state.useCase || 'best ' + state.type);
            const prompt = buildMatchPrompt(items, query);
            const raw = await llm7([
                { role: 'system', content: 'You are a senior AI engineer recommending the best open-source tools. Be specific and opinionated.' },
                { role: 'user', content: prompt },
            ], 0.3, state.abortCtrl.signal);
            const text = raw.replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();
            if (result) {
                result.innerHTML = '<div class="as-ai-head">🤖 AI Recommendation</div>' +
                    '<div class="as-ai-body">' + text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</div>' +
                    '<div class="as-ai-meta">LLM7 · based on ' + items.length + ' items</div>';
            }
        } catch (e) {
            if (result) {
                if (e.name === 'AbortError') {
                    result.innerHTML = '<div class="as-ai-note">⏹️ Đã hủy yêu cầu.</div>';
                } else {
                    result.innerHTML = '<div class="as-ai-note" style="color:var(--warning)">⚠️ ' + esc(e.message) + '</div>';
                }
            }
        }
        state.abortCtrl = null;
        setAskAILoading(false);
    }

    // ---------- stack UI (fab + sidebar) ----------
    function ensureStackUI() {
        if ($('stack-fab')) return;
        const fab = document.createElement('div');
        fab.id = 'stack-fab';
        fab.className = 'stack-fab';
        fab.innerHTML = `
            <button id="stack-fab-btn" type="button" aria-label="Xem stack đã chọn">
                <span class="stack-fab-icon">📦</span>
                <span id="stack-fab-count" class="stack-fab-count">0</span>
            </button>
        `;
        document.body.appendChild(fab);

        const sidebar = document.createElement('div');
        sidebar.id = 'stack-sidebar';
        sidebar.className = 'stack-sidebar';
        sidebar.innerHTML = `
            <div class="stack-overlay" id="stack-overlay" onclick="appCloseStack()"></div>
            <div class="stack-panel" id="stack-panel">
                <div class="stack-header">
                    <span class="stack-title">Stack đã chọn <span id="stack-panel-count">0</span></span>
                    <button id="stack-close" type="button" onclick="appCloseStack()">✕</button>
                </div>
                <div class="stack-list" id="stack-list"></div>
                <div class="stack-actions">
                    <div class="stack-field">
                        <label class="stack-field-label">Lệnh cài đặt</label>
                        <div class="stack-field-wrap">
                            <input id="stack-install-cmd" readonly>
                            <button id="stack-copy-cmd" type="button">Sao chép lệnh</button>
                        </div>
                    </div>
                    <div class="stack-field">
                        <label class="stack-field-label">Link stack (chia sẻ)</label>
                        <div class="stack-field-wrap">
                            <input id="stack-link" readonly>
                            <button id="stack-copy-link" type="button">Sao chép link</button>
                        </div>
                    </div>
                    <div class="stack-copy-options" style="display:flex;gap:6px;margin-top:8px">
                        <button id="stack-copy-github" type="button" style="flex:1">🔗 Copy GitHub links</button>
                        <button id="stack-copy-desc" type="button" style="flex:1">📋 Copy link + mô tả</button>
                    </div>
                    <button id="stack-clear" type="button">Xóa tất cả</button>
                </div>
            </div>
        `;
        document.body.appendChild(sidebar);

        // wire events
        $('stack-fab-btn').addEventListener('click', appOpenStack);
        $('stack-close').addEventListener('click', appCloseStack);
        $('stack-overlay').addEventListener('click', appCloseStack);
        $('stack-copy-cmd').addEventListener('click', () => copyText('stack-install-cmd'));
        $('stack-copy-link').addEventListener('click', () => copyText('stack-link'));
        $('stack-copy-github').addEventListener('click', copyGitHubLinks);
        $('stack-copy-desc').addEventListener('click', copyLinkDesc);
        $('stack-clear').addEventListener('click', appClearStack);
    }

    function appToggleSelect(id, checked) {
        toggleSelect(id, checked);
    }

    function appOpenStack() {
        ensureStackUI();
        const { skills, stackLink, installCmd } = buildStackData();
        $('stack-panel-count').textContent = skills.length;
        $('stack-install-cmd').value = installCmd;
        $('stack-link').value = stackLink;

        const list = $('stack-list');
        if (!skills.length) {
            list.innerHTML = '<div class="stack-empty">Chưa có skill nào trong stack.</div>';
        } else {
            list.innerHTML = skills.map(it => {
                const popLabel = it.downloads ? '⬇' : '⭐';
                const popVal = it.downloads ? it.downloads : it.stars;
                return `
                    <div class="stack-item">
                        <div class="stack-item-info">
                            <div class="stack-item-name">${esc(it.name)}</div>
                            <div class="stack-item-meta">${esc(it.category)} · ${popLabel} ${fmtNum(popVal)}</div>
                        </div>
                        <button class="stack-item-remove" type="button" aria-label="Xóa" data-id="${esc(it.name)}">✕</button>
                    </div>
                `;
            }).join('');
            list.querySelectorAll('.stack-item-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = btn.getAttribute('data-id');
                    toggleSelect(id, false);
                    appOpenStack(); // refresh sidebar
                });
            });
        }

        $('stack-sidebar').classList.add('open');
        document.body.style.overflow = 'hidden';
    }

    function appCloseStack() {
        const el = $('stack-sidebar');
        if (el) el.classList.remove('open');
        document.body.style.overflow = '';
    }

    function appClearStack() {
        state.selected = new Set();
        saveSelected();
        renderItems();
        renderFab();
        renderStackBadge();
        appOpenStack(); // refresh sidebar
    }

    function renderFab() {
        const fab = $('stack-fab');
        if (!fab) return;
        const n = state.selected.size;
        if (n === 0) { fab.style.display = 'none'; return; }
        fab.style.display = 'flex';
        $('stack-fab-count').textContent = n;
    }

    function showToast(msg, btn) {
        const old = btn.textContent;
        btn.textContent = msg;
        setTimeout(() => { btn.textContent = old; }, 1500);
    }

    function copyGitHubLinks() {
        const { skills } = buildStackData();
        if (!skills.length) return;
        const links = skills.map(s => s.url).filter(Boolean).join('\n');
        if (!links) return;
        navigator.clipboard.writeText(links).then(() => {
            const btn = $('stack-copy-github');
            if (btn) showToast('Đã sao chép ' + skills.length + ' link', btn);
        });
    }

    function copyLinkDesc() {
        const { skills } = buildStackData();
        if (!skills.length) return;
        const lines = skills.map(s => {
            const url = s.url || '#';
            const desc = (s.description || '').slice(0, 120);
            return `${url} - ${desc}`;
        }).join('\n');
        navigator.clipboard.writeText(lines).then(() => {
            const btn = $('stack-copy-desc');
            if (btn) showToast('Đã sao chép ' + skills.length + ' mục', btn);
        });
    }

    function copyText(id) {
        const el = $(id);
        if (!el) return;
        el.select();
        el.setSelectionRange(0, 99999);
        try {
            navigator.clipboard.writeText(el.value);
            const btn = el.parentElement.querySelector('button');
            const old = btn.textContent;
            btn.textContent = 'Đã sao chép ✓';
            setTimeout(() => { btn.textContent = old; }, 1500);
        } catch { /* fallback */ }
    }

    // ---------- controls ----------
    function bindControls() {
        if (SINGLE_TYPE) {
            const bar = document.querySelector('.as-bar');
            if (bar) bar.style.display = 'none';
        } else {
            document.querySelectorAll('.as-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    state.type = btn.dataset.tab;
                    document.querySelectorAll('.as-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.type));
                    renderItems();
                });
            });
        }

        document.querySelectorAll('.as-board-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                state.board = btn.dataset.board;
                renderBoardTabs();
                renderItems();
            });
        });

        const searchEl = $('as-search');
        if (searchEl) {
            searchEl.addEventListener('input', (e) => {
                state.search = e.target.value;
                renderItems();
            });
        }

        const chipsEl = $('as-chips');
        if (chipsEl) {
            chipsEl.addEventListener('click', (e) => {
                const chip = e.target.closest('.as-chip');
                if (!chip) return;
                if (chip.id === 'as-chip-clear') {
                    state.useCase = '';
                    if (searchEl) searchEl.value = '';
                } else {
                    state.useCase = chip.dataset.uc === state.useCase ? '' : chip.dataset.uc;
                    if (searchEl) searchEl.value = state.useCase || '';
                }
                document.querySelectorAll('.as-chip').forEach(c => {
                    c.classList.toggle('active', c.dataset.uc === state.useCase);
                });
                const clearBtn = $('as-chip-clear');
                if (clearBtn) clearBtn.hidden = !state.useCase;
                renderItems();
            });
        }

        // View toggle (grid / list)
        const aiBar = $('as-ai-bar');
        if (aiBar && !$('as-view-toggle-wrap')) {
            const wrap = document.createElement('div');
            wrap.id = 'as-view-toggle-wrap';
            wrap.className = 'as-view-toggle-wrap';
            wrap.innerHTML = `
                <button class="as-view-btn${state.view === 'grid' ? ' active' : ''}" data-view="grid" type="button" title="Grid view">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
                </button>
                <button class="as-view-btn${state.view === 'list' ? ' active' : ''}" data-view="list" type="button" title="List view">
                    <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
            `;
            aiBar.appendChild(wrap);
            wrap.querySelectorAll('.as-view-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    state.view = btn.dataset.view;
                    wrap.querySelectorAll('.as-view-btn').forEach(b => b.classList.toggle('active', b.dataset.view === state.view));
                    renderItems();
                });
            });
        }

        const aiBtn = $('as-ai-btn');
        const aiCancel = $('as-ai-cancel');
        if (aiBtn) aiBtn.addEventListener('click', runAskAI);
        if (aiCancel) aiCancel.addEventListener('click', runAskAI);

        const backBtn = $('back-to-top');
        if (backBtn) {
            window.addEventListener('scroll', () => { backBtn.hidden = window.scrollY < 600; });
            backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        }

        // Responsive: collapse/expand chips on window resize
        window.addEventListener('resize', () => {
            const collapsed = window.innerWidth <= 640;
            if (state.chipsCollapsed !== collapsed) {
                state.chipsCollapsed = collapsed;
                if (state.data) renderChips(state.data);
            }
        });
    }

    // ---------- bootstrap ----------
    async function load() {
        try {
            const resp = await fetch(DATA_URL);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            state.data = await resp.json();
        } catch (e) {
            const grid = $('as-grid');
            if (grid) grid.innerHTML = `<div class="hf-empty">Failed to load: ${esc(e.message)}</div>`;
            return;
        }

        // Load danh sách verified IDs (hạ tầng cho app skills deck sau này)
        try {
            const vresp = await fetch('data/skills-verified.json');
            if (vresp.ok) {
                const vdata = await vresp.json();
                (vdata.verified_ids || []).forEach(id => state.verifiedIds.add(id));
            }
        } catch { /* verified file chưa có — bỏ qua */ }

        renderStats(state.data);
        renderChips(state.data);
        renderBoardTabs();
        renderItems();
        renderFab();
        renderStackBadge();
    }

    document.addEventListener('DOMContentLoaded', () => {
        loadSelected();
        ensureStackUI();
        bindControls();
        const searchEl = $('as-search');
        if (searchEl && state.useCase) {
            searchEl.value = state.useCase;
        }
        load();
    });
})();
