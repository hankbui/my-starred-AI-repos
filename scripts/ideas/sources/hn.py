"""Hacker News Show HN — Algolia API (free, no key needed)"""

import hashlib
import re
from datetime import datetime, timezone

import requests


def detect_revenue_signal(text: str) -> str | None:
    patterns = [
        r"\$\d[\d,]*[kKmM]?\s*(MRR|ARR|mo|month|revenue|year|profit)",
        r"(MRR|ARR|revenue|profit)\s*[:\s]+\$?\d[\d,]*[kKmM]?",
        r"(made|earned|generating)\s+\$?\d[\d,]*[kKmM]?",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(0)
    return None


def fetch_hackernews(max_pages: int = 5) -> list[dict]:
    hits = []
    for page in range(max_pages):
        url = (
            f"https://hn.algolia.com/api/v1/search"
            f"?tags=show_hn&page={page}&hitsPerPage=50"
        )
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        page_hits = data.get("hits", [])
        if not page_hits:
            break
        hits.extend(page_hits)
    return hits


def parse_hackernews(hits: list[dict]) -> list[dict]:
    ideas = []
    for hit in hits:
        title = (hit.get("title") or "").strip()
        if not title:
            continue

        text = (hit.get("story_text") or "").strip()
        text_clean = re.sub(r"<[^>]+>", "", text)

        raw = title + " " + text_clean
        revenue = detect_revenue_signal(raw)

        unique = f"hn-{hit['objectID']}"
        idea_id = hashlib.sha256(unique.encode()).hexdigest()[:16]

        ideas.append(
            {
                "id": idea_id,
                "source": "hackernews",
                "title": title,
                "url": hit.get("url") or "",
                "description": text_clean[:1000],
                "revenue_signal": revenue,
                "category": "",
                "tags": [],
                "score": hit.get("points", 0),
                "num_comments": hit.get("num_comments", 0),
                "comments_url": f"https://news.ycombinator.com/item?id={hit['objectID']}",
                "date_published": hit.get("created_at", ""),
                "date_collected": datetime.now(timezone.utc).isoformat(),
                "raw_snippet": raw[:2000],
                "summary": "",
            }
        )
    return ideas


def run(max_pages: int = 5) -> list[dict]:
    hits = fetch_hackernews(max_pages)
    return parse_hackernews(hits)
