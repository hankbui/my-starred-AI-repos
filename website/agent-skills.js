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
        search: INIT_UC || '',
        useCase: INIT_UC || '',
        abortCtrl: null,
    };

    const BOARD_TABS = [
        { key: 'allTime', label: 'All Time', icon: '⏱️' },
        { key: 'trending', label: 'Trending', icon: '📈' },
        { key: 'hot', label: 'Hot', icon: '🔥' },
        { key: 'allResource', label: 'All Resource', icon: '📦' },
    ];

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

    // ---- render: stats + chips --------------------------------------------

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

    function renderChips(d) {
        const chips = $('as-chips');
        if (!chips) return;
        const ucs = d.use_cases || [];
        const icons = {
            ai: '🧠', coding: '💻', marketing: '📣', writing: '✍️', design: '🎨',
            sales: '💰', research: '🔬', data: '📊', finance: '🏦', legal: '⚖️',
            healthcare: '🏥', education: '📚', 'customer-support': '🎧', productivity: '⚡',
        };
        chips.innerHTML = '<span class="as-chips-label">Filter by use case:</span> ' +
            ucs.map(uc => `<button class="as-chip${uc === state.useCase ? ' active' : ''}" data-uc="${esc(uc)}" type="button">${icons[uc] || '📌'} ${esc(uc)}</button>`).join('') +
            '<button class="as-chip as-chip-clear" id="as-chip-clear" type="button"' + (state.useCase ? '' : ' hidden') + '>✕ Clear</button>';
    }

    function renderBoardTabs() {
        const board = $('as-board');
        if (!board) return;
        board.innerHTML = BOARD_TABS.map(b => {
            const active = state.board === b.key;
            return `<button class="as-board-tab${active ? ' active' : ''}" data-board="${esc(b.key)}" type="button" title="${esc(b.label)}">${b.icon} ${esc(b.label)}</button>`;
        }).join('');
    }

    // ---- filter + render grid ---------------------------------------------

    function getItems() {
        if (!state.data) return [];
        if (state.data.items) {
            return state.data.items;
        }
        // legacy combined format
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
            // default: expert value score high → low
            sorted.sort((a, b) => (b.value_score || b.stars || 0) - (a.value_score || a.stars || 0));
        }
        return sorted;
    }

    function valueBadge(item) {
        const v = Number(item.value_score || 0);
        if (!v) return '';
        return `<span class="as-card-value">💎 ${v.toFixed(1)}</span>`;
    }

    function renderCard(item) {
        const tags = (item.topics || []).slice(0, 4).map(t => `<span class="as-tag">${esc(t)}</span>`).join('');
        const ucs = (item.use_cases || []).map(uc => `<span class="as-uc-tag">${esc(uc)}</span>`).join('');
        const lang = item.language ? `<span class="as-tag as-tag-lang">${esc(item.language)}</span>` : '';
        const typeTag = item.is_agent ? '<span class="as-tag as-tag-agent">Agent</span>' :
            item.is_skill ? '<span class="as-tag as-tag-skill">Skill</span>' : '';
        const popLabel = item.downloads ? '⬇' : '⭐';
        const popVal = item.downloads ? item.downloads : item.stars;
        return `
            <div class="as-card">
                <div class="as-card-hd">
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                        <a class="as-card-name" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.name)}</a>
                        ${valueBadge(item)}
                    </div>
                    <span class="as-card-stars">${popLabel} ${fmtNum(popVal)}</span>
                </div>
                <div class="as-card-desc">${esc(item.description || '')}</div>
                <div class="as-card-cat">${typeTag}${item.category} ${item.delta_7d > 0 ? `· <span class="as-up">+${fmtNum(item.delta_7d)}/wk</span>` : ''}</div>
                <div class="as-card-tags">${ucs}${tags}${lang}</div>
            </div>
        `;
    }

    function renderGrid() {
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
            return;
        }
        if (empty) empty.hidden = true;
        grid.innerHTML = items.map(renderCard).join('');
    }

    // ---- LLM7 AI matching -------------------------------------------------

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

    // ---- controls ----------------------------------------------------------

    function bindControls() {
        if (SINGLE_TYPE) {
            // hide the tab bar on single-type pages
            const bar = document.querySelector('.as-bar');
            if (bar) bar.style.display = 'none';
        } else {
            document.querySelectorAll('.as-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    state.type = btn.dataset.tab;
                    document.querySelectorAll('.as-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.type));
                    renderGrid();
                });
            });
        }

        document.querySelectorAll('.as-board-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                state.board = btn.dataset.board;
                renderBoardTabs();
                renderGrid();
            });
        });

        const searchEl = $('as-search');
        if (searchEl) {
            searchEl.addEventListener('input', (e) => {
                state.search = e.target.value;
                renderGrid();
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
                renderGrid();
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
    }

    // ---- bootstrap ----------------------------------------------------------

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
        renderStats(state.data);
        renderChips(state.data);
        renderBoardTabs();
        renderGrid();
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindControls();
        const searchEl = $('as-search');
        if (searchEl && state.useCase) {
            searchEl.value = state.useCase;
        }
        load();
    });
})();
