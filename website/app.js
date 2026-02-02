const starredRepos = [];
const trendingRepos = [];
const categoryIcons = {
    '🤖 AI / LLM': '🤖',
    '👁️ Vision / OCR': '👁️',
    '⚙️ Automation': '⚙️',
    '📊 Data / ML': '📊',
    '🔧 Dev Tools': '🔧',
    '🌐 Web / Cloud': '🌐',
    '🔐 Security': '🔐',
    '📦 Other': '📦'
};

function getCategoryIcon(category) {
    return categoryIcons[category] || '📦';
}

const ThemeManager = {
    init() {
        const toggle = document.getElementById('theme-toggle');
        const sunIcon = document.getElementById('sun-icon');
        const moonIcon = document.getElementById('moon-icon');
        const html = document.documentElement;

        const savedTheme = localStorage.getItem('theme') || 'light';
        html.setAttribute('data-theme', savedTheme);
        this.updateIcons(savedTheme, sunIcon, moonIcon);

        toggle.addEventListener('click', () => {
            const currentTheme = html.getAttribute('data-theme');
            const newTheme = currentTheme === 'light' ? 'dark' : 'light';
            html.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            this.updateIcons(newTheme, sunIcon, moonIcon);
        });
    },

    updateIcons(theme, sunIcon, moonIcon) {
        if (theme === 'dark') {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
    }
};

async function loadData() {
    try {
        const response = await fetch('data/repos.json');
        if (!response.ok) throw new Error('Failed to load data');

        const data = await response.json();
        starredRepos.length = 0;
        trendingRepos.length = 0;
        starredRepos.push(...(data.starred_repos || []));
        trendingRepos.push(...(data.trending_repos || []));

        document.getElementById('last-updated-time').textContent = data.updated_at;
        document.getElementById('trending-count').textContent = trendingRepos.length;
        document.getElementById('starred-count').textContent = starredRepos.length;
        document.getElementById('total-count').textContent = trendingRepos.length + starredRepos.length;

        const totalStars = [...trendingRepos, ...starredRepos].reduce((sum, r) => sum + r.stars, 0);
        document.getElementById('total-stars').textContent = totalStars > 1000 ? (totalStars / 1000).toFixed(1) + 'k' : totalStars;

        document.getElementById('trending-tab-count').textContent = trendingRepos.length;
        document.getElementById('starred-tab-count').textContent = starredRepos.length;

        initCategoryFilters('trending', trendingRepos);
        initCategoryFilters('starred', starredRepos);

        TableManager.init('trending', trendingRepos);
        TableManager.init('starred', starredRepos);

    } catch (error) {
        console.error('Error loading data:', error);
    }
}

function initCategoryFilters(name, repos) {
    const container = document.getElementById(name + '-filters');
    const categories = [...new Set(repos.map(r => r.category))];
    const total = repos.length;

    let html = `<button class="filter-tab active" data-filter="all">All (${total})</button>`;

    categories.sort().forEach(cat => {
        const count = repos.filter(r => r.category === cat).length;
        const icon = getCategoryIcon(cat);
        html += `<button class="filter-tab" data-filter="${cat}">${icon} ${cat.split(' ')[0]} (${count})</button>`;
    });

    container.innerHTML = html;

    container.querySelectorAll('.filter-tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
            container.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
            e.target.classList.add('active');
            TableManager.get(name).currentFilter = e.target.dataset.filter;
            TableManager.get(name).currentPage = 1;
            TableManager.get(name).filter();
        });
    });
}

function renderCategoryBars(name, repos) {
    const container = document.getElementById(name + '-bars');
    const categoryCounts = {};
    repos.forEach(repo => {
        categoryCounts[repo.category] = (categoryCounts[repo.category] || 0) + 1;
    });

    const total = repos.length;
    const sortedCats = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);

    container.innerHTML = sortedCats.map(([cat, count]) => {
        const percentage = total > 0 ? (count / total) * 100 : 0;
        const icon = getCategoryIcon(cat);
        return `
            <div class="category-bar-item">
                <span class="category-bar-label">${icon} ${cat}</span>
                <div class="category-bar-track">
                    <div class="category-bar-fill" style="width: ${percentage}%"></div>
                </div>
                <span class="category-bar-count">${count} (${percentage.toFixed(1)}%)</span>
            </div>
        `;
    }).join('');
}

const TabManager = {
    init() {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                e.target.classList.add('active');
                document.getElementById(e.target.dataset.tab + '-section').classList.add('active');
            });
        });
    }
};

const TableManager = {
    managers: {},

    get(name) {
        return this.managers[name];
    },

    init(name, repos) {
        this.managers[name] = {
            name,
            repos,
            filteredRepos: [...repos],
            currentPage: 1,
            reposPerPage: 50,
            currentFilter: 'all',
            currentSort: 'stars'
        };

        const m = this.managers[name];

        document.getElementById(name + '-search').addEventListener('input', () => this.filter(name));
        document.getElementById(name + '-sort').addEventListener('change', (e) => {
            m.currentSort = e.target.value;
            this.filter(name);
        });
        document.getElementById(name + '-per-page').addEventListener('change', (e) => {
            m.reposPerPage = parseInt(e.target.value);
            m.currentPage = 1;
            this.render(name);
        });
        document.getElementById(name + '-prev').addEventListener('click', () => this.changePage(name, -1));
        document.getElementById(name + '-next').addEventListener('click', () => this.changePage(name, 1));

        renderCategoryBars(name, repos);
        this.render(name);
    },

    filter(name) {
        const m = this.managers[name];
        const searchTerm = document.getElementById(name + '-search').value.toLowerCase();

        m.filteredRepos = m.repos.filter(repo => {
            if (m.currentFilter !== 'all' && repo.category !== m.currentFilter) return false;
            if (searchTerm) {
                const searchText = (repo.name + ' ' + (repo.description || '')).toLowerCase();
                if (!searchText.includes(searchTerm)) return false;
            }
            return true;
        });

        m.filteredRepos.sort((a, b) => {
            if (m.currentSort === 'stars') return b.stars - a.stars;
            if (m.currentSort === 'updated') return new Date(b.updated_at) - new Date(a.updated_at);
            return a.name.localeCompare(b.name);
        });

        m.currentPage = 1;
        this.render(name);
    },

    changePage(name, delta) {
        const m = this.managers[name];
        const totalPages = Math.ceil(m.filteredRepos.length / m.reposPerPage);
        m.currentPage = Math.max(1, Math.min(m.currentPage + delta, totalPages));
        this.render(name);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    render(name) {
        const m = this.managers[name];
        const tbody = document.getElementById(name + '-tbody');
        const start = (m.currentPage - 1) * m.reposPerPage;
        const end = start + m.reposPerPage;
        const pageRepos = m.filteredRepos.slice(start, end);

        if (pageRepos.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="no-results">No repositories found.</td></tr>';
        } else {
            tbody.innerHTML = pageRepos.map((repo, i) => {
                const idx = start + i + 1;
                const trending = repo.flags && repo.flags.includes('trending');
                const catIcon = getCategoryIcon(repo.category);

                return `
                    <tr data-category="${repo.category}">
                        <td class="col-num">${idx}</td>
                        <td class="col-repo">
                            <div class="repo-cell">
                                <a href="${repo.url}" target="_blank" class="repo-name">${repo.name}</a>
                                <div class="repo-meta">
                                    <span>⭐ ${repo.stars.toLocaleString()}</span>
                                    <span>🕒 ${repo.updated_at}</span>
                                    ${trending ? '<span class="trending-badge">🔥 trending</span>' : ''}
                                </div>
                            </div>
                        </td>
                        <td class="col-stars"><div class="stars-cell">⭐ ${repo.stars.toLocaleString()}</div></td>
                        <td class="col-forks"><div class="forks-cell">🔀 ${repo.forks.toLocaleString()}</div></td>
                        <td class="col-desc" title="${(repo.description || '').replace(/"/g, '&quot;')}">${repo.description || 'No description'}</td>
                        <td class="col-category"><span class="category-badge ${trending ? 'trending' : ''}">${catIcon} ${repo.category.split(' ')[0]}</span></td>
                        <td class="col-updated">${repo.updated_at}</td>
                    </tr>
                `;
            }).join('');
        }

        const totalPages = Math.ceil(m.filteredRepos.length / m.reposPerPage);
        document.getElementById(name + '-page-info').textContent = `Page ${m.currentPage}`;
        document.getElementById(name + '-prev').disabled = m.currentPage === 1;
        document.getElementById(name + '-next').disabled = m.currentPage >= totalPages;
    }
};

document.addEventListener('DOMContentLoaded', () => {
    ThemeManager.init();
    TabManager.init();
    loadData();
});
