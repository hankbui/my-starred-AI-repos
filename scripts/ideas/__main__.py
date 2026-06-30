from __future__ import annotations

"""CLI entry point — python -m scripts.ideas"""

import os
import sys
from pathlib import Path

from dotenv import load_dotenv

from .cli import run_all

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_FILE = REPO_ROOT / ".env"
load_dotenv(ENV_FILE)


def main():
    db_path = REPO_ROOT / "data" / "ideas.db"
    output_path = REPO_ROOT / "website" / "data" / "ideas.json"

    print(f"Repo root: {REPO_ROOT}")
    print(f"DB: {db_path}")
    print(f"Output: {output_path}")

    stats = run_all(db_path, output_path)

    if stats["total"] == 0:
        print("\n⚠ No ideas collected. Check .env configuration for sources that need API keys.")
        sys.exit(1)


if __name__ == "__main__":
    main()
