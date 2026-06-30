#!/usr/bin/env python3
"""
Generate a GoodAIList-style dataset from the GitHub API — WITHOUT manual starring.

Three sections, written to website/data/ailist.json:
  - repos : AI/LLM repos discovered via GitHub search (keywords + topics + star floor)
  - devs  : human contributors ranked by their contributions across those AI repos
  - bots  : bot accounts (dependabot[bot], github-actions[bot], Copilot, ...) ranked the same way

Reuses the website repo schema + category rules from generate_data.py so the
front-end repo table can render this data unchanged.

Env:
  GITHUB_TOKEN            required
  AILIST_CONTRIB_REPOS    optional override for how many top repos to scan for
                          contributors (default 300). Lower it for a fast test run.
"""

import json
import math
import os
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

from generate_data import (
    HEADERS,
    GITHUB_API_URL,
    normalize_repo,
)

REPO_ROOT = Path(__file__).resolve().parents[1]
WEBSITE_DATA_DIR = REPO_ROOT / "website" / "data"
OUTPUT_FILE = WEBSITE_DATA_DIR / "ailist.json"

# ── Discovery: GitHub search queries (topic + keyword + star floor) ────────────
# Each entry is a raw GitHub search `q`. Sorted by stars; we keep the top pages.
SEARCH_QUERIES = [
    "topic:llm stars:>400",
    "topic:large-language-models stars:>300",
    "topic:generative-ai stars:>300",
    "topic:llmops stars:>150",
    "topic:rag stars:>200",
    "topic:agent stars:>500",
    "topic:ai-agents stars:>200",
    "topic:machine-learning stars:>3000",
    "topic:deep-learning stars:>3000",
    "topic:artificial-intelligence stars:>1500",
    "topic:transformers stars:>800",
    "topic:diffusion-models stars:>500",
    "topic:computer-vision stars:>2500",
    "topic:nlp stars:>2000",
    "llm in:name,description stars:>1500",
    "gpt in:name,description stars:>1500",
    "ai agent in:name,description stars:>1200",
]

PAGES_PER_QUERY = 2          # 100/page, sorted by stars → top 200 per query
MAX_REPOS = 1000             # cap on the discovered repo set
CONTRIB_REPO_LIMIT = int(os.getenv("AILIST_CONTRIB_REPOS", "300"))
TOP_DEVS = 300
TOP_BOTS = 80
TOP_REPOS_PER_USER = 3
SEARCH_SLEEP = 2.2           # search API allows ~30 req/min
CONTRIB_SLEEP = 0.2


def _get(url, params=None, max_retries=4):
    """GET with basic handling of primary + secondary rate limits."""
    for attempt in range(max_retries):
        resp = requests.get(url, headers=HEADERS, params=params, timeout=30)
        if resp.status_code == 403 and "rate limit" in resp.text.lower():
            reset = resp.headers.get("X-RateLimit-Reset")
            wait = 60
            if reset and reset.isdigit():
                wait = max(5, int(reset) - int(time.time()) + 2)
            print(f"    rate limited, sleeping {min(wait, 120)}s")
            time.sleep(min(wait, 120))
            continue
        if resp.status_code in (502, 503) and attempt < max_retries - 1:
            time.sleep(3 * (attempt + 1))
            continue
        return resp
    return resp


def search_ai_repos():
    """Run all search queries, dedupe by id, return normalized repos sorted by stars."""
    by_id = {}
    for query in SEARCH_QUERIES:
        for page in range(1, PAGES_PER_QUERY + 1):
            resp = _get(
                f"{GITHUB_API_URL}/search/repositories",
                params={"q": query, "sort": "stars", "order": "desc", "per_page": 100, "page": page},
            )
            if resp.status_code != 200:
                print(f"  [WARN] search '{query}' p{page}: HTTP {resp.status_code}")
                break
            items = resp.json().get("items", [])
            for repo in items:
                if repo.get("fork") or repo.get("archived"):
                    continue
                by_id[repo["id"]] = repo
            print(f"  query '{query}' p{page}: +{len(items)} (total {len(by_id)})")
            time.sleep(SEARCH_SLEEP)
            if len(items) < 100:
                break

    repos = [normalize_repo(r) for r in by_id.values()]
    repos.sort(key=lambda r: r["stars"], reverse=True)
    repos = repos[:MAX_REPOS]
    for index, repo in enumerate(repos, start=1):
        repo["rank"] = index
    return repos


def _is_bot(contributor):
    login = (contributor.get("login") or "")
    return contributor.get("type") == "Bot" or login.endswith("[bot]")


def aggregate_contributors(repos):
    """Scan top repos' contributors → aggregate per-account devs and bots."""
    accounts = {}  # login -> aggregate dict
    scanned = 0
    for repo in repos[:CONTRIB_REPO_LIMIT]:
        owner, _, name = repo["name"].partition("/")
        resp = _get(
            f"{GITHUB_API_URL}/repos/{owner}/{name}/contributors",
            params={"per_page": 100, "anon": "0"},
        )
        if resp.status_code != 200:
            # 403/204 happens for huge repos (list unavailable) — skip quietly
            time.sleep(CONTRIB_SLEEP)
            continue

        repo_weight = math.log10(repo["stars"] + 10)
        for c in resp.json():
            login = c.get("login")
            if not login:
                continue
            contributions = int(c.get("contributions") or 0)
            acc = accounts.get(login)
            if acc is None:
                acc = {
                    "login": login,
                    "type": "Bot" if _is_bot(c) else "User",
                    "avatar_url": c.get("avatar_url") or "",
                    "profile_url": c.get("html_url") or f"https://github.com/{login}",
                    "repos": 0,
                    "contributions": 0,
                    "weighted": 0.0,
                    "_top": [],
                }
                accounts[login] = acc
            acc["repos"] += 1
            acc["contributions"] += contributions
            acc["weighted"] += contributions * repo_weight
            acc["_top"].append(
                {"name": repo["name"], "contributions": contributions, "stars": repo["stars"]}
            )

        scanned += 1
        if scanned % 25 == 0:
            print(f"  contributors scanned: {scanned}/{min(len(repos), CONTRIB_REPO_LIMIT)} repos, {len(accounts)} accounts")
        time.sleep(CONTRIB_SLEEP)

    print(f"  contributor scan done: {scanned} repos, {len(accounts)} unique accounts")
    return accounts


def finalize_accounts(accounts):
    """Split into ranked devs + bots with trimmed top-repos."""
    devs, bots = [], []
    for acc in accounts.values():
        acc["weighted"] = round(acc["weighted"])
        acc["top_repos"] = sorted(acc.pop("_top"), key=lambda t: t["contributions"], reverse=True)[
            :TOP_REPOS_PER_USER
        ]
        (bots if acc["type"] == "Bot" else devs).append(acc)

    devs.sort(key=lambda a: (a["weighted"], a["contributions"]), reverse=True)
    bots.sort(key=lambda a: (a["weighted"], a["contributions"]), reverse=True)

    for index, acc in enumerate(devs[:TOP_DEVS], start=1):
        acc["rank"] = index
    for index, acc in enumerate(bots[:TOP_BOTS], start=1):
        acc["rank"] = index

    return devs[:TOP_DEVS], bots[:TOP_BOTS]


def main():
    print("=" * 60)
    print("GoodAIList-style generator (repos / devs / bots)")
    print("=" * 60)

    print("\n[1/3] Searching AI repos...")
    repos = search_ai_repos()
    print(f"  discovered {len(repos)} repos")

    print(f"\n[2/3] Aggregating contributors (top {CONTRIB_REPO_LIMIT} repos)...")
    accounts = aggregate_contributors(repos)

    print("\n[3/3] Ranking devs + bots...")
    devs, bots = finalize_accounts(accounts)
    print(f"  devs: {len(devs)} | bots: {len(bots)}")

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "counts": {"repos": len(repos), "devs": len(devs), "bots": len(bots)},
        "repos": repos,
        "devs": devs,
        "bots": bots,
    }

    WEBSITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved → {OUTPUT_FILE}")
    print(f"repos={len(repos)} devs={len(devs)} bots={len(bots)}")


if __name__ == "__main__":
    main()
