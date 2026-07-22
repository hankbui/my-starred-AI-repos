"""Agent & Skill Classifier — tag every repo as agent/skill + use-case.

Reads website/data/repos.json, classifies each repo into:
  - agent: repo is an AI agent, agent framework, or has agent-like features
  - skill: repo is a tool, library, SDK, framework, or skill

Also tags each with relevant use-cases (marketing, coding, design, etc.)
based on name, description, topics, and category.

Output: website/data/agent-skills.json
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUT = ROOT / "website" / "data" / "repos.json"
OUTPUT = ROOT / "website" / "data" / "agent-skills.json"

AGENT_CATEGORIES = {"Agents & Automation"}
AGENT_KEYWORDS = ["agent", "agentic", "multi-agent", "autonomous", "assistant",
                  "orchestrator", "function calling", "tool use", "mcp"]
SKILL_KEYWORDS = ["framework", "library", "sdk", "toolkit", "api", "cli",
                  "skills", "skill", "plugin", "extension", "runtime",
                  "middleware", "template", "boilerplate", "starter"]

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

STOP_TOPICS = {"transformers", "pytorch", "tensorflow", "safetensors", "gguf",
               "onnx", "llama.cpp", "cuda", "metal", "rocm", "gradio"}


def classify_repo(repo: dict) -> dict:
    name = repo.get("name", "") or ""
    desc = repo.get("description", "") or ""
    topics = [t.lower() for t in (repo.get("topics") or []) if t.lower() not in STOP_TOPICS]
    category = repo.get("category", "") or ""
    hay = f"{name} {desc} {' '.join(topics)} {category}".lower()

    is_agent = False
    is_skill = False

    if category in AGENT_CATEGORIES:
        is_agent = True
    for kw in AGENT_KEYWORDS:
        if kw in hay:
            is_agent = True
            break

    for kw in SKILL_KEYWORDS:
        if kw in hay:
            is_skill = True
            break

    use_cases = []
    for uc, kws in USE_CASE_MAP.items():
        if any(kw in hay for kw in kws):
            use_cases.append(uc)

    # add "ai" as a catch-all use case for repos with model/llm/ai keywords
    if any(kw in hay for kw in ["llm", "gpt", "ai", "model", "transformer", "neural"]):
        use_cases.append("ai")
    if "general" in use_cases:
        use_cases.remove("general")

    return {
        "id": repo.get("name", ""),
        "name": name,
        "url": repo.get("url", ""),
        "description": (desc or "")[:300],
        "stars": repo.get("stars", 0),
        "category": category,
        "language": repo.get("language", ""),
        "topics": topics[:10],
        "trend_score": round(repo.get("trend_score", 0) or 0, 1),
        "delta_7d": repo.get("star_delta_7d", 0) or 0,
        "is_agent": is_agent,
        "is_skill": is_skill,
        "use_cases": list(set(use_cases)),
    }


def main():
    print("=" * 60)
    print("Agent & Skill Classifier")
    print("=" * 60)

    if not INPUT.exists():
        print(f"  [ERROR] {INPUT} not found")
        return

    repos = json.loads(INPUT.read_text())
    items = repos.get("trending_repos") or repos.get("repos") or []
    print(f"  Loaded {len(items)} repos")

    classified = [classify_repo(r) for r in items]

    agents = [r for r in classified if r["is_agent"]]
    skills = [r for r in classified if r["is_skill"]]

    # sort by stars desc
    agents.sort(key=lambda r: r["stars"], reverse=True)
    skills.sort(key=lambda r: r["stars"], reverse=True)

    # collect all use cases
    all_use_cases = set()
    for r in classified:
        all_use_cases.update(r["use_cases"])
    all_use_cases = sorted(all_use_cases)

    print(f"  Agents: {len(agents)}")
    print(f"  Skills: {len(skills)}")
    print(f"  Use-cases: {len(all_use_cases)} — {', '.join(all_use_cases)}")
    print(f"  Most starred agent: {agents[0]['name']} ⭐{agents[0]['stars']}")
    print(f"  Most starred skill: {skills[0]['name']} ⭐{skills[0]['stars']}")

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "agents": len(agents),
            "skills": len(skills),
            "use_cases": len(all_use_cases),
        },
        "use_cases": all_use_cases,
        "agents": agents,
        "skills": skills,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"\n  Wrote {OUTPUT.relative_to(ROOT)} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
