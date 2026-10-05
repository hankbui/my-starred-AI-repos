from __future__ import annotations

import json
import os
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "website" / "data"
OUTPUT = DATA / "ai-employees.json"

AI_EMPLOYEE_ROLES = {
    "agent-framework": {
        "role": "Agent Infrastructure Engineer",
        "icon": "🧠",
        "description": "Build and maintain the agent runtime, memory systems, tool-calling layer, and planning engine that all other AI employees depend on.",
        "business_use": "ENGINEERING",
    },
    "multi-agent": {
        "role": "Multi-Agent Orchestrator",
        "icon": "👥",
        "description": "Coordinate specialist AI agents into teams — delegation, task splitting, inter-agent communication, and result merging.",
        "business_use": "OPERATIONS",
    },
    "ai-coding": {
        "role": "Software Engineering Agent",
        "icon": "💻",
        "description": "Autonomously write, review, test, debug, and deploy code. Acts as a 24/7 junior-to-mid-level engineer.",
        "business_use": "ENGINEERING",
    },
    "solo-founder": {
        "role": "Solo Founder Automation Stack",
        "icon": "🚀",
        "description": "Low-code/no-code platforms that let a single person automate an entire business — CRM, website, billing, workflows.",
        "business_use": "OPERATIONS",
    },
    "browser-auto": {
        "role": "Web Automation Agent",
        "icon": "🌐",
        "description": "Control browsers to scrape, fill forms, monitor competitors, test UIs, and interact with web apps just like a human employee would.",
        "business_use": "SALES",
    },
    "research-agent": {
        "role": "Research & Intelligence Agent",
        "icon": "🔬",
        "description": "Read papers, summarize findings, monitor competitive landscape, and produce daily intelligence briefings autonomously.",
        "business_use": "PRODUCT",
    },
    "workflow": {
        "role": "Workflow Automation Engineer",
        "icon": "⚙️",
        "description": "Design and run multi-step business processes — data pipelines, approval flows, notification chains, and scheduled jobs.",
        "business_use": "OPERATIONS",
    },
    "chinese": {
        "role": "Chinese Ecosystem Monitor",
        "icon": "🇨🇳",
        "description": "Track the rapidly evolving Chinese open-source AI ecosystem — DeepSeek, Alibaba, Baidu, ByteDance projects and their global impact.",
        "business_use": "MARKETING",
    },
}

BUSINESS_USE_CASES = {
    "SALES": {"icon": "💼", "label": "Sales", "desc": "Lead research, qualification, outbound, CRM, follow-ups, proposals"},
    "MARKETING": {"icon": "📢", "label": "Marketing", "desc": "Research, competitor monitoring, content production, SEO, social media"},
    "OPERATIONS": {"icon": "⚙️", "label": "Operations", "desc": "Reporting, monitoring, data processing, internal workflows, QA"},
    "PRODUCT": {"icon": "📋", "label": "Product", "desc": "User research, feedback analysis, feature discovery, analytics"},
    "ENGINEERING": {"icon": "💻", "label": "Engineering", "desc": "Coding, testing, debugging, code review, deployment, monitoring"},
    "SOCIAL": {"icon": "🔊", "label": "Social", "desc": "Trend discovery, content ideas, publishing, engagement, community"},
    "EXECUTIVE": {"icon": "🎯", "label": "Executive", "desc": "Daily briefings, business intelligence, opportunity discovery, strategic research"},
}

ACTION_RANK = {"IGNORE": 0, "WATCH": 1, "TEST": 2, "FORK": 3, "ADOPT": 4}
IMPACT_RANK = {"LOW": 1, "MEDIUM": 2, "HIGH": 3, "CRITICAL": 4}
MATURITY_RANK = {"EXPERIMENTAL": 1, "EARLY": 2, "USABLE": 3, "PRODUCTION": 4}

COMPUTE_WHAT_TO_BUILD = [
    {
        "name": "24/7 Competitor Intelligence Employee",
        "business_problem": "Your competitors change pricing, add features, update messaging, and launch campaigns while you sleep. A human can't monitor 15+ competitors around the clock.",
        "ai_employees": ["Web Automation Agent", "Research & Intelligence Agent", "Agent Infrastructure Engineer"],
        "architecture": "Browser automation (browser-use/Playwright) + LLM analysis + persistent memory (vector DB) + scheduled trigger + notification pipeline",
        "tools": ["browser-use", "LangChain/LangGraph", "Chroma/Pinecone", "GitHub Actions scheduler", "Slack/Discord webhook"],
        "example_repos": ["browser-use/browser-use", "langchain-ai/langchain", "assafelovic/gpt-researcher"],
        "complexity": "MEDIUM",
        "business_value": "HIGH — direct revenue protection and opportunity capture",
        "mvp": "1. Pick 3 competitors 2. Define what to monitor (pricing, features, blog) 3. Daily diff report to your inbox 4. Add alert conditions",
    },
    {
        "name": "Autonomous Sales Development Rep",
        "business_problem": "Finding, qualifying, and outreaching to leads is the most repetitive high-value task. Most solo founders can't afford a full-time SDR.",
        "ai_employees": ["Web Automation Agent", "Solo Founder Automation Stack", "Multi-Agent Orchestrator"],
        "architecture": "Web research agent finds leads → CRM lookup/update → personalization LLM → email/SMS outreach → follow-up scheduler → analytics dashboard",
        "tools": ["n8n/Dify", "browser-use", "OpenAI/Claude API", "Supabase/PostgreSQL", "Resend/SendGrid"],
        "example_repos": ["n8n-io/n8n", "langgenius/dify", "browser-use/browser-use"],
        "complexity": "MEDIUM",
        "business_value": "HIGH — directly generates revenue",
        "mvp": "1. Import 50 leads CSV 2. Set qualification criteria 3. Auto-send personalized intro 4. Log responses 5. Trigger human when hot",
    },
    {
        "name": "AI Employee Operating System (Company OS)",
        "business_problem": "Multiple AI agents need shared memory, identity, permissions, tools, and event system — currently each agent is isolated without coordination.",
        "ai_employees": ["Agent Infrastructure Engineer", "Multi-Agent Orchestrator", "Workflow Automation Engineer"],
        "architecture": "Central agent registry + shared event bus + persistent memory layer + permission system + observability stack + human-in-the-loop approval gates",
        "tools": ["LangGraph", "AutoGen", "CrewAI", "Temporal", "PostgreSQL+pgvector", "LangSmith/Weights & Biases", "OpenTelemetry"],
        "example_repos": ["microsoft/autogen", "crewAIInc/crewAI", "langchain-ai/langgraph", "temporalio/temporal"],
        "complexity": "HIGH",
        "business_value": "TRANSFORMATIVE — enables all other AI employees to work together",
        "mvp": "1. Pick 2 agents (research + email) 2. Give them shared memory 3. One shared event bus 4. Human approval on actions 5. Log everything",
    },
    {
        "name": "Social Media Autonomous Manager",
        "business_problem": "Content calendars, trend monitoring, posting schedules, and engagement analysis consume 10+ hours/week for an independent builder.",
        "ai_employees": ["Research & Intelligence Agent", "Web Automation Agent", "Solo Founder Automation Stack"],
        "architecture": "Trend scanner (Reddit/Twitter/HN) → content idea generator → draft + image → scheduler → auto-post → engagement monitor → performance report",
        "tools": ["gpt-researcher", "browser-use", "n8n/Dify", "Bubble/n8n", "Canva API/Browser"],
        "example_repos": ["assafelovic/gpt-researcher", "n8n-io/n8n", "browser-use/browser-use"],
        "complexity": "LOW",
        "business_value": "MEDIUM — time saving, consistent presence",
        "mvp": "1. Auto-scan 3 sources daily 2. Generate 3 post ideas 3. Human picks one 4. Auto-schedule + post 5. Weekly engagement summary",
    },
    {
        "name": "Coding Agent Team Lead",
        "business_problem": "Building software alone is slow. A lead coding agent that plans, delegates to specialized coding agents, reviews code, runs tests, and deploys can 10x solo output.",
        "ai_employees": ["Software Engineering Agent", "Agent Infrastructure Engineer", "Multi-Agent Orchestrator"],
        "architecture": "Product spec → architecture plan → task decomposition → parallel coding agents → code review → test generation → test execution → deployment",
        "tools": ["open-code", "Aider/Sweep", "LangGraph", "GitHub Actions", "Docker", "Playwright for E2E"],
        "example_repos": ["anomalyco/opencode", "langchain-ai/langgraph", "microsoft/autogen"],
        "complexity": "HIGH",
        "business_value": "TRANSFORMATIVE — 10x solo engineering output",
        "mvp": "1. One agent writes code 2. One agent reviews 3. One agent tests 4. Human merges 5. Auto-deploy on merge",
    },
]

MATURITY_RULES = {
    "PRODUCTION": {"min_stars": 10000, "min_delta_7d": 50},
    "USABLE": {"min_stars": 1000, "min_delta_7d": 10},
    "EARLY": {"min_stars": 100},
}


def load_json(path):
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def compute_score(stars, delta_7d, trend_score, has_curated):
    star_score = min(stars / 50000, 1.0) * 40
    growth_score = min((delta_7d or 0) / 1000, 1.0) * 30
    trend_score_val = min((trend_score or 0) / 100, 1.0) * 20
    curated_bonus = 5 if has_curated else 0
    return min(round(star_score + growth_score + trend_score_val + curated_bonus), 100)


def classify_impact(score):
    if score >= 90:
        return "CRITICAL"
    if score >= 75:
        return "HIGH"
    if score >= 55:
        return "MEDIUM"
    return "LOW"


def classify_maturity(stars, delta_7d):
    if stars >= MATURITY_RULES["PRODUCTION"]["min_stars"]:
        return "PRODUCTION"
    if stars >= MATURITY_RULES["USABLE"]["min_stars"]:
        return "USABLE"
    if stars >= MATURITY_RULES["EARLY"]["min_stars"]:
        return "EARLY"
    return "EXPERIMENTAL"


def classify_action(score, maturity):
    if score >= 85 and maturity in ("USABLE", "PRODUCTION"):
        return "ADOPT"
    if score >= 70:
        return "FORK"
    if score >= 50:
        return "TEST"
    if score >= 30:
        return "WATCH"
    return "IGNORE"


def determine_business_use(classes, primary):
    role_info = AI_EMPLOYEE_ROLES.get(primary, {})
    return role_info.get("business_use", "OPERATIONS")


def generate_technical_highlight(repo):
    desc = repo.get("description", "")
    lang = repo.get("language", "")
    topics = repo.get("topics", [])
    parts = []
    if lang:
        parts.append(f"Built with {lang}")
    if topics:
        tech_topics = [t for t in topics if t.lower() not in ("ai", "ml", "llm", "open-source")]
        if tech_topics:
            parts.append(f"Key tech: {', '.join(tech_topics[:3])}")
    if not parts:
        parts.append(f"{repo.get('stars', 0)} stars on GitHub")
    return " · ".join(parts)


def generate_reason(repo, role_info):
    desc = repo.get("description", "")
    stars = repo.get("stars", 0)
    delta = repo.get("star_delta_7d", 0)
    role_name = role_info.get("role", "AI Employee")
    lines = []
    if desc:
        lines.append(desc[:120])
    lines.append(f"Potential as {role_name}")
    if delta and delta > 100:
        lines.append(f"Rapid growth: +{delta} stars this week")
    return " — ".join(lines)


def build_what_changed(items):
    sections = {"new": [], "rising": [], "updated": [], "breakthrough": [], "stalled": []}
    for item in items:
        sc = item.get("score", 0)
        delta_7d = item.get("star_delta_7d", 0) or 0
        if sc >= 90:
            sections["breakthrough"].append(item["name"])
        if delta_7d > 500:
            sections["rising"].append(item["name"])
        if delta_7d > 100 and sc >= 70:
            sections["updated"].append(item["name"])
    for section, names in sections.items():
        sections[section] = names[:8]
    return sections


def build_important_repos(items):
    scored = [it for it in items if it.get("score", 0) > 0]
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:20]


def build_employee_role_stats(items):
    role_counter = Counter()
    use_counter = Counter()
    for item in items:
        primary = item.get("primary", "agent-framework")
        role_info = AI_EMPLOYEE_ROLES.get(primary, {})
        role_counter[primary] += 1
        bu = role_info.get("business_use", "OPERATIONS")
        use_counter[bu] += 1
    return dict(role_counter), dict(use_counter)


def generate_report():
    repos_data = load_json(DATA / "repos.json")
    starred = repos_data.get("starred_repos", [])
    trending = repos_data.get("trending_repos", [])
    all_repos = {}
    for r in starred + trending:
        name = r.get("name", "")
        if name and name not in all_repos:
            all_repos[name] = r

    try:
        automation_data = load_json(DATA / "automation.json")
        auto_items = automation_data.get("items", [])
    except Exception:
        auto_items = []

    if not auto_items:
        auto_items = []
        for name, r in all_repos.items():
            cat = r.get("category", "")
            if cat != "Agents & Automation":
                continue
            auto_items.append({
                "name": name,
                "url": r.get("url", ""),
                "stars": r.get("stars", 0),
                "description": (r.get("description") or "")[:200],
                "topics": r.get("topics", [])[:8],
                "language": r.get("language", ""),
                "category": cat,
                "classes": ["agent-framework"],
                "primary": "agent-framework",
                "star_delta_7d": r.get("star_delta_7d", 0),
                "star_delta_1d": r.get("star_delta_1d", 0),
                "trend_score": r.get("trend_score", 0),
                "_curated": False,
            })

    developments = []
    for item in auto_items:
        stars = item.get("stars", 0) or 0
        delta_7d = item.get("star_delta_7d", 0) or 0
        trend_score = item.get("trend_score", 0) or 0
        curated = item.get("_curated", False)
        primary = item.get("primary", "agent-framework")
        role_info = AI_EMPLOYEE_ROLES.get(primary, {})

        score = compute_score(stars, delta_7d, trend_score, curated)
        impact = classify_impact(score)
        maturity = classify_maturity(stars, delta_7d)
        action = classify_action(score, maturity)
        business_use = role_info.get("business_use", "OPERATIONS")

        developments.append({
            "name": item["name"],
            "url": item.get("url", f"https://github.com/{item['name']}"),
            "stars": stars,
            "description": item.get("description", "")[:200],
            "language": item.get("language", ""),
            "topic_labels": item.get("topics", [])[:5],
            "category": item.get("category", ""),
            "primary": primary,
            "star_delta_7d": delta_7d,
            "star_delta_1d": item.get("star_delta_1d", 0) or 0,
            "trend_score": trend_score,
            "score": score,
            "impact": impact,
            "maturity": maturity,
            "action": action,
            "ai_employee_role": role_info.get("role", "AI Employee"),
            "ai_employee_icon": role_info.get("icon", "🤖"),
            "business_use": business_use,
            "reason": generate_reason(item, role_info),
            "technical_highlight": generate_technical_highlight(item),
        })

    developments.sort(key=lambda x: x["score"], reverse=True)

    role_stats, use_stats = build_employee_role_stats(developments)
    what_changed = build_what_changed(developments)
    important = build_important_repos(developments)

    total_stars = sum(d["stars"] for d in developments)
    total_growth_7d = sum(d["star_delta_7d"] for d in developments)

    business_use_sections = {}
    for bu, info in BUSINESS_USE_CASES.items():
        items_in_use = [d for d in developments if d["business_use"] == bu]
        items_in_use.sort(key=lambda x: x["score"], reverse=True)
        business_use_sections[bu] = {
            "icon": info["icon"],
            "label": info["label"],
            "desc": info["desc"],
            "count": use_stats.get(bu, 0),
            "top": items_in_use[:6],
        }

    employee_roles = {}
    for key, info in AI_EMPLOYEE_ROLES.items():
        items_in_role = [d for d in developments if d["primary"] == key]
        items_in_role.sort(key=lambda x: x["score"], reverse=True)
        employee_roles[key] = {
            "role": info["role"],
            "icon": info["icon"],
            "description": info["description"],
            "business_use": info["business_use"],
            "count": role_stats.get(key, 0),
            "top": items_in_role[:5],
        }

    result = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "stats": {
            "total": len(developments),
            "total_stars": total_stars,
            "growth_7d": total_growth_7d,
            "categories": len(role_stats),
            "critical_count": sum(1 for d in developments if d["impact"] == "CRITICAL"),
            "high_count": sum(1 for d in developments if d["impact"] == "HIGH"),
        },
        "top_developments": developments[:60],
        "what_changed": what_changed,
        "what_to_build": COMPUTE_WHAT_TO_BUILD,
        "important_repos": important,
        "employee_roles": employee_roles,
        "business_use_sections": business_use_sections,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(result, indent=2, ensure_ascii=False))
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"AI Employee Radar written to {OUTPUT} ({size_kb:.1f} KB)")
    print(f"  Total developments: {len(developments)}")
    print(f"  Top developments: {len(result['top_developments'])}")
    print(f"  What to build: {len(result['what_to_build'])}")
    print(f"  Important repos: {len(important)}")
    print(f"  Employee roles: {len(employee_roles)}")
    print(f"  Business use sections: {len(business_use_sections)}")
    return result


if __name__ == "__main__":
    generate_report()