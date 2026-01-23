import os
import requests
from collections import defaultdict

# =====================
# CONFIG
# =====================
GITHUB_USER = "hankbui"
PER_PAGE = 100

HEADERS = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {os.getenv('GITHUB_TOKEN')}",
}

# =====================
# FETCH STARRED REPOS
# =====================
def fetch_starred():
    repos = []
    page = 1

    while True:
        url = f"https://api.github.com/users/{GITHUB_USER}/starred"
        resp = requests.get(
            url,
            headers=HEADERS,
            params={"per_page": PER_PAGE, "page": page},
            timeout=30,
        )

        if resp.status_code != 200:
            print("❌ Failed to fetch starred repos:", resp.text)
            break

        data = resp.json()
        if not data:
            break

        for r in data:
            repos.append({
                "name": r["full_name"],        # owner/repo
                "url": r["html_url"],
                "description": r["description"] or "",
                "topics": r.get("topics", []),
                "stars": r["stargazers_count"],
                "last_updated": r["updated_at"][:10],  # YYYY-MM-DD
            })

        page += 1

    print(f"✅ Fetched {len(repos)} starred repos")
    return repos
# =====================
# FETCH LANGUAGES (REAL TECH STACK)
# =====================
def fetch_languages(full_name):
    url = f"https://api.github.com/repos/{full_name}/languages"
    resp = requests.get(url, headers=HEADERS, timeout=30)

    if resp.status_code != 200:
        return {}

    return resp.json()

def format_techstack(lang_dict, top_n=3):
    if not lang_dict:
        return ""

    sorted_langs = sorted(
        lang_dict.items(),
        key=lambda x: x[1],
        reverse=True
    )

    return ", ".join(lang for lang, _ in sorted_langs[:top_n])

def fetch_languages(owner_repo: str):
    url = f"https://api.github.com/repos/{owner_repo}/languages"
    resp = requests.get(url, headers=HEADERS, timeout=30)

    if resp.status_code != 200:
        return ""

    data = resp.json()
    if not data:
        return ""

    total = sum(data.values())
    if total == 0:
        return ""

    parts = []
    for lang, bytes_ in sorted(data.items(), key=lambda x: -x[1]):
        pct = bytes_ * 100 / total
        parts.append(f"{lang} {pct:.1f}%")

    # chỉ lấy top 4 cho gọn
    return ", ".join(parts[:4])

# =====================
# CATEGORIZATION
# =====================
def categorize_repos(repos):
    categories = defaultdict(list)

    for repo in repos:
        print(f"🔍 Fetching techstack for {repo['name']}")
        repo["techstack"] = fetch_languages(repo["name"])

        topics = repo.get("topics", [])

        if any(t in topics for t in ["llm", "ai", "agent"]):
            categories["AI / LLM"].append(repo)
        elif any(t in topics for t in ["ocr", "vision"]):
            categories["OCR / Vision"].append(repo)
        elif any(t in topics for t in ["workflow", "automation"]):
            categories["Automation / Workflow"].append(repo)
        else:
            categories["Other"].append(repo)

    return categories
# =====================
# MARKDOWN RENDER
# =====================
def render_table(repos):
    lines = [
        "| Repository | Description | Tech Stack |",
        "|-----------|-------------|------------|",
    ]

    for r in repos:
        repo_cell = (
            f"[{r['name']}]({r['url']})<br/>"
            f"⭐ {r['stars']:,} &nbsp;•&nbsp; 🕒 {r['last_updated']}"
        )

        lines.append(
            f"| {repo_cell} | {r['description']} | {r['techstack']} |"
        )

    return "\n".join(lines)

def render_readme(categories):
    md = [
        "# ⭐ Starred Repositories",
        "",
        "_Auto-updated daily via GitHub Actions._",
        "",
    ]

    icons = {
        "AI / LLM": "🤖",
        "OCR / Vision": "👁️",
        "Automation / Workflow": "⚙️",
        "Chinese / Language": "🇨🇳",
        "Other": "📦",
    }

    for cat, repos in categories.items():
        if not repos:
            continue
        md.append(f"## {icons.get(cat, '📁')} {cat}\n")
        md.append(render_table(repos))
        md.append("")

    return "\n".join(md)

# =====================
# MAIN
# =====================
def main():
    print("🚀 README generator started")

    repos = fetch_starred()
    categories = categorize_repos(repos)
    markdown = render_readme(categories)

    with open("README.md", "w", encoding="utf-8") as f:
        f.write(markdown)

    print("✅ README.md generated successfully")

if __name__ == "__main__":
    main()
