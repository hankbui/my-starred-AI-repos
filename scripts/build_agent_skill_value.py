"""Build agents.json & skills.json with an expert "value score".

Reads website/data/repos.json (trending_repos), classifies every repo as
agent / skill / both, tags use-cases, computes a 0-100 value score and writes
two ready-to-publish JSON files:

  website/data/agents.json   -> only agents, sorted by value_score desc
  website/data/skills.json   -> only skills, sorted by value_score desc

The value score blends:
  - stars            (log scale, weight 0.50)  - community validation
  - 7d star delta    (growth, weight 0.20)     - momentum
  - freshness        (recent push, weight 0.15) - actively maintained
  - topic bonus      (ai-agents/mcp/autogen/etc, weight 0.15) - expert signal

Run:  python scripts/build_agent_skill_value.py
"""

from __future__ import annotations

import json
import math
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / "website" / "data" / "repos.json"
OUT_AGENTS = ROOT / "website" / "data" / "agents.json"
OUT_SKILLS = ROOT / "website" / "data" / "skills.json"

AGENT_KEYWORDS = [
    "agent", "agentic", "multi-agent", "autonomous", "assistant",
    "orchestrator", "function calling", "tool use", "mcp",
    "auto-gpt", "babyagi", "langchain", "crewai", "autogen",
    "semantic-kernel", "task",
]
SKILL_KEYWORDS = [
    "framework", "library", "sdk", "toolkit", "api", "cli",
    "skills", "skill", "plugin", "extension", "runtime",
    "middleware", "template", "boilerplate", "starter", "package",
]

USE_CASE_MAP = {
    "marketing": ["marketing", "seo", "social media", "content", "ad", "campaign",
                  "email marketing", "growth", "conversion", "analytics"],
    "coding": ["code", "coding", "programming", "development", "ide", "compiler",
               "debug", "test", "deploy", "ci/cd", "github", "git"],
    "writing": ["writing", "content", "copy", "blog", "article", "essay",
                "story", "creative writing", "humanizer"],
    "design": ["design", "ui", "ux", "frontend", "css", "figma", "prototype",
               "wireframe", "mockup", "layout", "visual"],
    "sales": ["sales", "crm", "lead", "customer", "outreach", "pipeline",
              "prospect", "deal", "revenue"],
    "research": ["research", "paper", "arxiv", "science", "academic", "survey",
                 "literature", "citation", "knowledge"],
    "data": ["data", "database", "etl", "pipeline", "analytics", "sql",
             "warehouse", "lake", "query", "dataset"],
    "finance": ["finance", "trading", "stock", "crypto", "investment", "market",
                "portfolio", "quant", "financial"],
    "legal": ["legal", "law", "contract", "compliance", "regulation", "policy",
              "terms", "privacy", "gdpr"],
    "healthcare": ["healthcare", "medical", "health", "clinical", "patient",
                   "diagnosis", "drug", "therapy", "wellness"],
    "education": ["education", "learning", "course", "tutorial", "teaching",
                  "student", "curriculum", "training"],
    "customer-support": ["customer support", "support", "helpdesk", "ticket",
                         "chat", "service desk", "faq", "csm"],
    "productivity": ["productivity", "task", "todo", "organize", "workflow",
                     "automation", "calendar", "project management"],
}

EXPERT_TOPICS = {
    "ai-agents", "mcp", "autogen", "langchain", "crewai", "agent",
    "agentic", "multi-agent", "autonomous-agents", "llm-agents",
    "ai-agent", "ai-agents", "function-calling", "tool-use",
}

STOP_TOPICS = {"transformers", "pytorch", "tensorflow", "safetensors", "gguf",
               "onnx", "llama.cpp", "cuda", "metal", "rocm", "gradio"}


def _haystack(repo: dict) -> str:
    name = repo.get("name", "") or ""
    desc = repo.get("description", "") or ""
    topics = [t for t in (repo.get("topics") or []) if t.lower() not in STOP_TOPICS]
    category = repo.get("category", "") or ""
    return f"{name} {desc} {' '.join(topics)} {category}".lower()


def classify(repo: dict) -> dict:
    hay = _haystack(repo)
    is_agent = any(kw in hay for kw in AGENT_KEYWORDS)
    is_skill = any(kw in hay for kw in SKILL_KEYWORDS)

    use_cases = []
    for uc, kws in USE_CASE_MAP.items():
        if any(kw in hay for kw in kws):
            use_cases.append(uc)
    if any(kw in hay for kw in ["llm", "gpt", "ai", "model", "neural", "rag"]):
        use_cases.append("ai")

    topics = [t.lower() for t in (repo.get("topics") or []) if t.lower() not in STOP_TOPICS]
    topic_bonus = len([t for t in topics if t in EXPERT_TOPICS])

    return {
        "name": repo.get("name", ""),
        "url": repo.get("url", ""),
        "description": (repo.get("description") or "")[:300],
        "stars": int(repo.get("stars", 0) or 0),
        "forks": int(repo.get("forks", 0) or 0),
        "language": repo.get("language", "") or "",
        "category": repo.get("category", "") or "",
        "topics": topics[:12],
        "delta_7d": int(repo.get("star_delta_7d", 0) or 0),
        "trend_score": round(float(repo.get("trend_score", 0) or 0), 1),
        "pushed_at": repo.get("pushed_at", "") or "",
        "is_agent": is_agent,
        "is_skill": is_skill,
        "use_cases": sorted(set(use_cases)),
        "topic_bonus": topic_bonus,
    }


def _value_score(r: dict) -> float:
    stars = r["stars"]
    delta = r["delta_7d"]
    pushed = r["pushed_at"]

    # stars: log scale capped at ~100k stars -> 100
    stars_score = min(100.0, (math.log10(stars + 1) / math.log10(100_000 + 1)) * 100)

    # growth: delta per existing stars, capped
    growth_score = min(100.0, (delta / max(stars, 1)) * 1200)

    # freshness: days since last push, fresher = higher
    days = 999
    if pushed:
        try:
            pushed_dt = datetime.fromisoformat(pushed.replace("Z", "+00:00"))
            days = max(0, (datetime.now(timezone.utc) - pushed_dt).days)
        except Exception:
            days = 999
    freshness_score = max(0.0, 100.0 - days / 30 * 12)  # 0 after ~250 days

    # topic bonus: expert topics add up, capped
    topic_score = min(100.0, r["topic_bonus"] * 25)

    value = (0.50 * stars_score
             + 0.20 * growth_score
             + 0.15 * freshness_score
             + 0.15 * topic_score)
    return round(value, 1)


def main() -> None:
    print("=" * 60)
    print("Build agents.json / skills.json (value-scored)")
    print("=" * 60)

    if not INPUT.exists():
        print(f"  [ERROR] {INPUT} not found")
        return

    repos = json.loads(INPUT.read_text())
    items = repos.get("trending_repos") or repos.get("repos") or []
    print(f"  Loaded {len(items)} repos from {INPUT}")

    classified = [classify(r) for r in items]
    # keep repos classified as at least one of agent/skill
    kept = [r for r in classified if r["is_agent"] or r["is_skill"]]
    print(f"  Classified agent/skill: {len(kept)}")

    agents = [r for r in kept if r["is_agent"]]
    skills = [r for r in kept if r["is_skill"]]

    for lst in (agents, skills):
        for r in lst:
            r["value_score"] = _value_score(r)
        lst.sort(key=lambda r: r["value_score"], reverse=True)

    all_use_cases = sorted({uc for r in kept for uc in r["use_cases"]})

    def payload(items_list: list) -> dict:
        return {
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "stats": {"count": len(items_list), "use_cases": len(all_use_cases)},
            "use_cases": all_use_cases,
            "items": items_list,
        }

    OUT_AGENTS.parent.mkdir(parents=True, exist_ok=True)
    OUT_AGENTS.write_text(json.dumps(payload(agents), indent=2, ensure_ascii=False))
    OUT_SKILLS.write_text(json.dumps(payload(skills), indent=2, ensure_ascii=False))

    print(f"  Agents : {len(agents)}  -> {OUT_AGENTS.relative_to(ROOT)}")
    print(f"  Skills : {len(skills)}  -> {OUT_SKILLS.relative_to(ROOT)}")
    if agents:
        print(f"  Top agent : {agents[0]['name']}   value={agents[0]['value_score']}  ⭐{agents[0]['stars']}")
    if skills:
        print(f"  Top skill : {skills[0]['name']}   value={skills[0]['value_score']}  ⭐{skills[0]['stars']}")


if __name__ == "__main__":
    main()
