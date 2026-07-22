(function () {
    'use strict';

    const DATA_URL = 'data/daily-top.json?v=' + Date.now();

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

    function renderCard(icon, title, subtitle, body, linkUrl, linkText, rankLabel) {
        return `
            <div class="dt-card">
                <div class="dt-card-head">
                    <span class="dt-rank-badge">${esc(rankLabel || '#1')}</span>
                    <span class="dt-card-icon">${icon}</span>
                    <div class="dt-card-title-group">
                        <div class="dt-card-ov">${esc(subtitle)}</div>
                        <div class="dt-card-title">${esc(title)}</div>
                    </div>
                </div>
                <div class="dt-card-body">${body}</div>
                ${linkUrl ? `<a class="dt-card-link" href="${esc(linkUrl)}" target="_blank" rel="noopener">${esc(linkText || 'Open →')}</a>` : ''}
            </div>
        `;
    }

    function renderRepoCard(repo, label, rankLabel) {
        if (!repo) return '';
        const delta = repo.delta_1d > 0 ? `<span class="dt-up">+${fmtNum(repo.delta_1d)} today</span>` : '';
        const delta7 = repo.delta_7d > 0 ? `<span class="dt-up">+${fmtNum(repo.delta_7d)} this week</span>` : '';
        return renderCard(
            '📦',
            repo.name || 'Unknown',
            label || 'GitHub Trending',
            `<p>${esc(repo.description || '')}</p>
             <div class="dt-meta">
                 <span>⭐ ${fmtNum(repo.stars)}</span>
                 ${delta}
                 ${delta7}
                 ${repo.language ? `<span>🔷 ${esc(repo.language)}</span>` : ''}
                 ${repo.category ? `<span>📂 ${esc(repo.category)}</span>` : ''}
                 <span>📊 ${repo.trend_score}</span>
             </div>`,
            repo.url,
            'View on GitHub →',
            rankLabel
        );
    }

    function renderPHCard(product, label, rankLabel) {
        if (!product) return '';
        const votes = product.votes ? `<span class="dt-up">▲ ${fmtNum(product.votes)} votes</span>` : '';
        const tags = (product.tags || []).map(t => `<span class="dt-tag">${esc(t)}</span>`).join('');
        const date = product.published || product.createdAt || '';
        return renderCard(
            '🚀',
            product.title || 'Unknown',
            label || 'Product Hunt',
            `<p>${esc(product.description || '')}</p>
             <div class="dt-meta">
                 ${votes}
                 ${date ? `<span>📅 ${date.slice(0, 10)}</span>` : ''}
                 ${tags}
             </div>`,
            product.url,
            'View on Product Hunt →',
            rankLabel
        );
    }

    function renderEmpty(icon, label, reason) {
        return renderCard(icon, 'No data yet', label,
            `<p style="color:var(--text-muted)">${esc(reason || 'Data will appear after the first daily update.')}</p>`,
            '', '', '—');
    }

    function renderAll(data) {
        const grid = $('dt-grid');
        const g = data.github || {};
        const ph = (data.producthunt || {}).winners || {};

        $('dt-updated').textContent = '· updated ' + relativeTime(data.updated_at);

        const cards = [
            // 1. GitHub #1 repo today
            g.today
                ? renderRepoCard(g.today, 'GitHub · #1 Trending Repo Today', '#1 Today')
                : renderEmpty('📦', 'GitHub Trending', 'No repo data available.'),

            // 2. Product Hunt #1 today
            ph.top_today
                ? renderPHCard(ph.top_today, 'Product Hunt · #1 Product Today', '#1 Today')
                : renderEmpty('🚀', 'Product Hunt', 'No Product Hunt data yet.'),

            // 3. Product Hunt #1 this week
            ph.top_week
                ? renderPHCard(ph.top_week, 'Product Hunt · #1 Product This Week', '#1 Week')
                : renderEmpty('🚀', 'Product Hunt Weekly', 'No Product Hunt data yet.'),

            // 4. AI #1 this week
            ph.top_ai_week
                ? renderPHCard(ph.top_ai_week, 'AI · #1 Product This Week', '#1 AI')
                : renderEmpty('🤖', 'AI Product', 'No AI products classified yet.'),

            // 5. Productivity #1 this week
            ph.top_prod_week
                ? renderPHCard(ph.top_prod_week, 'Productivity · #1 Product This Week', '#1 Prod')
                : renderEmpty('⚡', 'Productivity Product', 'No productivity products classified yet.'),
        ];

        grid.innerHTML = cards.join('');

        // Stats
        $('dt-stats').innerHTML = `
            <div class="hf-stat"><div class="hf-stat-val">${g.top_today ? g.top_today.length : 0}</div><div class="hf-stat-lbl">GitHub top repos</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${ph.count || 0}</div><div class="hf-stat-lbl">PH products</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${ph.count_ai || 0}</div><div class="hf-stat-lbl">AI products</div></div>
            <div class="hf-stat"><div class="hf-stat-val">${ph.count_prod || 0}</div><div class="hf-stat-lbl">Productivity</div></div>
        `;
    }

    async function load() {
        try {
            const resp = await fetch(DATA_URL);
            if (!resp.ok) throw new Error('HTTP ' + resp.status);
            const data = await resp.json();
            renderAll(data);
        } catch (e) {
            $('dt-grid').innerHTML = `<div class="hf-empty">Failed to load: ${esc(e.message)}</div>`;
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        const backBtn = $('back-to-top');
        if (backBtn) {
            window.addEventListener('scroll', () => { backBtn.hidden = window.scrollY < 600; });
            backBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
        }
        load();
    });
})();
