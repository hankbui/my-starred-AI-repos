#!/usr/bin/env python3
"""
Generate repository data from the GitHub API for the website.
"""

import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
WEBSITE_DATA_DIR = REPO_ROOT / "website" / "data"
STAR_HISTORY_FILE = DATA_DIR / "star_history.json"
ENV_FILE = REPO_ROOT / ".env"

load_dotenv(ENV_FILE)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "hankbui")
GITHUB_API_URL = "https://api.github.com"
MAX_PAGES = 10
PER_PAGE = 100
MAX_HISTORY_DAYS = 30

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
        "topics": (repo.get("topics") or [])[:3],
        "created_at": repo["created_at"][:10],
        "updated_at": repo["updated_at"][:10],
        "category": category_for_repo(repo),
    }


def load_star_history():
    """Load compact per-day star history for tracked repositories."""
    if not STAR_HISTORY_FILE.exists():
        return {}

    try:
        data = json.loads(STAR_HISTORY_FILE.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}

    if not isinstance(data, dict):
        return {}

    return data


def save_star_history(history):
    """Persist compact star history to disk."""
    pruned_dates = sorted(history.keys())[-MAX_HISTORY_DAYS:]
    pruned_history = {date_key: history[date_key] for date_key in pruned_dates}

    STAR_HISTORY_FILE.write_text(
        json.dumps(pruned_history, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    return pruned_history


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

        updated_days_ago = (today - datetime.fromisoformat(repo["updated_at"]).date()).days

        if updated_days_ago <= 3:
            activity = "Hot"
        elif updated_days_ago <= 14:
            activity = "Active"
        elif updated_days_ago <= 45:
            activity = "Steady"
        else:
            activity = "Quiet"

        repo["star_delta_1d"] = growth_1d
        repo["star_delta_1d_pct"] = growth_1d_pct
        repo["star_delta_7d"] = growth_7d
        repo["star_delta_7d_pct"] = growth_7d_pct
        repo["activity"] = activity
        repo["history_1d_date"] = snapshot_1d_date
        repo["history_7d_date"] = snapshot_7d_date

    return repos


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


def save_data(starred_repos):
    """Save repos to JSON files for both data and website/data."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    WEBSITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    today = datetime.now(timezone.utc).date()
    today_key = today.isoformat()
    history = load_star_history()

    starred_repos = attach_growth_metrics(starred_repos, history, today)
    history[today_key] = {repo["name"]: repo["stars"] for repo in starred_repos}
    history = save_star_history(history)

    payload = {
        "updated_at": today_key,
        "history_start_at": min(history.keys()) if history else today_key,
        "history_points": len(history),
        "starred_repos": starred_repos,
        "trending_repos": [],
    }

    for output_path in [DATA_DIR / "repos.json", WEBSITE_DATA_DIR / "repos.json"]:
        with output_path.open("w", encoding="utf-8") as file_handle:
            json.dump(payload, file_handle, indent=2, ensure_ascii=False)
            file_handle.write("\n")

    print("Data saved to data/repos.json and website/data/repos.json")
    print(f"Starred repos: {len(starred_repos)}")


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
