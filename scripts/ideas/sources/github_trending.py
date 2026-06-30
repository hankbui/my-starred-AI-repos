"""GitHub Trending — repos with high recent star growth via GitHub Search API

No API key required for unauthenticated access (60 req/hr).
Uses GITHUB_TOKEN env var when available (5,000 req/hr in CI).
"""

import hashlib
import os
from datetime import datetime, timedelta, timezone

try:
    import requests
except ImportError:
    requests = None  # fallback to urllib

GITHUB_API = "https://api.github.com"


def _fetch(url: str, token: str | None = None) -> dict | list:
    headers = {
        "User-Agent": "idea-scraper/1.0",
        "Accept": "application/vnd.github.v3+json",
    }
    if token:
        headers["Authorization"] = f"Bearer {token}"

    if requests:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        return resp.json()

    import urllib.request

    req = urllib.request.Request(url, headers=headers)
    r = urllib.request.urlopen(req, timeout=30)
    return __import__("json").loads(r.read().decode())


def _parse_stars(stars_str: str) -> int:
    try:
        return int(stars_str)
    except (ValueError, TypeError):
        return 0


def scrape_trending(
    limit: int = 25, min_stars: int = 100, token: str | None = None
) -> list[dict]:
    """Fetch trending repos — high star growth in the last 30 days."""
    now = datetime.now(timezone.utc)
    created_after = (now - timedelta(days=60)).strftime("%Y-%m-%d")
    pushed_after = (now - timedelta(days=7)).strftime("%Y-%m-%d")

    # Primary: repos created in last 60 days, pushed recently, sorted by stars
    query = f"created:>{created_after}+pushed:>{pushed_after}"
    url = (
        f"{GITHUB_API}/search/repositories"
        f"?q={query}&sort=stars&order=desc&per_page={min(limit, 100)}"
    )

    data = _fetch(url, token)
    items = data.get("items", [])

    if len(items) < limit:
        # Fallback: just high stars recently pushed
        query = f"stars:>{min_stars}+pushed:>{pushed_after}"
        url = (
            f"{GITHUB_API}/search/repositories"
            f"?q={query}&sort=stars&order=desc&per_page={min(limit, 100)}"
        )
        data = _fetch(url, token)
        items = data.get("items", [])

    return items[:limit]


def parse_trending(items: list[dict]) -> list[dict]:
    ideas = []
    seen = set()

    for item in items:
        full_name = item.get("full_name", "")
        if not full_name or full_name in seen:
            continue
        seen.add(full_name)

        description = item.get("description") or ""
        language = item.get("language") or ""
        stars = item.get("stargazers_count", 0)
        topics = item.get("topics", []) or []
        url = item.get("html_url", f"https://github.com/{full_name}")
        created_at = item.get("created_at", "")

        unique = f"gh-{full_name}"
        idea_id = hashlib.sha256(unique.encode()).hexdigest()[:16]

        ideas.append(
            {
                "id": idea_id,
                "source": "githubtrending",
                "title": full_name,
                "url": url,
                "description": description[:1000],
                "revenue_signal": None,
                "category": language,
                "tags": [language] + topics[:3] if language else topics[:3],
                "score": stars,
                "num_comments": item.get("forks_count", 0),
                "comments_url": f"{url}/forks",
                "date_published": created_at,
                "date_collected": datetime.now(timezone.utc).isoformat(),
                "raw_snippet": f"{full_name} {description}",
                "summary": "",
            }
        )

    return ideas


def run() -> list[dict]:
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    print("  Fetching GitHub Trending via API...")
    try:
        items = scrape_trending(limit=25, min_stars=100, token=token)
        if not items:
            print("  [SKIP] No trending repos found")
            return []
        ideas = parse_trending(items)
        print(f"  Got {len(ideas)} trending repos")
        return ideas
    except Exception as e:
        print(f"  [WARN] GitHub Trending failed: {e}")
        return []
