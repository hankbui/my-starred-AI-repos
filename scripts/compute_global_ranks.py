"""Fetch the actual top GitHub repos and save as a global leaderboard.

Fetches top repos from GitHub Search API (sorted by stars, descending),
assigns rank = position, and saves to website/data/top-repos.json.

Also merges into website/data/repos.json so the 'global' view can show
these repos alongside the user's starred repos.
"""

from __future__ import annotations

import json
import math
import time
import urllib.request
import urllib.error
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TOP_FILE = ROOT / "website" / "data" / "top-repos.json"
REPOS_FILE = ROOT / "website" / "data" / "repos.json"

HEADERS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "my-starred-ai-repos (top-repos)",
}

# Fallback star→rank estimation when API can't reach deeply enough
ANCHORS = [
    (1, 5000000), (10, 2000000), (50, 800000), (100, 500000),
    (500, 150000), (1000, 60000), (2000, 45000), (5000, 18000),
    (10000, 5500), (20000, 2000), (50000, 400), (100000, 150),
    (200000, 25), (500000, 5), (1000000, 2), (5000000, 1),
]
log_stars = [math.log(s) for s, _ in ANCHORS]
log_ranks = [math.log(r) for _, r in ANCHORS]


def estimate_rank(stars: int) -> int:
    if stars <= 0:
        stars = 1
    ls = math.log(stars)
    if ls <= log_stars[0]:
        return ANCHORS[0][1]
    if ls >= log_stars[-1]:
        return ANCHORS[-1][1]
    for i in range(len(log_stars) - 1):
        if log_stars[i] <= ls <= log_stars[i + 1]:
            frac = (ls - log_stars[i]) / (log_stars[i + 1] - log_stars[i])
            return round(math.exp(log_ranks[i] + frac * (log_ranks[i + 1] - log_ranks[i])))
    return ANCHORS[-1][1]


def gh_get(url: str, retries: int = 2) -> dict | None:
    for attempt in range(retries):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read())
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, ValueError) as e:
            code = getattr(e, "code", 0) if isinstance(e, urllib.error.HTTPError) else 0
            if code == 403:
                print("  [rate-limited] sleeping 60s...")
                time.sleep(60)
                continue
            if code == 422:
                print(f"  [validation error] {url}")
                return None
            print(f"  [attempt {attempt + 1} failed] {e}")
            time.sleep(3)
    return None


def fetch_top_repos(max_pages: int = 10) -> list[dict]:
    """Fetch top repos sorted by stars descending."""
    all_items = []
    for page in range(1, max_pages + 1):
        url = (f"https://api.github.com/search/repositories"
               f"?q=stars:%3E0&sort=stars&order=desc&per_page=100&page={page}")
        print(f"  Fetching page {page}...")
        data = gh_get(url)
        if not data or "items" not in data:
            print("    no more data")
            break
        items = data["items"]
        if not items:
            break
        for r in items:
            all_items.append({
                "name": r["full_name"],
                "owner": r["owner"]["login"],
                "repo_name": r["name"],
                "url": r["html_url"],
                "stars": r["stargazers_count"],
                "forks": r["forks_count"],
                "description": (r.get("description") or "")[:200],
                "language": r.get("language") or "",
                "topics": r.get("topics", [])[:8],
                "license": (r.get("license") or {}).get("spdx_id", "") if r.get("license") else "",
                "category": "Other",
                "global_rank": len(all_items) + 1,
            })
        if len(items) < 100:
            break
        time.sleep(1.2)  # be gentle with rate limit
    return all_items


def main():
    print("=" * 50)
    print("Fetching top GitHub repos...")
    top_repos = fetch_top_repos(max_pages=10)
    print(f"  Fetched {len(top_repos)} repos")

    # Assign exact ranks
    for i, r in enumerate(top_repos):
        r["global_rank"] = i + 1

    # Save standalone top-repos.json
    TOP_FILE.parent.mkdir(parents=True, exist_ok=True)
    TOP_FILE.write_text(json.dumps({
        "updated_at": time.strftime("%Y-%m-%d"),
        "source": "github_search_api",
        "total": len(top_repos),
        "items": top_repos,
    }, indent=2, ensure_ascii=False))
    print(f"  Saved to {TOP_FILE}")

    # Merge into repos.json for the 'global' view
    if REPOS_FILE.exists():
        data = json.loads(REPOS_FILE.read_text())
        starred = data.get("starred_repos") or data.get("repos", [])
        trending = data.get("trending_repos", [])

        # Build merged list: top repos first, then user repos (deduplicated)
        seen = set()
        merged = []
        for r in top_repos:
            if r["name"] not in seen:
                seen.add(r["name"])
                merged.append(r)

        for r in list(starred) + list(trending):
            name = r.get("name", "")
            if name and name not in seen:
                seen.add(name)
                merged.append(r)

        # Assign/update global ranks for all merged repos
        merged.sort(key=lambda x: -x["stars"])
        for i, r in enumerate(merged):
            r["global_rank"] = i + 1

        # For user repos that are NOT in the top list, also assign estimated rank
        user_repos_set = {(r.get("name", "")) for r in starred}
        for r in merged:
            if r.get("name") in user_repos_set:
                # Already has exact rank from merged position
                pass

        # Update the original data
        rank_map = {r["name"]: r["global_rank"] for r in merged}

        existing = set()
        all_existing = list(starred) + list(trending)
        for r in all_existing:
            name = r.get("name", "")
            if name not in existing:
                existing.add(name)
                if name in rank_map:
                    r["global_rank"] = rank_map[name]

        REPOS_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        print(f"  Merged into {REPOS_FILE} ({len(merged)} unique repos)")

    print("Done.")


if __name__ == "__main__":
    main()