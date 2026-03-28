#!/usr/bin/env python3
"""
Generate repository data from the GitHub API for the website.
"""

import base64
import json
import math
import os
import re
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
WEBSITE_DATA_DIR = REPO_ROOT / "website" / "data"
STAR_HISTORY_FILE = DATA_DIR / "star_history.json"
README_CACHE_FILE = DATA_DIR / "readme_cache.json"
ENV_FILE = REPO_ROOT / ".env"

load_dotenv(ENV_FILE)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "hankbui")
GITHUB_API_URL = "https://api.github.com"
MAX_PAGES = 10
PER_PAGE = 100
MAX_HISTORY_DAYS = 30
TRENDING_LIMIT = 250
README_TOP_TRENDING_COUNT = 36
README_TOP_STARRED_COUNT = 24
README_TOP_RECENT_COUNT = 12
README_CACHE_MAX_ENTRIES = 180
README_CACHE_TTL_DAYS = 14
README_EXCERPT_LIMIT = 1600

if not GITHUB_TOKEN:
    raise SystemExit("ERROR: GITHUB_TOKEN not found in .env file")

HEADERS = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "User-Agent": "my-starred-ai-repos",
    "X-GitHub-Api-Version": "2022-11-28",
}

CATEGORY_RULES = [
    (
        "Vision & Media",
        [
            "vision",
            "image",
            "video",
            "audio",
            "voice",
            "speech",
            "ocr",
            "transcription",
            "tts",
            "whisper",
            "diffusion",
        ],
    ),
    (
        "Data & Evaluation",
        [
            "dataset",
            "benchmark",
            "eval",
            "evaluation",
            "synthetic data",
            "label",
            "annotation",
            "leaderboard",
            "scoring",
        ],
    ),
    (
        "Infrastructure",
        [
            "deployment",
            "infra",
            "infrastructure",
            "runtime",
            "serving",
            "server",
            "docker",
            "kubernetes",
            "serverless",
            "cloud",
            "gpu",
        ],
    ),
    (
        "Developer Tools",
        [
            "cli",
            "sdk",
            "editor",
            "extension",
            "plugin",
            "debug",
            "testing",
            "monitoring",
            "observability",
            "terminal",
        ],
    ),
    (
        "Agents & Automation",
        [
            "agent",
            "multi-agent",
            "workflow",
            "automation",
            "browser",
            "scraper",
            "crawler",
            "orchestr",
            "task runner",
        ],
    ),
    (
        "AI Engineering",
        [
            "llm",
            "rag",
            "embedding",
            "prompt",
            "vector",
            "semantic search",
            "langchain",
            "llamaindex",
            "guardrail",
            "tool calling",
        ],
    ),
    (
        "Models & Inference",
        [
            "model",
            "transformer",
            "checkpoint",
            "fine-tun",
            "inference",
            "quantiz",
            "llama",
            "mistral",
            "qwen",
            "gemma",
            "deepseek",
        ],
    ),
    (
        "Applications",
        [
            "assistant",
            "copilot",
            "chatbot",
            "chat",
            "app",
            "studio",
            "workspace",
            "ui",
            "productivity",
        ],
    ),
    (
        "Research & Knowledge",
        [
            "research",
            "paper",
            "arxiv",
            "knowledge",
            "docs",
            "documentation",
            "tutorial",
            "course",
            "awesome",
        ],
    ),
]


def category_for_repo(repo):
    """Assign a display category using repo metadata."""
    search_text = " ".join(
        value
        for value in [
            repo.get("full_name", ""),
            repo.get("description") or "",
            repo.get("language") or "",
            " ".join(repo.get("topics") or []),
        ]
        if value
    ).lower()

    for category, keywords in CATEGORY_RULES:
        if any(keyword in search_text for keyword in keywords):
            return category

    return "Other"


def normalize_repo(repo):
    """Normalize GitHub API payload to the website schema."""
    full_name = repo["full_name"]
    owner, _, repo_name = full_name.partition("/")
    license_data = repo.get("license") or {}

    return {
        "id": repo["id"],
        "name": full_name,
        "owner": owner,
        "repo_name": repo_name or full_name,
        "url": repo["html_url"],
        "description": repo["description"] or "",
        "stars": repo["stargazers_count"],
        "forks": repo["forks_count"],
        "language": repo.get("language") or "",
        "topics": (repo.get("topics") or [])[:5],
        "homepage": repo.get("homepage") or "",
        "license": license_data.get("spdx_id") or license_data.get("name") or "",
        "default_branch": repo.get("default_branch") or "main",
        "open_issues": repo.get("open_issues_count") or 0,
        "archived": bool(repo.get("archived")),
        "is_fork": bool(repo.get("fork")),
        "created_at": repo["created_at"][:10],
        "updated_at": repo["updated_at"][:10],
        "pushed_at": (repo.get("pushed_at") or repo["updated_at"])[:10],
        "category": category_for_repo(repo),
        "trend_score": 0,
        "trend_source": "bootstrap",
        "trend_rank": None,
        "readme_excerpt": "",
        "readme_path": "",
        "readme_status": "unavailable",
    }


def load_json_dict(path):
    """Read a JSON dictionary from disk."""
    if not path.exists():
        return {}

    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}

    return data if isinstance(data, dict) else {}


def load_star_history():
    """Load compact per-day star history for tracked repositories."""
    return load_json_dict(STAR_HISTORY_FILE)


def save_star_history(history):
    """Persist compact star history to disk."""
    pruned_dates = sorted(history.keys())[-MAX_HISTORY_DAYS:]
    pruned_history = {date_key: history[date_key] for date_key in pruned_dates}

    STAR_HISTORY_FILE.write_text(
        json.dumps(pruned_history, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    return pruned_history


def load_readme_cache():
    """Load cached README previews from disk."""
    return load_json_dict(README_CACHE_FILE)


def save_readme_cache(cache):
    """Persist a bounded README cache."""
    sorted_entries = sorted(
        cache.items(),
        key=lambda item: (
            item[1].get("touched_at", ""),
            item[1].get("fetched_at", ""),
        ),
        reverse=True,
    )
    pruned_cache = dict(sorted_entries[:README_CACHE_MAX_ENTRIES])

    README_CACHE_FILE.write_text(
        json.dumps(pruned_cache, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    return pruned_cache


def get_snapshot_for_date(history, target_date):
    """Return the nearest snapshot on or before the requested date."""
    candidates = [date_key for date_key in history.keys() if date_key <= target_date]
    if not candidates:
        return None, None

    snapshot_date = max(candidates)
    return history[snapshot_date], snapshot_date


def compute_growth_value(current_stars, snapshot, repo_name):
    """Compute star delta and percentage from a historical snapshot."""
    if not snapshot or repo_name not in snapshot:
        return None, None

    previous_stars = snapshot[repo_name]
    delta = current_stars - previous_stars
    pct = None if previous_stars <= 0 else round((delta / previous_stars) * 100, 2)
    return delta, pct


def determine_activity_label(days_since_push):
    """Group repositories by recent code activity."""
    if days_since_push <= 3:
        return "Hot"
    if days_since_push <= 14:
        return "Active"
    if days_since_push <= 45:
        return "Steady"
    return "Quiet"


def attach_growth_metrics(repos, history, today):
    """Attach daily and weekly star growth from stored snapshots."""
    snapshot_1d, snapshot_1d_date = get_snapshot_for_date(
        history,
        (today - timedelta(days=1)).isoformat(),
    )
    snapshot_7d, snapshot_7d_date = get_snapshot_for_date(
        history,
        (today - timedelta(days=7)).isoformat(),
    )

    for repo in repos:
        growth_1d, growth_1d_pct = compute_growth_value(
            repo["stars"],
            snapshot_1d,
            repo["name"],
        )
        growth_7d, growth_7d_pct = compute_growth_value(
            repo["stars"],
            snapshot_7d,
            repo["name"],
        )

        pushed_days_ago = (today - datetime.fromisoformat(repo["pushed_at"]).date()).days

        repo["star_delta_1d"] = growth_1d
        repo["star_delta_1d_pct"] = growth_1d_pct
        repo["star_delta_7d"] = growth_7d
        repo["star_delta_7d_pct"] = growth_7d_pct
        repo["activity"] = determine_activity_label(pushed_days_ago)
        repo["history_1d_date"] = snapshot_1d_date
        repo["history_7d_date"] = snapshot_7d_date

    return repos


def calculate_trend_score(repo, today):
    """Compute a weighted trend score using growth and repo freshness."""
    pushed_days_ago = (today - datetime.fromisoformat(repo["pushed_at"]).date()).days
    recency_ratio = max(0, 30 - min(pushed_days_ago, 30)) / 30
    stars_score = math.log1p(repo["stars"]) * 4.0
    forks_score = math.log1p(repo["forks"]) * 1.8
    activity_bonus = {
        "Hot": 12.0,
        "Active": 8.0,
        "Steady": 4.0,
        "Quiet": 0.0,
    }.get(repo["activity"], 0.0)

    has_history = (
        repo["star_delta_1d"] is not None
        or repo["star_delta_7d"] is not None
    )

    if has_history:
        history_score = max(repo["star_delta_1d"] or 0, 0) * 2.0
        history_score += max(repo["star_delta_7d"] or 0, 0) * 1.5
        history_score += max(repo["star_delta_1d_pct"] or 0, 0) * 6.5
        history_score += max(repo["star_delta_7d_pct"] or 0, 0) * 8.5
        score = history_score + (recency_ratio * 18.0) + stars_score + activity_bonus
        source = "history"
    else:
        score = (recency_ratio * 28.0) + stars_score + forks_score + activity_bonus
        source = "bootstrap"

    if repo["archived"]:
        score -= 60.0
    if repo["is_fork"]:
        score -= 12.0

    return round(score, 2), source


def attach_trend_metrics(repos, today):
    """Attach trend score and source to each repository."""
    for repo in repos:
        score, source = calculate_trend_score(repo, today)
        repo["trend_score"] = score
        repo["trend_source"] = source

    sorted_repos = sorted(
        repos,
        key=lambda repo: (
            repo["trend_score"],
            repo.get("star_delta_7d") or -1,
            repo.get("star_delta_1d") or -1,
            repo["stars"],
        ),
        reverse=True,
    )

    for index, repo in enumerate(sorted_repos, start=1):
        repo["trend_rank"] = index

    return repos


def build_trending_repos(repos):
    """Return the strongest trending repositories for the dedicated tab."""
    trending = sorted(
        repos,
        key=lambda repo: (
            repo["trend_score"],
            repo.get("star_delta_7d") or -1,
            repo.get("star_delta_1d") or -1,
            repo["stars"],
        ),
        reverse=True,
    )[:TRENDING_LIMIT]

    return [dict(repo) for repo in trending]


def normalize_readme_text(text):
    """Turn a README into a readable preview for the static drawer."""
    text = text.replace("\r\n", "\n")
    text = re.sub(r"<!--.*?-->", "", text, flags=re.DOTALL)
    text = re.sub(r"\[!\[[^\]]*\]\([^)]+\)\]\([^)]+\)", "", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]+\)", "", text)
    text = re.sub(r"<img[^>]*>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"```.*?```", "\n[code sample omitted]\n", text, flags=re.DOTALL)

    cleaned_lines = []
    for raw_line in text.splitlines():
        line = re.sub(r"^#{1,6}\s*", "", raw_line).strip()
        line = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", line)
        line = re.sub(r"`([^`]+)`", r"\1", line)
        line = re.sub(r"\s+", " ", line).strip()
        if not line:
            continue
        cleaned_lines.append(line)

    excerpt_parts = []
    current_length = 0
    for line in cleaned_lines:
        extra_length = len(line) + (2 if excerpt_parts else 0)
        if current_length + extra_length > README_EXCERPT_LIMIT:
            break
        excerpt_parts.append(line)
        current_length += extra_length

    return "\n\n".join(excerpt_parts).strip()


def readme_cache_is_fresh(entry, today):
    """Return true when the cached README is still fresh enough."""
    fetched_at = entry.get("fetched_at")
    if not fetched_at:
        return False

    try:
        fetched_date = datetime.fromisoformat(fetched_at).date()
    except ValueError:
        return False

    return (today - fetched_date).days <= README_CACHE_TTL_DAYS


def fetch_readme_preview(full_name):
    """Fetch and condense README content for a repository."""
    response = requests.get(
        f"{GITHUB_API_URL}/repos/{full_name}/readme",
        headers=HEADERS,
        timeout=30,
    )

    if response.status_code == 404:
        return {
            "excerpt": "",
            "status": "missing",
            "path": "",
        }

    if response.status_code != 200:
        print(f"README fetch failed for {full_name}: {response.status_code}")
        return {
            "excerpt": "",
            "status": f"error_{response.status_code}",
            "path": "",
        }

    payload = response.json()
    content = payload.get("content") or ""
    raw_text = ""

    if payload.get("encoding") == "base64" and content:
        raw_text = base64.b64decode(content).decode("utf-8", errors="ignore")

    excerpt = normalize_readme_text(raw_text)
    status = "ready" if excerpt else "empty"

    return {
        "excerpt": excerpt,
        "status": status,
        "path": payload.get("path") or "",
    }


def select_readme_targets(starred_repos, trending_repos):
    """Choose a bounded set of repositories whose README should be cached."""
    recent_repos = sorted(
        starred_repos,
        key=lambda repo: repo["pushed_at"],
        reverse=True,
    )

    ordered_names = []
    ordered_names.extend(repo["name"] for repo in trending_repos[:README_TOP_TRENDING_COUNT])
    ordered_names.extend(
        repo["name"]
        for repo in sorted(starred_repos, key=lambda repo: repo["stars"], reverse=True)[:README_TOP_STARRED_COUNT]
    )
    ordered_names.extend(repo["name"] for repo in recent_repos[:README_TOP_RECENT_COUNT])

    unique_names = []
    seen = set()
    for repo_name in ordered_names:
        if repo_name in seen:
            continue
        seen.add(repo_name)
        unique_names.append(repo_name)

    return unique_names


def attach_readme_previews(starred_repos, trending_repos, today):
    """Attach cached README previews to a selected set of repositories."""
    cache = load_readme_cache()
    repo_index = {repo["name"]: repo for repo in starred_repos}
    today_key = today.isoformat()

    for repo_name in select_readme_targets(starred_repos, trending_repos):
        entry = cache.get(repo_name, {})

        if not readme_cache_is_fresh(entry, today):
            entry = fetch_readme_preview(repo_name)
            entry["fetched_at"] = today_key

        entry["touched_at"] = today_key
        cache[repo_name] = entry

        repo = repo_index.get(repo_name)
        if not repo:
            continue

        repo["readme_excerpt"] = entry.get("excerpt", "")
        repo["readme_path"] = entry.get("path", "")
        repo["readme_status"] = entry.get("status", "unavailable")

    for repo in starred_repos:
        repo.setdefault("readme_excerpt", "")
        repo.setdefault("readme_path", "")
        repo.setdefault("readme_status", "unavailable")

    save_readme_cache(cache)
    return starred_repos


def detect_trending_mode(repos):
    """Summarize whether trending is fully history-backed yet."""
    has_1d = any(repo.get("star_delta_1d") is not None for repo in repos)
    has_7d = any(repo.get("star_delta_7d") is not None for repo in repos)

    if has_7d:
        return "history_7d"
    if has_1d:
        return "history_1d"
    return "bootstrap"


def fetch_starred_repos():
    """Fetch all starred repos for the user."""
    print(f"Fetching starred repos for {GITHUB_USERNAME}...")
    repos = []
    page = 1

    while page <= MAX_PAGES:
        response = requests.get(
            f"{GITHUB_API_URL}/users/{GITHUB_USERNAME}/starred",
            headers=HEADERS,
            params={"per_page": PER_PAGE, "page": page, "sort": "updated"},
            timeout=30,
        )

        if response.status_code != 200:
            detail = response.text.strip()
            print(f"Failed to fetch page {page}: {response.status_code} {detail}")
            break

        data = response.json()
        if not data:
            break

        repos.extend(normalize_repo(repo) for repo in data)
        print(f"Page {page}: {len(data)} repos")

        if len(data) < PER_PAGE:
            break

        page += 1

    print(f"Total starred repos: {len(repos)}")
    return repos


def build_payload(starred_repos, history, today):
    """Build the full payload used by the website."""
    starred_repos = attach_growth_metrics(starred_repos, history, today)
    starred_repos = attach_trend_metrics(starred_repos, today)
    trending_repos = build_trending_repos(starred_repos)
    starred_repos = attach_readme_previews(starred_repos, trending_repos, today)
    trending_repos = build_trending_repos(starred_repos)
    trending_mode = detect_trending_mode(starred_repos)

    return {
        "updated_at": today.isoformat(),
        "history_start_at": min(history.keys()) if history else today.isoformat(),
        "history_points": len(history),
        "trending_mode": trending_mode,
        "trending_count": len(trending_repos),
        "starred_repos": starred_repos,
        "trending_repos": trending_repos,
    }


def save_data(starred_repos):
    """Save repos to JSON files for both data and website/data."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    WEBSITE_DATA_DIR.mkdir(parents=True, exist_ok=True)

    today = datetime.now(timezone.utc).date()
    today_key = today.isoformat()
    history = load_star_history()

    history[today_key] = {repo["name"]: repo["stars"] for repo in starred_repos}
    history = save_star_history(history)
    payload = build_payload(starred_repos, history, today)

    for output_path in [DATA_DIR / "repos.json", WEBSITE_DATA_DIR / "repos.json"]:
        with output_path.open("w", encoding="utf-8") as file_handle:
            json.dump(payload, file_handle, indent=2, ensure_ascii=False)
            file_handle.write("\n")

    print("Data saved to data/repos.json and website/data/repos.json")
    print(f"Starred repos: {len(payload['starred_repos'])}")
    print(f"Trending repos: {len(payload['trending_repos'])}")


def main():
    """Run the data generation workflow."""
    print("=" * 60)
    print("GitHub Repos Data Generator")
    print("=" * 60)

    starred_repos = fetch_starred_repos()
    save_data(starred_repos)

    print("\nDone!")


if __name__ == "__main__":
    main()
