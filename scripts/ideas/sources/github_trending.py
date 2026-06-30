"""GitHub Trending — trending repos via Search API + HTML fallback

Prefers GitHub Search API (with GITHUB_TOKEN if available).
Falls back to scraping github.com/trending HTML when API is rate-limited.
"""

import hashlib
import os
import re
import urllib.request
from datetime import datetime, timedelta, timezone

try:
    import requests
except ImportError:
    requests = None

GITHUB_API = "https://api.github.com"


def _fetch_json(url: str, token: str | None = None) -> dict | list:
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
    req = urllib.request.Request(url, headers=headers)
    r = urllib.request.urlopen(req, timeout=30)
    return __import__("json").loads(r.read().decode())


def _fetch_html(url: str) -> str:
    headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
        "Accept": "text/html",
    }
    req = urllib.request.Request(url, headers=headers)
    r = urllib.request.urlopen(req, timeout=30)
    return r.read().decode("utf-8", errors="replace")


def scrape_api(token: str | None) -> list[dict] | None:
    now = datetime.now(timezone.utc)
    pushed_after = (now - timedelta(days=7)).strftime("%Y-%m-%d")

    query = f"stars:>100+pushed:>{pushed_after}"
    url = f"{GITHUB_API}/search/repositories?q={query}&sort=stars&order=desc&per_page=25"

    try:
        data = _fetch_json(url, token)
        items = data.get("items", [])
        if items:
            return items
    except Exception:
        return None
    return None


def scrape_html() -> list[dict] | None:
    try:
        html = _fetch_html("https://github.com/trending?since=weekly")
        articles = re.findall(
            r'<article class="Box-row"[^>]*>(.*?)</article>', html, re.DOTALL
        )
        if not articles:
            return None

        repos = []
        for article in articles:
            # Repo name — h2 with class, link inside
            name_match = re.search(
                r'<h2[^>]*>\s*<a[^>]*href="/([^"]+)"[^>]*>', article, re.DOTALL
            )
            if not name_match:
                continue
            full_name = name_match.group(1).strip()
            # Description
            desc_match = re.search(
                r'<p class="col-9[^"]*"[^>]*>(.*?)</p>', article, re.DOTALL
            )
            description = ""
            if desc_match:
                description = re.sub(r"<[^>]+>", "", desc_match.group(1)).strip()
            # Stars
            stars_match = re.findall(r'octicon-star[^>]*>.*?</svg>\s*([\d,]+)', article, re.DOTALL)
            stars = int(stars_match[0].replace(",", "")) if stars_match else 0
            # Language
            lang_match = re.search(
                r'<span itemprop="programmingLanguage">([^<]+)</span>', article
            )
            language = lang_match.group(1).strip() if lang_match else ""

            repos.append(
                {
                    "full_name": full_name,
                    "description": description,
                    "stargazers_count": stars,
                    "language": language,
                    "html_url": f"https://github.com/{full_name}",
                    "created_at": "",
                    "topics": [],
                    "forks_count": 0,
                }
            )
        return repos
    except Exception:
        return None


def scrape_trending(limit: int = 25, token: str | None = None) -> list[dict]:
    items = scrape_api(token)
    if items:
        return items[:limit]

    items = scrape_html()
    if items:
        return items[:limit]

    return []


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
    print("  Fetching GitHub Trending...")
    try:
        items = scrape_trending(limit=25, token=token)
        if not items:
            print("  [SKIP] No trending repos found")
            return []
        ideas = parse_trending(items)
        print(f"  Got {len(ideas)} trending repos")
        return ideas
    except Exception as e:
        print(f"  [WARN] GitHub Trending failed: {e}")
        return []
