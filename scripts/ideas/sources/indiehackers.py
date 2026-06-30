"""IndieHackers — scrape public stories (no API, careful rate limiting)"""

import hashlib
import re
import time
from datetime import datetime, timezone

import requests


BASE_URL = "https://www.indiehackers.com"


def scrape_stories(max_pages: int = 3) -> list[dict]:
    stories = []
    session = requests.Session()
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Accept": "text/html,application/xhtml+xml",
        }
    )

    for page in range(1, max_pages + 1):
        try:
            url = f"{BASE_URL}/stories?page={page}" if page > 1 else f"{BASE_URL}/stories"
            resp = session.get(url, timeout=30)
            resp.raise_for_status()
            html = resp.text

            # Extract story cards — IndieHackers uses predictable structure
            # Pattern: find story links in the page
            story_links = re.findall(
                r'href="(/story/[^"]+)"[^>]*>([^<]+)', html
            )

            # Also try to get the JSON-embedded data
            json_matches = re.findall(
                r'<script[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>',
                html, re.DOTALL,
            )

            if json_matches:
                import json as j
                try:
                    data = j.loads(json_matches[0])
                    # Navigate through the Next.js data structure
                    props = (
                        data.get("props", {})
                        .get("pageProps", {})
                    )
                    stories_list = (
                        props.get("stories") or props.get("posts") or []
                    )
                    for s in stories_list:
                        stories.append(s)
                except (j.JSONDecodeError, KeyError, TypeError):
                    pass

            time.sleep(2.0)  # Be polite

        except requests.RequestException as e:
            print(f"  [WARN] IndieHackers page {page}: {e}")
            break

    return stories


def parse_indiehackers(stories: list[dict]) -> list[dict]:
    ideas = []
    seen = set()

    for story in stories:
        title = story.get("title") or ""
        if not title:
            continue

        slug = story.get("slug") or ""
        unique_key = slug or title[:40]
        if unique_key in seen:
            continue
        seen.add(unique_key)

        body = (story.get("description") or story.get("excerpt") or "")[:1000]
        raw = title + " " + body
        revenue = None
        for pat in [
            r"\$\d[\d,]*[kKmM]?\s*(MRR|ARR|mo|month|revenue|year|profit)",
            r"(MRR|ARR|revenue|profit)\s*[:\s]+\$?\d[\d,]*[kKmM]?",
            r"(made|earned|generating)\s+\$?\d[\d,]*[kKmM]?",
        ]:
            m = re.search(pat, raw, re.IGNORECASE)
            if m:
                revenue = m.group(0)
                break

        unique = f"ih-{slug or unique_key}".replace("/", "-")
        idea_id = hashlib.sha256(unique.encode()).hexdigest()[:16]

        ideas.append(
            {
                "id": idea_id,
                "source": "indiehackers",
                "title": title,
                "url": f"{BASE_URL}/story/{slug}" if slug else "",
                "description": body,
                "revenue_signal": revenue,
                "category": "",
                "tags": story.get("tags", []),
                "score": story.get("upvotes", 0),
                "num_comments": story.get("commentsCount", 0),
                "comments_url": f"{BASE_URL}/story/{slug}#comments" if slug else "",
                "date_published": story.get("createdAt", ""),
                "date_collected": datetime.now(timezone.utc).isoformat(),
                "raw_snippet": raw[:2000],
                "summary": "",
            }
        )
    return ideas


def run(max_pages: int = 3) -> list[dict]:
    print("  Scraping IndieHackers (rate-limited to 2s/page)...")
    stories = scrape_stories(max_pages)
    if not stories:
        print("  [SKIP] Could not extract IndieHackers data (page structure may have changed)")
        return []
    return parse_indiehackers(stories)
