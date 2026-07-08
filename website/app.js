const STAR_HISTORY_URL = 'data/star_history.json?v=20260701-1';

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
    stackLayer: 'all',
    minStars: 0,
    sort: 'stars_desc',
    search: '',
    activePreset: 'all',
    updatedAt: '',
    historyStartAt: '',
    historyPoints: 0,
    trendingMode: 'bootstrap',
    selectedRepoId: null,
    starHistoryMap: null,
    mobileView: localStorage.getItem('mobileView') === 'true',
};

const DATA_URL = 'data/repos.json?v=20260328-5';
const DEFAULT_PER_PAGE = 50;
const DEFAULT_VIEW = 'starred';

function getDefaultSortForView(view = state.view) {
    return view === 'trending' ? 'trend_desc' : 'stars_desc';
}

function hasCustomFilters() {
    return state.search.trim() !== ''
        || state.category !== 'all'
        || state.topic !== 'all'
        || state.activity !== 'all'
        || state.stackLayer !== 'all'
        || state.minStars !== 0
        || state.sort !== getDefaultSortForView(state.view);
}

function buildStateQueryParams() {
    const params = new URLSearchParams();

    if (state.view !== DEFAULT_VIEW) {
        params.set('view', state.view);
    }
    if (state.search.trim()) {
        params.set('q', state.search.trim());
    }
    if (state.category !== 'all') {
        params.set('category', state.category);
    }
    if (state.topic !== 'all') {
        params.set('topic', state.topic);
    }
    if (state.activity !== 'all') {
        params.set('activity', state.activity);
    }
    if (state.stackLayer !== 'all') {
        params.set('stack', state.stackLayer);
    }
    if (state.minStars > 0) {
        params.set('stars', String(state.minStars));
    }
    if (state.sort !== getDefaultSortForView(state.view)) {
        params.set('sort', state.sort);
    }
    if (state.perPage !== DEFAULT_PER_PAGE) {
        params.set('rows', String(state.perPage));
    }
    if (state.currentPage > 1) {
        params.set('page', String(state.currentPage));
    }
    if (state.activePreset !== 'all' && state.activePreset !== 'custom') {
        params.set('preset', state.activePreset);
    }

    return params;
}

function syncUrlState() {
    const url = new URL(window.location.href);
    const nextQuery = buildStateQueryParams().toString();
    const currentQuery = url.search.startsWith('?') ? url.search.slice(1) : url.search;

    if (nextQuery === currentQuery) {
        return;
    }

    url.search = nextQuery;
    window.history.replaceState({}, '', url);
}

function restoreStateFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const requestedView = params.get('view');
    const requestedSort = params.get('sort');
    const requestedPerPage = Number(params.get('rows'));
    const requestedPage = Number(params.get('page'));
    const requestedPreset = params.get('preset');
    const allowedSorts = new Set([
        'stars_desc',
        'trend_desc',
        'growth_1d_desc',
        'growth_7d_desc',
        'forks_desc',
        'updated_desc',
        'created_desc',
        'name_asc',
    ]);

    if (requestedView === 'starred' || requestedView === 'trending') {
        state.view = requestedView;
    }

    state.search = params.get('q') || '';
    state.category = params.get('category') || 'all';
    state.topic = params.get('topic') || 'all';
    state.activity = params.get('activity') || 'all';
    state.stackLayer = params.get('stack') || 'all';

    if (Number.isFinite(requestedPerPage) && [25, 50, 100].includes(requestedPerPage)) {
        state.perPage = requestedPerPage;
    }

    if (Number.isFinite(requestedPage) && requestedPage >= 1) {
        state.currentPage = Math.floor(requestedPage);
    }

    const requestedStars = Number(params.get('stars'));
    if (Number.isFinite(requestedStars) && requestedStars >= 0) {
        state.minStars = requestedStars;
    }

    if (requestedSort && allowedSorts.has(requestedSort)) {
        state.sort = requestedSort;
    } else {
        state.sort = getDefaultSortForView(state.view);
    }

    if (requestedPreset && presetDefinitions[requestedPreset]) {
        state.activePreset = requestedPreset;
    } else {
        state.activePreset = hasCustomFilters() ? 'custom' : 'all';
    }
}

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
        stack_layer: classifyStackLayer(repo),
    };
}

function getActiveRepos() {
    return state.view === 'trending' ? state.trendingRepos : state.starredRepos;
}

function getActiveViewLabel() {
    return state.view === 'trending' ? 'trending repos' : 'repos';
}

function getActiveViewSlug() {
    return state.view === 'trending' ? 'trending-repos' : 'repos';
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
    document.getElementById('stack-filter').value = state.stackLayer;
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

            if (state.stackLayer !== 'all' && repo.stack_layer !== state.stackLayer) {
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

            const terms = query.split(',').map(t => t.trim()).filter(t => t.length > 0);
            return terms.length === 0 || terms.every(term => haystack.includes(term));
        }),
    );

    const totalPages = Math.max(1, Math.ceil(state.filteredRepos.length / state.perPage));
    state.currentPage = Math.min(state.currentPage, totalPages);

    renderCategoryGrid();
    renderHistoryNote();
    renderTable();
    renderPagination();
}

function renderSignalBadge(repo) {
    const d7 = repo.star_delta_7d;
    const d1 = repo.star_delta_1d;
    if (d7 === null && d1 === null) return '';
    if (d7 >= 500) return '<span class="sig-badge sig-fire" title="On fire — 500+ stars this week">🔥</span>';
    if (d7 >= 100 || d1 >= 50) return '<span class="sig-badge sig-surging" title="Surging — strong growth">⚡</span>';
    if (d7 > 0) return '<span class="sig-badge sig-growing" title="Growing — positive momentum">📈</span>';
    return '';
}

function renderSparkline(repo) {
    if (!state.starHistoryMap) return '';
    const arr = state.starHistoryMap.get(repo.name);
    if (!arr || arr.length < 2) return '';
    const values = arr.filter(v => v !== null);
    if (values.length < 2) return '';
    const w = 72, h = 22;
    const min = Math.min(...values), max = Math.max(...values);
    const range = max - min || 1;
    const points = values.map((v, i) => {
        const x = (i / (values.length - 1)) * (w - 4) + 2;
        const y = h - 4 - ((v - min) / range) * (h - 8);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
    const color = values[values.length - 1] >= values[0] ? 'var(--success)' : '#ff7878';
    const fillId = `sfill-${repo.id}`;
    return `<svg class="sparkline" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-label="Star history trend">
        <defs><linearGradient id="${fillId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${color}" stop-opacity="0.2"/>
            <stop offset="100%" stop-color="${color}" stop-opacity="0.02"/>
        </linearGradient></defs>
        <polygon points="${points} ${(w - 2).toFixed(1)},${(h - 4).toFixed(1)} 2,${(h - 4).toFixed(1)}" fill="url(#${fillId})"/>
        <polyline points="${points}" fill="none" stroke="${color}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;
}

function renderTable() {
    const isMobile = state.mobileView;
    const tableShell = document.querySelector('.table-shell');
    const mobileList = document.getElementById('mobile-repos-list');

    if (tableShell) tableShell.style.display = isMobile ? 'none' : 'block';
    if (mobileList) mobileList.style.display = isMobile ? 'block' : 'none';

    if (isMobile) {
        renderMobileList();
        return;
    }

    const tbody = document.getElementById('repos-tbody');
    const start = (state.currentPage - 1) * state.perPage;
    const pageRepos = state.filteredRepos.slice(start, start + state.perPage);

    if (pageRepos.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="12" class="empty-state">No repositories match the current filters.</td>
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
                    <td class="col-num" data-label="#">${repoNumberLabel}</td>
                    <td class="col-repo" data-label="Repo">
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
                    <td class="col-stars" data-label="Stars">${repo.stars.toLocaleString()}</td>
                    <td class="col-signal" data-label="">${renderSignalBadge(repo)}</td>
                    <td class="col-growth" data-label="1d">${formatGrowth(repo.star_delta_1d, repo.star_delta_1d_pct)}</td>
                    <td class="col-growth" data-label="7d">${formatGrowth(repo.star_delta_7d, repo.star_delta_7d_pct)}</td>
                    <td class="col-trend" data-label="Trend">${renderSparkline(repo)}</td>
                    <td class="col-forks" data-label="Forks">${repo.forks.toLocaleString()}</td>
                    <td class="col-desc" data-label="Description">
                        <div class="desc-text" title="${escapeHtml(repo.description)}">${escapeHtml(repo.description)}</div>
                    </td>
                    <td class="col-category" data-label="Category">
                        <span class="badge ${tone}">${escapeHtml(repo.category)}</span>
                    </td>
                    <td class="col-date" data-label="Created">${escapeHtml(repo.created_at)}</td>
                    <td class="col-date" data-label="Updated">${escapeHtml(repo.updated_at)}</td>
                </tr>
            `;
        })
        .join('');
}

function renderPagination() {
    const totalItems = state.filteredRepos.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / state.perPage));
    const label = `${state.currentPage} / ${totalPages}`;

    ['top', 'bottom'].forEach((position) => {
        const infoEl = document.getElementById(`${position}-page-info`);
        if (infoEl) infoEl.textContent = label;
        
        const prevEl = document.getElementById(`${position}-prev`);
        if (prevEl) prevEl.disabled = state.currentPage === 1;
        
        const nextEl = document.getElementById(`${position}-next`);
        if (nextEl) nextEl.disabled = state.currentPage === totalPages;
        
        const perPageEl = document.getElementById(`${position}-per-page`);
        if (perPageEl) perPageEl.value = String(state.perPage);
    });

    document.getElementById('results-meta').textContent = `${totalItems.toLocaleString()} items`;
    syncUrlState();
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

function getScopedRows() {
    return state.filteredRepos;
}

function getCopyRows() {
    return state.filteredRepos;
}

function buildCopyPayload(repos) {
    const lines = ['repo\tgit_link'];

    repos.forEach((repo) => {
        lines.push(`${repo.name}\thttps://github.com/${repo.name}.git`);
    });

    return lines.join('\n');
}

// ---- Ask AI (Google AI Mode) ----
const PROMPTS_STORAGE_KEY = 'starred-repo-custom-prompts';

function loadCustomPrompts() {
    try { return JSON.parse(localStorage.getItem(PROMPTS_STORAGE_KEY)) || []; }
    catch { return []; }
}
function saveCustomPrompts(prompts) {
    localStorage.setItem(PROMPTS_STORAGE_KEY, JSON.stringify(prompts));
}
function renderCustomPrompts() {
    const list = document.getElementById('prompts-custom-list');
    const group = document.getElementById('prompts-custom-group');
    const prompts = loadCustomPrompts();
    if (!prompts.length) { group.hidden = true; return; }
    group.hidden = false;
    list.innerHTML = prompts.map((p, i) =>
        `<div class="prompts-custom-item" data-index="${i}">
            <span class="prompts-custom-text">${escapeHtml(p)}</span>
            <button class="prompts-del" data-index="${i}" type="button" aria-label="Delete prompt">✕</button>
        </div>`
    ).join('');
    list.querySelectorAll('.prompts-custom-item').forEach(el => {
        el.addEventListener('click', (e) => {
            if (e.target.closest('.prompts-del')) return;
            const idx = Number(el.dataset.index);
            const prompts = loadCustomPrompts();
            if (prompts[idx]) injectPrompt(prompts[idx]);
        });
    });
    list.querySelectorAll('.prompts-del').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = Number(btn.dataset.index);
            let prompts = loadCustomPrompts();
            prompts.splice(idx, 1);
            saveCustomPrompts(prompts);
            renderCustomPrompts();
        });
    });
}
function injectPrompt(text) {
    const ta = document.getElementById('ai-ask-question');
    if (!ta) return;
    ta.value = text;
    ta.dispatchEvent(new Event('input'));
    closePromptsMenu();
}
function closePromptsMenu() {
    const menu = document.getElementById('ask-prompts-menu');
    const btn = document.getElementById('ask-prompts-btn');
    if (menu) menu.hidden = true;
    if (btn) btn.classList.remove('open');
}
function togglePromptsMenu() {
    const menu = document.getElementById('ask-prompts-menu');
    const btn = document.getElementById('ask-prompts-btn');
    if (!menu) return;
    const isOpen = !menu.hidden;
    menu.hidden = isOpen;
    btn.classList.toggle('open', !isOpen);
    if (!isOpen) renderCustomPrompts();
}

const AI_ASK_DEFAULT_QUESTION =
    'I have a curated list of GitHub AI repositories below. Give me a concise overview of what each one does, group them by purpose, highlight the strongest options, and recommend which to try first for building an AI app.';
const AI_ASK_DESC_LIMIT = 140;
const AI_ASK_URL_SOFT_LIMIT = 7500;

function getAiAskRepos() {
    const limitRaw = Number(document.getElementById('ai-ask-count')?.value ?? 25);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : state.filteredRepos.length;
    return state.filteredRepos.slice(0, limit);
}

function buildAiRepoList(repos, includeDesc) {
    return repos
        .map((repo, index) => {
            const stars = `${repo.stars.toLocaleString()}★`;
            const url = `https://github.com/${repo.name}`;
            if (!includeDesc) {
                return `${index + 1}. ${repo.name} (${stars}) — ${url}`;
            }
            const desc = String(repo.description || '').replace(/\s+/g, ' ').trim();
            const shortDesc = desc.length > AI_ASK_DESC_LIMIT ? `${desc.slice(0, AI_ASK_DESC_LIMIT - 1)}…` : desc;
            return `${index + 1}. ${repo.name} (${stars}) — ${url}${shortDesc ? ` — ${shortDesc}` : ''}`;
        })
        .join('\n');
}

function buildAiAskFilterContext() {
    const bits = [`View: ${state.view === 'trending' ? 'Trending' : 'All Repos'}`];
    if (state.search.trim()) bits.push(`Search: ${state.search.trim()}`);
    if (state.category !== 'all') bits.push(`Category: ${state.category}`);
    if (state.topic !== 'all') bits.push(`Topic: ${state.topic}`);
    if (state.activity !== 'all') bits.push(`Activity: ${state.activity}`);
    if (state.stackLayer !== 'all') bits.push(`Stack: ${state.stackLayer}`);
    if (state.minStars > 0) bits.push(`Min stars: ${state.minStars.toLocaleString()}`);
    return bits.join(' • ');
}

function buildAiAskPrompt() {
    const questionEl = document.getElementById('ai-ask-question');
    const question = (questionEl?.value || AI_ASK_DEFAULT_QUESTION).trim();
    const includeDesc = document.getElementById('ai-ask-include-desc')?.checked ?? true;
    const repos = getAiAskRepos();
    const list = buildAiRepoList(repos, includeDesc);
    return `${question}\n\nFilter context: ${buildAiAskFilterContext()}\nRepositories (${repos.length}):\n${list}`;
}

function buildGoogleAiModeUrl(query) {
    return `https://www.google.com/search?q=${encodeURIComponent(query.trim())}&udm=50`;
}

function renderAiAskPreview() {
    const prompt = buildAiAskPrompt();
    const repos = getAiAskRepos();
    const preview = document.getElementById('ai-ask-preview');
    const meter = document.getElementById('ai-ask-meter');
    const warning = document.getElementById('ai-ask-warning');
    const context = document.getElementById('ai-ask-context');

    if (preview) preview.value = prompt;

    const urlLength = buildGoogleAiModeUrl(prompt).length;
    if (meter) {
        meter.textContent = `${repos.length} repos • ${prompt.length.toLocaleString()} chars • URL ~${urlLength.toLocaleString()}`;
    }

    if (context) {
        context.textContent = state.filteredRepos.length === repos.length
            ? `Asking about all ${repos.length} filtered repo${repos.length === 1 ? '' : 's'}.`
            : `Asking about the top ${repos.length} of ${state.filteredRepos.length} filtered repos.`;
    }

    if (warning) {
        if (urlLength > AI_ASK_URL_SOFT_LIMIT) {
            warning.hidden = false;
            warning.textContent = 'Long prompt — Google may trim it in the URL. It is copied to your clipboard as a backup so you can paste it into AI Mode.';
        } else {
            warning.hidden = true;
            warning.textContent = '';
        }
    }
}

function openAiAskModal() {
    if (state.filteredRepos.length === 0) {
        return;
    }
    closePromptsMenu();
    const questionEl = document.getElementById('ai-ask-question');
    if (questionEl && !questionEl.value.trim()) {
        questionEl.value = AI_ASK_DEFAULT_QUESTION;
    }
    renderAiAskPreview();
    document.getElementById('ai-ask-backdrop').hidden = false;
    const modal = document.getElementById('ai-ask-modal');
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.classList.add('drawer-open');
}

function closeAiAskModal() {
    closePromptsMenu();
    document.getElementById('ai-ask-backdrop').hidden = true;
    const modal = document.getElementById('ai-ask-modal');
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.getElementById('repo-drawer').classList.contains('open')) {
        document.body.classList.remove('drawer-open');
    }
}

function setAiAskOpenFeedback(label) {
    const span = document.querySelector('#ai-ask-open span');
    if (span) span.textContent = label;
}

async function launchAiAsk() {
    const prompt = buildAiAskPrompt();

    // Always copy as a backup in case Google trims a long prompt from the URL.
    try {
        await copyText(prompt);
    } catch (error) {
        console.error(error);
    }

    window.open(buildGoogleAiModeUrl(prompt), '_blank', 'noopener');
    setAiAskOpenFeedback('Opened ✓ (prompt copied)');
    window.setTimeout(() => setAiAskOpenFeedback('Open in Google AI Mode'), 1800);
}

function bindAiAsk() {
    const openModal = () => openAiAskModal();
    document.getElementById('hero-ask-ai')?.addEventListener('click', openModal);
    document.getElementById('top-ask-ai')?.addEventListener('click', openModal);
    document.getElementById('bottom-ask-ai')?.addEventListener('click', openModal);
    document.getElementById('ai-ask-close')?.addEventListener('click', closeAiAskModal);
    document.getElementById('ai-ask-backdrop')?.addEventListener('click', closeAiAskModal);
    document.getElementById('ai-ask-count')?.addEventListener('change', renderAiAskPreview);
    document.getElementById('ai-ask-include-desc')?.addEventListener('change', renderAiAskPreview);
    document.getElementById('ai-ask-question')?.addEventListener('input', renderAiAskPreview);
    document.getElementById('ai-ask-open')?.addEventListener('click', launchAiAsk);

    // Prompt templates
    document.getElementById('ask-prompts-btn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        togglePromptsMenu();
    });
    document.getElementById('ask-prompts-add')?.addEventListener('click', () => {
        const text = window.prompt('Enter your custom prompt:');
        if (text && text.trim()) {
            const prompts = loadCustomPrompts();
            prompts.push(text.trim());
            saveCustomPrompts(prompts);
            renderCustomPrompts();
            injectPrompt(text.trim());
        }
    });
    document.querySelectorAll('.prompts-item[data-prompt]').forEach(el => {
        el.addEventListener('click', () => injectPrompt(el.dataset.prompt));
    });
    document.addEventListener('click', (e) => {
        const wrapper = document.querySelector('.ai-ask-prompts-wrapper');
        if (wrapper && !wrapper.contains(e.target)) closePromptsMenu();
    });

    const copyBtn = document.getElementById('ai-ask-copy');
    copyBtn?.addEventListener('click', async () => {
        try {
            await copyText(buildAiAskPrompt());
            copyBtn.textContent = 'Copied ✓';
        } catch (error) {
            console.error(error);
            copyBtn.textContent = 'Copy failed';
        }
        window.setTimeout(() => {
            copyBtn.textContent = 'Copy prompt';
        }, 1500);
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && document.getElementById('ai-ask-modal').classList.contains('open')) {
            closeAiAskModal();
        }
    });
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

function setShareFeedback(label) {
    document.querySelectorAll('.share-btn span').forEach((element) => {
        element.textContent = label;
    });
}

function setExportFeedback(format, label) {
    document.querySelectorAll(`.export-btn[data-format="${format}"] span`).forEach((element) => {
        element.textContent = label;
    });
}

function escapeCsvValue(value) {
    const text = String(value ?? '');
    if (!/[",\n]/.test(text)) {
        return text;
    }
    return `"${text.replaceAll('"', '""')}"`;
}

function buildCsvPayload(repos) {
    const header = [
        'repo',
        'github_url',
        'git_link',
        'stars',
        'forks',
        'category',
        'activity',
        'language',
        'topics',
        'created_at',
        'updated_at',
        'trend_score',
        'growth_1d',
        'growth_7d',
    ];
    const lines = [header.join(',')];

    repos.forEach((repo) => {
        lines.push([
            repo.name,
            repo.url,
            `https://github.com/${repo.name}.git`,
            repo.stars,
            repo.forks,
            repo.category,
            repo.activity,
            repo.language,
            repo.topics.join('|'),
            repo.created_at,
            repo.updated_at,
            repo.trend_score.toFixed(2),
            repo.star_delta_1d ?? '',
            repo.star_delta_7d ?? '',
        ].map(escapeCsvValue).join(','));
    });

    return lines.join('\n');
}

function escapeMarkdownCell(value) {
    return String(value ?? '')
        .replaceAll('\n', ' ')
        .replaceAll('|', '\\|');
}

function buildMarkdownPayload(repos) {
    const filters = [
        `View: ${state.view === 'trending' ? 'Trending' : 'All Repos'}`,
        `Scope: ${state.copyCurrentPageOnly ? `Current page (${repos.length})` : `Filtered results (${repos.length})`}`,
        `Search: ${state.search.trim() || 'None'}`,
        `Category: ${state.category === 'all' ? 'All' : state.category}`,
        `Topic: ${state.topic === 'all' ? 'All' : state.topic}`,
        `Activity: ${state.activity === 'all' ? 'All' : state.activity}`,
        `Min stars: ${state.minStars.toLocaleString()}`,
        `Sort: ${state.sort}`,
        `Exported at: ${new Date().toISOString()}`,
    ];

    const lines = [
        '# Filtered Repository Export',
        '',
        ...filters.map((entry) => `- ${entry}`),
        '',
        '| Repo | Git Link | Stars | Forks | Category | Activity | Topics | Updated |',
        '| --- | --- | ---: | ---: | --- | --- | --- | --- |',
    ];

    repos.forEach((repo) => {
        lines.push(`| ${escapeMarkdownCell(repo.name)} | \`${escapeMarkdownCell(`https://github.com/${repo.name}.git`)}\` | ${repo.stars.toLocaleString()} | ${repo.forks.toLocaleString()} | ${escapeMarkdownCell(repo.category)} | ${escapeMarkdownCell(repo.activity)} | ${escapeMarkdownCell(repo.topics.join(', '))} | ${escapeMarkdownCell(repo.updated_at)} |`);
    });

    return lines.join('\n');
}

function normalizeExportExtension(extension) {
    const normalized = String(extension || '').trim().toLowerCase().replace(/^\./, '');
    return normalized === 'md' ? 'md' : 'csv';
}

function ensureFilenameExtension(filename, extension) {
    const normalized = normalizeExportExtension(extension);
    return filename.toLowerCase().endsWith(`.${normalized}`) ? filename : `${filename}.${normalized}`;
}

function buildExportFilename(extension, repoCount) {
    const normalized = normalizeExportExtension(extension);
    const scope = state.copyCurrentPageOnly ? `page-${state.currentPage}` : 'filtered';
    const timestamp = (state.updatedAt || new Date().toISOString().slice(0, 10)).replaceAll('/', '-');
    const count = Number(repoCount || 0).toLocaleString('en-US').replaceAll(',', '');
    return ensureFilenameExtension(`hankbui-${getActiveViewSlug()}-export-${scope}-${count}-rows-${timestamp}`, normalized);
}

function downloadTextFile(filename, extension, content, mimeType) {
    const safeFilename = ensureFilenameExtension(filename, extension);
    const blob = new Blob([content], { type: mimeType });
    const blobUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = blobUrl;
    link.download = safeFilename;
    link.setAttribute('download', safeFilename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    window.setTimeout(() => {
        URL.revokeObjectURL(blobUrl);
    }, 0);
}

function renderActionToolbar() {
    document.querySelectorAll('.share-btn span').forEach((element) => {
        element.textContent = 'Share URL';
    });

    document.querySelectorAll('.export-btn[data-format="csv"] span').forEach((element) => {
        element.textContent = 'CSV';
    });

    document.querySelectorAll('.export-btn[data-format="md"] span').forEach((element) => {
        element.textContent = 'MD';
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

    renderActionToolbar();
}

function getSimilarRepos(repo, limit = 5) {
    const all = getActiveRepos();
    const myId = repo.id;
    const myTopics = new Set((repo.topics || []).map(t => t.toLowerCase()));
    const myCat = repo.category || '';

    const scored = all.filter(r => r.id !== myId).map(r => {
        let score = 0;
        if (r.category === myCat) score += 3;
        const rTopics = new Set((r.topics || []).map(t => t.toLowerCase()));
        const overlap = [...myTopics].filter(t => rTopics.has(t)).length;
        score += overlap * 2;
        if (r.stars > repo.stars * 0.5 && r.stars < repo.stars * 2) score += 1;
        if (r.language && r.language === repo.language && r.language !== 'Unknown') score += 1;
        return { repo: r, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit).filter(s => s.score > 0).map(s => s.repo);
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
                <span class="drawer-metric-label">Stack Layer</span>
                <strong>${escapeHtml(repo.stack_layer)}</strong>
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

            <section class="drawer-section">
                <h5>Similar Repos</h5>
                <div class="drawer-similar" id="drawer-similar">Loading…</div>
            </section>
        </div>
    `;

    // Render similar repos asynchronously
    const similar = getSimilarRepos(repo, 6);
    const similarEl = document.getElementById('drawer-similar');
    if (similar.length) {
        similarEl.innerHTML = similar.map(r => {
            const tone = categoryTones[r.category] || categoryTones.Other;
            return `<a class="drawer-sim-item" href="javascript:void(0)" data-repo-id="${r.id}" tabindex="0">
                <span class="drawer-sim-name">${escapeHtml(r.repo_name)}</span>
                <span class="drawer-sim-meta">
                    <span class="badge ${tone}" style="font-size:0.65rem;padding:1px 6px">${escapeHtml(r.category)}</span>
                    <span>${r.stars.toLocaleString()}★</span>
                </span>
            </a>`;
        }).join('');
        similarEl.querySelectorAll('.drawer-sim-item').forEach(el => {
            el.addEventListener('click', () => {
                const target = getRepoById(Number(el.dataset.repoId));
                if (target) openDrawer(target);
            });
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    const target = getRepoById(Number(el.dataset.repoId));
                    if (target) openDrawer(target);
                }
            });
        });
    } else {
        similarEl.textContent = 'No closely related repos found.';
    }

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
    state.stackLayer = 'all';
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
    const scopeEl = document.getElementById(`${position}-copy-scope`);
    if (scopeEl) {
        scopeEl.addEventListener('change', (event) => {
            state.copyCurrentPageOnly = event.target.checked;
            renderCopyToolbar();
        });
    }

    const btnEl = document.getElementById(`${position}-copy-button`);
    if (btnEl) {
        btnEl.addEventListener('click', async () => {
            const reposToCopy = getCopyRows();

            if (reposToCopy.length === 0) {
                setCopyFeedback('No rows');
                window.setTimeout(renderCopyToolbar, 1400);
                return;
            }

            try {
                await copyText(buildCopyPayload(reposToCopy));
                setCopyFeedback(`Copied ${reposToCopy.length}`);
            } catch (error) {
                console.error(error);
                setCopyFeedback('Failed');
            }

            window.setTimeout(renderCopyToolbar, 1400);
        });
    }
}

function bindShareAndExport(position) {
    const shareEl = document.getElementById(`${position}-share-button`);
    if (shareEl) {
        shareEl.addEventListener('click', async () => {
            try {
                await copyText(window.location.href);
                setShareFeedback('Copied URL');
            } catch (error) {
                console.error(error);
                setShareFeedback('Copy failed');
            }
            window.setTimeout(renderCopyToolbar, 1400);
        });
    }

    const csvEl = document.getElementById(`${position}-export-csv`);
    if (csvEl) {
        csvEl.addEventListener('click', () => {
            const repos = getScopedRows();
            if (repos.length === 0) {
                setExportFeedback('csv', 'No rows');
                window.setTimeout(renderCopyToolbar, 1400);
                return;
            }
            try {
                downloadTextFile(buildExportFilename('csv', repos.length), 'csv', buildCsvPayload(repos), 'application/octet-stream');
                setExportFeedback('csv', 'Done');
            } catch (error) {
                console.error(error);
                setExportFeedback('csv', 'Failed');
            }
            window.setTimeout(renderCopyToolbar, 1600);
        });
    }

    const mdEl = document.getElementById(`${position}-export-md`);
    if (mdEl) {
        mdEl.addEventListener('click', () => {
            const repos = getScopedRows();
            if (repos.length === 0) {
                setExportFeedback('md', 'No rows');
                window.setTimeout(renderCopyToolbar, 1400);
                return;
            }
            try {
                downloadTextFile(buildExportFilename('md', repos.length), 'md', buildMarkdownPayload(repos), 'application/octet-stream');
                setExportFeedback('md', 'Done');
            } catch (error) {
                console.error(error);
                setExportFeedback('md', 'Failed');
            }
            window.setTimeout(renderCopyToolbar, 1600);
        });
    }
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

    document.getElementById('stack-filter').addEventListener('change', (event) => {
        state.stackLayer = event.target.value;
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

function renderMobileList() {
    const list = document.getElementById('mobile-repos-list');
    const start = (state.currentPage - 1) * state.perPage;
    const pageRepos = state.filteredRepos.slice(start, start + state.perPage);

    if (pageRepos.length === 0) {
        list.innerHTML = '<div class="mobile-empty">No repositories match the current filters.</div>';
        return;
    }

    list.innerHTML = pageRepos
        .map((repo, index) => {
            const rowNumber = start + index + 1;
            const tone = categoryTones[repo.category] || categoryTones.Other;

            return `
                <div class="mobile-card" data-repo-id="${repo.id}" tabindex="0" role="button" aria-label="Open details for ${escapeHtml(repo.name)}">
                    <div class="mobile-card-num">${rowNumber}</div>
                    <div class="mobile-card-body">
                        <div class="mobile-card-name">
                            <span class="repo-link">${escapeHtml(repo.repo_name)}</span>
                            <span class="mobile-card-owner">${escapeHtml(repo.owner)}</span>
                        </div>
                        <div class="mobile-card-desc">${escapeHtml(repo.description)}</div>
                        <div class="mobile-card-footer">
                            <div class="mobile-card-meta">
                                <span class="badge ${tone}">${escapeHtml(repo.category)}</span>
                                <span class="language-pill">${escapeHtml(repo.language)}</span>
                            </div>
                            <div style="display:flex;align-items:center;gap:10px">
                                <div class="mobile-card-stars">
                                    <svg viewBox="0 0 24 24" aria-hidden="true" class="star-icon"><path d="m12 3 2.8 5.68 6.27.91-4.54 4.43 1.07 6.24L12 17.3l-5.6 2.94 1.07-6.24L2.93 9.6l6.27-.91z"/></svg>
                                    <span>${repo.stars.toLocaleString()}</span>
                                </div>
                                ${renderSignalBadge(repo)}
                                ${renderSparkline(repo)}
                            </div>
                        </div>
                    </div>
                </div>
            `;
        })
        .join('');

    list.querySelectorAll('.mobile-card').forEach((card) => {
        card.addEventListener('click', (event) => {
            openDrawer(getRepoById(card.dataset.repoId));
        });
        card.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openDrawer(getRepoById(card.dataset.repoId));
            }
        });
    });
}

function bindViewToggle() {
    const toggle = document.getElementById('view-toggle');
    if (!toggle) return;

    toggle.addEventListener('click', () => {
        state.mobileView = !state.mobileView;
        localStorage.setItem('mobileView', state.mobileView);
        const icon = document.getElementById('view-toggle-icon');
        const label = document.getElementById('view-toggle-label');
        if (state.mobileView) {
            icon.textContent = '💻';
            label.textContent = 'Desktop View';
        } else {
            icon.textContent = '📱';
            label.textContent = 'Mobile View';
        }
        renderTable();
        renderPagination();
    });
}

async function loadData() {
    const [reposResp, historyResp] = await Promise.all([
        fetch(DATA_URL),
        fetch(STAR_HISTORY_URL).catch(() => null),
    ]);

    if (!reposResp.ok) {
        throw new Error('Failed to load repository data');
    }

    const data = await reposResp.json();
    state.starredRepos = (data.starred_repos || []).map(normalizeRepo);
    state.trendingRepos = (data.trending_repos || []).map(normalizeRepo);
    state.updatedAt = data.updated_at || '';
    state.historyStartAt = data.history_start_at || '';
    state.historyPoints = data.history_points || 0;
    state.trendingMode = data.trending_mode || 'bootstrap';

    // Build star history map
    if (historyResp && historyResp.ok) {
        try {
            const history = await historyResp.json();
            const dates = Object.keys(history).sort();
            const map = new Map();
            for (const [name, stars] of Object.entries(history[dates[dates.length - 1]])) {
                const arr = [];
                for (const d of dates) {
                    const v = history[d][name];
                    arr.push(v !== undefined ? v : null);
                }
                map.set(name, arr);
            }
            state.starHistoryMap = map;
        } catch (e) {
            console.warn('Failed to parse star history:', e);
        }
    }

    renderStats();
    applyFilters();
}

async function initPageViewer() {
    const countEl = document.getElementById('page-viewer-count');
    if (!countEl) return;

    // Local browser view counter
    const KEY = 'page_view_count';
    let localCount = Number(localStorage.getItem(KEY) || 0);
    localCount++;
    try { localStorage.setItem(KEY, String(localCount)); } catch {}

    // Try to get repo stars for social proof
    let stars = null;
    try {
        const r = await fetch('https://api.github.com/repos/hankbui/my-starred-AI-repos');
        if (r.ok) stars = (await r.json()).stargazers_count;
    } catch {}

    countEl.innerHTML = `<span class="viewer-local">${localCount.toLocaleString()} views</span>` +
        (stars ? ` · <span class="viewer-stars">⭐ ${stars.toLocaleString()}</span>` : ' • <span class="viewer-offline">offline</span>');
}

document.addEventListener('DOMContentLoaded', async () => {
    initPageViewer();
    restoreStateFromUrl();
    bindNav();
    bindFilters();
    bindDatasetTabs();
    bindPresets();
    bindCopyToolbar('top');
    bindCopyToolbar('bottom');
    bindShareAndExport('top');
    bindShareAndExport('bottom');
    bindPagination('top');
    bindPagination('bottom');
    bindTableInteractions();
    bindDrawer();
    bindBackToTop();
    bindViewToggle();
    bindAiAsk();

    if (state.mobileView) {
        const icon = document.getElementById('view-toggle-icon');
        const label = document.getElementById('view-toggle-label');
        if (icon) icon.textContent = '💻';
        if (label) label.textContent = 'Desktop View';
    }
    closeDrawer();

    try {
        await loadData();
    } catch (error) {
        console.error(error);
        document.getElementById('results-meta').textContent = 'Unable to load repository data';
        document.getElementById('repos-tbody').innerHTML = `
            <tr>
                <td colspan="12" class="empty-state">Repository data could not be loaded.</td>
            </tr>
        `;
    }
});
