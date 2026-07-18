from __future__ import annotations

import json
import os
import urllib.request
import urllib.error
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "website" / "data"
OUTPUT = DATA / "automation.json"

# Primary signal: repo category is "Agents & Automation"
# Secondary: specific technical keywords
AUTOMATION_KEYWORDS = frozenset({
    "agent", "agents", "multi-agent", "autogpt", "crewai",
    "langchain", "langgraph", "agentic",
    "browser-use", "playwright",
    "autonomous", "n8n", "temporal",
    "coze", "dify", "fastgpt", "ragflow", "metagpt", "chatdev",
    "agentverse", "babyagi", "superagent",
    "opencode", "continue.dev",
    "mcp", "model context protocol", "a2a",
    "function calling", "tool use",
})

CATEGORY_MAP: dict[str, str] = {
    "agent framework": "agent-framework",
    "multi-agent": "multi-agent",
    "coding agent": "ai-coding",
    "solo founder": "solo-founder",
    "browser automation": "browser-auto",
    "research agent": "research-agent",
    "workflow": "workflow",
    "chinese": "chinese",
    "ai coding": "ai-coding",
}

def load_json(path: Path) -> dict | list:
    if not path.exists():
        return {}
    return json.loads(path.read_text())

def classify_repo(name: str, desc: str, topics: list[str], category: str) -> list[str]:
    haystack = f"{name} {desc} {' '.join(topics)} {category}".lower()
    classes: list[str] = []
    is_agent_cat = category == "Agents & Automation"

    # Agent frameworks
    if any(kw in haystack for kw in ["langchain", "langgraph", "crewai", "autogen",
        "agent sdk", "function calling", "tool use", "mcp", "model context protocol",
        "agent framework", "agentic framework"]):
        classes.append("agent-framework")
    elif is_agent_cat and any(kw in haystack for kw in ["agent", "autonomous"]):
        classes.append("agent-framework")

    # Multi-agent
    if any(kw in haystack for kw in ["multi-agent", "agent team", "agent collaboration",
        "agent-to-agent", "a2a", "agentverse", "metagpt", "chatdev",
        "agent orchestration", "swarm"]):
        classes.append("multi-agent")

    # AI Coding
    if any(kw in haystack for kw in ["coding agent", "code agent", "copilot",
        "code assistant", "code generation", "ai coding", "opencode",
        "cursor", "continue.dev", "claude code", "codeium"]):
        classes.append("ai-coding")
    elif is_agent_cat and any(kw in haystack for kw in ["code", "programming"]):
        classes.append("ai-coding")

    # Solo founder / low-code
    if any(kw in haystack for kw in ["n8n", "dify", "bolt.new", "lovable",
        "low-code", "no-code", "app builder", "solo founder"]):
        classes.append("solo-founder")

    # Browser automation
    if any(kw in haystack for kw in ["browser-use", "browser automation",
        "playwright", "puppeteer", "selenium", "web automation",
        "crawl", "scrape", "web scraper"]):
        classes.append("browser-auto")

    # Research agent
    if any(kw in haystack for kw in ["research agent", "research assistant",
        "paper analysis", "auto research", "gpt-researcher", "scientific"]):
        classes.append("research-agent")

    # Workflow / pipeline (only if it's a clear workflow engine, not just any repo mentioning "workflow")
    if any(kw in haystack for kw in ["n8n", "temporal", "airflow", "prefect", "dagster",
        "workflow engine", "workflow orchestration", "pipeline orchestration",
        "ci/cd pipeline", "automation engine"]):
        classes.append("workflow")
    elif is_agent_cat and any(kw in haystack for kw in ["workflow", "pipeline", "orchestration"]):
        classes.append("workflow")

    # Chinese ecosystem
    if any(kw in haystack for kw in ["dify", "fastgpt", "ragflow", "db-gpt",
        "metagpt", "chatdev", "coze", "中文", "chinese"]):
        classes.append("chinese")

    return classes

CURATED_REPOS: list[dict] = [
    {"name": "langgenius/dify", "primary": "solo-founder", "reason": "Production agentic workflow platform (Chinese)"},
    {"name": "n8n-io/n8n", "primary": "solo-founder", "reason": "Fair-code workflow automation"},
    {"name": "microsoft/autogen", "primary": "multi-agent", "reason": "Multi-agent conversation framework"},
    {"name": "crewAIInc/crewAI", "primary": "multi-agent", "reason": "Multi-agent team orchestration"},
    {"name": "geekan/MetaGPT", "primary": "multi-agent", "reason": "Multi-agent meta-programming (Chinese)"},
    {"name": "OpenBMB/ChatDev", "primary": "multi-agent", "reason": "Agent team for software dev (Chinese)"},
    {"name": "OpenBMB/AgentVerse", "primary": "multi-agent", "reason": "Multi-agent platform (Chinese)"},
    {"name": "browser-use/browser-use", "primary": "browser-auto", "reason": "Browser agent framework"},
    {"name": "anomalyco/opencode", "primary": "ai-coding", "reason": "Open source coding agent"},
    {"name": "assafelovic/gpt-researcher", "primary": "research-agent", "reason": "Autonomous research agent"},
    {"name": "langchain-ai/langchain", "primary": "agent-framework", "reason": "Agent framework standard"},
    {"name": "langchain-ai/langgraph", "primary": "agent-framework", "reason": "Agent orchestration graph"},
    {"name": "labring/FastGPT", "primary": "chinese", "reason": "Knowledge-base QA agent (Chinese)"},
    {"name": "infiniflow/ragflow", "primary": "chinese", "reason": "RAG engine with agent (Chinese)"},
    {"name": "eosphoros-ai/DB-GPT", "primary": "chinese", "reason": "Database agent (Chinese)"},
    {"name": "coze-dev/coze", "primary": "chinese", "reason": "Bot building platform (Chinese)"},
    {"name": "chatchat-space/Langchain-Chatchat", "primary": "chinese", "reason": "Chinese LLM agent platform"},
    {"name": "binary-husky/gpt_academic", "primary": "chinese", "reason": "Research agent (Chinese)"},
    {"name": "THUDM/AgentTuning", "primary": "chinese", "reason": "Agent training (Chinese)"},
    {"name": "Significant-Gravitas/AutoGPT", "primary": "agent-framework", "reason": "Pioneer autonomous agent"},
    {"name": "nicepkg/gpt-runner", "primary": "agent-framework", "reason": "AI agent runner"},
]

def fetch_github_repo(token: str | None, name: str) -> dict | None:
    try:
        req = urllib.request.Request(f"https://api.github.com/repos/{name}")
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        req.add_header("User-Agent", "Automation-Radar/1.0")
        with urllib.request.urlopen(req, timeout=10) as resp:
            if resp.status == 200:
                d = json.loads(resp.read())
                return {
                    "name": d.get("full_name", name),
                    "stars": d.get("stargazers_count", 0),
                    "description": (d.get("description") or "")[:200],
                    "topics": d.get("topics", []),
                    "language": d.get("language") or "",
                    "url": d.get("html_url", f"https://github.com/{name}"),
                    "category": "Agents & Automation",
                    "star_delta_7d": 0,
                    "star_delta_1d": 0,
                }
    except (urllib.error.HTTPError, urllib.error.URLError, OSError) as e:
        if isinstance(e, urllib.error.HTTPError) and e.code == 403 and not token:
            return None  # rate limited without token, skip
        if isinstance(e, urllib.error.HTTPError) and e.code == 404:
            return None  # repo not found
    return None

def build_automation_data() -> dict:
    repos_data = load_json(DATA / "repos.json")
    starred: list[dict] = []
    trending: list[dict] = []
    if isinstance(repos_data, dict):
        starred = repos_data.get("starred_repos", [])
        trending = repos_data.get("trending_repos", [])

    all_repos: dict[str, dict] = {}
    for r in starred + trending:
        name = r.get("name", "")
        if name and name not in all_repos:
            all_repos[name] = r

    # Filter for automation repos + classify
    automation_items: list[dict] = []
    seen_names: set[str] = set()

    for name, r in all_repos.items():
        stars = r.get("stars", 0) or 0
        if stars < 100:
            continue
        desc = r.get("description") or ""
        topics = r.get("topics", [])
        category = r.get("category", "")
        haystack = f"{name} {desc} {' '.join(topics)} {category}".lower()
        is_agent_cat = category == "Agents & Automation"

        # Must either be in Agents & Automation category, or match specific keywords
        if not is_agent_cat and not any(kw in haystack for kw in AUTOMATION_KEYWORDS):
            continue
        # Skip if category is clearly unrelated
        unrelated = {"Vision & Media", "Data & Evaluation", "Models & Inference", "Research & Knowledge"}
        if not is_agent_cat and category in unrelated:
            continue
        if name in seen_names:
            continue
        seen_names.add(name)

        classes = classify_repo(name, desc, topics, category)
        if not classes:
            continue
        primary = classes[0]

        automation_items.append({
            "name": name,
            "url": r.get("url", f"https://github.com/{name}"),
            "stars": r.get("stars", 0),
            "description": desc[:200],
            "topics": topics[:8],
            "language": r.get("language", ""),
            "category": category,
            "classes": classes,
            "primary": primary,
            "star_delta_7d": r.get("star_delta_7d", 0),
            "star_delta_1d": r.get("star_delta_1d", 0),
            "trend_score": r.get("trend_score", 0),
        })

    # Try to add curated repos via API
    token = os.environ.get("GITHUB_TOKEN")
    for cur in CURATED_REPOS:
        name = cur["name"]
        if name in seen_names:
            continue
        repo = fetch_github_repo(token, name)
        if repo:
            seen_names.add(name)
            desc = repo.get("description") or ""
            topics = repo.get("topics", [])
            primary = cur.get("primary", "agent-framework")
            classes = [primary]
            automation_items.append({
                "name": name,
                "url": repo.get("url", f"https://github.com/{name}"),
                "stars": repo.get("stars", 0),
                "description": desc[:200],
                "topics": topics[:8],
                "language": repo.get("language", ""),
                "category": "Agents & Automation",
                "classes": classes,
                "primary": primary,
                "star_delta_7d": repo.get("star_delta_7d", 0),
                "star_delta_1d": repo.get("star_delta_1d", 0),
                "trend_score": 0,
                "_curated": True,
            })

    automation_items.sort(key=lambda x: x["stars"], reverse=True)

    # Compute section stats
    class_counts: Counter = Counter()
    for item in automation_items:
        for c in item["classes"]:
            class_counts[c] += 1

    sections = {
        "agent-framework": {"label": "Agent Frameworks", "icon": "🧠", "desc": "Build blocks for creating AI agents — memory, tools, planning, reasoning"},
        "multi-agent": {"label": "Multi-Agent Teams", "icon": "👥", "desc": "Agent collaboration, delegation, and swarm orchestration"},
        "ai-coding": {"label": "AI Coding Agents", "icon": "💻", "desc": "Autonomous code generation, review, and software development agents"},
        "solo-founder": {"label": "Solo Founder Stack", "icon": "🚀", "desc": "Low-code / no-code platforms for one-person company automation"},
        "browser-auto": {"label": "Browser & Web Automation", "icon": "🌐", "desc": "Browser agents, web scrapers, and test automation"},
        "research-agent": {"label": "Research Agents", "icon": "🔬", "desc": "Scientific paper analysis, literature review, auto-research"},
        "workflow": {"label": "Workflow Orchestration", "icon": "⚙️", "desc": "Pipeline automation, CI/CD, and workflow engines"},
        "chinese": {"label": "Chinese Ecosystem", "icon": "🇨🇳", "desc": "Notable Chinese agent/automation projects"},
    }

    total_stars_7d = sum(item["star_delta_7d"] or 0 for item in automation_items)
    total_stars = sum(item["stars"] or 0 for item in automation_items)

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "total_repos": len(automation_items),
            "total_stars": total_stars,
            "total_stars_7d": total_stars_7d,
            "by_section": dict(class_counts),
            "sections": sections,
        },
        "items": automation_items,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    print(f"Automation data written to {OUTPUT}")
    print(f"  Total automation repos: {len(automation_items)}")
    print(f"  Sections: {dict(class_counts)}")
    return result

if __name__ == "__main__":
    build_automation_data()
