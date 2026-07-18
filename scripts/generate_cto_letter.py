"""Weekly AI CTO Letter — auto-generated intelligence brief.

Reads repos, ideas, and research data → produces a weekly HTML-ready JSON
letter that surfaces accelerating technologies, revenue-bearing startup
ideas, hidden-gem papers, and notable GitHub implementations.
"""

from __future__ import annotations

import json
import os
import re
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "website" / "data"
RESEARCH_JSON = ROOT / "website" / "research" / "json"
OUTPUT = DATA / "cto-letter.json"


def load_json(path: Path) -> dict | list:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def extract_accelerating_techs(technologies: list[dict], top_n: int = 3) -> list[dict]:
    scored = [
        {
            "name": t.get("name", "?"),
            "description": (t.get("name") or "?"),
            "trend": t.get("trend", "stable"),
            "confidence": t.get("confidence", 0),
            "maturity": t.get("maturity", "unknown"),
            "paper_count": t.get("papers", 0) if isinstance(t.get("papers"), int) else len(t.get("papers") or []),
            "signal": t.get("trend", "stable"),
        }
        for t in technologies
        if t.get("trend") in ("rising", "breakout") and t.get("confidence", 0) >= 0.4
    ]
    scored.sort(key=lambda x: (x["confidence"], x.get("paper_count", 0)), reverse=True)
    return scored[:top_n]


def extract_revenue_ideas(ideas: list[dict], top_n: int = 3) -> list[dict]:
    with_revenue = [
        {
            "title": i.get("title", "?"),
            "url": i.get("url", ""),
            "revenue_signal": i.get("revenue_signal", ""),
            "source": i.get("source", "?"),
            "category": i.get("category", ""),
            "business_model": i.get("business_model", ""),
            "ai_potential": i.get("ai_potential", 0),
            "score": i.get("score", 0),
        }
        for i in ideas
        if i.get("revenue_signal")
    ]
    with_revenue.sort(key=lambda x: x.get("ai_potential", 0) + x.get("score", 0) / 1000, reverse=True)
    return with_revenue[:top_n]


def extract_hidden_gems(papers: list[dict], technologies: list[dict], top_n: int = 2) -> list[dict]:
    low_confidence = [t for t in technologies if t.get("confidence", 1) < 0.75 and t.get("trend") in ("rising", "emerging")]
    low_confidence.sort(key=lambda t: t.get("papers", 0), reverse=True)
    gems = []
    for t in low_confidence[:top_n]:
        related = [p for p in papers if t.get("name") in (p.get("technologies") or [])]
        gems.append({
            "technology": t.get("name", "?"),
            "description": (t.get("name") or "?")[:300],
            "confidence": t.get("confidence", 0),
            "paper_count": t.get("papers", 0),
            "related_papers": [{"title": p.get("title", "?"), "url": p.get("url", "")} for p in related[:3]],
        })
    return gems


def extract_notable_repos(repos: list[dict], technologies: list[str] | None = None, top_n: int = 5) -> list[dict]:
    scored = [
        {
            "name": r.get("full_name", r.get("name", "?")),
            "url": r.get("html_url", r.get("url", "")),
            "description": (r.get("description") or "")[:200],
            "stars": r.get("stargazers_count", r.get("stars", 0)),
            "language": r.get("language", ""),
            "topics": r.get("topics", []),
            "category": r.get("category", ""),
        }
        for r in repos
        if r.get("stargazers_count", r.get("stars", 0)) > 100
    ]
    scored.sort(key=lambda x: x["stars"], reverse=True)
    return scored[:top_n]


def build_letter() -> dict:
    ideas_data = load_json(DATA / "ideas.json")
    research_data = load_json(RESEARCH_JSON / "index.json")
    report_data = load_json(DATA / "report.json")

    ideas = ideas_data.get("ideas", [])
    repos = load_json(DATA / "repos.json")
    if isinstance(repos, dict):
        repo_data = repos
        repos = repo_data.get("starred_repos", repo_data.get("repos", repo_data.get("items", [])))
        trending = repo_data.get("trending_repos", [])
        if trending:
            existing_names = {r.get("full_name", r.get("name", "")) for r in repos}
            for r in trending:
                name = r.get("full_name", r.get("name", ""))
                if name and name not in existing_names:
                    repos.append(r)

    papers = research_data.get("papers", [])
    technologies = research_data.get("technologies", [])
    opportunities = research_data.get("product_opportunities", [])
    meta = research_data.get("meta", {})

    accelerating = extract_accelerating_techs(technologies, 3)
    revenue_ideas = extract_revenue_ideas(ideas, 3)
    hidden_gems = extract_hidden_gems(papers, technologies, 2)
    notable_repos = extract_notable_repos(repos, top_n=5)

    letter = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "week_of": datetime.now(timezone.utc).strftime("%Y-%U"),
        "meta": {
            "papers_tracked": meta.get("papers_count", len(papers)),
            "technologies_tracked": meta.get("technologies_count", len(technologies)),
            "ideas_tracked": len(ideas),
            "repos_tracked": len(repos) if isinstance(repos, list) else 0,
            "last_research_update": meta.get("updated_at", ""),
        },
        "accelerating_technologies": accelerating,
        "startup_ideas_with_revenue": revenue_ideas,
        "hidden_gems": hidden_gems,
        "notable_repos": notable_repos,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(letter, indent=2, ensure_ascii=False))
    print(f"CTO Letter written to {OUTPUT} ({len(json.dumps(letter))} bytes)")
    return letter


if __name__ == "__main__":
    build_letter()
