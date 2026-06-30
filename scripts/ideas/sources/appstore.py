"""App Store + Google Play — top charts scraping

No API keys needed. Uses iTunes RSS feeds and google-play-scraper.
"""

import hashlib
import re
import time
from datetime import datetime, timezone

import requests


CATEGORIES = {
    "education": {
        "appstore": 6017,
        "playstore": "EDUCATION",
    },
    "productivity": {
        "appstore": 6007,
        "playstore": "PRODUCTIVITY",
    },
}


def _detect_revenue(text: str) -> str | None:
    for pat in [
        r"\$\d[\d,]*[kKmM]?\s*(MRR|ARR|mo|month|revenue|year|profit)",
        r"(MRR|ARR|revenue|profit)\s*[:\s]+\$?\d[\d,]*[kKmM]?",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(0)
    return None


# ── App Store ─────────────────────────────────────────────────────────


def fetch_appstore(category_id: int, country: str = "us", limit: int = 50) -> list[dict]:
    url = (
        f"https://itunes.apple.com/{country}/rss/topfreeapplications"
        f"/limit={limit}/genre={category_id}/json"
    )
    resp = requests.get(url, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    entries = data.get("feed", {}).get("entry", [])
    return entries


def parse_appstore(entries: list[dict], category: str) -> list[dict]:
    ideas = []
    for entry in entries:
        name = (
            entry.get("im:name", {}).get("label", "") if isinstance(entry, dict) else ""
        )
        if not name:
            continue

        desc = ""
        if isinstance(entry, dict):
            summary = entry.get("summary", {})
            if isinstance(summary, dict):
                desc = summary.get("label", "")

        app_id = ""
        if isinstance(entry, dict):
            id_obj = entry.get("id", {})
            if isinstance(id_obj, dict):
                app_id = id_obj.get("attributes", {}).get("im:id", "")
                app_url = id_obj.get("label", "")
            else:
                app_url = ""

        if not app_id:
            continue

        raw = name + " " + desc
        revenue = _detect_revenue(raw)

        unique = f"as-{app_id}"
        idea_id = hashlib.sha256(unique.encode()).hexdigest()[:16]

        # Get price info
        price_str = ""
        if isinstance(entry, dict):
            price = entry.get("im:price", {})
            if isinstance(price, dict):
                price_str = price.get("label", "")

        ideas.append(
            {
                "id": idea_id,
                "source": "appstore",
                "title": name,
                "url": app_url,
                "description": desc[:1000],
                "revenue_signal": revenue if "free" not in price_str.lower() else None,
                "category": category,
                "tags": [category, "ios"],
                "score": 0,
                "num_comments": 0,
                "comments_url": "",
                "date_published": "",
                "date_collected": datetime.now(timezone.utc).isoformat(),
                "raw_snippet": raw[:2000],
                "summary": "",
            }
        )
    return ideas


# ── Google Play ────────────────────────────────────────────────────────


def fetch_playstore(category_code: str, country: str = "us", limit: int = 50) -> list[dict]:
    try:
        from google_play_scraper import search  # type: ignore

        # Search queries for each category
        queries = {
            "EDUCATION": ["education", "learn language", "coding app"],
            "PRODUCTIVITY": ["productivity", "task manager", "note taking"],
        }

        query_list = queries.get(category_code, ["education"])
        seen_ids = set()
        apps = []

        for query in query_list:
            results = search(
                query,
                n_hits=min(limit, 50),
                lang="en",
                country=country,
            )
            for app in results if isinstance(results, list) else []:
                app_id = app.get("appId", "")
                if app_id and app_id not in seen_ids:
                    seen_ids.add(app_id)
                    apps.append(app)
            if len(apps) >= limit:
                break

        return apps[:limit]

    except ImportError:
        print("  [WARN] google-play-scraper not installed, skipping Play Store")
        return []
    except Exception as e:
        print(f"  [WARN] Play Store scrape failed: {e}")
        return []


def parse_playstore(apps: list[dict], category: str) -> list[dict]:
    ideas = []
    seen = set()

    for app in apps:
        if not isinstance(app, dict):
            continue
        title = app.get("title") or app.get("name") or ""
        if not title:
            continue
        app_id = app.get("appId") or app.get("id") or title
        if app_id in seen:
            continue
        seen.add(app_id)

        desc = (app.get("description") or app.get("summary") or "")[:1000]
        raw = title + " " + desc
        revenue = _detect_revenue(raw)

        unique = f"gp-{app_id}"
        idea_id = hashlib.sha256(unique.encode()).hexdigest()[:16]

        score = app.get("score", 0)
        if isinstance(score, (int, float)):
            score_val = int(score * 20)  # normalize to 0-100
        else:
            score_val = 0

        ideas.append(
            {
                "id": idea_id,
                "source": "playstore",
                "title": title,
                "url": f"https://play.google.com/store/apps/details?id={app_id}",
                "description": desc,
                "revenue_signal": revenue,
                "category": category,
                "tags": [category, "android", app.get("genre", "")],
                "score": score_val,
                "num_comments": app.get("reviews", 0),
                "comments_url": "",
                "date_published": "",
                "date_collected": datetime.now(timezone.utc).isoformat(),
                "raw_snippet": raw[:2000],
                "summary": "",
            }
        )
    return ideas


# ── Public runner ──────────────────────────────────────────────────────


def run() -> list[dict]:
    all_ideas = []
    import time

    # App Store — Education (VN + US)
    for country in ["us", "vn"]:
        try:
            entries = fetch_appstore(
                CATEGORIES["education"]["appstore"], country=country, limit=30
            )
            ideas = parse_appstore(entries, "education")
            all_ideas.extend(ideas)
            print(f"  App Store Education ({country.upper()}): {len(ideas)} apps")
            time.sleep(1)
        except Exception as e:
            print(f"  [WARN] App Store {country}: {e}")

    # App Store — Productivity (US)
    try:
        entries = fetch_appstore(
            CATEGORIES["productivity"]["appstore"], country="us", limit=30
        )
        ideas = parse_appstore(entries, "productivity")
        all_ideas.extend(ideas)
        print(f"  App Store Productivity (US): {len(ideas)} apps")
    except Exception as e:
        print(f"  [WARN] App Store productivity: {e}")

    # Google Play
    try:
        apps = fetch_playstore(
            CATEGORIES["education"]["playstore"], country="us", limit=30
        )
        ideas = parse_playstore(apps, "education")
        all_ideas.extend(ideas)
        print(f"  Play Store Education: {len(ideas)} apps")
    except Exception as e:
        print(f"  [WARN] Play Store: {e}")

    return all_ideas
