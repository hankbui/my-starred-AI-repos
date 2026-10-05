"""Compute approximate global GitHub rank for every repo using a known star distribution.

Uses published GitHub star distribution anchor points to estimate global rank
without needing an API token.  Ranks are approximate but meaningful for the
Global Rank tab.
"""

from __future__ import annotations

import json
import math
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_FILES = [ROOT / "data" / "repos.json", ROOT / "website" / "data" / "repos.json"]

# Known anchor points: (stars, estimated_rank_on_github)
# Based on public GitHub star distribution studies
ANCHORS = [
    (1, 5000000),
    (10, 2000000),
    (50, 800000),
    (100, 500000),
    (500, 150000),
    (1000, 60000),
    (2000, 45000),
    (5000, 18000),
    (10000, 5500),
    (20000, 2000),
    (50000, 400),
    (100000, 150),
    (200000, 25),
    (500000, 5),
    (1000000, 2),
    (5000000, 1),
]

# Build log-log interpolation tables
log_stars = [math.log(s) for s, _ in ANCHORS]
log_ranks = [math.log(r) for _, r in ANCHORS]


def estimate_rank(stars: int) -> int:
    if stars <= 0:
        stars = 1
    ls = math.log(stars)

    # Clamp to range
    if ls <= log_stars[0]:
        return ANCHORS[0][1]
    if ls >= log_stars[-1]:
        return ANCHORS[-1][1]

    # Linear interpolation in log-log space
    for i in range(len(log_stars) - 1):
        if log_stars[i] <= ls <= log_stars[i + 1]:
            frac = (ls - log_stars[i]) / (log_stars[i + 1] - log_stars[i])
            lr = log_ranks[i] + frac * (log_ranks[i + 1] - log_ranks[i])
            return round(math.exp(lr))

    return ANCHORS[-1][1]


def main():
    for fp in DATA_FILES:
        if not fp.exists():
            print(f"Skipping {fp} (not found)")
            continue

        data = json.loads(fp.read_text())
        starred = data.get("starred_repos") or data.get("repos", [])
        trending = data.get("trending_repos", [])

        all_repos = list(starred) + list(trending)
        if not all_repos:
            print(f"{fp.name}: no repos, skipping")
            continue

        # Compute rank for each repo
        for repo in all_repos:
            repo["global_rank"] = estimate_rank(repo["stars"])

        fp.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        top = max(all_repos, key=lambda r: r["stars"])
        bottom = min(all_repos, key=lambda r: r["stars"])
        print(f"{fp.name}: {len(all_repos)} repos, rank range #{bottom['global_rank']:,} – #{top['global_rank']:,}")

    print("\nDone. Run generate_ai_employees.py next to refresh AI employee data.")


if __name__ == "__main__":
    main()