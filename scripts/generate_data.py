#!/usr/bin/env python3
"""
Generate repository data from the GitHub API.
"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "data"
ENV_FILE = REPO_ROOT / ".env"

load_dotenv(ENV_FILE)

GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "hankbui")

if not GITHUB_TOKEN:
    raise SystemExit("ERROR: GITHUB_TOKEN not found in .env file")

HEADERS = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {GITHUB_TOKEN}",
}


def fetch_starred_repos():
    """Fetch all starred repos for the user."""
    print(f"Fetching starred repos for {GITHUB_USERNAME}...")
    repos = []
    page = 1

    while page <= 10:
        response = requests.get(
            f"https://api.github.com/users/{GITHUB_USERNAME}/starred",
            headers=HEADERS,
            params={"per_page": 100, "page": page, "sort": "updated"},
            timeout=30,
        )

        if response.status_code != 200:
            print(f"Failed to fetch page {page}: {response.status_code}")
            break

        data = response.json()
        if not data:
            break

        for repo in data:
            repos.append(
                {
                    "id": repo["id"],
                    "name": repo["full_name"],
                    "url": repo["html_url"],
                    "description": repo["description"] or "",
                    "stars": repo["stargazers_count"],
                    "forks": repo["forks_count"],
                    "language": repo.get("language"),
                    "updated_at": repo["updated_at"][:10],
                    "category": "📦 Other",
                }
            )

        print(f"Page {page}: {len(data)} repos")
        page += 1

    print(f"Total starred repos: {len(repos)}")
    return repos


def save_data(starred_repos):
    """Save repos to JSON file."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)

    payload = {
        "updated_at": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "starred_repos": starred_repos,
        "trending_repos": [],
    }

    with (DATA_DIR / "repos.json").open("w", encoding="utf-8") as file_handle:
        json.dump(payload, file_handle, indent=2, ensure_ascii=False)
        file_handle.write("\n")

    print("Data saved to data/repos.json")
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
