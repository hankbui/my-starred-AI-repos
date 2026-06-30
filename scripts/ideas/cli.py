"""Unified idea export — merges all sources into JSON for the website"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from . import db
from .sources import (
    hn,
    producthunt,
    reddit,
    indiehackers,
    appstore,
    github_trending,
    v2ex,
    thirtysixkr,
)


SOURCE_MODULES = {
    "hackernews": hn,
    "producthunt": producthunt,
    "reddit": reddit,
    "indiehackers": indiehackers,
    "appstore": appstore,
    "githubtrending": github_trending,
    "v2ex": v2ex,
    "thirtysixkr": thirtysixkr,
}


def run_all(db_path: str | Path, output_path: str | Path) -> dict:
    """
    Pull from all configured sources, store in SQLite, export to JSON.
    Returns summary stats.
    """
    database = db.IdeasDB(db_path)
    stats = {"sources": {}, "total": 0, "errors": []}

    for source_name, module in SOURCE_MODULES.items():
        source_key = source_name.upper()
        print(f"\n[{source_key}] Pulling data...")
        try:
            ideas = module.run()
            if not ideas:
                print(f"  No data returned from {source_name}")
                stats["sources"][source_name] = 0
                continue

            inserted = 0
            for idea in ideas:
                try:
                    database.upsert(idea)
                    inserted += 1
                except Exception as e:
                    stats["errors"].append(f"{source_name}/{idea.get('id', '?')}: {e}")

            stats["sources"][source_name] = inserted
            stats["total"] += inserted
            print(f"  Inserted/updated: {inserted} ideas")

        except Exception as e:
            stats["errors"].append(f"{source_name}: {e}")
            print(f"  [ERROR] {e}")

    # Export to JSON
    all_ideas = database.get_all_ideas()
    database.close()

    # Convert Row objects
    ideas_list = []
    for row in all_ideas:
        idea = dict(row)
        # Parse tags back from JSON string
        if isinstance(idea.get("tags"), str):
            try:
                idea["tags"] = json.loads(idea["tags"])
            except (json.JSONDecodeError, TypeError):
                idea["tags"] = []
        if not idea.get("tags"):
            idea["tags"] = []
        ideas_list.append(idea)

    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
        "ideas": ideas_list,
    }

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False))

    print(f"\n{'='*50}")
    print(f"Total ideas collected: {stats['total']}")
    for s, c in stats["sources"].items():
        print(f"  {s}: {c}")
    print(f"Exported to: {output_path}")
    if stats["errors"]:
        print(f"Errors: {len(stats['errors'])}")
        for err in stats["errors"][:5]:
            print(f"  {err}")

    return stats
