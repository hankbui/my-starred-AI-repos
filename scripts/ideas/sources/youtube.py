"""YouTube — build-in-public / startup idea videos via Data API v3

Requires YOUTUBE_API_KEY in env.
Rotates search queries per run to avoid stale results.
"""

import hashlib
import os
import random
from datetime import datetime, timedelta, timezone

import requests

SEARCH_QUERIES = [
    '"I built a" startup',
    '"build in public" SaaS',
    '"my SaaS" project',
    '"side project" launched',
    '"made $" online business',
    '"my first" product launch',
    '"I created" micro SaaS',
    '"building in public" indie',
]


def fetch_videos(api_key: str, query: str, max_results: int = 50) -> list[dict]:
    search_url = "https://www.googleapis.com/youtube/v3/search"
    search_params = {
        "part": "snippet",
        "q": query,
        "type": "video",
        "maxResults": min(max_results, 50),
        "order": "date",
        "relevanceLanguage": "en",
        "publishedAfter": (datetime.now(timezone.utc) - timedelta(days=365)).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "key": api_key,
    }
    resp = requests.get(search_url, params=search_params, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    items = data.get("items", [])
    if not items:
        return []

    video_ids = [item["id"]["videoId"] for item in items if item.get("id", {}).get("videoId")]

    details_url = "https://www.googleapis.com/youtube/v3/videos"
    details_params = {
        "part": "snippet,statistics",
        "id": ",".join(video_ids[:50]),
        "key": api_key,
    }
    resp2 = requests.get(details_url, params=details_params, timeout=30)
    resp2.raise_for_status()
    details_data = resp2.json()

    video_map = {}
    for item in data["items"]:
        vid = item.get("id", {}).get("videoId")
        if vid:
            video_map[vid] = item.get("snippet", {})

    for item in details_data.get("items", []):
        vid = item.get("id")
        if vid and vid in video_map:
            video_map[vid]["statistics"] = item.get("statistics", {})

    result = []
    for vid, snippet in video_map.items():
        stats = snippet.get("statistics", {})
        result.append({
            "id": vid,
            "title": snippet.get("title", ""),
            "description": snippet.get("description", ""),
            "channel_name": snippet.get("channelTitle", ""),
            "channel_id": snippet.get("channelId", ""),
            "published_at": snippet.get("publishedAt", ""),
            "view_count": int(stats.get("viewCount", 0)),
            "like_count": int(stats.get("likeCount", 0)),
            "comment_count": int(stats.get("commentCount", 0)),
            "tags": snippet.get("tags", []),
        })
    return result


def parse_videos(items: list[dict]) -> list[dict]:
    ideas = []
    seen = set()

    for item in items:
        video_id = item["id"]
        if video_id in seen:
            continue
        seen.add(video_id)

        title = (item["title"] or "").strip()
        if not title:
            continue

        description = (item["description"] or "").strip()[:1000]
        channel = item["channel_name"]
        views = item["view_count"]
        likes = item["like_count"]
        published = item["published_at"]

        unique = f"yt-{video_id}"
        idea_id = hashlib.sha256(unique.encode()).hexdigest()[:16]

        tags = item.get("tags", [])[:3]
        if channel:
            tags.insert(0, channel)

        ideas.append({
            "id": idea_id,
            "source": "youtube",
            "title": title,
            "url": f"https://youtube.com/watch?v={video_id}",
            "description": description,
            "revenue_signal": None,
            "category": "",
            "tags": tags[:5],
            "score": views,
            "num_comments": item["comment_count"],
            "comments_url": "",
            "date_published": published,
            "date_collected": datetime.now(timezone.utc).isoformat(),
            "raw_snippet": f"{title} {description}",
            "summary": "",
        })

    return ideas


def run(max_results: int = 50) -> list[dict]:
    api_key = os.environ.get("YOUTUBE_API_KEY")
    if not api_key:
        print("  [SKIP] YOUTUBE_API_KEY not set")
        return []

    query = random.choice(SEARCH_QUERIES)
    print(f"  Fetching YouTube (query: {query})...")

    try:
        items = fetch_videos(api_key, query, max_results)
        if not items:
            print("  [SKIP] No videos found")
            return []
        ideas = parse_videos(items)
        print(f"  Got {len(ideas)} videos")
        return ideas
    except Exception as e:
        print(f"  [WARN] YouTube failed: {e}")
        return []
