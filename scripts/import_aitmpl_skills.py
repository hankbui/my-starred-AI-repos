"""Import 925 skills from aitmpl.com catalog API into website/data/skills.json.

Reads the raw aitmpl catalog JSON (saved by webfetch), converts each skill to
the app's skills.json schema, merges with existing items (dedupe by _skill_id),
computes a value_score, and re-sorts everything with highest value first.

Usage:
  python scripts/import_aitmpl_skills.py <aitmpl_catalog_json_file>
"""

from __future__ import annotations

import json
import math
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS_JSON = ROOT / "website" / "data" / "skills.json"

USE_CASE_MAP = {
    "coding": ["code", "coding", "programming", "development", "debug", "test",
               "deploy", "github", "git", "cli", "sdk", "framework", "library",
               "api", "build", "refactor", "lint", "commit", "pull request"],
    "writing": ["writing", "content", "copy", "blog", "article", "text",
                "documentation", "docs", "essay", "story"],
    "research": ["research", "paper", "literature", "citation", "knowledge",
                 "analysis", "survey", "deep research", "benchmark", "evaluate"],
    "productivity": ["productivity", "task", "workflow", "automation", "organize",
                     "planning", "calendar", "project management", "memory"],
    "design": ["design", "ui", "ux", "visual", "layout", "prototype", "figma"],
    "data": ["data", "analytics", "dashboard", "metrics", "monitoring",
             "observability", "database", "etl", "pipeline", "sql"],
    "marketing": ["marketing", "social", "seo", "content", "campaign",
                  "publish", "growth", "conversion"],
    "sales": ["sales", "lead", "crm", "outreach", "revenue", "prospect"],
    "customer-support": ["support", "helpdesk", "ticket", "chat", "customer"],
    "education": ["education", "learning", "tutorial", "teaching", "course",
                  "training"],
    "finance": ["finance", "billing", "payment", "invoice", "subscription"],
    "legal": ["legal", "compliance", "gdpr", "policy", "contract", "privacy"],
    "healthcare": ["healthcare", "medical", "health", "patient"],
    "ai": ["ai", "llm", "agent", "automation", "mcp", "workflow", "orchestration",
           "multi-agent", "autonomous", "rag", "vector"],
}

SKILL_ID_RE = re.compile(r"^skills/([^/]+)/([^/]+)$")


def guess_use_cases(desc: str, category: str, keywords: list) -> list[str]:
    hay = f"{desc} {category} {' '.join(keywords)}".lower()
    found = []
    for uc, kws in USE_CASE_MAP.items():
        if any(kw in hay for kw in kws):
            found.append(uc)
    if not found:
        found = ["ai", "productivity"]
    return sorted(set(found))


def value_score(downloads: int) -> float:
    # downloads: log scale, cap ~10k downloads -> 100
    return round(min(100.0, (math.log10(downloads + 1) / math.log10(10_000 + 1)) * 100), 1)


def convert(skill: dict) -> dict:
    sid = skill.get("id", "")
    m = SKILL_ID_RE.match(sid)
    category = m.group(1) if m else "uncategorized"
    name = skill.get("name", sid)
    downloads = int(skill.get("downloads", 0) or 0)
    keywords = skill.get("keywords") or []
    topics = list(dict.fromkeys([category] + keywords + ["skill", "aitmpl"]))[:12]
    return {
        "name": name,
        "url": (skill.get("urls") or {}).get("page", ""),
        "description": (skill.get("description") or "")[:300],
        "stars": downloads,  # reuse downloads as popularity signal
        "forks": 0,
        "language": "",
        "category": category,
        "topics": topics,
        "delta_7d": 0,
        "trend_score": 0.0,
        "pushed_at": "",
        "is_agent": False,
        "is_skill": True,
        "use_cases": guess_use_cases(skill.get("description", ""), category, keywords),
        "topic_bonus": 0,
        "downloads": downloads,
        "_source": "aitmpl.com",
        "_skill_id": sid,
        "value_score": value_score(downloads),
    }


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python scripts/import_aitmpl_skills.py <aitmpl_catalog_json_file>")
        sys.exit(1)

    src_path = Path(sys.argv[1])
    if not src_path.exists():
        print(f"[ERROR] {src_path} not found")
        sys.exit(1)

    raw = json.loads(src_path.read_text(encoding="utf-8"))
    components = raw.get("components", [])
    print(f"Parsed {len(components)} skills from aitmpl catalog (generated {raw.get('generatedAt')})")

    if not SKILLS_JSON.exists():
        print(f"[ERROR] {SKILLS_JSON} not found")
        sys.exit(1)

    data = json.loads(SKILLS_JSON.read_text(encoding="utf-8"))
    items = data.get("items", [])

    existing_ids = {it.get("_skill_id") for it in items if it.get("_skill_id")}
    existing_names = {it["name"] for it in items}

    added = 0
    for skill in components:
        entry = convert(skill)
        if entry["_skill_id"] in existing_ids or entry["name"] in existing_names:
            continue
        items.append(entry)
        existing_ids.add(entry["_skill_id"])
        existing_names.add(entry["name"])
        added += 1

    # Recompute value_score for all aitmpl items, sort everything by value desc
    for it in items:
        if it.get("_source") == "aitmpl.com" and "downloads" in it:
            it["value_score"] = value_score(it["downloads"])

    items.sort(key=lambda r: (r.get("value_score", 0), r.get("stars", 0)), reverse=True)

    all_use_cases = sorted({uc for it in items for uc in it.get("use_cases", [])})

    data["items"] = items
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["stats"] = {"count": len(items), "use_cases": len(all_use_cases)}
    data["use_cases"] = all_use_cases

    SKILLS_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Added {added} new skills from aitmpl.com")
    print(f"Total skills: {len(items)}")
    if items:
        top = items[0]
        print(f"Top skill: {top['name']} value={top['value_score']} downloads={top.get('downloads',0)}")
    print(f"Wrote {SKILLS_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
