"""Unified idea export — merges all sources into JSON for the website"""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from . import db
from .enrichment import enrich_all
from .sources import (
    hn,
    producthunt,
    reddit,
    indiehackers,
    appstore,
    github_trending,
    v2ex,
    thirtysixkr,
    youtube,
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
    "youtube": youtube,
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
    # NOTE: do not close the DB yet — we persist composite scores back after enrichment.

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

    # Enrich all ideas
    print(f"\n{'='*50}")
    print("Enriching ideas (revenue, business model, AI potential, trends, composite)...")
    ideas_list = enrich_all(ideas_list)
    enriched = sum(1 for i in ideas_list if i.get("business_model") or i.get("ai_potential"))
    trended = sum(1 for i in ideas_list if i.get("trend_direction") and i.get("trend_direction") != "stable")
    revenue_count = sum(1 for i in ideas_list if i.get("revenue_signal"))
    print(f"  Enriched: {enriched} with BM/AI | {trended} with trend signals | {revenue_count} with revenue")
    print(f"  Trends API calls: {len(ideas_list)} ideas scanned")

    # Persist composite + refreshed enrichment back to the DB so later runs read
    # them from get_all_ideas() rather than recomputing from a cold state.
    try:
        database.write_composite_scores(ideas_list)
    except Exception as e:
        print(f"  [WARN] could not persist composite scores to DB: {e}")

    # Carry forward Reddit ideas when this run couldn't collect any (e.g. GitHub
    # Actions' datacenter IP is blocked from Reddit's public RSS). This keeps the
    # Reddit tab alive between local refreshes instead of wiping it every daily run.
    if not any(i.get("source") == "reddit" for i in ideas_list):
        try:
            previous = json.loads(Path(output_path).read_text())
            prev_reddit = [i for i in previous.get("ideas", []) if i.get("source") == "reddit"]
            if prev_reddit:
                ideas_list.extend(prev_reddit)
                stats["sources"]["reddit"] = len(prev_reddit)
                print(f"  Carried forward {len(prev_reddit)} Reddit ideas from previous export")
        except (FileNotFoundError, json.JSONDecodeError):
            pass

    output = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "stats": stats,
        "ideas": ideas_list,
    }

    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, indent=2, ensure_ascii=False))

    # Now safe to close — composite scores have been persisted and JSON written.
    try:
        database.close()
    except Exception:
        pass

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
