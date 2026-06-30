"""Reddit — r/SideProject, r/Entrepreneur, r/SaaS, r/IndieHackers

Needs free Reddit API app (script type) at https://www.reddit.com/prefs/apps
Set REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USER_AGENT in .env
"""

import hashlib
import os
import re
from datetime import datetime, timezone


KEYWORDS = [
    "MRR", "ARR", "made $", "revenue", "launched", "built a",
    "side project", "$", "profit", "users",
]

SUBREDDITS = ["SideProject", "Entrepreneur", "SaaS", "IndieHackers"]


def _reddit_auth():
    import requests

    client_id = os.getenv("REDDIT_CLIENT_ID")
    secret = os.getenv("REDDIT_CLIENT_SECRET")
    ua = os.getenv("REDDIT_USER_AGENT", "idea-scraper/0.1")

    if not client_id or not secret:
        return None

    auth = requests.auth.HTTPBasicAuth(client_id, secret)
    data = {"grant_type": "client_credentials"}
    headers = {"User-Agent": ua}
    resp = requests.post(
        "https://www.reddit.com/api/v1/access_token",
        auth=auth, data=data, headers=headers, timeout=30,
    )
    resp.raise_for_status()
    token = resp.json()["access_token"]
    headers["Authorization"] = f"Bearer {token}"
    return headers


def fetch_reddit(headers, subreddit: str, limit: int = 50) -> list[dict]:
    import requests

    url = f"https://oauth.reddit.com/r/{subreddit}/hot"
    params = {"limit": min(limit, 100)}
    resp = requests.get(
        url, headers=headers, params=params, timeout=30,
    )
    resp.raise_for_status()
    data = resp.json()
    return [c["data"] for c in data.get("data", {}).get("children", [])]


def detect_revenue_signal(text: str) -> str | None:
    patterns = [
        r"\$\d[\d,]*[kKmM]?\s*(MRR|ARR|mo|month|revenue|year|profit)",
        r"(MRR|ARR|revenue)\s*[:\s]+\$?\d[\d,]*[kKmM]?",
        r"(made|earned|generating)\s+\$?\d[\d,]*[kKmM]?",
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(0)
    return None


def relevant_post(post: dict) -> bool:
    text = (post.get("title") or "") + " " + (post.get("selftext") or "")
    text_lower = text.lower()
    return any(kw.lower() in text_lower for kw in KEYWORDS)


def parse_reddit(posts: list[dict], subreddit: str) -> list[dict]:
    ideas = []
    for post in posts:
        if not relevant_post(post):
            continue

        title = (post.get("title") or "").strip()
        body = (post.get("selftext") or "").strip()[:1000]
        raw = title + " " + body
        revenue = detect_revenue_signal(raw)

        unique = f"reddit-{subreddit}-{post['id']}"
        idea_id = hashlib.sha256(unique.encode()).hexdigest()[:16]

        ideas.append(
            {
                "id": idea_id,
                "source": "reddit",
                "title": title,
                "url": f"https://reddit.com/r/{subreddit}/comments/{post['id']}/",
                "description": body,
                "revenue_signal": revenue,
                "category": "",
                "tags": [subreddit],
                "score": post.get("score", 0),
                "num_comments": post.get("num_comments", 0),
                "comments_url": f"https://reddit.com/r/{subreddit}/comments/{post['id']}/",
                "date_published": datetime.fromtimestamp(
                    post.get("created_utc", 0), tz=timezone.utc
                ).isoformat(),
                "date_collected": datetime.now(timezone.utc).isoformat(),
                "raw_snippet": raw[:2000],
                "summary": "",
            }
        )
    return ideas


def run(limit_per_sub: int = 50) -> list[dict]:
    headers = _reddit_auth()
    if not headers:
        print("  [SKIP] REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set")
        return []

    all_ideas = []
    for sub in SUBREDDITS:
        try:
            posts = fetch_reddit(headers, sub, limit=limit_per_sub)
            ideas = parse_reddit(posts, sub)
            all_ideas.extend(ideas)
            print(f"  Reddit r/{sub}: collected {len(ideas)} relevant posts")
        except Exception as e:
            print(f"  [ERROR] Reddit r/{sub}: {e}")
    return all_ideas
