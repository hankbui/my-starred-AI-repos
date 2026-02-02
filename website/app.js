let allRepos = [];
let filteredRepos = [];
let currentPage = 1;
let reposPerPage = 50;
let currentFilter = 'all';
let currentSort = 'stars';

const repoIcons = {
    '🤖 AI / LLM': '🤖',
    '👁️ Vision / OCR': '👁️',
    '⚙️ Automation': '⚙️',
    '📊 Data / ML': '📊',
    '🔧 Dev Tools': '🔧',
    '🌐 Web / Cloud': '🌐',
    '🔐 Security': '🔐',
    '📦 Other': '📦'
};

async function loadData() {
    const loadingEl = document.getElementById('repos-tbody');
    loadingEl.innerHTML = '<tr><td colspan="7" class="loading">Loading repositories...</td></tr>';

    try {
        const response = await fetch('data/repos.json');
        if (!response.ok) {
            throw new Error('Failed to load data');
        }

        const data = await response.json();
        allRepos = data.repos;
        filteredRepos = [...allRepos];

        document.getElementById('last-updated-time').textContent = data.updated_at;
        document.getElementById('total-repos').textContent = data.total_count.toLocaleString();

        const totalStars = allRepos.reduce((sum, r) => sum + r.stars, 0);
        document.getElementById('total-stars').textContent = totalStars.toLocaleString();

        initCategoryTabs();
        initCategorySummary();
        applyFiltersAndSort();
    } catch (error) {
        console.error('Error loading data:', error);
        loadingEl.innerHTML = '<tr><td colspan="7" class="no-results">Failed to load repositories. Please try again later.</td></tr>';
    }
}

function initCategoryTabs() {
    const categories = [...new Set(allRepos.map(r => r.category))];
    document.getElementById('total-categories').textContent = categories.length;

    const tabsContainer = document.getElementById('category-tabs');
    tabsContainer.innerHTML = '';

    categories.sort().forEach(cat => {
        const count = allRepos.filter(r => r.category === cat).length;
        const tab = document.createElement('button');
        tab.className = 'filter-tab';
        tab.dataset.filter = cat;
        tab.innerHTML = `${repoIcons[cat] || '📁'} ${cat.split(' ')[0]} (${count})`;
        tabsContainer.appendChild(tab);
    });

    document.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            currentFilter = tab.dataset.filter;
            currentPage = 1;
            applyFiltersAndSort();
        });
    });
}

function initCategorySummary() {
    const barsContainer = document.getElementById('category-bars');
    const categoryCounts = {};

    allRepos.forEach(repo => {
        categoryCounts[repo.category] = (categoryCounts[repo.category] || 0) + 1;
    });

    const total = allRepos.length;
    const sortedCategories = Object.entries(categoryCounts)
        .sort((a, b) => b[1] - a[1]);

    barsContainer.innerHTML = sortedCategories.map(([cat, count]) => {
        const percentage = (count / total) * 100;
        return `
            <div class="category-bar-item">
                <span class="category-bar-label">${repoIcons[cat] || '📁'} ${cat}</span>
                <div class="category-bar-track">
                    <div class="category-bar-fill" style="width: ${percentage}%"></div>
                </div>
                <span class="category-bar-count">${count} (${percentage.toFixed(1)}%)</span>
            </div>
        `;
    }).join('');
}

function applyFiltersAndSort() {
    filteredRepos = allRepos.filter(repo => {
        if (currentFilter !== 'all' && repo.category !== currentFilter) {
            return false;
        }

        const searchTerm = document.getElementById('search-input').value.toLowerCase();
        if (searchTerm) {
            const searchText = `${repo.name} ${repo.description}`.toLowerCase();
            if (!searchText.includes(searchTerm)) {
                return false;
            }
        }

        return true;
    });

    filteredRepos.sort((a, b) => {
        if (currentSort === 'stars') {
            return b.stars - a.stars;
        } else if (currentSort === 'updated') {
            return new Date(b.updated_at) - new Date(a.updated_at);
        } else if (currentSort === 'name') {
            return a.name.localeCompare(b.name);
        }
        return 0;
    });

    renderTable();
    updatePagination();
}

function renderTable() {
    const tbody = document.getElementById('repos-tbody');
    const start = (currentPage - 1) * reposPerPage;
    const end = start + reposPerPage;
    const pageRepos = filteredRepos.slice(start, end);

    if (pageRepos.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="no-results">No repositories found.</td></tr>';
        return;
    }

    tbody.innerHTML = pageRepos.map((repo, index) => {
        const globalIndex = start + index + 1;
        const repoUrl = repo.url;
        const repoName = repo.name;
        const description = repo.description || 'No description';
        const categoryIcon = repoIcons[repo.category] || '📁';

        return `
            <tr>
                <td class="col-num">${globalIndex}</td>
                <td class="col-repo">
                    <div class="repo-cell">
                        <a href="${repoUrl}" target="_blank" class="repo-name">${repoName}</a>
                        <div class="repo-meta">
                            <span>⭐ ${repo.stars.toLocaleString()}</span>
                            <span>🕒 ${repo.updated_at}</span>
                            ${repo.flags && repo.flags.includes('trending') ? '<span>🔥 trending</span>' : ''}
                        </div>
                    </div>
                </td>
                <td class="col-stars">
                    <div class="stars-cell">
                        ⭐ ${repo.stars.toLocaleString()}
                    </div>
                </td>
                <td class="col-forks">
                    <div class="forks-cell">
                        🔀 ${repo.forks.toLocaleString()}
                    </div>
                </td>
                <td class="col-desc" title="${description}">${description}</td>
                <td class="col-category">
                    <span class="category-badge">${categoryIcon} ${repo.category.split(' ')[0]}</span>
                </td>
                <td class="col-updated">${repo.updated_at}</td>
            </tr>
        `;
    }).join('');
}

function updatePagination() {
    const totalPages = Math.ceil(filteredRepos.length / reposPerPage);

    document.getElementById('page-info').textContent = `Page ${currentPage} of ${totalPages || 1}`;
    document.getElementById('prev-page').disabled = currentPage === 1;
    document.getElementById('next-page').disabled = currentPage >= totalPages;
}

function changePage(delta) {
    const totalPages = Math.ceil(filtered.length / reposPerPage);
    currentPage = Math.max(1, Math.min(currentPage + delta, totalPages));
    renderTable();
    updatePagination();

    window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.getElementById('search-input').addEventListener('input', () => {
    currentPage = 1;
    applyFiltersAndSort();
});

document.getElementById('sort-select').addEventListener('change', (e) => {
    currentSort = e.target.value;
    applyFiltersAndSort();
});

document.getElementById('per-page-select').addEventListener('change', (e) => {
    reposPerPage = parseInt(e.target.value);
    currentPage = 1;
    applyFiltersAndSort();
});

document.getElementById('prev-page').addEventListener('click', () => changePage(-1));
document.getElementById('next-page').addEventListener('click', () => changePage(1));

document.addEventListener('DOMContentLoaded', loadData);
