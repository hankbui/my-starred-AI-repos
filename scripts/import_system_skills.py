"""Import skills from a system-update text block into website/data/skills.json.

The system-update content lists skills as XML-like blocks:

  <skill>
    <id>skill-id</id>
    <name>Skill Name</name>
    <description>...</description>
  </skill>

Usage:
  python scripts/import_system_skills.py <system_update_file.txt>

If no file is given, reads from STDIN.
"""

from __future__ import annotations

import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SKILLS_JSON = ROOT / "website" / "data" / "skills.json"

SKILL_BLOCK_RE = re.compile(
    r"<skill>\s*<id>(.*?)</id>\s*<name>(.*?)</name>\s*<description>(.*?)</description>\s*</skill>",
    re.S,
)

USE_CASE_MAP = {
    "coding": ["code", "coding", "programming", "development", "debug", "test", "deploy",
               "github", "git", "cli", "sdk", "framework", "library", "api"],
    "writing": ["writing", "content", "copy", "blog", "article", "text"],
    "research": ["research", "paper", "literature", "citation", "knowledge", "analysis"],
    "productivity": ["productivity", "task", "workflow", "automation", "organize"],
    "design": ["design", "ui", "ux", "visual", "layout", "prototype"],
    "data": ["data", "analytics", "dashboard", "metrics", "monitoring", "observability"],
    "marketing": ["marketing", "social", "seo", "content", "campaign", "publish"],
    "sales": ["sales", "lead", "crm", "outreach", "revenue"],
    "customer-support": ["support", "helpdesk", "ticket", "chat", "customer"],
    "education": ["education", "learning", "tutorial", "teaching", "course", "training"],
    "finance": ["finance", "billing", "payment", "invoice", "subscription"],
    "legal": ["legal", "compliance", "gdpr", "policy", "contract"],
    "healthcare": ["healthcare", "medical", "health", "patient"],
    "ai": ["ai", "llm", "agent", "automation", "mcp", "workflow", "orchestration"],
}


def parse_skills(text: str) -> list[dict]:
    skills = []
    for m in SKILL_BLOCK_RE.finditer(text):
        skill_id = m.group(1).strip()
        name = m.group(2).strip()
        desc = re.sub(r"\s+", " ", m.group(3)).strip()
        skills.append({"id": skill_id, "name": name, "description": desc})
    return skills


def guess_use_cases(desc: str) -> list[str]:
    hay = desc.lower()
    found = []
    for uc, kws in USE_CASE_MAP.items():
        if any(kw in hay for kw in kws):
            found.append(uc)
    if not found:
        found = ["ai", "productivity"]
    return sorted(set(found))


def to_skill_entry(s: dict) -> dict:
    return {
        "name": s["name"],
        "url": f"https://github.com/hankbui/my-starred-AI-repos#skill-{s['id']}",
        "description": s["description"][:300],
        "stars": 0,
        "forks": 0,
        "language": "",
        "category": "System Skills",
        "topics": [s["id"], "system-skill"],
        "delta_7d": 0,
        "trend_score": 0.0,
        "pushed_at": "",
        "is_agent": False,
        "is_skill": True,
        "use_cases": guess_use_cases(s["description"]),
        "topic_bonus": 0,
        "_source": "system-update",
        "_skill_id": s["id"],
    }


def value_score(r: dict) -> float:
    # system skills: no stars/growth -> score purely on topic relevance
    return round(20.0 + len(r["use_cases"]) * 5, 1)


def main() -> None:
    if len(sys.argv) > 1:
        text = Path(sys.argv[1]).read_text(encoding="utf-8")
    else:
        text = sys.stdin.read()

    skills = parse_skills(text)
    print(f"Parsed {len(skills)} skills from system-update")

    if not SKILLS_JSON.exists():
        print(f"[ERROR] {SKILLS_JSON} not found")
        return

    data = json.loads(SKILLS_JSON.read_text(encoding="utf-8"))
    items = data.get("items", [])

    existing_ids = {it.get("_skill_id") for it in items if it.get("_skill_id")}
    existing_names = {it["name"] for it in items}

    added = 0
    for s in skills:
        if s["id"] in existing_ids or s["name"] in existing_names:
            continue
        entry = to_skill_entry(s)
        entry["value_score"] = value_score(entry)
        items.append(entry)
        existing_ids.add(s["id"])
        existing_names.add(s["name"])
        added += 1

    # recompute value_score for all system skills, keep GitHub-repo scores intact
    for it in items:
        if it.get("_source") == "system-update":
            it["value_score"] = value_score(it)

    # sort: value_score desc, then stars desc
    items.sort(key=lambda r: (r.get("value_score", 0), r.get("stars", 0)), reverse=True)

    all_use_cases = sorted({uc for it in items for uc in it.get("use_cases", [])})

    data["items"] = items
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["stats"] = {
        "count": len(items),
        "use_cases": len(all_use_cases),
    }
    data["use_cases"] = all_use_cases

    SKILLS_JSON.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    print(f"Added {added} new system skills")
    print(f"Total skills: {len(items)}")
    print(f"Wrote {SKILLS_JSON.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
