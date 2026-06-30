"""36Kr — Chinese startup & tech news via RSS feed

No API key needed. Uses the public RSS feed at 36kr.com/feed
"""

import hashlib
import re
import urllib.request
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from html import unescape

RSS_URL = "https://36kr.com/feed"


def strip_html(text: str) -> str:
    clean = re.sub(r"<[^>]+>", " ", text)
    clean = re.sub(r"\s+", " ", clean).strip()
    return unescape(clean)


def fetch_feed() -> list[dict]:
    req = urllib.request.Request(RSS_URL, headers={"User-Agent": "Mozilla/5.0"})
    r = urllib.request.urlopen(req, timeout=30)
    body = r.read().decode("utf-8", errors="replace")

    root = ET.fromstring(body)
    items = []

    for item in root.findall(".//item"):
        title = item.findtext("title", "") or ""
        link = item.findtext("link", "") or ""
        pub_date = item.findtext("pubDate", "") or ""
        description_html = item.findtext("description", "") or ""
        description = strip_html(description_html)[:1000]

        items.append(
            {
                "title": title.strip(),
                "link": link.strip(),
                "description": description,
                "pubDate": pub_date,
            }
        )

    return items


def extract_funding(text: str) -> str | None:
    """Extract Chinese funding signals."""
    for pat in [
        r"(融资|获投|募资|估值|融资额).{0,20}[\d,]+[亿万kK]?",
        r"[\d,]+[亿万kK]?.*(融资|估值|投资|募资|营收|ARR)",
        r"\$[\d,]+[kKmM]?.*(funding|raise|valuation|ARR|MRR)",
        r"(raised|funding|valuation)\s+\$?[\d,]+[kKmMbB]?",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(0)
    return None


def extract_tags(title: str, description: str) -> list[str]:
    tags = []
    text = title + " " + description
    sector_map = {
        "AI|人工智能|大模型|LLM|GPT|机器学习": "AI",
        "芯片|半导体|集成电路": "Semiconductor",
        "新能源|电动车|电池|光伏": "CleanTech",
        "医疗|生物|医药|健康": "Health",
        "SaaS|企业服务|云|云计算": "Enterprise",
        "机器人|自动化|具身": "Robotics",
        "消费|零售|电商|品牌": "Consumer",
        "金融|支付|保险|区块链": "FinTech",
        "航天|卫星|航空|空间": "Space",
        "教育|培训|学习": "Education",
    }
    for pattern, tag in sector_map.items():
        if re.search(pattern, text, re.IGNORECASE):
            tags.append(tag)
    return tags[:5]


def parse(items: list[dict]) -> list[dict]:
    ideas = []
    seen = set()

    for item in items:
        title = item["title"]
        if not title:
            continue

        link = item["link"]
        if link in seen:
            continue
        seen.add(link)

        description = item["description"]
        raw = title + " " + description
        funding = extract_funding(raw)
        tags = extract_tags(title, description)

        unique = f"36kr-{link.split('/')[-1]}" if "/" in link else f"36kr-{hash(link) % 10**8}"
        idea_id = hashlib.sha256(unique.encode()).hexdigest()[:16]

        ideas.append(
            {
                "id": idea_id,
                "source": "thirtysixkr",
                "title": title,
                "url": link,
                "description": description,
                "revenue_signal": funding,
                "category": tags[0] if tags else "Tech",
                "tags": tags + ["chinese"],
                "score": 0,
                "num_comments": 0,
                "comments_url": "",
                "date_published": item["pubDate"],
                "date_collected": datetime.now(timezone.utc).isoformat(),
                "raw_snippet": raw[:2000],
                "summary": "",
            }
        )

    return ideas


def run() -> list[dict]:
    print("  Fetching 36Kr via RSS feed...")
    try:
        items = fetch_feed()
        if not items:
            print("  [SKIP] No 36Kr items found")
            return []
        ideas = parse(items)
        print(f"  Got {len(ideas)} items from 36Kr")
        return ideas
    except Exception as e:
        print(f"  [WARN] 36Kr failed: {e}")
        return []
