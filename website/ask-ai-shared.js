'use strict';

/* Shared Ask AI (Google AI Mode) module — works like the one on index.html.
 *
 * Usage:
 *   initAskAI({
 *     prefix: 'hf',                        // unique id prefix for this page
 *     title: 'Ask AI about HuggingFace picks',
 *     defaultQuestion: '...',
 *     getItems: () => [...],               // current filtered items (active tab + search)
 *     context: () => 'View: ... • Tab: models • Search: llm',
 *     itemFields: (it) => ({ name, url, stars, desc }),   // optional normalizer
 *   });
 *
 * The button must exist in the page: <button id="{prefix}-ask-ai" class="action-btn ask-ai-btn">.
 */

(function () {
    'use strict';

    const PROMPTS_STORAGE_KEY = 'starred-repo-custom-prompts';
    const DESC_LIMIT = 140;

    const PROMPT_GROUPS = [
        {
            title: '🔥 Discovery & Validation',
            items: [
                ['Which of these solve real problems developers face? Look beyond hype — identify pain points, practical utility, and signs of real adoption (stars, forks, recent commits).', 'Real problems solved'],
                ['Which items are in the fastest-growing categories? Identify: (1) category trend direction, (2) whether adoption is accelerating, (3) which specific items benefit from market timing.', 'Trending categories + timing'],
                ['Which items have strongest community validation? Compare: star growth rate, contributors, fork activity, recent releases. Highlight the top 3 with proven traction.', 'Strongest validation'],
            ],
        },
        {
            title: '💰 Build & Ship',
            items: [
                ['Which of these could be combined to build a practical application? Suggest 3 specific combinations with a use case for each.', 'Combine to build an app'],
                ['Rank these by how quickly a solo developer could integrate them into a working MVP. Prioritize: good docs, active maintenance, simple APIs, minimal dependencies.', 'Fastest to MVP'],
                ['Which items are essential for building an AI coding assistant? Consider: LLM access, code analysis, RAG, agent framework, and IDE integration pieces.', 'Build an AI coding assistant'],
            ],
        },
        {
            title: '📊 Market Intelligence',
            items: [
                ['Group these by purpose. For each group, analyze: (1) is the space growing or saturating? (2) who are the key players? (3) what’s missing? Identify gaps worth building in.', 'Category gaps analysis'],
                ['Which items are in declining or over-saturated categories? Highlight ones to deprioritize and explain why.', 'Declining/saturated to skip'],
                ['For each major group here, tell me which is the de-facto standard and which is the promising challenger. When would I pick the challenger?', 'Standard vs challenger'],
            ],
        },
        {
            title: '🤖 Tech Stack',
            items: [
                ['From this list, recommend a complete stack for: (A) a RAG chatbot, (B) an agent automation tool, (C) a code generation app. For each, pick model, vector store, framework, and orchestration layer.', 'Pick a stack'],
                ['Which items pair well together? Suggest 3 complementary pairs where two items cover adjacent parts of the same problem.', 'Complementary pairs'],
                ['Build me a fully open-source, self-hostable stack from this list (no paid APIs). Pick the runtime, framework, store, and UI; flag any gaps.', 'Open-source self-hosted stack'],
            ],
        },
    ];

    function esc(s) {
        if (s === null || s === undefined) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }

    function loadCustomPrompts() {
        try { return JSON.parse(localStorage.getItem(PROMPTS_STORAGE_KEY)) || []; }
        catch { return []; }
    }
    function saveCustomPrompts(prompts) {
        localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(prompts));
    }

    function fmtNum(n) {
        n = Number(n) || 0;
        if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
        if (n >= 1e3) return (n / 1e3).toFixed(1) + 'k';
        return String(n);
    }

    function buildModalHtml(prefix, cfg) {
        const promptsHtml = PROMPT_GROUPS.map(g => `
            <div class="prompts-group">
                <div class="prompts-group-title">${esc(g.title)}</div>
                ${g.items.map(([prompt, label]) => `<button class="prompts-item" data-prompt="${esc(prompt)}">${esc(label)}</button>`).join('')}
            </div>
        `).join('');
        return `
        <div class="ai-ask-backdrop" id="${prefix}-ai-backdrop" hidden></div>
        <div class="ai-ask-modal" id="${prefix}-ai-modal" role="dialog" aria-modal="true" aria-labelledby="${prefix}-ai-title" aria-hidden="true">
            <div class="ai-ask-header">
                <div>
                    <div class="ai-ask-overline">Ask Google AI Mode</div>
                    <h3 class="ai-ask-title" id="${prefix}-ai-title">${esc(cfg.title || 'Ask AI about these results')}</h3>
                </div>
                <button class="ai-ask-close" id="${prefix}-ai-close" type="button" aria-label="Close">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 18 18"/><path d="M18 6 6 18"/></svg>
                </button>
            </div>

            <div class="ai-ask-body">
                <p class="ai-ask-context" id="${prefix}-ai-context">-</p>

                <label class="ai-ask-field">
                    <div class="ai-ask-label-row">
                        <span class="ai-ask-label">Your question</span>
                        <div class="ai-ask-prompts-wrapper">
                            <button class="ai-ask-prompts-btn" id="${prefix}-prompts-btn" type="button">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                                <span>Prompts</span>
                                <svg class="prompts-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6"/></svg>
                            </button>
                            <div class="ai-ask-prompts-menu" id="${prefix}-prompts-menu" hidden>
                                ${promptsHtml}
                                <div class="prompts-divider"></div>
                                <div class="prompts-group" id="${prefix}-prompts-custom-group" hidden>
                                    <div class="prompts-group-title">📝 Your Prompts</div>
                                    <div id="${prefix}-prompts-custom-list"></div>
                                </div>
                                <button class="prompts-add-btn" id="${prefix}-prompts-add" type="button">➕ Add your own prompt</button>
                            </div>
                        </div>
                    </div>
                    <textarea id="${prefix}-ai-question" class="ai-ask-question" rows="3" spellcheck="false"></textarea>
                </label>

                <div class="ai-ask-controls">
                    <label class="ai-ask-field ai-ask-field-inline">
                        <span class="ai-ask-label">Items to include</span>
                        <select id="${prefix}-ai-count" class="ai-ask-select">
                            <option value="10">Top 10</option>
                            <option value="25" selected>Top 25</option>
                            <option value="50">Top 50</option>
                            <option value="0">All filtered</option>
                        </select>
                    </label>
                    <label class="ai-ask-toggle" for="${prefix}-ai-include-desc">
                        <input type="checkbox" id="${prefix}-ai-include-desc" checked>
                        <span>Include descriptions</span>
                    </label>
                </div>

                <label class="ai-ask-field">
                    <span class="ai-ask-label">Prompt preview</span>
                    <textarea id="${prefix}-ai-preview" class="ai-ask-preview" rows="9" readonly spellcheck="false"></textarea>
                </label>

                <div class="ai-ask-meta">
                    <span class="ai-ask-meter" id="${prefix}-ai-meter">-</span>
                    <span class="ai-ask-warning" id="${prefix}-ai-warning" hidden></span>
                </div>
            </div>

            <div class="ai-ask-footer">
                <button class="ai-ask-secondary" id="${prefix}-ai-copy" type="button">Copy prompt</button>
                <button class="ai-ask-primary" id="${prefix}-ai-open" type="button">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>
                    <span>Open in Google AI Mode</span>
                </button>
            </div>
        </div>`;
    }

    window.initAskAI = function (cfg) {
        const prefix = cfg.prefix || 'qa';
        const $ = (id) => document.getElementById(prefix + '-' + id);
        const openBtn = document.getElementById(prefix + '-ask-ai');
        if (!openBtn) return;

        // Inject modal once
        if (!$( 'ai-modal')) {
            document.body.insertAdjacentHTML('beforeend', buildModalHtml(prefix, cfg));
        }

        const backdrop = $('ai-backdrop');
        const modal = $('ai-modal');
        const closeBtn = $('ai-close');
        const copyBtn = $('ai-copy');
        const goBtn = $('ai-open');
        const question = $('ai-question');
        const countEl = $('ai-count');
        const includeDesc = $('ai-include-desc');
        const preview = $('ai-preview');
        const meter = $('ai-meter');
        const warning = $('ai-warning');
        const context = $('ai-context');

        const DEFAULT_Q = cfg.defaultQuestion || 'Give me a concise overview of these items: what each does, the strongest options, and which to try first.';

        function getItems() {
            const items = (cfg.getItems ? cfg.getItems() : []) || [];
            const limitRaw = Number(countEl?.value ?? 0);
            const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : items.length;
            return items.slice(0, limit);
        }

        function fields(it) {
            if (cfg.itemFields) return cfg.itemFields(it);
            return {
                name: it.name || it.title || it.label || it.id || '?',
                url: it.url || it.href || '',
                stars: it.stars || it.likes || it.upvotes || 0,
                desc: it.description || it.summary || '',
            };
        }

        function buildPrompt() {
            const q = (question?.value || DEFAULT_Q).trim();
            const items = getItems();
            const list = items.map((it, i) => {
                const f = fields(it);
                const starStr = Number(f.stars) > 0 ? ` (${fmtNum(f.stars)}★)` : '';
                const desc = String(f.desc || '').replace(/\s+/g, ' ').trim();
                const shortDesc = desc.length > DESC_LIMIT ? desc.slice(0, DESC_LIMIT - 1) + '…' : desc;
                const url = cfg.urlFor ? cfg.urlFor(it) : (f.url ? ` — ${f.url}` : '');
                return `${i + 1}. ${f.name}${starStr}${url}${includeDesc?.checked && shortDesc ? ` — ${shortDesc}` : ''}`;
            }).join('\n');
            const ctx = cfg.context ? cfg.context() : '';
            return `${q}\n\nFilter context: ${ctx || 'current view'}\nItems (${items.length}):\n${list}`;
        }

        function renderPreview() {
            const prompt = buildPrompt();
            const items = getItems();
            if (preview) preview.value = prompt;
            if (meter) meter.textContent = `${items.length} items • ${prompt.length.toLocaleString()} chars • URL ~${(prompt.length + 60).toLocaleString()}`;
            if (context) context.textContent = cfg.contextDetail
                ? cfg.contextDetail(items.length)
                : `Asking about ${items.length} filtered item${items.length === 1 ? '' : 's'}.`;
            if (warning) {
                const long = prompt.length + 60 > 29000;
                warning.hidden = !long;
                warning.textContent = long ? 'Long prompt — Google may trim it in the URL. It is copied to your clipboard as a backup.' : '';
            }
        }

        function openModal() {
            if (question && !question.value.trim()) question.value = DEFAULT_Q;
            renderPreview();
            backdrop.hidden = false;
            modal.classList.add('open');
            modal.setAttribute('aria-hidden', 'false');
            document.body.classList.add('drawer-open');
            setTimeout(() => question?.focus(), 100);
        }
        function closeModal() {
            backdrop.hidden = true;
            modal.classList.remove('open');
            modal.setAttribute('aria-hidden', 'true');
            document.body.classList.remove('drawer-open');
        }

        function renderCustomPrompts() {
            const list = $( 'prompts-custom-list');
            const group = $( 'prompts-custom-group');
            if (!list || !group) return;
            const prompts = loadCustomPrompts();
            if (!prompts.length) { group.hidden = true; return; }
            group.hidden = false;
            list.innerHTML = prompts.map((p, i) =>
                `<div class="prompts-custom-item" data-index="${i}" role="button">
                    <span class="prompts-custom-text">${esc(p)}</span>
                    <button class="prompts-del" data-index="${i}" type="button" aria-label="Delete prompt">✕</button>
                </div>`
            ).join('');
            list.querySelectorAll('.prompts-custom-item').forEach(el => {
                el.addEventListener('click', (e) => {
                    if (e.target.closest('.prompts-del')) return;
                    const idx = Number(el.dataset.index);
                    const prompts = loadCustomPrompts();
                    if (prompts[idx]) {
                        question.value = prompts[idx];
                        question.dispatchEvent(new Event('input'));
                        closePromptsMenu();
                    }
                });
            });
            list.querySelectorAll('.prompts-del').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const idx = Number(btn.dataset.index);
                    const prompts = loadCustomPrompts();
                    prompts.splice(idx, 1);
                    saveCustomPrompts(prompts);
                    renderCustomPrompts();
                });
            });
        }

        function closePromptsMenu() {
            const menu = $( 'prompts-menu');
            const btn = $( 'prompts-btn');
            if (menu) menu.hidden = true;
            if (btn) btn.classList.remove('open');
        }
        function togglePromptsMenu() {
            const menu = $( 'prompts-menu');
            const btn = $( 'prompts-btn');
            if (!menu) return;
            const isOpen = !menu.hidden;
            menu.hidden = isOpen;
            btn.classList.toggle('open', !isOpen);
            if (!isOpen) renderCustomPrompts();
        }
        function injectPrompt(text) {
            question.value = text;
            question.dispatchEvent(new Event('input'));
            closePromptsMenu();
        }

        // ---- bindings ----
        openBtn.addEventListener('click', (e) => { e.preventDefault(); openModal(); });
        closeBtn?.addEventListener('click', closeModal);
        backdrop?.addEventListener('click', closeModal);
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.classList.contains('open')) closeModal();
        });

        countEl?.addEventListener('change', renderPreview);
        includeDesc?.addEventListener('change', renderPreview);
        question?.addEventListener('input', renderPreview);

        copyBtn?.addEventListener('click', async () => {
            try {
                await navigator.clipboard.writeText(buildPrompt());
                copyBtn.textContent = 'Copied ✓';
            } catch {
                copyBtn.textContent = 'Copy failed';
            }
            setTimeout(() => { copyBtn.textContent = 'Copy prompt'; }, 1500);
        });

        goBtn?.addEventListener('click', async () => {
            const prompt = buildPrompt();
            try { await navigator.clipboard.writeText(prompt); } catch {}
            const q = encodeURIComponent(prompt);
            const url = 'https://www.google.com/search?q=' + q + '&udm=50';
            if (url.length > 29000) {
                const short = prompt.slice(0, 2000);
                window.open('https://www.google.com/search?q=' + encodeURIComponent(short) + '&udm=50', '_blank', 'noopener');
            } else {
                window.open(url, '_blank', 'noopener');
            }
        });

        const promptsBtn = $( 'prompts-btn');
        const promptsMenu = $( 'prompts-menu');
        if (promptsBtn && promptsMenu) {
            promptsBtn.addEventListener('click', (e) => { e.stopPropagation(); togglePromptsMenu(); });
            document.addEventListener('click', (e) => {
                const wrapper = promptsBtn.closest('.ai-ask-prompts-wrapper');
                if (wrapper && !wrapper.contains(e.target)) closePromptsMenu();
            });
            promptsMenu.querySelectorAll('.prompts-item[data-prompt]').forEach(el => {
                el.addEventListener('click', () => injectPrompt(el.dataset.prompt));
            });
        }
        const addBtn = $( 'prompts-add');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const text = window.prompt('Enter your custom prompt:');
                if (text && text.trim()) {
                    const prompts = loadCustomPrompts();
                    prompts.push(text.trim());
                    saveCustomPrompts(prompts);
                    renderCustomPrompts();
                    injectPrompt(text.trim());
                }
            });
        }

        renderCustomPrompts();
    };
})();