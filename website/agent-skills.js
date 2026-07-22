(function () {
    'use strict';

    const DATA_URL = 'data/agent-skills.json?v=' + Date.now();
    const LLM7_URL = 'https://api.llm7.io/v1/chat/completions';

    const $ = (id) => document.getElementById(id);

    const state = {
        data: null,
        tab: 'agents',
        search: '',
        useCase: '',
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

    function fmtDate(iso) {
        if (!iso) return '';
        const d = new Date(iso);
        if (isNaN(d)) return iso;
        return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // ---- render: stats + chips --------------------------------------------

    function renderStats(d) {
        const s = d.stats || {};
        $('as-updated').textContent = '· updated ' + relativeTime(d.updated_at);
        $('as-stats').innerHTML = `
            <div class="hf-stat"><div class="hf-stat-val">${s.agents || 0}</div><div class="hf-stat-lbl">agents</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${s.skills || 0}</div><div class="hf-stat-lbl">skills</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${s.use_cases || 0}</div><div class="hf-stat-lbl">use cases</div></div>
        `;
        $('as-c-agents').textContent = `(${s.agents || 0})`;
        $('as-c-skills').textContent = `(${s.skills || 0})`;
    }

    function renderChips(d) {
        const chips = $('as-chips');
        const ucs = d.use_cases || [];
        const icons = {
            ai: '🧠', coding: '💻', marketing: '📣', writing: '✍️', design: '🎨',
            sales: '💰', research: '🔬', data: '📊', finance: '🏦', legal: '⚖️',
            healthcare: '🏥', education: '📚', 'customer-support': '🎧', productivity: '⚡',
        };
        chips.innerHTML = '<span class="as-chips-label">Filter by use case:</span> ' +
            ucs.map(uc => `<button class="as-chip" data-uc="${esc(uc)}" type="button">${icons[uc] || '📌'} ${esc(uc)}</button>`).join('') +
            '<button class="as-chip as-chip-clear" id="as-chip-clear" type="button" hidden>✕ Clear</button>';
    }

    // ---- filter + render grid ---------------------------------------------

    function getItems() {
        if (!state.data) return [];
        return state.tab === 'agents' ? state.data.agents : state.data.skills;
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

        return items;
    }

    function renderCard(item) {
        const tags = (item.topics || []).slice(0, 4).map(t => `<span class="as-tag">${esc(t)}</span>`).join('');
        const ucs = (item.use_cases || []).map(uc => `<span class="as-uc-tag">${esc(uc)}</span>`).join('');
        const lang = item.language ? `<span class="as-tag as-tag-lang">${esc(item.language)}</span>` : '';
        return `
            <div class="as-card">
                <div class="as-card-hd">
                    <a class="as-card-name" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.name)}</a>
                    <span class="as-card-stars">⭐ ${fmtNum(item.stars)}</span>
                </div>
                <div class="as-card-desc">${esc(item.description || '')}</div>
                <div class="as-card-cat">${esc(item.category)}${item.delta_7d > 0 ? ` · <span class="as-up">+${fmtNum(item.delta_7d)}/wk</span>` : ''}</div>
                <div class="as-card-tags">${ucs}${tags}${lang}</div>
            </div>
        `;
    }

    function renderGrid() {
        const grid = $('as-grid');
        const empty = $('as-empty');
        const items = filterItems();
        const count = items.length;

        $('as-count').textContent = `${count} shown`;

        if (!count) {
            grid.innerHTML = '';
            empty.hidden = false;
            empty.innerHTML = `<div class="hf-empty">No ${state.tab} match your search. Try a different term or use case.</div>`;
            return;
        }
        empty.hidden = true;
        grid.innerHTML = items.map(renderCard).join('');
    }

    // ---- LLM7 AI matching -------------------------------------------------

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

    function buildMatchPrompt(items, query) {
        const list = items.slice(0, 30).map((r, i) =>
            `${i + 1}. ${r.name} ⭐${r.stars} | ${r.category} | ${(r.description || '').slice(0, 120)} | use-cases: ${(r.use_cases || []).join(', ')}`
        ).join('\n');
        const type = state.tab === 'agents' ? 'agent/AI-agent' : 'tool/framework/skill';
        return `I have these ${state.tab} that could match the query "${query}". From this list, recommend the TOP 3 most relevant ones and explain WHY each fits. Be specific.

${list}

Return as: **Name** — why it fits (1-2 sentences). Focus on the query need: "${query}"`;
    }

    async function runAskAI() {
        const btn = $('as-ai-btn');
        const result = $('as-ai-result');
        const items = filterItems();

        if (!items.length) {
            result.hidden = false;
            result.innerHTML = '<div class="as-ai-note" style="color:var(--warning)">No items to analyze. Try a broader search.</div>';
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<span style="display:inline-block;animation:spin 1s linear infinite">⟳</span> Matching…';
        result.hidden = false;
        result.innerHTML = '<div class="rep-note">Analyzing…</div>';

        try {
            const query = state.search.trim() || (state.useCase || 'best ' + state.tab);
            const prompt = buildMatchPrompt(items, query);
            const raw = await llm7([
                { role: 'system', content: 'You are a senior AI engineer recommending the best open-source tools. Be specific and opinionated.' },
                { role: 'user', content: prompt },
            ], 0.3);
            const text = raw.replace(/^```[\s\S]*?\n/, '').replace(/```$/, '').trim();
            result.innerHTML = '<div class="as-ai-head">🤖 AI Recommendation</div>' +
                '<div class="as-ai-body">' + text.replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') + '</div>' +
                '<div class="as-ai-meta">LLM7 · based on ' + items.length + ' items</div>';
        } catch (e) {
            result.innerHTML = '<div class="as-ai-note" style="color:var(--warning)">⚠️ ' + esc(e.message) + '</div>';
        }
        btn.disabled = false;
        btn.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3a9 9 0 0 0-7.74 13.55L3 21l4.6-1.2A9 9 0 1 0 12 3Z"/><path d="M8.5 11h7"/><path d="M8.5 14h4"/></svg> Ask AI: Find the best match`;
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
        const clearBtn = $('as-chip-clear');
        if (clearBtn) clearBtn.hidden = !uc;
        renderGrid();
    }

    function bindControls() {
        document.querySelectorAll('.as-tab').forEach(btn => {
            btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
        });

        $('as-search').addEventListener('input', (e) => {
            state.search = e.target.value;
            renderGrid();
        });

        $('as-chips').addEventListener('click', (e) => {
            const chip = e.target.closest('.as-chip');
            if (!chip) return;
            if (chip.id === 'as-chip-clear') { setUseCase(''); return; }
            setUseCase(chip.dataset.uc === state.useCase ? '' : chip.dataset.uc);
        });

        $('as-ai-btn').addEventListener('click', runAskAI);

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
            $('as-grid').innerHTML = `<div class="hf-empty">Failed to load: ${esc(e.message)}</div>`;
            return;
        }
        renderStats(state.data);
        renderChips(state.data);
        renderGrid();
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindControls();
        load();
    });
})();
