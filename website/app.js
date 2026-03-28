const state = {
    repos: [],
    filteredRepos: [],
    currentPage: 1,
    perPage: 50,
    category: 'all',
    minStars: 0,
    sort: 'stars_desc',
    search: '',
    updatedAt: '',
    historyStartAt: '',
    historyPoints: 0,
};

const DATA_URL = 'data/repos.json?v=20260328-3';

const categoryTones = {
    'Applications': 'tone-applications',
    'AI Engineering': 'tone-ai-engineering',
    'Agents & Automation': 'tone-agents',
    'Models & Inference': 'tone-models',
    'Vision & Media': 'tone-vision',
    'Data & Evaluation': 'tone-data',
    'Developer Tools': 'tone-devtools',
    'Infrastructure': 'tone-infra',
    'Research & Knowledge': 'tone-research',
    'Other': 'tone-other',
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
        created_at: repo.created_at || '-',
        updated_at: repo.updated_at || '-',
        activity: repo.activity || 'Steady',
        star_delta_1d: typeof repo.star_delta_1d === 'number' ? repo.star_delta_1d : null,
        star_delta_7d: typeof repo.star_delta_7d === 'number' ? repo.star_delta_7d : null,
        star_delta_1d_pct: typeof repo.star_delta_1d_pct === 'number' ? repo.star_delta_1d_pct : null,
        star_delta_7d_pct: typeof repo.star_delta_7d_pct === 'number' ? repo.star_delta_7d_pct : null,
    };
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

function getCategoryStats() {
    const counts = new Map();

    state.repos.forEach((repo) => {
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

function populateCategoryFilter() {
    const select = document.getElementById('category-filter');
    const categoryStats = getCategoryStats();

    select.innerHTML = [
        `<option value="all">All categories (${state.repos.length.toLocaleString()})</option>`,
        ...categoryStats.map(
            (entry) => `<option value="${escapeHtml(entry.name)}">${escapeHtml(entry.name)} (${entry.count})</option>`,
        ),
    ].join('');

    select.value = state.category;
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
            document.getElementById('category-filter').value = state.category;
            applyFilters();
            document.getElementById('repos-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    });
}

function renderStats() {
    const totalStars = state.repos.reduce((sum, repo) => sum + repo.stars, 0);

    document.getElementById('repo-count').textContent = state.repos.length.toLocaleString();
    document.getElementById('category-count').textContent = getCategoryStats().length.toLocaleString();
    document.getElementById('total-stars').textContent = formatCompactNumber(totalStars);
    document.getElementById('last-updated-time').textContent = state.updatedAt || '-';
}

function renderHistoryNote() {
    const note = document.getElementById('history-note');
    const has1d = state.repos.some((repo) => typeof repo.star_delta_1d === 'number');
    const has7d = state.repos.some((repo) => typeof repo.star_delta_7d === 'number');

    if (has1d && has7d) {
        note.hidden = true;
        note.textContent = '';
        return;
    }

    if (!state.historyStartAt) {
        note.hidden = true;
        note.textContent = '';
        return;
    }

    if (!has1d) {
        note.textContent = `Growth columns are warming up. Daily history started on ${state.historyStartAt} and there ${state.historyPoints === 1 ? 'is' : 'are'} ${state.historyPoints} snapshot${state.historyPoints === 1 ? '' : 's'} so far, so 1d and 7d star changes will fill in automatically after more daily runs.`;
    } else {
        note.textContent = `1d growth is available. 7d growth will appear automatically once at least 7 daily snapshots have been collected.`;
    }

    note.hidden = false;
}

function sortRepos(repos) {
    const sorted = [...repos];

    sorted.sort((left, right) => {
        if (state.sort === 'stars_desc') return right.stars - left.stars;
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
    const query = state.search.trim().toLowerCase();

    state.filteredRepos = sortRepos(
        state.repos.filter((repo) => {
            if (state.category !== 'all' && repo.category !== state.category) {
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

            return `
                <tr>
                    <td class="col-num">${rowNumber}</td>
                    <td class="col-repo">
                        <div class="repo-primary">${escapeHtml(repo.owner)}</div>
                        <a class="repo-link" href="${escapeHtml(repo.url)}" target="_blank" rel="noreferrer">${escapeHtml(repo.repo_name)}</a>
                        <div class="repo-meta-row">
                            <span class="language-pill">${escapeHtml(repo.language)}</span>
                            <span class="activity-pill activity-${repo.activity.toLowerCase()}">${escapeHtml(repo.activity)}</span>
                            ${repo.topics.slice(0, 2).map((topic) => `<span class="topic-pill">${escapeHtml(topic)}</span>`).join('')}
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
    const label = `${state.currentPage} / ${totalPages} (${totalItems.toLocaleString()} repos)`;

    ['top', 'bottom'].forEach((position) => {
        document.getElementById(`${position}-page-info`).textContent = label;
        document.getElementById(`${position}-prev`).disabled = state.currentPage === 1;
        document.getElementById(`${position}-next`).disabled = state.currentPage === totalPages;
        document.getElementById(`${position}-per-page`).value = String(state.perPage);
    });

    document.getElementById('results-meta').textContent = `${totalItems.toLocaleString()} visible repos`;
}

function changePage(delta) {
    const totalPages = Math.max(1, Math.ceil(state.filteredRepos.length / state.perPage));
    state.currentPage = Math.max(1, Math.min(state.currentPage + delta, totalPages));
    renderTable();
    renderPagination();
    document.getElementById('repos-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
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
        applyFilters();
    });

    document.getElementById('category-filter').addEventListener('change', (event) => {
        state.category = event.target.value;
        state.currentPage = 1;
        applyFilters();
    });

    document.getElementById('stars-filter').addEventListener('change', (event) => {
        state.minStars = Number(event.target.value);
        state.currentPage = 1;
        applyFilters();
    });

    document.getElementById('sort-select').addEventListener('change', (event) => {
        state.sort = event.target.value;
        state.currentPage = 1;
        applyFilters();
    });

    document.getElementById('reset-filters').addEventListener('click', () => {
        state.search = '';
        state.category = 'all';
        state.minStars = 0;
        state.sort = 'stars_desc';
        state.currentPage = 1;

        document.getElementById('repo-search').value = '';
        document.getElementById('category-filter').value = 'all';
        document.getElementById('stars-filter').value = '0';
        document.getElementById('sort-select').value = 'stars_desc';

        applyFilters();
    });
}

async function loadData() {
    const response = await fetch(DATA_URL);
    if (!response.ok) {
        throw new Error('Failed to load repository data');
    }

    const data = await response.json();
    state.repos = (data.starred_repos || []).map(normalizeRepo);
    state.updatedAt = data.updated_at || '';
    state.historyStartAt = data.history_start_at || '';
    state.historyPoints = data.history_points || 0;

    renderStats();
    populateCategoryFilter();
    renderCategoryGrid();
    applyFilters();
}

document.addEventListener('DOMContentLoaded', async () => {
    bindNav();
    bindFilters();
    bindPagination('top');
    bindPagination('bottom');

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
