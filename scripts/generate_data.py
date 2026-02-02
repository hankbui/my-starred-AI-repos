#!/usr/bin/env python3
"""
Fetch both trending AI repos and user's starred repos from GitHub.
"""

import os
import json
import requests
from datetime import datetime, timezone
from collections import defaultdict
from pathlib import Path

GITHUB_USER = "hankbui"
PER_PAGE = 100

TOKEN = os.getenv("GITHUB_TOKEN")
HEADERS = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {TOKEN}",
}

NOW = datetime.now(timezone.utc)
TRENDING_STAR_THRESHOLD = 200


def fetch_starred_repos():
    """Fetch all starred repos for the user."""
    print(f"🚀 Fetching starred repos for {GITHUB_USER}...")
    repos = []
    page = 1

    while True:
        url = f"https://api.github.com/users/{GITHUB_USER}/starred"
        resp = requests.get(
            url,
            headers=HEADERS,
            params={"per_page": PER_PAGE, "page": page, "sort": "updated"},
            timeout=30,
        )

        if resp.status_code != 200:
            print(f"❌ Failed to fetch page {page}: {resp.status_code}")
            break

        data = resp.json()
        if not data:
            break

        for r in data:
            updated_at = r["updated_at"]
            updated = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            days_ago = (NOW - updated).days

            repos.append(
                {
                    "id": r["id"],
                    "name": r["full_name"],
                    "owner": r["owner"]["login"],
                    "owner_avatar": r["owner"]["avatar_url"],
                    "url": r["html_url"],
                    "description": r["description"] or "",
                    "stars": r["stargazers_count"],
                    "forks": r["forks_count"],
                    "issues": r["open_issues_count"],
                    "topics": r.get("topics", []),
                    "language": r.get("language"),
                    "created_at": r["created_at"][:10],
                    "updated_at": updated_at[:10],
                    "days_ago": days_ago,
                }
            )

        print(f"   Page {page}: {len(data)} repos")
        page += 1
        if page > 10:
            break

    print(f"✅ Total starred repos: {len(repos)}")
    return repos


def fetch_trending_repos():
    """Fetch trending AI/ML repos using GitHub search API."""
    print(f"\n🔥 Fetching trending AI/ML repos...")
    repos = []
    page = 1

    search_queries = [
        "topic:ai",
        "topic:machine-learning",
        "topic:llm",
        "topic:agent",
    ]

    for query in search_queries:
        url = "https://api.github.com/search/repositories"
        params = {
            "q": query,
            "sort": "stars",
            "order": "desc",
            "per_page": 30,
            "page": page,
        }

        resp = requests.get(url, headers=HEADERS, params=params, timeout=30)

        if resp.status_code != 200:
            print(f"   ⚠️ Failed to fetch {query}: {resp.status_code}")
            continue

        data = resp.json()
        items = data.get("items", [])

        for r in items:
            if r["stargazers_count"] < 1000:
                continue

            if any(r["full_name"] == repo["name"] for repo in repos):
                continue

            updated_at = r["updated_at"]
            updated = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
            days_ago = (NOW - updated).days

            repos.append(
                {
                    "id": r["id"],
                    "name": r["full_name"],
                    "owner": r["owner"]["login"],
                    "owner_avatar": r["owner"]["avatar_url"],
                    "url": r["html_url"],
                    "description": r["description"] or "",
                    "stars": r["stargazers_count"],
                    "forks": r["forks_count"],
                    "issues": r["open_issues_count"],
                    "topics": r.get("topics", []),
                    "language": r.get("language"),
                    "created_at": r["created_at"][:10],
                    "updated_at": updated_at[:10],
                    "days_ago": days_ago,
                    "query": query,
                }
            )

        print(f"   {query}: {len(items)} repos")

    repos.sort(key=lambda x: -x["stars"])
    print(f"✅ Total trending repos (1k+ stars): {len(repos)}")
    return repos[:100]


def fetch_languages(repo_fullname):
    """Fetch programming languages for a repo."""
    url = f"https://api.github.com/repos/{repo_fullname}/languages"
    resp = requests.get(url, headers=HEADERS, timeout=30)

    if resp.status_code != 200:
        return {}

    data = resp.json()
    total = sum(data.values()) if data else 1

    langs = {}
    for lang, bytes_ in data.items():
        pct = bytes_ * 100 / total
        langs[lang] = round(pct, 1)

    return langs


def categorize_repo(repo):
    """Categorize a repo based on topics and description."""
    text = f"{repo['name']} {repo.get('description', '')}".lower()
    topics = [t.lower() for t in repo.get("topics", [])]

    keywords = {
        "🤖 AI / LLM": [
            "llm",
            "ai",
            "agent",
            "gpt",
            "transformer",
            "langchain",
            "rag",
            "ollama",
            "claude",
            "openai",
            "deepseek",
            "gemma",
            "qwen",
            "mistral",
            "chatbot",
        ],
        "👁️ Vision / OCR": [
            "vision",
            "ocr",
            "image",
            "video",
            "yolo",
            "cv",
            "stable-diffusion",
            "diffusion",
            "image-generation",
        ],
        "⚙️ Automation": [
            "automation",
            "workflow",
            "agent",
            "browser",
            "scraper",
            "crawler",
            "playwright",
            "puppeteer",
            "robot",
        ],
        "📊 Data / ML": [
            "data",
            "ml",
            "machine-learning",
            "pytorch",
            "tensorflow",
            "dataset",
            "training",
            "inference",
            "deep-learning",
        ],
        "🔧 Dev Tools": [
            "cli",
            "tool",
            "editor",
            "ide",
            "debug",
            "testing",
            "monitoring",
            "observability",
            "devops",
        ],
        "🌐 Web / Cloud": [
            "web",
            "cloud",
            "kubernetes",
            "docker",
            "serverless",
            "api",
            "backend",
            "frontend",
        ],
        "🔐 Security": ["security", "auth", "encryption", "privacy", "cryptography"],
    }

    for category, keys in keywords.items():
        if any(k in text or k in topics for k in keys):
            return category

    return "📦 Other"


def get_trending_info(repo):
    """Determine trending and activity status."""
    flags = []
    if repo["days_ago"] <= 7 and repo["stars"] >= TRENDING_STAR_THRESHOLD:
        flags.append("trending")
    if repo["days_ago"] > 365:
        flags.append("inactive")
    return flags


def enrich_repos(repos, source):
    """Add languages, categories, and flags to repos."""
    print(f"\n🔍 Enriching {source} repos with languages and categories...")

    for i, repo in enumerate(repos):
        print(f"   [{i + 1}/{len(repos)}] {repo['name']}")

        try:
            repo["languages"] = fetch_languages(repo["name"])
        except Exception as e:
            print(f"      ⚠️ Failed to fetch languages: {e}")
            repo["languages"] = {}

        repo["category"] = categorize_repo(repo)
        repo["flags"] = get_trending_info(repo)

    return repos


def save_data(starred_repos, trending_repos):
    """Save repos to JSON files."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)

    history_dir = data_dir / "history"
    history_dir.mkdir(exist_ok=True)

    data = {
        "updated_at": today,
        "starred_count": len(starred_repos),
        "trending_count": len(trending_repos),
        "starred_repos": starred_repos,
        "trending_repos": trending_repos,
    }

    with open(data_dir / "repos.json", "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    history_file = history_dir / f"{today}.json"
    if not history_file.exists():
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f"\n🗂 Saved snapshot: {history_file}")

    print(f"\n✅ Data saved to data/repos.json")
    print(f"   Starred repos: {len(starred_repos)}")
    print(f"   Trending repos: {len(trending_repos)}")


def generate_summary_stats(starred_repos, trending_repos):
    """Generate summary statistics."""
    all_repos = starred_repos + trending_repos

    stats = {
        "total_starred": len(starred_repos),
        "total_trending": len(trending_repos),
        "total_stars": sum(r["stars"] for r in all_repos),
        "by_category": defaultdict(int),
        "by_language": defaultdict(int),
        "trending_repos": [],
        "top_starred": [],
    }

    for repo in trending_repos:
        stats["by_category"][repo["category"]] += 1
        if "trending" in repo["flags"]:
            stats["trending_repos"].append(repo)

    for repo in starred_repos:
        stats["by_category"][repo["category"]] += 1
        if repo.get("language"):
            stats["by_language"][repo["language"]] += 1

    stats["top_starred"] = sorted(starred_repos, key=lambda x: -x["stars"])[:10]
    stats["by_category"] = dict(stats["by_category"])
    stats["by_language"] = dict(
        sorted(stats["by_language"].items(), key=lambda x: -x[1])[:20]
    )

    return stats


def main():
    print("=" * 60)
    print("📦 GitHub Repos Data Generator")
    print("=" * 60)

    starred_repos = []
    trending_repos = []

    if TOKEN:
        starred_repos = fetch_starred_repos()
        starred_repos = enrich_repos(starred_repos, "starred")

    trending_repos = fetch_trending_repos()
    trending_repos = enrich_repos(trending_repos, "trending")

    save_data(starred_repos, trending_repos)

    stats = generate_summary_stats(starred_repos, trending_repos)
    with open("data/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

    print(f"\n📊 Summary:")
    print(f"   Starred repos: {stats['total_starred']}")
    print(f"   Trending repos: {stats['total_trending']}")
    print(f"   Categories: {len(stats['by_category'])}")

    print("\n✅ Done!")


if __name__ == "__main__":
    main()
