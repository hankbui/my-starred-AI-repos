def render_table(repos):
    rows = []
    rows.append("| Repo | Description | Tech Stack |")
    rows.append("|------|-------------|------------|")

    for r in repos:
        tech = " · ".join(r.get("techstack", []))
        rows.append(
            f"| [{r['name']}]({r['url']}) | {r['description']} | {tech} |"
        )

    return "\n".join(rows)
