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

    while True:
        url = f"https://api.github.com/users/{GITHUB_USER}/starred"
        resp = requests.get(url, params={"per_page": PER_PAGE, "page": page})
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

    for t in repo.get("topics", []):
        if t.lower() in ["llm", "ai", "ocr", "vision", "nlp", "agent"]:
            tech.add(t.upper())

    return sorted(tech)


# =====================
# CATEGORIZATION
# =====================
def categorize_repos(repos):
    categories = defaultdict(list)

    for repo in repos:
        repo["techstack"] = infer_techstack(repo)

        topics = repo["topics"]
        name = repo["name"].lower()

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
    rows = []
    for r in repos:
        tech = ", ".join(r["techstack"])
        rows.append(
            f"| [{r['name']}]({r['url']}) | {r['description']} | {tech} |"
        )

    return (
        "| Repo | Description | Tech Stack |\n"
        "|------|-------------|------------|\n"
        + "\n".join(rows)
    )


def render_category(title, icon, repos):
    if not repos:
        return ""
    return f"""
## {icon} {title}

{render_table(repos)}
"""


def render_readme(categorized):
    md = "# ⭐ Starred Repositories\n\n"
    md += "_Auto-updated daily via GitHub Actions._\n\n"

    md += render_category("AI / LLM", "🧠", categorized.get("AI / LLM", []))
    md += render_category("OCR / Vision", "👁️", categorized.get("OCR / Vision", []))
    md += render_category("Automation / Workflow", "⚙️", categorized.get("Automation / Workflow", []))
    md += render_category("Other", "📦", categorized.get("Other", []))

    return md


# =====================
# MAIN
# =====================
def main():
    repos = fetch_starred()
    categorized = categorize_repos(repos)
    markdown = render_readme(categorized)

    with open("README.md", "w", encoding="utf-8") as f:
        f.write(markdown)


if __name__ == "__main__":
    main()
