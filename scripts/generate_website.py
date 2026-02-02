#!/usr/bin/env python3
"""
Generate static HTML website with 2 tabs: Trending Repos & My Starred Repos.
"""

import json
from pathlib import Path


def load_data():
    """Load repos data and stats."""
    with open("data/repos.json", "r", encoding="utf-8") as f:
        return json.load(f)


def get_category_icon(category):
    icons = {
        "🤖 AI / LLM": "🤖",
        "👁️ Vision / OCR": "👁️",
        "⚙️ Automation": "⚙️",
        "📊 Data / ML": "📊",
        "🔧 Dev Tools": "🔧",
        "🌐 Web / Cloud": "🌐",
        "🔐 Security": "🔐",
        "📦 Other": "📦",
    }
    return icons.get(category, "📦")


def render_repo_row(repo, index, is_trending=False):
    """Render a single repo row."""
    repo_url = repo["url"]
    repo_name = repo["name"]
    description = repo.get("description", "No description") or "No description"
    description = (
        description.replace('"', "&quot;").replace("<", "&lt;").replace(">", "&gt;")
    )
    stars = repo["stars"]
    forks = repo["forks"]
    category = repo["category"]
    updated_at = repo["updated_at"]
    category_icon = get_category_icon(category)
    flags = repo.get("flags", [])
    trending_badge = " <span>🔥 trending</span>" if "trending" in flags else ""

    return f'''
            <tr data-category="{category}">
                <td class="col-num">{index}</td>
                <td class="col-repo">
                    <div class="repo-cell">
                        <a href="{repo_url}" target="_blank" class="repo-name">{repo_name}</a>
                        <div class="repo-meta">
                            <span>⭐ {stars:,}</span>
                            <span>🕒 {updated_at}</span>
                            {trending_badge}
                        </div>
                    </div>
                </td>
                <td class="col-stars">
                    <div class="stars-cell">⭐ {stars:,}</div>
                </td>
                <td class="col-forks">
                    <div class="forks-cell">🔀 {forks:,}</div>
                </td>
                <td class="col-desc" title="{description}">{description}</td>
                <td class="col-category">
                    <span class="category-badge">{category_icon} {category.split(" ")[0]}</span>
                </td>
                <td class="col-updated">{updated_at}</td>
            </tr>'''


def render_table_rows(repos, is_trending=False):
    """Render all repo rows for a table."""
    return "\n".join(
        render_repo_row(repo, i + 1, is_trending) for i, repo in enumerate(repos)
    )


def get_categories(repos):
    """Get unique categories from repos."""
    return sorted(set(repo["category"] for repo in repos))


def render_category_tabs(categories, repos, is_trending=False):
    """Render category filter tabs."""
    total = len(repos)
    tabs = f'<button class="filter-tab active" data-filter="all">All ({total})</button>'

    for cat in categories:
        count = sum(1 for r in repos if r["category"] == cat)
        icon = get_category_icon(cat)
        tabs += f'''
            <button class="filter-tab" data-filter="{cat}">
                {icon} {cat.split(" ")[0]} ({count})
            </button>'''

    return tabs


def render_category_bars(categories, repos, total_repos):
    """Render category distribution bars."""
    bars = ""
    sorted_cats = sorted(
        categories,
        key=lambda c: sum(1 for r in repos if r["category"] == c),
        reverse=True,
    )

    for cat in sorted_cats:
        count = sum(1 for r in repos if r["category"] == cat)
        percentage = (count / total_repos) * 100 if total_repos > 0 else 0
        icon = get_category_icon(cat)
        bars += f"""
            <div class="category-bar-item">
                <span class="category-bar-label">{icon} {cat}</span>
                <div class="category-bar-track">
                    <div class="category-bar-fill" style="width: {percentage}%"></div>
                </div>
                <span class="category-bar-count">{count} ({percentage:.1f}%)</span>
            </div>"""
    return bars


def generate_html(data, stats):
    """Generate the complete HTML page with 2 tabs."""
    starred_repos = data.get("starred_repos", [])
    trending_repos = data.get("trending_repos", [])
    updated_at = data["updated_at"]

    starred_categories = get_categories(starred_repos)
    trending_categories = get_categories(trending_repos)

    starred_table = render_table_rows(starred_repos)
    trending_table = render_table_rows(trending_repos, is_trending=True)

    starred_tabs = render_category_tabs(starred_categories, starred_repos)
    trending_tabs = render_category_tabs(trending_categories, trending_repos)

    starred_bars = render_category_bars(
        starred_categories, starred_repos, len(starred_repos)
    )
    trending_bars = render_category_bars(
        trending_categories, trending_repos, len(trending_repos)
    )

    total_count = len(starred_repos) + len(trending_repos)
    total_stars = stats.get("total_stars", 0)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>⭐ My Starred AI Repos</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <div class="app">
        <header class="header">
            <div class="header-content">
                <h1>⭐ AI Repositories</h1>
                <p class="subtitle">Curated AI/ML repositories - Trending & My Stars</p>
            </div>
            <div class="header-stats">
                <div class="stat-card">
                    <span class="stat-value">{len(trending_repos):,}</span>
                    <span class="stat-label">🔥 Trending</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">{len(starred_repos):,}</span>
                    <span class="stat-label">⭐ My Stars</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">{total_count:,}</span>
                    <span class="stat-label">Total Repos</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">{total_stars:,}</span>
                    <span class="stat-label">Total Stars</span>
                </div>
            </div>
            <div class="last-updated">
                Updated: <span id="last-updated-time">{updated_at}</span>
            </div>
        </header>

        <div class="tabs-container">
            <div class="tabs">
                <button class="tab-btn active" data-tab="trending">
                    🔥 Trending Repos
                </button>
                <button class="tab-btn" data-tab="starred">
                    ⭐ My Starred Repos
                </button>
            </div>
        </div>

        <div id="trending-section" class="tab-content active">
            <div class="filters-section">
                <div class="search-box">
                    <input type="text" id="trending-search" placeholder="Search trending repos...">
                </div>
                <div class="filter-tabs">
                    {trending_tabs}
                </div>
                <div class="filter-options">
                    <select id="trending-sort">
                        <option value="stars" selected>Sort by Stars</option>
                        <option value="updated">Sort by Updated</option>
                        <option value="name">Sort by Name</option>
                    </select>
                    <select id="trending-per-page">
                        <option value="25">25 per page</option>
                        <option value="50" selected>50 per page</option>
                        <option value="100">100 per page</option>
                    </select>
                </div>
            </div>

            <div class="table-container">
                <table class="repos-table">
                    <thead>
                        <tr>
                            <th class="col-num">#</th>
                            <th class="col-repo">Repository</th>
                            <th class="col-stars">Stars</th>
                            <th class="col-forks">Forks</th>
                            <th class="col-desc">Description</th>
                            <th class="col-category">Category</th>
                            <th class="col-updated">Updated</th>
                        </tr>
                    </thead>
                    <tbody id="trending-tbody">
                        {trending_table}
                    </tbody>
                </table>
            </div>

            <div class="pagination" id="trending-pagination">
                <button class="page-btn" id="trending-prev" disabled>← Prev</button>
                <span class="page-info" id="trending-page-info">Page 1 of 1</span>
                <button class="page-btn" id="trending-next">Next →</button>
            </div>

            <div class="category-summary">
                <h3>📊 Trending Category Distribution</h3>
                <div class="category-bars">
                    {trending_bars}
                </div>
            </div>
        </div>

        <div id="starred-section" class="tab-content">
            <div class="filters-section">
                <div class="search-box">
                    <input type="text" id="starred-search" placeholder="Search my starred repos...">
                </div>
                <div class="filter-tabs">
                    {starred_tabs}
                </div>
                <div class="filter-options">
                    <select id="starred-sort">
                        <option value="stars" selected>Sort by Stars</option>
                        <option value="updated">Sort by Updated</option>
                        <option value="name">Sort by Name</option>
                    </select>
                    <select id="starred-per-page">
                        <option value="25">25 per page</option>
                        <option value="50" selected>50 per page</option>
                        <option value="100">100 per page</option>
                    </select>
                </div>
            </div>

            <div class="table-container">
                <table class="repos-table">
                    <thead>
                        <tr>
                            <th class="col-num">#</th>
                            <th class="col-repo">Repository</th>
                            <th class="col-stars">Stars</th>
                            <th class="col-forks">Forks</th>
                            <th class="col-desc">Description</th>
                            <th class="col-category">Category</th>
                            <th class="col-updated">Updated</th>
                        </tr>
                    </thead>
                    <tbody id="starred-tbody">
                        {starred_table}
                    </tbody>
                </table>
            </div>

            <div class="pagination" id="starred-pagination">
                <button class="page-btn" id="starred-prev" disabled>← Prev</button>
                <span class="page-info" id="starred-page-info">Page 1 of 1</span>
                <button class="page-btn" id="starred-next">Next →</button>
            </div>

            <div class="category-summary">
                <h3>📊 My Stars Category Distribution</h3>
                <div class="category-bars">
                    {starred_bars}
                </div>
            </div>
        </div>

        <footer class="footer">
            <p>🤖 Auto-updated daily via GitHub Actions</p>
            <p>Made with ❤️ by <a href="https://github.com/hankbui" target="_blank">@hankbui</a></p>
        </footer>
    </div>

    <script>
    const starredRepos = {json.dumps(starred_repos)};
    const trendingRepos = {json.dumps(trending_repos)};
    const categoryIcons = {
        json.dumps(
            {
                "🤖 AI / LLM": "🤖",
                "👁️ Vision / OCR": "👁️",
                "⚙️ Automation": "⚙️",
                "📊 Data / ML": "📊",
                "🔧 Dev Tools": "🔧",
                "🌐 Web / Cloud": "🌐",
                "🔐 Security": "🔐",
                "📦 Other": "📦",
            }
        )
    };

    const TabManager = {{
        init() {{
            document.querySelectorAll('.tab-btn').forEach(btn => {{
                btn.addEventListener('click', (e) => {{
                    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                    e.target.classList.add('active');
                    document.getElementById(e.target.dataset.tab + '-section').classList.add('active');
                }});
            }});
        }}
    }};

    const TableManager = {{
        init(name, repos) {{
            this.name = name;
            this.repos = repos;
            this.filteredRepos = [...repos];
            this.currentPage = 1;
            this.reposPerPage = 50;
            this.currentFilter = 'all';
            this.currentSort = 'stars';

            this.bindEvents();
            this.render();
        }},

        bindEvents() {{
            document.getElementById(this.name + '-search').addEventListener('input', () => this.filter());
            document.getElementById(this.name + '-sort').addEventListener('change', (e) => {{
                this.currentSort = e.target.value;
                this.filter();
            }});
            document.getElementById(this.name + '-per-page').addEventListener('change', (e) => {{
                this.reposPerPage = parseInt(e.target.value);
                this.currentPage = 1;
                this.render();
            }});
            document.getElementById(this.name + '-prev').addEventListener('click', () => this.changePage(-1));
            document.getElementById(this.name + '-next').addEventListener('click', () => this.changePage(1));
            document.querySelectorAll('#' + this.name + '-section .filter-tab').forEach(tab => {{
                tab.addEventListener('click', (e) => {{
                    document.querySelectorAll('#' + this.name + '-section .filter-tab').forEach(t => t.classList.remove('active'));
                    e.target.classList.add('active');
                    this.currentFilter = e.target.dataset.filter;
                    this.currentPage = 1;
                    this.filter();
                }});
            }});
        }},

        filter() {{
            const searchTerm = document.getElementById(this.name + '-search').value.toLowerCase();
            this.filteredRepos = this.repos.filter(repo => {{
                if (this.currentFilter !== 'all' && repo.category !== this.currentFilter) return false;
                if (searchTerm) {{
                    const searchText = (repo.name + ' ' + (repo.description || '')).toLowerCase();
                    if (!searchText.includes(searchTerm)) return false;
                }}
                return true;
            }});
            this.filteredRepos.sort((a, b) => {{
                if (this.currentSort === 'stars') return b.stars - a.stars;
                if (this.currentSort === 'updated') return new Date(b.updated_at) - new Date(a.updated_at);
                return a.name.localeCompare(b.name);
            }});
            this.currentPage = 1;
            this.render();
        }},

        changePage(delta) {{
            const totalPages = Math.ceil(this.filteredRepos.length / this.reposPerPage);
            this.currentPage = Math.max(1, Math.min(this.currentPage + delta, totalPages));
            this.render();
            window.scrollTo({{ top: 0, behavior: 'smooth' }});
        }},

        render() {{
            const tbody = document.getElementById(this.name + '-tbody');
            const start = (this.currentPage - 1) * this.reposPerPage;
            const end = start + this.reposPerPage;
            const pageRepos = this.filteredRepos.slice(start, end);

            if (pageRepos.length === 0) {{
                tbody.innerHTML = '<tr><td colspan="7" class="no-results">No repositories found.</td></tr>';
            }} else {{
                tbody.innerHTML = pageRepos.map((repo, i) => {{
                    const idx = start + i + 1;
                    const trending = repo.flags && repo.flags.includes('trending') ? '<span>🔥 trending</span>' : '';
                    const catIcon = categoryIcons[repo.category] || '📦';
                    return `
                        <tr data-category="${{repo.category}}">
                            <td class="col-num">${{idx}}</td>
                            <td class="col-repo">
                                <div class="repo-cell">
                                    <a href="${{repo.url}}" target="_blank" class="repo-name">${{repo.name}}</a>
                                    <div class="repo-meta">
                                        <span>⭐ ${{repo.stars.toLocaleString()}}</span>
                                        <span>🕒 ${{repo.updated_at}}</span>
                                        ${{trending}}
                                    </div>
                                </div>
                            </td>
                            <td class="col-stars"><div class="stars-cell">⭐ ${{repo.stars.toLocaleString()}}</div></td>
                            <td class="col-forks"><div class="forks-cell">🔀 ${{repo.forks.toLocaleString()}}</div></td>
                            <td class="col-desc" title="${{(repo.description || '').replace(/"/g, '&quot;')}}">${{repo.description || 'No description'}}</td>
                            <td class="col-category"><span class="category-badge">${{catIcon}} ${{repo.category.split(' ')[0]}}</span></td>
                            <td class="col-updated">${{repo.updated_at}}</td>
                        </tr>
                    `;
                }}).join('');
            }}

            const totalPages = Math.ceil(this.filteredRepos.length / this.reposPerPage);
            document.getElementById(this.name + '-page-info').textContent = `Page ${{this.currentPage}} of ${{totalPages || 1}}`;
            document.getElementById(this.name + '-prev').disabled = this.currentPage === 1;
            document.getElementById(this.name + '-next').disabled = this.currentPage >= totalPages;
        }}
    }};

    document.addEventListener('DOMContentLoaded', () => {{
        TabManager.init();
        TableManager.init('trending', trendingRepos);
        TableManager.init('starred', starredRepos);
    }});
    </script>
</body>
</html>"""

    return html


def main():
    print("📦 Generating website...")

    data = load_data()

    with open("data/stats.json", "r", encoding="utf-8") as f:
        stats = json.load(f)

    html = generate_html(data, stats)

    website_dir = Path("website")
    website_dir.mkdir(exist_ok=True)

    with open(website_dir / "index.html", "w", encoding="utf-8") as f:
        f.write(html)

    print(f"✅ Website generated: website/index.html")
    print(f"   Trending repos: {len(data.get('trending_repos', []))}")
    print(f"   Starred repos: {len(data.get('starred_repos', []))}")


if __name__ == "__main__":
    main()
