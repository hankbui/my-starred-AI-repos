#!/usr/bin/env python3
"""
Fetch starred repos from GitHub and generate data files.
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

    print(f"✅ Total repos fetched: {len(repos)}")
    return repos


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
    text = f"{repo['name']} {repo['description']}".lower()
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
        ],
        "👁️ Vision / OCR": [
            "vision",
            "ocr",
            "image",
            "video",
            "yolo",
            "cv",
            "stable-diffusion",
            "生成",
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
        ],
        "🌐 Web / Cloud": [
            "web",
            "cloud",
            "kubernetes",
            "docker",
            "serverless",
            "api",
            "backend",
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


def enrich_repos(repos):
    """Add languages, categories, and flags to repos."""
    print("\n🔍 Enriching repos with languages and categories...")

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


def save_data(repos):
    """Save repos to JSON files."""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    data_dir = Path("data")
    data_dir.mkdir(exist_ok=True)

    history_dir = data_dir / "history"
    history_dir.mkdir(exist_ok=True)

    with open(data_dir / "repos.json", "w", encoding="utf-8") as f:
        json.dump(
            {"updated_at": today, "total_count": len(repos), "repos": repos},
            f,
            indent=2,
            ensure_ascii=False,
        )

    history_file = history_dir / f"{today}.json"
    if not history_file.exists():
        with open(history_file, "w", encoding="utf-8") as f:
            json.dump(
                {"updated_at": today, "total_count": len(repos), "repos": repos},
                f,
                indent=2,
                ensure_ascii=False,
            )
        print(f"\n🗂 Saved snapshot: {history_file}")

    print(f"\n✅ Data saved to data/repos.json ({len(repos)} repos)")


def generate_summary_stats(repos):
    """Generate summary statistics."""
    stats = {
        "total": len(repos),
        "by_category": defaultdict(int),
        "by_language": defaultdict(int),
        "trending": [],
        "recently_updated": [],
    }

    total_stars = 0

    for repo in repos:
        stats["by_category"][repo["category"]] += 1
        total_stars += repo["stars"]

        if repo.get("language"):
            stats["by_language"][repo["language"]] += 1

        if "trending" in repo["flags"]:
            stats["trending"].append(repo)

        if repo["days_ago"] <= 30:
            stats["recently_updated"].append(repo)

    stats["total_stars"] = total_stars
    stats["by_category"] = dict(stats["by_category"])
    stats["by_language"] = dict(
        sorted(stats["by_language"].items(), key=lambda x: -x[1])[:20]
    )

    return stats


def main():
    print(f"=" * 60)
    print(f"📦 GitHub Starred Repos Data Generator")
    print(f"=" * 60)

    repos = fetch_starred_repos()
    repos = enrich_repos(repos)
    save_data(repos)

    stats = generate_summary_stats(repos)
    with open("data/stats.json", "w", encoding="utf-8") as f:
        json.dump(stats, f, indent=2, ensure_ascii=False)

    print(f"\n📊 Summary:")
    print(f"   Total repos: {stats['total']}")
    print(f"   Total stars: {stats['total_stars']:,}")
    print(f"   Trending: {len(stats['trending'])}")
    print(f"   Categories: {len(stats['by_category'])}")

    print("\n✅ Done!")


if __name__ == "__main__":
    main()
