import requests
from collections import defaultdict

# =====================
# CONFIG
# =====================
GITHUB_USER = "hankbui"  
PER_PAGE = 100

# =====================
# FETCH STARRED REPOS
# =====================
def fetch_starred():
    repos = []
    page = 1

    headers = {
        "Accept": "application/vnd.github.mercy-preview+json"
    }

    while True:
        url = f"https://api.github.com/users/{GITHUB_USER}/starred"
        resp = requests.get(
            url,
            params={"per_page": PER_PAGE, "page": page},
            headers=headers
        )
        data = resp.json()

        if not data:
            break

        for r in data:
            repos.append({
                "name": r["full_name"],
                "url": r["html_url"],
                "description": r["description"] or "",
                "topics": r.get("topics", []),
                "language": r.get("language"),
            })

        page += 1

    return repos

# =====================
# TECH STACK INFERENCE
# =====================
def infer_techstack(repo):
    tech = set()

    if repo["language"]:
        tech.add(repo["language"])

    for t in repo["topics"]:
        tech.add(t)

    name = repo["name"].lower()
    desc = repo["description"].lower()

    if "llm" in name or "llm" in desc:
        tech.add("LLM")
    if "ocr" in name or "ocr" in desc:
        tech.add("OCR")

    return ", ".join(sorted(tech))

# =====================
# CATEGORIZATION
# =====================
def categorize_repos(repos):
    categories = defaultdict(list)

    for repo in repos:
        repo["techstack"] = infer_techstack(repo)

        text = (repo["name"] + " " + repo["description"]).lower()
        topics = [t.lower() for t in repo.get("topics", [])]

        if any(k in text or k in topics for k in ["llm", "ai", "agent", "gpt", "transformer"]):
            categories["AI / LLM"].append(repo)
        elif any(k in text or k in topics for k in ["ocr", "vision", "cv"]):
            categories["OCR / Vision"].append(repo)
        elif any(k in text or k in topics for k in ["workflow", "automation", "pipeline"]):
            categories["Automation / Workflow"].append(repo)
        elif any(k in text or k in topics for k in ["chinese", "mandarin", "zh"]):
            categories["Chinese / Language"].append(repo)
        else:
            categories["Other"].append(repo)

    return categories


# =====================
# MARKDOWN RENDER
# =====================
def render_table(repos):
    lines = [
        "| Repo | Description | Tech Stack |",
        "|------|-------------|------------|",
    ]

    for r in repos:
        lines.append(
            f"| [{r['name']}]({r['url']}) | {r['description']} | {r['techstack']} |"
        )

    return "\n".join(lines)

def render_category(title, icon, repos):
    if not repos:
        return ""
    return f"""
## {icon} {title}

{render_table(repos)}
"""


def render_readme(categories):
    md = [
        "# ⭐ Starred Repositories",
        "",
        "_Auto-updated daily via GitHub Actions_",
        "",
    ]

    icons = {
        "AI / LLM": "🤖",
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
    repos = fetch_starred()
    categories = categorize_repos(repos)
    markdown = render_readme(categories)

    with open("README.md", "w", encoding="utf-8") as f:
        f.write(markdown)


if __name__ == "__main__":
    main()
