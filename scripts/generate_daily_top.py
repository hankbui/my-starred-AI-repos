"""Daily Top Picks — GitHub #1 repo + Product Hunt top products.

Generates website/data/daily-top.json with 5 sections:
  - GitHub Trending #1 repo today (by star_delta_1d)
  - GitHub Trending #1 repo this week (by star_delta_7d)
  - Product Hunt top products (API first, RSS feed fallback)
  - AI-product-of-the-week (classified from PH data)
  - Productivity-product-of-the-week (classified from PH data)

Run daily via GitHub Actions. Zero external dependencies — stdlib only.
"""

from __future__ import annotations

import json
import os
import re
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPOS_PATH = ROOT / "website" / "data" / "repos.json"
OUTPUT = ROOT / "website" / "data" / "daily-top.json"

PH_API_URL = "https://api.producthunt.com/v2/api/graphql"
PH_FEED_URL = "https://www.producthunt.com/feed"
PH_TOKEN = os.environ.get("PRODUCTHUNT_TOKEN", "")

AI_KEYWORDS = ["ai", "artificial intelligence", "machine learning", "llm", "gpt",
               "chatbot", "neural", "deep learning", "intelligence", "cognitive",
               "vision", "nlp", "natural language", "tensor", "diffusion",
               "transformer", "rag", "embedding", "autonomous", "agent"]

PRODUCTIVITY_KEYWORDS = ["productivity", "task", "organize", "workflow", "project management",
                         "time tracking", "calendar", "todo", "note", "document",
                         "collaboration", "kanban", "sprint", "agile", "focus",
                         "distraction", "habit", "planner", "schedule", "efficiency",
                         "automation", "no-code", "low-code", "spreadsheet"]

HEADERS = {
    "User-Agent": "my-starred-ai-repos/1.0 (daily-top-pipeline)",
    "Accept": "application/json",
}


def _get(url: str, retries: int = 2, headers: dict | None = None, data: bytes | None = None) -> str | None:
    last_err = None
    for attempt in range(retries + 1):
        try:
            hdrs = HEADERS.copy()
            if headers:
                hdrs.update(headers)
            req = urllib.request.Request(url, headers=hdrs, data=data)
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode("utf-8", "replace")
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, OSError) as e:
            last_err = e
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
    print(f"  [WARN] GET failed: {url} -> {last_err}")
    return None


# ---- GitHub section -------------------------------------------------------

def load_github_top() -> dict:
    if not REPOS_PATH.exists():
        return {"error": "repos.json not found"}
    try:
        data = json.loads(REPOS_PATH.read_text())
    except Exception as e:
        return {"error": str(e)}

    trending = data.get("trending_repos") or data.get("repos") or []
    if not trending:
        return {"error": "no repos found"}

    # Sort by 1d delta for "today", 7d delta for "week"
    by_1d = sorted(trending, key=lambda r: r.get("star_delta_1d", 0) or 0, reverse=True)
    by_7d = sorted(trending, key=lambda r: r.get("star_delta_7d", 0) or 0, reverse=True)

    def mint(r):
        return {
            "name": r.get("name") or r.get("repo_name") or "",
            "url": r.get("url") or "",
            "stars": r.get("stars") or 0,
            "delta_1d": r.get("star_delta_1d", 0) or 0,
            "delta_7d": r.get("star_delta_7d", 0) or 0,
            "description": (r.get("description") or "")[:200],
            "language": r.get("language") or "",
            "category": r.get("category") or "",
            "trend_score": round(r.get("trend_score", 0) or 0, 1),
        }

    return {
        "today": mint(by_1d[0]) if by_1d else None,
        "week": mint(by_7d[0]) if by_7d else None,
        "top_today": [mint(r) for r in by_1d[:10]],
        "top_week": [mint(r) for r in by_7d[:10]],
    }


# ---- Product Hunt section -------------------------------------------------

def classify_ph_product(title: str, desc: str) -> list[str]:
    text = f"{title} {desc}".lower()
    tags = []
    if any(kw in text for kw in AI_KEYWORDS):
        tags.append("AI")
    if any(kw in text for kw in PRODUCTIVITY_KEYWORDS):
        tags.append("Productivity")
    return tags or ["General"]


def fetch_ph_feed() -> list[dict]:
    raw = _get(PH_FEED_URL)
    if not raw:
        return []

    products = []
    try:
        root = ET.fromstring(raw)
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        for entry in root.findall("atom:entry", ns)[:50]:
            title_el = entry.find("atom:title", ns)
            published_el = entry.find("atom:published", ns)
            updated_el = entry.find("atom:updated", ns)
            link_el = entry.find("atom:link", ns)
            content_el = entry.find("atom:content", ns)

            title = title_el.text.strip() if title_el is not None and title_el.text else ""
            published = published_el.text.strip()[:10] if published_el is not None and published_el.text else ""
            updated = updated_el.text.strip()[:10] if updated_el is not None and updated_el.text else ""
            url = link_el.get("href", "") if link_el is not None else ""

            desc = ""
            if content_el is not None and content_el.text:
                desc_text = re.sub(r"<[^>]+>", "", content_el.text).strip()
                desc = desc_text[:200]

            if not title:
                continue

            tags = classify_ph_product(title, desc)
            products.append({
                "title": title,
                "description": desc,
                "url": url,
                "published": published,
                "updated": updated,
                "tags": tags,
                "source": "feed",
            })
    except Exception as e:
        print(f"  [WARN] PH feed parse error: {e}")

    return products


def fetch_ph_api() -> list[dict]:
    if not PH_TOKEN:
        print("  [SKIP] No PRODUCTHUNT_TOKEN — falling back to RSS feed")
        return []

    query = """
    query($after: String) {
        posts(first: 25, order: VOTES, after: $after) {
            edges {
                cursor
                node {
                    id name tagline description votesCount createdAt
                    topics { edges { node { name } } }
                    url
                }
            }
        }
    }"""

    all_posts = []
    cursor = None

    for page in range(2):
        variables = {"after": cursor}
        try:
            raw = _get(
                PH_API_URL,
                headers={
                    "Authorization": f"Bearer {PH_TOKEN}",
                    "Content-Type": "application/json",
                },
                data=json.dumps({"query": query, "variables": variables}).encode("utf-8"),
            )
            if not raw:
                return []
            body = json.loads(raw)
            edges = body.get("data", {}).get("posts", {}).get("edges", [])
            for edge in edges:
                node = edge.get("node", {})
                title = node.get("name", "")
                if not title:
                    continue
                topics = [t["node"]["name"] for t in node.get("topics", {}).get("edges", [])]
                desc = node.get("tagline", "") or node.get("description", "") or ""
                tags = classify_ph_product(title, desc)
                all_posts.append({
                    "title": title,
                    "description": desc[:200],
                    "votes": node.get("votesCount", 0),
                    "url": node.get("url", ""),
                    "createdAt": (node.get("createdAt") or "")[:10],
                    "topics": topics[:5],
                    "tags": tags,
                    "id": node.get("id"),
                    "source": "api",
                })
                cursor = edge.get("cursor")
            if not edges:
                break
        except Exception as e:
            print(f"  [WARN] PH API error: {e}")
            return []

    print(f"  Fetched {len(all_posts)} products from PH API")
    return all_posts


def fetch_ph_products() -> list[dict]:
    products = fetch_ph_api()
    if products:
        return products
    print("  Falling back to RSS feed...")
    products = fetch_ph_feed()
    return products


def pick_ph_winners(products: list[dict]) -> dict:
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    week_ago = (datetime.now(timezone.utc).date() - __import__("datetime").timedelta(days=7)).isoformat()

    # Sort by published date descending (most recent first)
    sorted_products = sorted(products, key=lambda p: p.get("published", p.get("createdAt", "")), reverse=True)

    # "Today" products
    today_products = [p for p in sorted_products if p.get("published", p.get("createdAt", ""))[:10] == today]
    top_today = today_products[0] if today_products else sorted_products[0] if sorted_products else None

    # #1 this week (most recent product from this week)
    week_products = [p for p in sorted_products if p.get("published", p.get("createdAt", ""))[:10] >= week_ago]
    week_products = week_products or sorted_products
    top_week = week_products[0] if week_products else None

    # AI #1 this week
    ai_weekly = [p for p in week_products if "AI" in p.get("tags", [])]
    top_ai = ai_weekly[0] if ai_weekly else None

    # Productivity #1 this week
    prod_weekly = [p for p in week_products if "Productivity" in p.get("tags", [])]
    top_prod = prod_weekly[0] if prod_weekly else None

    return {
        "top_today": top_today,
        "top_week": top_week,
        "top_ai_week": top_ai,
        "top_prod_week": top_prod,
        "count": len(products),
        "count_today": len(today_products),
        "count_week": len(week_products),
        "count_ai": len(ai_weekly),
        "count_prod": len(prod_weekly),
    }


# ---- main ----------------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print("Daily Top Picks Generator")
    print("=" * 60)

    print("\n1. GitHub Top Repos...")
    github = load_github_top()
    if github.get("today"):
        t = github["today"]
        print(f"   #1 today: {t['name']} (+{t['delta_1d']} stars)")
    if github.get("week"):
        w = github["week"]
        print(f"   #1 week: {w['name']} (+{w['delta_7d']} stars)")
    print(f"   Top 10 today: {len(github.get('top_today', []))} items")

    print("\n2. Product Hunt Top Products...")
    ph_products = fetch_ph_products()
    print(f"   {len(ph_products)} products fetched")

    print("\n3. Classifying & picking winners...")
    ph = pick_ph_winners(ph_products)
    print(f"   Top today: {ph['top_today']['title'] if ph['top_today'] else 'none'}")
    print(f"   AI #1: {ph['top_ai_week']['title'] if ph['top_ai_week'] else 'none'}")
    print(f"   Productivity #1: {ph['top_prod_week']['title'] if ph['top_prod_week'] else 'none'}")

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "github": github,
        "producthunt": {
            "products": ph_products[:50],
            "winners": ph,
        },
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"\n  Wrote {OUTPUT.relative_to(ROOT)} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
