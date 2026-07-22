(function () {
    'use strict';

    const DATA_URL = 'data/agent-skills.json?v=' + Date.now();

    const $ = (id) => document.getElementById(id);

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

    // ---- curated top picks -------------------------------------------------

    const TOP_PICKS = [
        {
            name: 'nextlevelbuilder/ui-ux-pro-max-skill',
            url: 'https://github.com/nextlevelbuilder/ui-ux-pro-max-skill',
            stars: 109000,
            badge: '🥇 BEST FOR UI',
            reason: 'Skill AI chuyên về UI/UX. Cung cấp design intelligence cho 50+ styles, 21 palettes, font pairings. Build professional UI multiple platforms.',
            useCase: 'Thiết kế giao diện app từ A-Z, chọn style, phối màu, typography',
        },
        {
            name: 'emilkowalski/skills',
            url: 'https://github.com/emilkowalski/skills',
            stars: 19471,
            badge: '🎯 DESIGN ENGINEER',
            reason: '"Skills for Design Engineers" — dedicated repository của một design engineer. Tập trung vào kỹ thuật thiết kế UI chuyên sâu.',
            useCase: 'Design engineering, component design, design system implementation',
        },
        {
            name: 'VoltAgent/awesome-design-md',
            url: 'https://github.com/VoltAgent/awesome-design-md',
            stars: 104000,
            badge: '📐 DESIGN SYSTEMS',
            reason: 'Bộ sưu tập DESIGN.md từ các brand design systems nổi tiếng. Drop một file vào project là coding agent biết style của brand đó.',
            useCase: 'Áp dụng brand design system (Apple, Google, Airbnb style...) vào project',
        },
        {
            name: 'google-labs-code/design.md',
            url: 'https://github.com/google-labs-code/design.md',
            stars: 26000,
            badge: '📋 FORMAT SPEC',
            reason: 'Format specification chuẩn từ Google để mô tả visual identity cho coding agents. Định nghĩa rõ ràng design token, spacing, colors.',
            useCase: 'Định nghĩa design system chuẩn cho agent, tạo DESIGN.md file từ template',
        },
        {
            name: 'nexu-io/open-design',
            url: 'https://github.com/nexu-io/open-design',
            stars: 80000,
            badge: '🖼️ OPEN DESIGN',
            reason: 'Open-source Claude Design alternative. Local-first desktop app. Biến coding agent thành designer với giao diện kéo thả.',
            useCase: 'Thiết kế UI trực quan, biến ý tưởng thành giao diện thực tế',
        },
        {
            name: 'obra/superpowers',
            url: 'https://github.com/obra/superpowers',
            stars: 258812,
            badge: '⚡ GENERAL FRAMEWORK',
            reason: 'Agentic skills framework. Có thể kết hợp với design skills để tạo workflow design system hoàn chỉnh.',
            useCase: 'Framework tổng thể để quản lý skills, tích hợp design vào quy trình phát triển',
        },
    ];

    function renderPicks() {
        const el = $('ds-picks');
        el.innerHTML = TOP_PICKS.map(p => `
            <div class="ds-pick">
                <div class="ds-pick-hd">
                    <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
                        <a class="ds-pick-name" href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.name)}</a>
                        <span class="ds-pick-badge">${esc(p.badge)}</span>
                    </div>
                    <span class="ds-pick-stars">⭐ ${fmtNum(p.stars)}</span>
                </div>
                <div class="ds-pick-reason">${esc(p.reason)}</div>
                <div class="ds-pick-use"><b>Dùng để:</b> ${esc(p.useCase)}</div>
                <a class="ds-pick-link" href="${esc(p.url)}" target="_blank" rel="noopener">View on GitHub →</a>
            </div>
        `).join('');
    }

    // ---- all design items (from agent-skills data) ------------------------

    let state = { data: null, tab: 'agents' };

    function filterItems(tab) {
        if (!state.data) return [];
        const items = tab === 'agents' ? state.data.agents : state.data.skills;
        return items.filter(r => (r.use_cases || []).includes('design'));
    }

    function renderCard(item) {
        const tags = (item.topics || []).slice(0, 3).map(t => `<span class="as-tag">${esc(t)}</span>`).join('');
        const ucs = (item.use_cases || []).map(uc => `<span class="as-uc-tag">${esc(uc)}</span>`).join('');
        return `
            <div class="as-card">
                <div class="as-card-hd">
                    <a class="as-card-name" href="${esc(item.url)}" target="_blank" rel="noopener">${esc(item.name)}</a>
                    <span class="as-card-stars">⭐ ${fmtNum(item.stars)}</span>
                </div>
                <div class="as-card-desc">${esc(item.description || '')}</div>
                <div class="as-card-cat">${esc(item.category)}${item.delta_7d > 0 ? ' · <span class="as-up">+'+fmtNum(item.delta_7d)+'/wk</span>' : ''}</div>
                <div class="as-card-tags">${ucs}${tags}</div>
            </div>
        `;
    }

    function renderGrid() {
        const grid = $('ds-grid');
        const empty = $('ds-empty');
        const items = filterItems(state.tab);

        $('ds-c-agents').textContent = '(' + filterItems('agents').length + ')';
        $('ds-c-skills').textContent = '(' + filterItems('skills').length + ')';

        if (!items.length) {
            grid.innerHTML = '';
            empty.hidden = false;
            empty.innerHTML = '<div class="hf-empty">No design items in this tab.</div>';
            return;
        }
        empty.hidden = true;
        grid.innerHTML = items.map(renderCard).join('');
    }

    function bindControls() {
        document.querySelectorAll('.as-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                state.tab = btn.dataset.tab;
                document.querySelectorAll('.as-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === state.tab));
                renderGrid();
            });
        });
    }

    async function load() {
        try {
            const resp = await fetch(DATA_URL);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            state.data = await resp.json();
        } catch (e) {
            $('ds-grid').innerHTML = '<div class="hf-empty">Failed to load: ' + esc(e.message) + '</div>';
            return;
        }
        renderPicks();
        renderGrid();
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindControls();
        load();
    });
})();
