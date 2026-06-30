"""Reddit — r/SideProject, r/Entrepreneur, r/SaaS, r/IndieHackers

Two modes, auto-selected:
  1. OAuth  — if REDDIT_CLIENT_ID + REDDIT_CLIENT_SECRET are set (recommended,
     works everywhere incl. GitHub Actions). Create a free "script" app at
     https://www.reddit.com/prefs/apps
  2. Public — no app / token needed; reads the public ``.rss`` (Atom) feed with a
     browser-like User-Agent (Reddit now hard-blocks the ``.json`` endpoints for
     non-browser agents). Works from a normal IP (your machine / local cron);
     ``score``/``num_comments`` are unavailable via RSS and default to 0. From a
     blocked/rate-limited IP (e.g. GitHub Actions runners) it 403/429s and this
     source skips itself cleanly.

Set REDDIT_USER_AGENT in .env to a unique string (Reddit throttles generic ones).
"""

import hashlib
import os
import re
import time
from datetime import datetime, timezone


KEYWORDS = [
    "MRR", "ARR", "made $", "revenue", "launched", "built a",
    "side project", "$", "profit", "users",
]

SUBREDDITS = ["SideProject", "Entrepreneur", "SaaS", "IndieHackers"]

# Reddit rejects/throttles generic agents like "python-requests"; use a unique one.
DEFAULT_USER_AGENT = "idea-scraper/0.1 (by /u/idea-scraper)"

# Reddit hard-blocks the public .json endpoints for non-browser agents (HTTP 403),
# but still serves the public .rss (Atom) feed to a browser-like agent. The public
# fallback therefore reads RSS with this UA.
PUBLIC_BROWSER_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
)

# Unauthenticated RSS is rate-limited hard; pace requests and back off on 429.
PUBLIC_REQUEST_DELAY_SEC = 12
PUBLIC_MAX_RETRIES = 4
PUBLIC_RETRY_WAIT_SEC = 20


def _reddit_auth():
    import requests

    client_id = os.getenv("REDDIT_CLIENT_ID")
    secret = os.getenv("REDDIT_CLIENT_SECRET")
    ua = os.getenv("REDDIT_USER_AGENT") or DEFAULT_USER_AGENT

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


_HTML_TAG_RE = re.compile(r"<[^>]+>")
_REDDIT_ID_RE = re.compile(r"/comments/([a-z0-9]+)/", re.IGNORECASE)


def _strip_html(html: str) -> str:
    """Reddit RSS <content> is escaped HTML — unescape, drop tags, collapse space."""
    from html import unescape

    text = _HTML_TAG_RE.sub(" ", unescape(html or ""))
    return re.sub(r"\s+", " ", text).strip()


def _reddit_id_from(entry_id: str, link: str) -> str:
    """Extract the base36 post id from the Atom <id> (``t3_xxx``) or permalink."""
    if entry_id and entry_id.startswith("t3_"):
        return entry_id[3:]
    match = _REDDIT_ID_RE.search(link or "")
    return match.group(1) if match else (entry_id or "unknown")


def _iso_to_unix(value: str) -> float:
    """Atom <published> (e.g. ``2026-06-30T20:14:06+00:00``) -> unix seconds."""
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (ValueError, AttributeError):
        return 0.0


def fetch_reddit_public(subreddit: str, limit: int = 50, ua: str = PUBLIC_BROWSER_UA) -> list[dict]:
    """No-auth fallback: read the public ``.rss`` (Atom) feed — no app/token needed.

    Returns pseudo-posts shaped like ``fetch_reddit`` output (``title``,
    ``selftext``, ``id``, ``created_utc``; ``score``/``num_comments`` default to 0
    since RSS doesn't expose them) so ``parse_reddit`` works unchanged. Raises on
    non-2xx (e.g. 403/429 from a blocked/rate-limited IP) so the caller can skip.
    """
    import requests
    import xml.etree.ElementTree as ET

    url = f"https://www.reddit.com/r/{subreddit}/hot.rss"
    params = {"limit": min(limit, 100)}
    headers = {
        "User-Agent": ua,
        "Accept": "application/atom+xml, application/xml, text/xml, */*",
    }

    resp = None
    for attempt in range(PUBLIC_MAX_RETRIES):
        resp = requests.get(url, headers=headers, params=params, timeout=30)
        if resp.status_code == 429 and attempt < PUBLIC_MAX_RETRIES - 1:
            retry_after = resp.headers.get("Retry-After")
            base = float(retry_after) if (retry_after or "").replace(".", "", 1).isdigit() else PUBLIC_RETRY_WAIT_SEC
            # Exponential-ish backoff, capped.
            time.sleep(min(base * (attempt + 1), 60))
            continue
        break
    resp.raise_for_status()

    ns = {"atom": "http://www.w3.org/2005/Atom"}
    root = ET.fromstring(resp.content)

    posts = []
    for entry in root.findall("atom:entry", ns):
        link_el = entry.find("atom:link", ns)
        link = link_el.get("href") if link_el is not None else ""
        entry_id = entry.findtext("atom:id", default="", namespaces=ns) or ""
        content_html = entry.findtext("atom:content", default="", namespaces=ns) or ""
        published = entry.findtext("atom:published", default="", namespaces=ns) or ""

        posts.append(
            {
                "id": _reddit_id_from(entry_id, link),
                "title": (entry.findtext("atom:title", default="", namespaces=ns) or "").strip(),
                "selftext": _strip_html(content_html),
                "score": 0,
                "num_comments": 0,
                "created_utc": _iso_to_unix(published),
            }
        )
    return posts


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
    use_oauth = headers is not None
    if use_oauth:
        print("  Reddit: using OAuth (client credentials)")
    else:
        print("  Reddit: no API credentials — falling back to public RSS (no token)")

    all_ideas = []
    blocked = False

    for index, sub in enumerate(SUBREDDITS):
        try:
            if use_oauth:
                posts = fetch_reddit(headers, sub, limit=limit_per_sub)
            else:
                # Be polite to the public feed to avoid 429s.
                if index > 0:
                    time.sleep(PUBLIC_REQUEST_DELAY_SEC)
                posts = fetch_reddit_public(sub, limit=limit_per_sub)

            ideas = parse_reddit(posts, sub)
            all_ideas.extend(ideas)
            print(f"  Reddit r/{sub}: collected {len(ideas)} relevant posts")
        except Exception as e:
            status = getattr(getattr(e, "response", None), "status_code", None)
            if not use_oauth and status in (403, 429):
                blocked = True
            print(f"  [ERROR] Reddit r/{sub}: {e}")

    if blocked and not all_ideas:
        print(
            "  [SKIP] Public Reddit RSS was blocked (HTTP 403/429) — this IP is "
            "likely a datacenter/runner. Set REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET "
            "for OAuth, or run from a normal IP."
        )

    return all_ideas
