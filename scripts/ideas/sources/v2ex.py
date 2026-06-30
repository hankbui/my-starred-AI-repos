"""V2EX — Chinese developer community product sharing via JSON Feed

No API key needed. Uses the public JSON Feed at v2ex.com/feed/
"""

import hashlib
import re
import urllib.request
from datetime import datetime, timezone
from html import unescape

FEEDS = {
    "share": "https://www.v2ex.com/feed/share.json",
    "create": "https://www.v2ex.com/feed/create.json",
}


def strip_html(text: str) -> str:
    clean = re.sub(r"<[^>]+>", " ", text)
    clean = re.sub(r"\s+", " ", clean).strip()
    return unescape(clean)


def fetch_feed(url: str) -> list[dict]:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    r = urllib.request.urlopen(req, timeout=30)
    data = __import__("json").loads(r.read().decode())
    return data.get("items", [])


def is_relevant(title: str, description: str) -> bool:
    """Filter out non-product discussions."""
    keywords = [
        "发布", "上线", "开发", "做了", "写了", "创建", "分享",
        "免费", "开源", "工具", "app", "网站", "小程序",
        "macOS", "iOS", "Android", "Web", "Chrome",
        "项目", "产品", "GPT", "AI", "模型",
    ]
    text = (title + " " + description).lower()
    # Skip purely personal/daily life posts
    skip_keywords = [
        "为什么", "怎么", "请问", "求助", "吐槽",
        "结婚", "分手", "买房", "招聘", "面试",
    ]
    for sk in skip_keywords:
        if sk in text:
            return False
    for kw in keywords:
        if kw in text:
            return True
    return False


def scrape_v2ex(max_items: int = 50) -> list[dict]:
    items = []
    for feed_name, feed_url in FEEDS.items():
        try:
            feed_items = fetch_feed(feed_url)
            for item in feed_items:
                item["_section"] = feed_name
            items.extend(feed_items)
        except Exception as e:
            print(f"  [WARN] V2EX feed '{feed_name}': {e}")
    return items[:max_items]


def parse_v2ex(items: list[dict]) -> list[dict]:
    ideas = []
    seen = set()

    for item in items:
        title = item.get("title", "").strip()
        url = item.get("url", "")
        topic_id = item.get("id", "").split("/")[-1] if item.get("id") else ""

        if not title:
            continue
        if topic_id in seen:
            continue
        seen.add(topic_id)

        section = item.get("_section", "share")
        content_html = item.get("content_html", "")
        description = strip_html(content_html)[:1000]
        raw = title + " " + description

        author = ""
        author_obj = item.get("author", {})
        if isinstance(author_obj, dict):
            author = author_obj.get("name", "")

        date_published = item.get("date_published", "")
        date_modified = item.get("date_modified", "")

        # Detect revenue signals
        revenue = None
        for pat in [
            r"\$\d[\d,]*[kKmM]?\s*(MRR|ARR|mo|month|revenue|year|profit)",
            r"(MRR|ARR|revenue|profit)\s*[:\s]+\$?\d[\d,]*[kKmM]?",
            r"(made|earned|generating)\s+\$?\d[\d,]*[kKmM]?",
            r"(收入|赚|盈利|付费).{0,10}[\d,]+[万kK]?",
            r"[\d,]+[万kK]?.*(用户|下载|安装|收入)",
        ]:
            m = re.search(pat, raw, re.IGNORECASE)
            if m:
                revenue = m.group(0)
                break

        unique = f"v2ex-{topic_id}"
        idea_id = hashlib.sha256(unique.encode()).hexdigest()[:16]

        ideas.append(
            {
                "id": idea_id,
                "source": "v2ex",
                "title": title,
                "url": url,
                "description": description,
                "revenue_signal": revenue,
                "category": section,
                "tags": ["chinese", section],
                "score": 0,
                "num_comments": 0,
                "comments_url": url,
                "date_published": date_published or date_modified,
                "date_collected": datetime.now(timezone.utc).isoformat(),
                "raw_snippet": raw[:2000],
                "summary": "",
            }
        )

    return ideas


def run() -> list[dict]:
    print("  Fetching V2EX via JSON Feed...")
    try:
        items = scrape_v2ex(max_items=50)
        if not items:
            print("  [SKIP] No V2EX items found")
            return []
        ideas = parse_v2ex(items)
        print(f"  Got {len(ideas)} items from V2EX")
        return ideas
    except Exception as e:
        print(f"  [WARN] V2EX failed: {e}")
        return []
