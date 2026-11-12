(function () {
    'use strict';

    const DATA_URL = 'data/video-production.json?v=' + Date.now();
    const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';
    const LLM7_TOKEN = 'LLM7_TOKEN_PLACEHOLDER';

    const $ = (id) => document.getElementById(id);

    const state = {
        data: null,
        tab: 'video',
        board: 'allTime',
        search: '',
        useCase: '',
        abortCtrl: null,
    };

    const BOARD_TABS = [
        { key: 'allTime', label: 'All Time', icon: 'clock' },
        { key: 'trending', label: 'Trending', icon: 'trending' },
        { key: 'hot', label: 'Hot', icon: 'fire' },
    ];

    const CASE_ICONS = {
        'trends': '🔍', 'ideas': '💡', 'assets': '🎞️', 'publish': '🚀',
        'thumbnails': '📸', 'analytics': '📊', 'video-gen': '🎬', 'image-gen': '🖼️',
        'editing': '✂️', 'avatar': '🗣️', 'tts': '🎙️', 'captions': '💬',
        'comfyui': '🧩', 'shorts': '📱', 'pipeline': '⚙️', 'upscaler': '🔍',
        '3d': '🧊',
    };

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

    // ---- render: stats + chips --------------------------------------------

    function renderStats(d) {
        const s = d.stats || {};
        $('vp-updated').textContent = '· updated ' + relativeTime(d.updated_at);
        $('vp-stats').innerHTML = `
            <div class="hf-stat"><div class="hf-stat-val">${s.video || 0}</div><div class="hf-stat-lbl">video repos</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${s.image || 0}</div><div class="hf-stat-lbl">image repos</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${s.tts || 0}</div><div class="hf-stat-lbl">tts engines</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${s.automation || 0}</div><div class="hf-stat-lbl">automation</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${s.workflow || 0}</div><div class="hf-stat-lbl">workflow</div></div>
        `;
        $('vp-c-video').textContent = `(${s.video || 0})`;
        $('vp-c-image').textContent = `(${s.image || 0})`;
        $('vp-c-tts').textContent = `(${s.tts || 0})`;
        $('vp-c-automation').textContent = `(${s.automation || 0})`;
        $('vp-c-workflow').textContent = `(${s.workflow || 0})`;
        $('vp-c-all').textContent = `(${s.total || 0})`;
    }

    function renderChips(d) {
        const chips = $('vp-chips');
        const cases = d.cases || [];
        chips.innerHTML = '<span class="as-chips-label">Filter by case:</span> ' +
            cases.map(c => `<button class="as-chip${c === state.useCase ? ' active' : ''}" data-uc="${esc(c)}" type="button">${CASE_ICONS[c] || '📌'} ${esc(c)}</button>`).join('') +
            '<button class="as-chip as-chip-clear" id="vp-chip-clear" type="button"' + (state.useCase ? '' : ' hidden') + '>✕ Clear</button>';
    }

    function renderBoardTabs() {
        const board = $('vp-board');
        board.innerHTML = BOARD_TABS.map(b => {
            const active = state.board === b.key;
            return `<button class="as-board-tab${active ? ' active' : ''}" data-board="${esc(b.key)}" type="button" title="${esc(b.label)}">${boardIcon(b.key)} ${esc(b.label)}</button>`;
        }).join('');
    }

    function boardIcon(key) {
        switch (key) {
            case 'allTime': return '⏱️';
            case 'trending': return '📈';
            case 'hot': return '🔥';
            default: return '•';
        }
    }

    // ---- filter + render grid ---------------------------------------------

    function getItems() {
        if (!state.data) return [];
        if (state.tab === 'all') return state.data.all || [];
        return state.data[state.tab] || [];
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
                    Array.isArray(it.cases) ? it.cases.join(' ') : '',
                    it.language || '',
                    it.readme || '',
                ].filter(Boolean).join(' ').toLowerCase();
                const haySquash = hay.replace(/[-_\s]+/g, '');
                return terms.every(t => {
                    const sq = t.replace(/[-_\s]+/g, '');
                    return hay.includes(t) || (sq && haySquash.includes(sq));
                });
            });
        }

        if (uc) {
            items = items.filter(it => Array.isArray(it.cases) && it.cases.includes(uc));
        }

        const sorted = [...items];
        if (state.board === 'trending') {
            sorted.sort((a, b) => (b.delta_7d || 0) - (a.delta_7d || 0));
        } else if (state.board === 'hot') {
            sorted.sort((a, b) => (b.stars || 0) - (a.stars || 0));
        }
        return sorted;
    }

    function renderCard(item) {
        const tags = (item.topics || []).slice(0, 4).map(t => `<span class="as-tag">${esc(t)}</span>`).join('');
        const cases = (item.cases || []).map(uc => `<span class="as-uc-tag">${esc(uc)}</span>`).join('');
        const lang = item.language ? `<span class="as-tag as-tag-lang">${esc(item.language)}</span>` : '';
        const q = state.search.trim().toLowerCase();
        const readmeText = (item.readme || '').toLowerCase();
        const qSquash = q.replace(/[-_\s]+/g, '');
        const readmeHit = q && (readmeText.includes(q) || (qSquash && readmeText.replace(/[-_\s]+/g, '').includes(qSquash)))
            ? '<span class="as-tag as-tag-readme" title="Matched in README">📖 README</span>' : '';
        return `
            <div class="as-card">
                <div class="as-card-hd">
                    <a class="as-card-name" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.name)}</a>
                    <span class="as-card-stars">⭐ ${fmtNum(item.stars)}</span>
                </div>
                <div class="as-card-desc">${esc(item.description || '')}</div>
                <div class="as-card-cat">${esc(item.category)}${item.delta_7d > 0 ? ` · <span class="as-up">+${fmtNum(item.delta_7d)}/wk</span>` : ''}</div>
                <div class="as-card-tags">${cases}${readmeHit}${tags}${lang}</div>
            </div>
        `;
    }

    function renderGrid() {
        const grid = $('vp-grid');
        const empty = $('vp-empty');
        const items = filterItems();
        const count = items.length;

        $('vp-count').textContent = `${count} shown`;

        if (!count) {
            grid.innerHTML = '';
            empty.hidden = false;
            empty.innerHTML = `<div class="hf-empty">No repos match your search. Try a different term or use case.</div>`;
            return;
        }
        empty.hidden = true;
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
        const btn = $('vp-ai-btn');
        const cancel = $('vp-ai-cancel');
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
            `${i + 1}. ${r.name} ⭐${r.stars} | ${(r.tabs || []).join(', ')} | ${(r.description || '').slice(0, 120)} | cases: ${(r.cases || []).join(', ')}`
        ).join('\n');
        const kind = state.tab === 'all' ? 'video-production repo' : state.tab + ' production repo';
        return `I have these video-production repos that could match the query "${query}". From this list, recommend the TOP 3 most relevant ones and explain WHY each fits. Be specific.

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
            const result = $('vp-ai-result');
            result.hidden = false;
            result.innerHTML = '<div class="as-ai-note" style="color:var(--warning)">No items to analyze. Try a broader search.</div>';
            return;
        }

        state.abortCtrl = new AbortController();
        setAskAILoading(true);
        $('vp-ai-result').hidden = false;
        $('vp-ai-result').innerHTML = '<div class="rep-note">Analyzing…</div>';

        try {
            const query = state.search.trim() || (state.useCase || 'best ' + state.tab + ' repo');
            const prompt = buildMatchPrompt(items, query);
            const raw = await llm7([
                { role: 'system', content: 'You are a senior video production engineer recommending the best open-source tools. Be specific and opinionated.' },
                { role: 'user', content: prompt },
            ], 0.3, state.abortCtrl.signal);
            const text = raw.replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();
            const result = $('vp-ai-result');
            result.innerHTML = '<div class="as-ai-head">🤖 AI Recommendation</div>' +
                '<div class="as-ai-body">' + text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</div>' +
                '<div class="as-ai-meta">LLM7 · based on ' + items.length + ' items</div>';
        } catch (e) {
            const result = $('vp-ai-result');
            if (e.name === 'AbortError') {
                result.innerHTML = '<div class="as-ai-note">⏹️ Đã hủy yêu cầu.</div>';
            } else {
                result.innerHTML = '<div class="as-ai-note" style="color:var(--warning)">⚠️ ' + esc(e.message) + '</div>';
            }
        }
        state.abortCtrl = null;
        setAskAILoading(false);
    }

    // ---- controls ----------------------------------------------------------

    function setActiveTab(tab) {
        state.tab = tab;
        document.querySelectorAll('.as-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        renderGrid();
    }

    function setUseCase(uc) {
        state.useCase = uc;
        document.querySelectorAll('.as-chip').forEach(c => {
            const isActive = c.dataset.uc === uc;
            c.classList.toggle('active', isActive);
        });
        const clearBtn = $('vp-chip-clear');
        if (clearBtn) clearBtn.hidden = !uc;
        renderGrid();
    }

    function setBoard(key) {
        state.board = key;
        renderBoardTabs();
        renderGrid();
    }

    function bindControls() {
        document.querySelectorAll('.as-tab').forEach(btn => {
            btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
        });

        document.querySelectorAll('.as-board-tab').forEach(btn => {
            btn.addEventListener('click', () => setBoard(btn.dataset.board));
        });

        $('vp-search').addEventListener('input', (e) => {
            state.search = e.target.value;
            renderGrid();
        });

        $('vp-chips').addEventListener('click', (e) => {
            const chip = e.target.closest('.as-chip');
            if (!chip) return;
            if (chip.id === 'vp-chip-clear') { setUseCase(''); return; }
            setUseCase(chip.dataset.uc === state.useCase ? '' : chip.dataset.uc);
        });

        $('vp-ai-btn').addEventListener('click', runAskAI);
        $('vp-ai-cancel').addEventListener('click', runAskAI);

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
            $('vp-grid').innerHTML = `<div class="hf-empty">Failed to load: ${esc(e.message)}</div>`;
            return;
        }
        renderStats(state.data);
        renderChips(state.data);
        renderBoardTabs();
        renderGrid();
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindControls();
        load();
    });
})();
