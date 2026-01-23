import os
import requests
from collections import defaultdict
from datetime import datetime, timezone, timedelta

import json
from pathlib import Path
# =====================
# CONFIG
# =====================
GITHUB_USER = "hankbui"
PER_PAGE = 100
TRENDING_STAR_THRESHOLD = 200
SORT_MODE = "stars"  # "stars" | "updated"

TOKEN = os.getenv("GITHUB_TOKEN")
HEADERS = {
    "Authorization": f"Bearer {TOKEN}",
    "Accept": "application/vnd.github+json"
}

NOW = datetime.now(timezone.utc)

# =====================
# FETCH STARRED REPOS
# =====================
def fetch_starred():
    print("🚀 Fetching starred repos...")
    repos = []
    page = 1

    while True:
        url = f"https://api.github.com/users/{GITHUB_USER}/starred"
        resp = requests.get(
            url,
            params={"per_page": PER_PAGE, "page": page},
            headers=HEADERS,
            timeout=30
        )

        resp.raise_for_status()
        data = resp.json()
        if not data:
            break

        for r in data:
            repos.append({
                "name": r["full_name"],
                "url": r["html_url"],
                "description": r["description"] or "",
                "stars": r["stargazers_count"],
                "updated_at": r["updated_at"],
                "topics": r.get("topics", []),
            })

        page += 1

    print(f"✅ Total repos: {len(repos)}")
    return repos

# =====================
# FETCH LANGUAGE %
# =====================
def fetch_languages(repo_fullname):
    url = f"https://api.github.com/repos/{repo_fullname}/languages"
    resp = requests.get(url, headers=HEADERS, timeout=30)

    if resp.status_code != 200:
        return ""

    data = resp.json()
    if not data:
        return ""

    total = sum(data.values())
    parts = []

    for lang, size in sorted(data.items(), key=lambda x: -x[1]):
        pct = size * 100 / total
        parts.append(f"{lang} {pct:.1f}%")

    return ", ".join(parts[:4])

# =====================
# FLAGS
# =====================
def repo_flags(repo):
    flags = []

    updated = datetime.fromisoformat(repo["updated_at"].replace("Z", "+00:00"))
    days = (NOW - updated).days

    if days > 365:
        flags.append("🧊 inactive")

    if days <= 7 and repo["stars"] >= TRENDING_STAR_THRESHOLD:
        flags.append("🔥 trending")

    return " ".join(flags)

# =====================
# CATEGORIZATION
# =====================
def categorize_repos(repos):
    categories = defaultdict(list)

    for repo in repos:
        print(f"🔍 {repo['name']}")
        repo["techstack"] = fetch_languages(repo["name"])
        repo["flags"] = repo_flags(repo)

        text = (repo["name"] + " " + repo["description"]).lower()
        topics = [t.lower() for t in repo["topics"]]

        if any(k in text or k in topics for k in ["llm", "ai", "agent", "gpt", "transformer"]):
            categories["AI / LLM"].append(repo)
        elif any(k in text or k in topics for k in ["ocr", "vision"]):
            categories["OCR / Vision"].append(repo)
        elif any(k in text or k in topics for k in ["workflow", "automation"]):
            categories["Automation / Workflow"].append(repo)
        else:
            categories["Other"].append(repo)

    return categories

# =====================
# SORTING
# =====================
def sort_repos(repos):
    if SORT_MODE == "updated":
        return sorted(repos, key=lambda r: r["updated_at"], reverse=True)
    return sorted(repos, key=lambda r: r["stars"], reverse=True)

# =====================
# MARKDOWN
# =====================
def render_table(repos):
    lines = [
        "| Repo | Description | Tech Stack |",
        "|------|-------------|------------|",
    ]

    for r in sort_repos(repos):
        updated = r["updated_at"][:10]
        meta = f"⭐ {r['stars']} • 🕒 {updated}"
        if r["flags"]:
            meta += f" • {r['flags']}"

        lines.append(
            f"| [{r['name']}]({r['url']})<br/>{meta} | {r['description']} | {r['techstack']} |"
        )

    return "\n".join(lines)

def render_readme(categories):
    md = [
        "# ⭐ Starred Repositories",
        "",
        "_Auto-updated daily via GitHub Actions_",
        "",
    ]

    icons = {
        "AI / LLM": "🤖",
        "OCR / Vision": "👁️",
        "Automation / Workflow": "⚙️",
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
    repos = fetch_starred()
    categories = categorize_repos(repos)
    markdown = render_readme(categories)

    with open("README.md", "w", encoding="utf-8") as f:
        f.write(markdown)

    print("✅ README.md generated")

if __name__ == "__main__":
    print(">>> UPDATE STARRED REPOS START <<<")
    main()
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



def export_json(categories):
    output = []

    for cat, repos in categories.items():
        for r in repos:
            output.append({
                "name": r["name"],
                "url": r["url"],
                "description": r["description"],
                "stars": r["stars"],
                "last_updated": r["updated_at"],
                "techstack": r["techstack"],
                "flags": r["flags"],
                "category": r["category"],
            })

    Path("data").mkdir(exist_ok=True)

    with open("data/starred_repos.json", "w", encoding="utf-8") as f:
        json.dump(output, f, indent=2, ensure_ascii=False)

    print(f"📦 Exported {len(output)} repos → data/starred_repos.json")
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
