#!/usr/bin/env python3
"""Run the idea scraper pipeline — pull all sources, export to JSON."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[1] / ".env")

from ideas.cli import run_all

REPO_ROOT = Path(__file__).resolve().parents[1]

if __name__ == "__main__":
    db_path = REPO_ROOT / "data" / "ideas.db"
    output_path = REPO_ROOT / "website" / "data" / "ideas.json"
    stats = run_all(db_path, output_path)
    if stats["total"] == 0:
        print("\n⚠ No ideas collected. Check .env for API keys.")
        sys.exit(1)
