"""Crawl GitHub Trending for AI agent / skill repositories.

Fetches the public GitHub Trending pages for agent- and skill-related topics
(no API token required), extracts repo name / url / description / stars /
language / topics hints, and merges them into website/data/repos.json under
trending_repos (deduplicated by full repo name).

Topics crawled:
  ai-agents, ai-agent, autogen, crewai, langchain, mcp, autonomous-agents,
  agentic-framework, llm-agents, coding-agent, ai-automation

Usage:
  python scripts/crawl_agent_skills.py
  # then rebuild the value-scored pages:
  python scripts/build_agent_skill_value.py
"""

from __future__ import annotations

import json
import re
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPOS_JSON = ROOT / "website" / "data" / "repos.json"

TOPICS = [
    "ai-agents", "ai-agent", "autogen", "crewai", "langchain", "mcp",
    "autonomous-agents", "agentic-framework", "llm-agents", "coding-agent",
    "ai-automation", "ai-agents",
]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; AgentSkillsCrawl/1.0; +https://github.com/hankbui)",
    "Accept-Language": "en-US,en;q=0.9",
}

_repo_re = re.compile(
    r'<article[^>]*class="Box-row"[^>]*>.*?</article>', re.S
)
_name_re = re.compile(r'<h1[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', re.S)
_desc_re = re.compile(r'<p[^>]*>(.*?)</p>', re.S)
_star_re = re.compile(r'(\d[\d,]*)\s*star', re.I)


def _fetch(url: str) -> str:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as resp:
        return resp.read().decode("utf-8", errors="replace")


def _clean_html(raw: str) -> str:
    text = re.sub(r"<[^>]+>", " ", raw)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _parse_star(text: str) -> int:
    m = _star_re.search(text)
    if not m:
        return 0
    return int(m.group(1).replace(",", ""))


def crawl_topic(topic: str) -> list[dict]:
    url = f"https://github.com/trending/{topic}?since=weekly"
    print(f"  crawling {url}")
    try:
        html = _fetch(url)
    except Exception as e:
        print(f"    [SKIP] {topic}: {e}")
        return []

    repos: list[dict] = []
    for block in _repo_re.findall(html):
        nm = _name_re.search(block)
        if not nm:
            continue
        owner_repo = nm.group(1).strip().strip("/")
        name_raw = _clean_html(nm.group(2))
        name = re.sub(r"\s+", "/", name_raw).strip("/") if "/" not in name_raw else name_raw
        full = owner_repo
        desc = ""
        dm = _desc_re.search(block)
        if dm:
            desc = _clean_html(dm.group(1))
        stars = _parse_star(block)

        language = ""
        lm = re.search(
            r'<span[^>]*itemprop="programmingLanguage"[^>]*>(.*?)</span>', block, re.S
        )
        if lm:
            language = _clean_html(lm.group(1))

        repos.append({
            "name": full,
            "repo_name": full.split("/")[-1] if "/" in full else full,
            "owner": full.split("/")[0] if "/" in full else "",
            "url": f"https://github.com/{full}",
            "description": desc[:300],
            "stars": stars,
            "forks": 0,
            "language": language,
            "topics": [topic] + ([language.lower()] if language else []),
            "pushed_at": "",
            "category": "Other",
            "trend_score": 0,
            "star_delta_7d": 0,
            "activity": "Hot",
            "stack_layer": "Other",
            "_source": f"github-trending:{topic}",
        })
        time.sleep(0.4)

    print(f"    found {len(repos)} repos")
    return repos


def main() -> None:
    print("=" * 60)
    print("Crawl GitHub Trending -> agents/skills candidates")
    print("=" * 60)

    if not REPOS_JSON.exists():
        REPOS_JSON.write_text(
            json.dumps(
                {"updated_at": "", "trending_repos": [], "starred_repos": []},
                indent=2,
            )
        )

    data = json.loads(REPOS_JSON.read_text())
    existing = data.get("trending_repos") or []
    existing_names = {r.get("name") for r in existing}

    added = 0
    for topic in TOPICS:
        for r in crawl_topic(topic):
            if r["name"] in existing_names:
                continue
            existing.append(r)
            existing_names.add(r["name"])
            added += 1

    data["trending_repos"] = existing
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    REPOS_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False))

    print(f"\n  Added {added} new repos")
    print(f"  Total trending_repos: {len(existing)}")
    print(f"  Wrote {REPOS_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
