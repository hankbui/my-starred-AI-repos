"""IndieHackers — fetch stories via RSS feed (no API key needed)"""

import hashlib
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape

RSS_FEED_URL = "https://feed.indiehackers.world/posts.rss"


def strip_html(text: str) -> str:
    clean = re.sub(r"<[^>]+>", " ", text)
    clean = re.sub(r"\s+", " ", clean).strip()
    return unescape(clean)


def fetch_rss() -> list[dict]:
    req = urllib.request.Request(
        RSS_FEED_URL, headers={"User-Agent": "Mozilla/5.0"}
    )
    r = urllib.request.urlopen(req, timeout=30)
    body = r.read().decode("utf-8", errors="replace")

    root = ET.fromstring(body)
    items = []

    for item in root.findall(".//item"):
        title = item.findtext("title", "") or ""
        link = item.findtext("link", "") or ""
        pub_date = item.findtext("pubDate", "") or ""
        category = item.findtext("category", "") or ""

        content_ns = item.find(
            "{http://purl.org/rss/1.0/modules/content/}encoded"
        )
        description = (
            strip_html(content_ns.text)
            if content_ns is not None and content_ns.text
            else ""
        )

        items.append(
            {
                "title": title.strip(),
                "link": link.strip(),
                "description": description[:1000],
                "pubDate": pub_date,
                "category": category.strip(),
            }
        )

    return items


def extract_revenue(text: str) -> str | None:
    for pat in [
        r"\$\d[\d,]*[kKmM]?\s*(MRR|ARR|mo|month|revenue|year|profit)",
        r"(MRR|ARR|revenue|profit)\s*[:\s]+\$?\d[\d,]*[kKmM]?",
        r"(made|earned|generating)\s+\$?\d[\d,]*[kKmM]?",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(0)
    return None


def parse_date(date_str: str) -> str:
    if not date_str:
        return ""
    try:
        dt = parsedate_to_datetime(date_str)
        return dt.isoformat()
    except Exception:
        return date_str


def parse_indiehackers(feed_items: list[dict]) -> list[dict]:
    ideas = []
    seen = set()

    for item in feed_items:
        title = item["title"]
        if not title:
            continue

        unique_key = item["link"] or title[:40]
        if unique_key in seen:
            continue
        seen.add(unique_key)

        body = item["description"][:1000]
        raw = title + " " + body
        revenue = extract_revenue(raw)
        slug = unique_key.rstrip("/").split("/")[-1]
        unique = f"ih-{slug}"
        idea_id = hashlib.sha256(unique.encode()).hexdigest()[:16]

        ideas.append(
            {
                "id": idea_id,
                "source": "indiehackers",
                "title": title,
                "url": item["link"],
                "description": body,
                "revenue_signal": revenue,
                "category": item["category"],
                "tags": [item["category"]] if item["category"] else [],
                "score": 0,
                "num_comments": 0,
                "comments_url": "",
                "date_published": parse_date(item["pubDate"]),
                "date_collected": datetime.now(timezone.utc).isoformat(),
                "raw_snippet": raw[:2000],
                "summary": "",
            }
        )

    return ideas


def run(max_pages: int = 3) -> list[dict]:
    print("  Fetching IndieHackers from RSS feed (feed.indiehackers.world)...")
    try:
        feed_items = fetch_rss()
        if not feed_items:
            print("  [SKIP] No items from IndieHackers RSS feed")
            return []
        print(f"  Got {len(feed_items)} items from RSS feed")
        return parse_indiehackers(feed_items)
    except Exception as e:
        print(f"  [WARN] IndieHackers RSS failed: {e}")
        return []
