const state = {
    starredRepos: [],
    trendingRepos: [],
    filteredRepos: [],
    currentPage: 1,
    perPage: 50,
    copyCurrentPageOnly: false,
    view: 'starred',
    category: 'all',
    topic: 'all',
    activity: 'all',
    minStars: 0,
    sort: 'stars_desc',
    search: '',
    activePreset: 'all',
    updatedAt: '',
    historyStartAt: '',
    historyPoints: 0,
    trendingMode: 'bootstrap',
    selectedRepoId: null,
};

const DATA_URL = 'data/repos.json?v=20260328-5';

const categoryTones = {
    Applications: 'tone-applications',
    'AI Engineering': 'tone-ai-engineering',
    'Agents & Automation': 'tone-agents',
    'Models & Inference': 'tone-models',
    'Vision & Media': 'tone-vision',
    'Data & Evaluation': 'tone-data',
    'Developer Tools': 'tone-devtools',
    Infrastructure: 'tone-infra',
    'Research & Knowledge': 'tone-research',
    Other: 'tone-other',
};

const presetDefinitions = {
    all() {
        resetFilters({ keepView: true, preset: 'all' });
    },
    hot() {
        resetFilters({ keepView: true, preset: 'hot' });
        state.activity = 'Hot';
        state.sort = 'updated_desc';
    },
    'fast-growing'() {
        resetFilters({ keepView: true, preset: 'fast-growing' });
        state.view = 'trending';
        state.sort = 'trend_desc';
    },
    'recently-updated'() {
        resetFilters({ keepView: true, preset: 'recently-updated' });
        state.sort = 'updated_desc';
        state.activity = 'Active';
    },
    '10k-plus'() {
        resetFilters({ keepView: true, preset: '10k-plus' });
        state.minStars = 10_000;
    },
    agents() {
        resetFilters({ keepView: true, preset: 'agents' });
        state.category = 'Agents & Automation';
    },
    infra() {
        resetFilters({ keepView: true, preset: 'infra' });
        state.category = 'Infrastructure';
    },
};

function escapeHtml(value) {
    return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function formatCompactNumber(value) {
    const number = Number(value || 0);
    if (number >= 1_000_000) {
        return `${(number / 1_000_000).toFixed(1)}M`;
    }
    if (number >= 1_000) {
        return `${(number / 1_000).toFixed(1)}k`;
    }
    return number.toLocaleString();
}

function formatPercent(value) {
    if (typeof value !== 'number') {
        return null;
    }
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatGrowth(delta, pct) {
    if (typeof delta !== 'number') {
        return '<span class="growth-empty">warming up</span>';
    }

    const tone = delta >= 0 ? 'positive' : 'negative';
    const signedDelta = `${delta >= 0 ? '+' : ''}${delta.toLocaleString()}`;
    const percentText = formatPercent(pct);

    return `
        <div class="growth-stack ${tone}">
            <span class="growth-main">${signedDelta}</span>
            <span class="growth-sub">${percentText || 'tracked'}</span>
        </div>
    `;
}

function normalizeRepo(repo) {
    const name = repo.name || '';
    const [ownerFromName, repoNameFromName] = name.split('/');

    return {
        ...repo,
        owner: repo.owner || ownerFromName || '',
        repo_name: repo.repo_name || repoNameFromName || name,
        category: repo.category || 'Other',
        language: repo.language || 'Unknown',
        description: repo.description || 'No description provided.',
        topics: Array.isArray(repo.topics) ? repo.topics : [],
        homepage: repo.homepage || '',
        license: repo.license || '',
        default_branch: repo.default_branch || 'main',
        open_issues: Number(repo.open_issues || 0),
        archived: Boolean(repo.archived),
        is_fork: Boolean(repo.is_fork),
        created_at: repo.created_at || '-',
        updated_at: repo.updated_at || '-',
        pushed_at: repo.pushed_at || repo.updated_at || '-',
        activity: repo.activity || 'Steady',
        trend_score: typeof repo.trend_score === 'number' ? repo.trend_score : 0,
        trend_rank: typeof repo.trend_rank === 'number' ? repo.trend_rank : null,
        trend_source: repo.trend_source || 'bootstrap',
        star_delta_1d: typeof repo.star_delta_1d === 'number' ? repo.star_delta_1d : null,
        star_delta_7d: typeof repo.star_delta_7d === 'number' ? repo.star_delta_7d : null,
        star_delta_1d_pct: typeof repo.star_delta_1d_pct === 'number' ? repo.star_delta_1d_pct : null,
        star_delta_7d_pct: typeof repo.star_delta_7d_pct === 'number' ? repo.star_delta_7d_pct : null,
        readme_excerpt: repo.readme_excerpt || '',
        readme_path: repo.readme_path || '',
        readme_status: repo.readme_status || 'unavailable',
    };
}

function getActiveRepos() {
    return state.view === 'trending' ? state.trendingRepos : state.starredRepos;
}

function getActiveViewLabel() {
    return state.view === 'trending' ? 'trending repos' : 'repos';
}

function getRepoById(repoId) {
    const targetId = Number(repoId);
    return state.starredRepos.find((repo) => repo.id === targetId)
        || state.trendingRepos.find((repo) => repo.id === targetId)
        || null;
}

function getCategoryStats(repos = getActiveRepos()) {
    const counts = new Map();

    repos.forEach((repo) => {
        const current = counts.get(repo.category) || {
            name: repo.category,
            count: 0,
            stars: 0,
        };

        current.count += 1;
        current.stars += repo.stars;
        counts.set(repo.category, current);
    });

    return [...counts.values()].sort((left, right) => right.count - left.count);
}

function getTopicStats(repos = getActiveRepos()) {
    const counts = new Map();

    repos.forEach((repo) => {
        repo.topics.forEach((topic) => {
            if (!topic) {
                return;
            }
            counts.set(topic, (counts.get(topic) || 0) + 1);
        });
    });

    return [...counts.entries()]
        .map(([topic, count]) => ({ topic, count }))
        .sort((left, right) => right.count - left.count || left.topic.localeCompare(right.topic));
}

function getActivityStats(repos = getActiveRepos()) {
    const labels = ['Hot', 'Active', 'Steady', 'Quiet'];
    return labels.map((label) => ({
        label,
        count: repos.filter((repo) => repo.activity === label).length,
    }));
}

function syncFilterAvailability(repos) {
    const categories = new Set(repos.map((repo) => repo.category));
    const topics = new Set(repos.flatMap((repo) => repo.topics));
    const activities = new Set(repos.map((repo) => repo.activity));

    if (state.category !== 'all' && !categories.has(state.category)) {
        state.category = 'all';
    }
    if (state.topic !== 'all' && !topics.has(state.topic)) {
        state.topic = 'all';
    }
    if (state.activity !== 'all' && !activities.has(state.activity)) {
        state.activity = 'all';
    }
}

function populateCategoryFilter(repos = getActiveRepos()) {
    const select = document.getElementById('category-filter');
    const categoryStats = getCategoryStats(repos);

    select.innerHTML = [
        `<option value="all">All categories (${repos.length.toLocaleString()})</option>`,
        ...categoryStats.map(
            (entry) => `<option value="${escapeHtml(entry.name)}">${escapeHtml(entry.name)} (${entry.count})</option>`,
        ),
    ].join('');

    select.value = state.category;
}

function populateTopicFilter(repos = getActiveRepos()) {
    const select = document.getElementById('topic-filter');
    const topicStats = getTopicStats(repos);

    select.innerHTML = [
        `<option value="all">All topics</option>`,
        ...topicStats.slice(0, 60).map(
            (entry) => `<option value="${escapeHtml(entry.topic)}">${escapeHtml(entry.topic)} (${entry.count})</option>`,
        ),
    ].join('');

    select.value = state.topic;
}

function populateActivityFilter(repos = getActiveRepos()) {
    const select = document.getElementById('activity-filter');
    const activityStats = getActivityStats(repos);

    select.innerHTML = [
        '<option value="all">All activity</option>',
        ...activityStats.map(
            (entry) => `<option value="${entry.label}">${entry.label} (${entry.count})</option>`,
        ),
    ].join('');

    select.value = state.activity;
}

function renderCategoryGrid() {
    const grid = document.getElementById('category-grid');
    const cards = getCategoryStats().map((entry) => {
        const isActive = state.category === entry.name;
        const tone = categoryTones[entry.name] || categoryTones.Other;

        return `
            <button class="category-card ${tone} ${isActive ? 'active' : ''}" data-category="${escapeHtml(entry.name)}">
                <span class="category-card-name">${escapeHtml(entry.name)}</span>
                <span class="category-card-meta">${entry.count.toLocaleString()} repos</span>
                <span class="category-card-meta">${formatCompactNumber(entry.stars)} stars</span>
            </button>
        `;
    });

    grid.innerHTML = cards.join('');

    grid.querySelectorAll('.category-card').forEach((button) => {
        button.addEventListener('click', () => {
            state.category = button.dataset.category;
            state.currentPage = 1;
            state.activePreset = 'custom';
            document.getElementById('category-filter').value = state.category;
            applyFilters();
            document.getElementById('repos-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function renderStats() {
    const totalStars = state.starredRepos.reduce((sum, repo) => sum + repo.stars, 0);

    document.getElementById('repo-count').textContent = state.starredRepos.length.toLocaleString();
    document.getElementById('category-count').textContent = getCategoryStats(state.starredRepos).length.toLocaleString();
    document.getElementById('total-stars').textContent = formatCompactNumber(totalStars);
    document.getElementById('last-updated-time').textContent = state.updatedAt || '-';
}

function renderDatasetTabs() {
    document.querySelectorAll('.dataset-tab').forEach((button) => {
        button.classList.toggle('active', button.dataset.view === state.view);
    });

    document.getElementById('starred-tab-count').textContent = state.starredRepos.length.toLocaleString();
    document.getElementById('trending-tab-count').textContent = state.trendingRepos.length.toLocaleString();

    const caption = state.view === 'trending'
        ? 'Trending is ranked from your own starred-repo history and recent activity.'
        : 'All starred repositories, with filters and growth columns.';
    document.getElementById('dataset-caption').textContent = caption;
}

function renderPresetChips() {
    document.querySelectorAll('.preset-chip').forEach((button) => {
        button.classList.toggle('active', button.dataset.preset === state.activePreset);
    });
}

function renderHistoryNote() {
    const note = document.getElementById('history-note');
    const has1d = state.starredRepos.some((repo) => typeof repo.star_delta_1d === 'number');
    const has7d = state.starredRepos.some((repo) => typeof repo.star_delta_7d === 'number');

    if (!state.historyStartAt) {
        note.hidden = true;
        note.textContent = '';
        return;
    }

    if (state.view === 'trending') {
        if (state.trendingMode === 'bootstrap') {
            note.textContent = `Trending is warming up. Daily history started on ${state.historyStartAt}, so the ranking currently blends freshness, stars, and repo activity until real 1d/7d star movement is available.`;
            note.hidden = false;
            return;
        }

        if (state.trendingMode === 'history_1d' && !has7d) {
            note.textContent = 'Trending already uses 1d star movement. The 7d signal will strengthen automatically once at least 7 daily snapshots exist.';
            note.hidden = false;
            return;
        }

        note.hidden = true;
        note.textContent = '';
        return;
    }

    if (!has1d) {
        note.textContent = `Growth columns are warming up. Daily history started on ${state.historyStartAt} and there ${state.historyPoints === 1 ? 'is' : 'are'} ${state.historyPoints} snapshot${state.historyPoints === 1 ? '' : 's'} so far, so 1d and 7d star changes will fill in automatically after more daily runs.`;
        note.hidden = false;
        return;
    }

    if (!has7d) {
        note.textContent = '1d growth is available. 7d growth will appear automatically once at least 7 daily snapshots have been collected.';
        note.hidden = false;
        return;
    }

    note.hidden = true;
    note.textContent = '';
}

function sortRepos(repos) {
    const sorted = [...repos];

    sorted.sort((left, right) => {
        if (state.sort === 'stars_desc') return right.stars - left.stars;
        if (state.sort === 'trend_desc') return right.trend_score - left.trend_score;
        if (state.sort === 'growth_1d_desc') return (right.star_delta_1d ?? Number.NEGATIVE_INFINITY) - (left.star_delta_1d ?? Number.NEGATIVE_INFINITY);
        if (state.sort === 'growth_7d_desc') return (right.star_delta_7d ?? Number.NEGATIVE_INFINITY) - (left.star_delta_7d ?? Number.NEGATIVE_INFINITY);
        if (state.sort === 'forks_desc') return right.forks - left.forks;
        if (state.sort === 'updated_desc') return new Date(right.updated_at) - new Date(left.updated_at);
        if (state.sort === 'created_desc') return new Date(right.created_at) - new Date(left.created_at);
        return left.name.localeCompare(right.name);
    });

    return sorted;
}

function applyFilters() {
    const activeRepos = getActiveRepos();
    syncFilterAvailability(activeRepos);
    populateCategoryFilter(activeRepos);
    populateTopicFilter(activeRepos);
    populateActivityFilter(activeRepos);
    renderDatasetTabs();
    renderPresetChips();
    document.getElementById('repo-search').value = state.search;
    document.getElementById('stars-filter').value = String(state.minStars);
    document.getElementById('sort-select').value = state.sort;

    const query = state.search.trim().toLowerCase();

    state.filteredRepos = sortRepos(
        activeRepos.filter((repo) => {
            if (state.category !== 'all' && repo.category !== state.category) {
                return false;
            }

            if (state.topic !== 'all' && !repo.topics.includes(state.topic)) {
                return false;
            }

            if (state.activity !== 'all' && repo.activity !== state.activity) {
                return false;
            }

            if (repo.stars < state.minStars) {
                return false;
            }

            if (!query) {
                return true;
            }

            const haystack = [
                repo.name,
                repo.owner,
                repo.repo_name,
                repo.description,
                repo.category,
                repo.language,
                repo.activity,
                repo.license,
                repo.topics.join(' '),
            ]
                .join(' ')
                .toLowerCase();

            return haystack.includes(query);
        }),
    );

    const totalPages = Math.max(1, Math.ceil(state.filteredRepos.length / state.perPage));
    state.currentPage = Math.min(state.currentPage, totalPages);

    renderCategoryGrid();
    renderHistoryNote();
    renderTable();
    renderPagination();
}

function renderTable() {
    const tbody = document.getElementById('repos-tbody');
    const start = (state.currentPage - 1) * state.perPage;
    const pageRepos = state.filteredRepos.slice(start, start + state.perPage);

    if (pageRepos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">No repositories match the current filters.</td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = pageRepos
        .map((repo, index) => {
            const tone = categoryTones[repo.category] || categoryTones.Other;
            const rowNumber = start + index + 1;
            const activityClass = `activity-${repo.activity.toLowerCase()}`;
            const metaTopics = repo.topics.slice(0, 3).map((topic) => `<span class="topic-pill">${escapeHtml(topic)}</span>`).join('');
            const repoNumberLabel = state.view === 'trending' && repo.trend_rank
                ? `#${repo.trend_rank}`
                : `${rowNumber}`;

            return `
                <tr class="repo-row" data-repo-id="${repo.id}" tabindex="0" role="button" aria-label="Open details for ${escapeHtml(repo.name)}">
                    <td class="col-num">${repoNumberLabel}</td>
                    <td class="col-repo">
                        <div class="repo-primary">${escapeHtml(repo.owner)}</div>
                        <div class="repo-title-row">
                            <span class="repo-link">${escapeHtml(repo.repo_name)}</span>
                            <a class="repo-open-link" href="${escapeHtml(repo.url)}" target="_blank" rel="noreferrer" aria-label="Open ${escapeHtml(repo.name)} on GitHub">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7"/><path d="M9 7h8v8"/></svg>
                            </a>
                        </div>
                        <div class="repo-meta-row">
                            <span class="language-pill">${escapeHtml(repo.language)}</span>
                            <span class="activity-pill ${activityClass}">${escapeHtml(repo.activity)}</span>
                            ${metaTopics}
                        </div>
                    </td>
                    <td class="col-stars">${repo.stars.toLocaleString()}</td>
                    <td class="col-growth">${formatGrowth(repo.star_delta_1d, repo.star_delta_1d_pct)}</td>
                    <td class="col-growth">${formatGrowth(repo.star_delta_7d, repo.star_delta_7d_pct)}</td>
                    <td class="col-forks">${repo.forks.toLocaleString()}</td>
                    <td class="col-desc">
                        <div class="desc-text" title="${escapeHtml(repo.description)}">${escapeHtml(repo.description)}</div>
                    </td>
                    <td class="col-category">
                        <span class="badge ${tone}">${escapeHtml(repo.category)}</span>
                    </td>
                    <td class="col-date">${escapeHtml(repo.created_at)}</td>
                    <td class="col-date">${escapeHtml(repo.updated_at)}</td>
                </tr>
            `;
        })
        .join('');
}

function renderPagination() {
    const totalItems = state.filteredRepos.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / state.perPage));
    const label = `${state.currentPage} / ${totalPages} (${totalItems.toLocaleString()} ${getActiveViewLabel()})`;

    ['top', 'bottom'].forEach((position) => {
        document.getElementById(`${position}-page-info`).textContent = label;
        document.getElementById(`${position}-prev`).disabled = state.currentPage === 1;
        document.getElementById(`${position}-next`).disabled = state.currentPage === totalPages;
        document.getElementById(`${position}-per-page`).value = String(state.perPage);
    });

    document.getElementById('results-meta').textContent = `${totalItems.toLocaleString()} visible ${getActiveViewLabel()}`;
    renderCopyToolbar();
}

function changePage(delta) {
    const totalPages = Math.max(1, Math.ceil(state.filteredRepos.length / state.perPage));
    state.currentPage = Math.max(1, Math.min(state.currentPage + delta, totalPages));
    renderTable();
    renderPagination();
    document.getElementById('repos-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function getCurrentPageRepos() {
    const start = (state.currentPage - 1) * state.perPage;
    return state.filteredRepos.slice(start, start + state.perPage);
}

function getCopyRows() {
    return state.copyCurrentPageOnly ? getCurrentPageRepos() : state.filteredRepos;
}

function buildCopyPayload(repos) {
    const lines = ['repo\tgit_link'];

    repos.forEach((repo) => {
        lines.push(`${repo.name}\thttps://github.com/${repo.name}.git`);
    });

    return lines.join('\n');
}

async function copyText(text) {
    if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
}

function setCopyFeedback(label) {
    document.querySelectorAll('.copy-btn span').forEach((element) => {
        element.textContent = label;
    });
}

function renderCopyToolbar() {
    const rows = getCopyRows();
    const label = state.copyCurrentPageOnly ? `Copy page (${rows.length})` : `Copy filtered (${rows.length})`;

    document.querySelectorAll('.copy-btn span').forEach((element) => {
        element.textContent = label;
    });

    document.querySelectorAll('.copy-toggle input').forEach((input) => {
        input.checked = state.copyCurrentPageOnly;
    });
}

function openDrawer(repo) {
    if (!repo) {
        return;
    }

    state.selectedRepoId = repo.id;

    const body = document.getElementById('drawer-body');
    const badgeTone = categoryTones[repo.category] || categoryTones.Other;
    const readmeContent = repo.readme_excerpt
        ? escapeHtml(repo.readme_excerpt)
        : 'README preview is not cached for this repo yet. The generator will gradually cache popular and trending repos so the drawer stays static-friendly on GitHub Pages.';
    const homepage = repo.homepage
        ? `<a href="${escapeHtml(repo.homepage)}" target="_blank" rel="noreferrer">${escapeHtml(repo.homepage)}</a>`
        : '<span class="drawer-muted">Not set</span>';

    body.innerHTML = `
        <div class="drawer-hero">
            <div class="drawer-hero-copy">
                <div class="drawer-owner">${escapeHtml(repo.owner)}</div>
                <h4>${escapeHtml(repo.repo_name)}</h4>
                <p class="drawer-description">${escapeHtml(repo.description)}</p>
                <div class="drawer-badges">
                    <span class="badge ${badgeTone}">${escapeHtml(repo.category)}</span>
                    <span class="language-pill">${escapeHtml(repo.language)}</span>
                    <span class="activity-pill activity-${repo.activity.toLowerCase()}">${escapeHtml(repo.activity)}</span>
                    ${repo.topics.map((topic) => `<span class="topic-pill">${escapeHtml(topic)}</span>`).join('')}
                </div>
            </div>
            <div class="drawer-actions">
                <a class="drawer-action primary" href="${escapeHtml(repo.url)}" target="_blank" rel="noreferrer">Open GitHub</a>
                <button class="drawer-action" type="button" data-copy-clone="${escapeHtml(repo.name)}">Copy clone URL</button>
            </div>
        </div>

        <div class="drawer-metric-grid">
            <div class="drawer-metric">
                <span class="drawer-metric-label">Stars</span>
                <strong>${repo.stars.toLocaleString()}</strong>
            </div>
            <div class="drawer-metric">
                <span class="drawer-metric-label">Forks</span>
                <strong>${repo.forks.toLocaleString()}</strong>
            </div>
            <div class="drawer-metric">
                <span class="drawer-metric-label">Trend score</span>
                <strong>${repo.trend_score.toFixed(2)}</strong>
            </div>
            <div class="drawer-metric">
                <span class="drawer-metric-label">Trend source</span>
                <strong>${escapeHtml(repo.trend_source)}</strong>
            </div>
            <div class="drawer-metric">
                <span class="drawer-metric-label">1d growth</span>
                <strong>${typeof repo.star_delta_1d === 'number' ? `${repo.star_delta_1d >= 0 ? '+' : ''}${repo.star_delta_1d.toLocaleString()}` : 'warming up'}</strong>
            </div>
            <div class="drawer-metric">
                <span class="drawer-metric-label">7d growth</span>
                <strong>${typeof repo.star_delta_7d === 'number' ? `${repo.star_delta_7d >= 0 ? '+' : ''}${repo.star_delta_7d.toLocaleString()}` : 'warming up'}</strong>
            </div>
        </div>

        <div class="drawer-section-grid">
            <section class="drawer-section">
                <h5>Repository Info</h5>
                <dl class="drawer-meta-list">
                    <div><dt>Homepage</dt><dd>${homepage}</dd></div>
                    <div><dt>License</dt><dd>${escapeHtml(repo.license || 'Unknown')}</dd></div>
                    <div><dt>Default branch</dt><dd>${escapeHtml(repo.default_branch)}</dd></div>
                    <div><dt>Open issues</dt><dd>${repo.open_issues.toLocaleString()}</dd></div>
                    <div><dt>Created</dt><dd>${escapeHtml(repo.created_at)}</dd></div>
                    <div><dt>Updated</dt><dd>${escapeHtml(repo.updated_at)}</dd></div>
                    <div><dt>Pushed</dt><dd>${escapeHtml(repo.pushed_at)}</dd></div>
                    <div><dt>Archived</dt><dd>${repo.archived ? 'Yes' : 'No'}</dd></div>
                    <div><dt>Fork repo</dt><dd>${repo.is_fork ? 'Yes' : 'No'}</dd></div>
                    <div><dt>README</dt><dd>${escapeHtml(repo.readme_status)}</dd></div>
                </dl>
            </section>

            <section class="drawer-section">
                <h5>README Preview</h5>
                <div class="drawer-readme-wrap">
                    <div class="drawer-readme-path">${escapeHtml(repo.readme_path || 'README cache')}</div>
                    <pre class="drawer-readme">${readmeContent}</pre>
                </div>
            </section>
        </div>
    `;

    document.getElementById('drawer-backdrop').hidden = false;
    document.getElementById('repo-drawer').classList.add('open');
    document.getElementById('repo-drawer').setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
}

function closeDrawer() {
    state.selectedRepoId = null;
    document.getElementById('drawer-backdrop').hidden = true;
    document.getElementById('repo-drawer').classList.remove('open');
    document.getElementById('repo-drawer').setAttribute('aria-hidden', 'true');
    document.body.classList.remove('drawer-open');
}

function resetFilters({ keepView = true, preset = 'all' } = {}) {
    const currentView = state.view;
    state.search = '';
    state.category = 'all';
    state.topic = 'all';
    state.activity = 'all';
    state.minStars = 0;
    state.sort = keepView && currentView === 'trending' ? 'trend_desc' : 'stars_desc';
    state.currentPage = 1;
    state.activePreset = preset;
    if (!keepView) {
        state.view = 'starred';
    }

    document.getElementById('repo-search').value = '';
    document.getElementById('stars-filter').value = '0';
    document.getElementById('sort-select').value = state.sort;
}

function applyPreset(presetId) {
    const handler = presetDefinitions[presetId];
    if (!handler) {
        return;
    }

    handler();
    applyFilters();
}

function bindCopyToolbar(position) {
    document.getElementById(`${position}-copy-scope`).addEventListener('change', (event) => {
        state.copyCurrentPageOnly = event.target.checked;
        renderCopyToolbar();
    });

    document.getElementById(`${position}-copy-button`).addEventListener('click', async () => {
        const reposToCopy = getCopyRows();

        if (reposToCopy.length === 0) {
            setCopyFeedback('No rows to copy');
            window.setTimeout(renderCopyToolbar, 1400);
            return;
        }

        try {
            await copyText(buildCopyPayload(reposToCopy));
            setCopyFeedback(`Copied ${reposToCopy.length}`);
        } catch (error) {
            console.error(error);
            setCopyFeedback('Copy failed');
        }

        window.setTimeout(renderCopyToolbar, 1400);
    });
}

function bindPagination(position) {
    document.getElementById(`${position}-prev`).addEventListener('click', () => changePage(-1));
    document.getElementById(`${position}-next`).addEventListener('click', () => changePage(1));
    document.getElementById(`${position}-per-page`).addEventListener('change', (event) => {
        state.perPage = Number(event.target.value);
        state.currentPage = 1;
        renderTable();
        renderPagination();
    });
}

function bindNav() {
    document.querySelectorAll('.nav-link[data-section]').forEach((button) => {
        button.addEventListener('click', () => {
            document.querySelectorAll('.nav-link[data-section]').forEach((item) => {
                item.classList.toggle('active', item === button);
            });
            document.getElementById(`${button.dataset.section}-section`).scrollIntoView({
                behavior: 'smooth',
                block: 'start',
            });
        });
    });
}

function bindFilters() {
    document.getElementById('repo-search').addEventListener('input', (event) => {
        state.search = event.target.value;
        state.currentPage = 1;
        state.activePreset = 'custom';
        applyFilters();
    });

    document.getElementById('category-filter').addEventListener('change', (event) => {
        state.category = event.target.value;
        state.currentPage = 1;
        state.activePreset = 'custom';
        applyFilters();
    });

    document.getElementById('topic-filter').addEventListener('change', (event) => {
        state.topic = event.target.value;
        state.currentPage = 1;
        state.activePreset = 'custom';
        applyFilters();
    });

    document.getElementById('activity-filter').addEventListener('change', (event) => {
        state.activity = event.target.value;
        state.currentPage = 1;
        state.activePreset = 'custom';
        applyFilters();
    });

    document.getElementById('stars-filter').addEventListener('change', (event) => {
        state.minStars = Number(event.target.value);
        state.currentPage = 1;
        state.activePreset = 'custom';
        applyFilters();
    });

    document.getElementById('sort-select').addEventListener('change', (event) => {
        state.sort = event.target.value;
        state.currentPage = 1;
        state.activePreset = 'custom';
        applyFilters();
    });

    document.getElementById('reset-filters').addEventListener('click', () => {
        resetFilters({ keepView: true, preset: 'all' });
        applyFilters();
    });
}

function bindDatasetTabs() {
    document.querySelectorAll('.dataset-tab').forEach((button) => {
        button.addEventListener('click', () => {
            const nextView = button.dataset.view;
            if (!nextView || nextView === state.view) {
                return;
            }

            state.view = nextView;
            state.currentPage = 1;

            if (state.view === 'trending' && state.sort === 'stars_desc') {
                state.sort = 'trend_desc';
                document.getElementById('sort-select').value = state.sort;
            } else if (state.view === 'starred' && state.sort === 'trend_desc') {
                state.sort = 'stars_desc';
                document.getElementById('sort-select').value = state.sort;
            }

            applyFilters();
        });
    });
}

function bindPresets() {
    document.querySelectorAll('.preset-chip').forEach((button) => {
        button.addEventListener('click', () => {
            applyPreset(button.dataset.preset);
        });
    });
}

function bindTableInteractions() {
    const tbody = document.getElementById('repos-tbody');

    tbody.addEventListener('click', (event) => {
        if (event.target.closest('a.repo-open-link')) {
            return;
        }

        const row = event.target.closest('.repo-row');
        if (!row) {
            return;
        }

        openDrawer(getRepoById(row.dataset.repoId));
    });

    tbody.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') {
            return;
        }

        const row = event.target.closest('.repo-row');
        if (!row) {
            return;
        }

        event.preventDefault();
        openDrawer(getRepoById(row.dataset.repoId));
    });
}

function bindDrawer() {
    document.getElementById('drawer-close').addEventListener('click', closeDrawer);
    document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);

    document.getElementById('drawer-body').addEventListener('click', async (event) => {
        const button = event.target.closest('[data-copy-clone]');
        if (!button) {
            return;
        }

        try {
            await copyText(`https://github.com/${button.dataset.copyClone}.git`);
            button.textContent = 'Copied';
            window.setTimeout(() => {
                button.textContent = 'Copy clone URL';
            }, 1400);
        } catch (error) {
            console.error(error);
            button.textContent = 'Copy failed';
            window.setTimeout(() => {
                button.textContent = 'Copy clone URL';
            }, 1400);
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.body.classList.contains('drawer-open')) {
            closeDrawer();
        }
    });
}

function updateBackToTopVisibility() {
    const button = document.getElementById('back-to-top');
    const shouldShow = window.scrollY > 640;
    button.hidden = !shouldShow;
    button.classList.toggle('visible', shouldShow);
}

function bindBackToTop() {
    const button = document.getElementById('back-to-top');

    button.addEventListener('click', () => {
        window.scrollTo({
            top: 0,
            behavior: 'smooth',
        });
    });

    window.addEventListener('scroll', updateBackToTopVisibility, { passive: true });
    updateBackToTopVisibility();
}

async function loadData() {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
        throw new Error('Failed to load repository data');
    }

    const data = await response.json();
    state.starredRepos = (data.starred_repos || []).map(normalizeRepo);
    state.trendingRepos = (data.trending_repos || []).map(normalizeRepo);
    state.updatedAt = data.updated_at || '';
    state.historyStartAt = data.history_start_at || '';
    state.historyPoints = data.history_points || 0;
    state.trendingMode = data.trending_mode || 'bootstrap';

    renderStats();
    applyFilters();
}

document.addEventListener('DOMContentLoaded', async () => {
    bindNav();
    bindFilters();
    bindDatasetTabs();
    bindPresets();
    bindCopyToolbar('top');
    bindCopyToolbar('bottom');
    bindPagination('top');
    bindPagination('bottom');
    bindTableInteractions();
    bindDrawer();
    bindBackToTop();
    closeDrawer();

    try {
        await loadData();
    } catch (error) {
        console.error(error);
        document.getElementById('results-meta').textContent = 'Unable to load repository data';
        document.getElementById('repos-tbody').innerHTML = `
            <tr>
                <td colspan="10" class="empty-state">Repository data could not be loaded.</td>
            </tr>
        `;
    }
});
