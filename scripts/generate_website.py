#!/usr/bin/env python3
"""
Generate static HTML website from repos data.
"""

import json
from pathlib import Path
from datetime import datetime


def load_data():
    """Load repos data and stats."""
    with open("data/repos.json", "r", encoding="utf-8") as f:
        return json.load(f)


def generate_html(data, stats):
    """Generate the complete HTML page."""
    repos = data["repos"]
    updated_at = data["updated_at"]
    total_count = data["total_count"]
    total_stars = stats.get("total_stars", sum(r["stars"] for r in repos))

    category_counts = stats.get("by_category", {})
    categories = sorted(category_counts.items(), key=lambda x: -x[1])

    category_tabs = ""
    for cat, count in categories:
        icon = get_category_icon(cat)
        category_tabs += f'''
            <button class="filter-tab" data-filter="{cat}">
                {icon} {cat.split(" ")[0]} ({count})
            </button>
'''

    category_bars = ""
    for cat, count in categories:
        icon = get_category_icon(cat)
        percentage = (count / total_count) * 100
        category_bars += f"""
            <div class="category-bar-item">
                <span class="category-bar-label">{icon} {cat}</span>
                <div class="category-bar-track">
                    <div class="category-bar-fill" style="width: {percentage}%"></div>
                </div>
                <span class="category-bar-count">{count} ({percentage:.1f}%)</span>
            </div>
"""

    table_rows = ""
    for i, repo in enumerate(repos, 1):
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

        table_rows += f'''
            <tr>
                <td class="col-num">{i}</td>
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
            </tr>
'''

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
                <h1>⭐ My Starred AI Repos</h1>
                <p class="subtitle">Curated collection of AI/ML repositories I love</p>
            </div>
            <div class="header-stats">
                <div class="stat-card">
                    <span class="stat-value">{total_count:,}</span>
                    <span class="stat-label">Repos</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">{total_stars:,}</span>
                    <span class="stat-label">Total Stars</span>
                </div>
                <div class="stat-card">
                    <span class="stat-value">{len(categories)}</span>
                    <span class="stat-label">Categories</span>
                </div>
            </div>
            <div class="last-updated">
                Updated: <span id="last-updated-time">{updated_at}</span>
            </div>
        </header>

        <div class="filters-section">
            <div class="search-box">
                <input type="text" id="search-input" placeholder="Search repos...">
            </div>
            <div class="filter-tabs">
                <button class="filter-tab active" data-filter="all">All ({total_count})</button>
                {category_tabs}
            </div>
            <div class="filter-options">
                <select id="sort-select">
                    <option value="stars" selected>Sort by Stars</option>
                    <option value="updated">Sort by Updated</option>
                    <option value="name">Sort by Name</option>
                </select>
                <select id="per-page-select">
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
                <tbody id="repos-tbody">
                    {table_rows}
                </tbody>
            </table>
        </div>

        <div class="category-summary" id="category-summary">
            <h3>📊 Category Distribution</h3>
            <div class="category-bars">
                {category_bars}
            </div>
        </div>

        <footer class="footer">
            <p>🤖 Auto-updated daily via GitHub Actions</p>
            <p>Made with ❤️ by <a href="https://github.com/hankbui" target="_blank">@hankbui</a></p>
        </footer>
    </div>

    <script>
        let allRepos = {json.dumps(repos)};
        let currentFilter = 'all';
        let currentSort = 'stars';
        let currentPage = 1;
        let reposPerPage = 50;

        document.addEventListener('DOMContentLoaded', function() {{
            initEventListeners();
        }});

        function initEventListeners() {{
            document.getElementById('search-input').addEventListener('input', filterRepos);
            document.getElementById('sort-select').addEventListener('change', function(e) {{
                currentSort = e.target.value;
                filterRepos();
            }});
            document.getElementById('per-page-select').addEventListener('change', function(e) {{
                reposPerPage = parseInt(e.target.value);
                currentPage = 1;
                renderPage();
            }});
            document.querySelectorAll('.filter-tab').forEach(tab => {{
                tab.addEventListener('click', function(e) {{
                    document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
                    e.target.classList.add('active');
                    currentFilter = e.target.dataset.filter;
                    currentPage = 1;
                    filterRepos();
                }});
            }});
        }}

        function filterRepos() {{
            const searchTerm = document.getElementById('search-input').value.toLowerCase();
            window.filteredRepos = allRepos.filter(repo => {{
                if (currentFilter !== 'all' && repo.category !== currentFilter) return false;
                if (searchTerm) {{
                    const searchText = (repo.name + ' ' + (repo.description || '')).toLowerCase();
                    if (!searchText.includes(searchTerm)) return false;
                }}
                return true;
            }});
            window.filteredRepos.sort((a, b) => {{
                if (currentSort === 'stars') return b.stars - a.stars;
                if (currentSort === 'updated') return new Date(b.updated_at) - new Date(a.updated_at);
                return a.name.localeCompare(b.name);
            }});
            currentPage = 1;
            renderPage();
        }}

        function renderPage() {{
            const tbody = document.getElementById('repos-tbody');
            const start = (currentPage - 1) * reposPerPage;
            const end = start + reposPerPage;
            const pageRepos = window.filteredRepos.slice(start, end);

            tbody.innerHTML = pageRepos.map((repo, i) => {{
                const idx = start + i + 1;
                const trending = repo.flags && repo.flags.includes('trending') ? '<span>🔥 trending</span>' : '';
                return `
                    <tr>
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
                        <td class="col-category"><span class="category-badge">${{getCategoryIcon(repo.category)}} ${{repo.category.split(' ')[0]}}</span></td>
                        <td class="col-updated">${{repo.updated_at}}</td>
                    </tr>
                `;
            }}).join('');

            const totalPages = Math.ceil(window.filteredRepos.length / reposPerPage);
            document.getElementById('page-info').textContent = `Page ${{currentPage}} of ${{totalPages || 1}}`;
            document.getElementById('prev-page').disabled = currentPage === 1;
            document.getElementById('next-page').disabled = currentPage >= totalPages;
        }}
    </script>
    <script src="app.js"></script>
</body>
</html>"""

    return html


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
    print(f"   Total repos: {data['total_count']}")
    print(f"   Total stars: {stats.get('total_stars', 0):,}")


if __name__ == "__main__":
    main()
