def render_table(repos):
    rows = []
    for r in repos:
        tech = ", ".join(r.get("techstack", []))
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
    md = "# ⭐ Starred Repositories\n"

    md += render_category("AI / LLM", "🧠", categorized.get("AI / LLM", []))
    md += render_category("OCR / Vision", "👁️", categorized.get("OCR / Vision", []))
    md += render_category("Dev Tools", "🛠️", categorized.get("Dev Tools", []))
    md += render_category("Other", "📦", categorized.get("Other", []))

    return md
