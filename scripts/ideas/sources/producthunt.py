"""Product Hunt — GraphQL API (needs free token from api.producthunt.com)"""

import hashlib
import os
from datetime import datetime, timezone

import requests


API_URL = "https://api.producthunt.com/v2/api/graphql"
FETCH_TOPICS = [  # Topics we care about
    "Education", "Productivity", "Developer Tools", "AI",
    "Mobile", "Web App", "SaaS", "Open Source",
]


def fetch_producthunt(token: str, pages: int = 5) -> list[dict]:
    posts = []
    cursor = None

    for _ in range(pages):
        query = """
        query($after: String) {
            posts(first: 50, order: VOTES, after: $after) {
                edges {
                    cursor
                    node {
                        id
                        name
                        tagline
                        description
                        votesCount
                        commentsCount
                        url
                        createdAt
                        topics(first: 5) {
                            edges { node { name } }
                        }
                    }
                }
                pageInfo { hasNextPage endCursor }
            }
        }
        """

        variables = {"after": cursor} if cursor else {}
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {token}",
        }
        resp = requests.post(
            API_URL,
            json={"query": query, "variables": variables},
            headers=headers,
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()

        if "errors" in data:
            raise RuntimeError(f"PH API error: {data['errors']}")

        page = data.get("data", {}).get("posts", {})
        edges = page.get("edges", [])
        if not edges:
            break

        for edge in edges:
            posts.append(edge["node"])

        if not page.get("pageInfo", {}).get("hasNextPage"):
            break
        cursor = page["pageInfo"]["endCursor"]

    return posts


def parse_producthunt(posts: list[dict]) -> list[dict]:
    ideas = []
    for post in posts:
        topics = [
            t["node"]["name"]
            for t in post.get("topics", {}).get("edges", [])
        ]

        raw = f"{post['name']} {post.get('tagline', '')} {post.get('description', '')}"
        revenue = None
        import re
        for pat in [
            r"\$\d[\d,]*[kKmM]?\s*(MRR|ARR|mo|month|revenue)",
            r"(MRR|revenue|profit)\s*[:\s]+\$?\d[\d,]*[kKmM]?",
        ]:
            m = re.search(pat, raw, re.IGNORECASE)
            if m:
                revenue = m.group(0)
                break

        unique = f"ph-{post['id']}"
        idea_id = hashlib.sha256(unique.encode()).hexdigest()[:16]

        ideas.append(
            {
                "id": idea_id,
                "source": "producthunt",
                "title": f"{post['name']} — {post.get('tagline', '')}",
                "url": post.get("url", ""),
                "description": (post.get("description") or "")[:1000],
                "revenue_signal": revenue,
                "category": topics[0] if topics else "",
                "tags": topics,
                "score": post.get("votesCount", 0),
                "num_comments": post.get("commentsCount", 0),
                "comments_url": post.get("url", ""),
                "date_published": post.get("createdAt", ""),
                "date_collected": datetime.now(timezone.utc).isoformat(),
                "raw_snippet": raw[:2000],
                "summary": "",
            }
        )
    return ideas


def run(pages: int = 5) -> list[dict]:
    token = os.getenv("PRODUCTHUNT_TOKEN")
    if not token:
        print("  [SKIP] PRODUCTHUNT_TOKEN not set")
        return []
    posts = fetch_producthunt(token, pages=pages)
    return parse_producthunt(posts)
