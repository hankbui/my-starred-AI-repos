#!/usr/bin/env python3
"""
Post a daily digest to a public Telegram channel.

Reads the freshly generated JSON data (website/data/*) and sends one
concise message per page section. Anyone can subscribe simply by joining
the channel. The bot also reports how many members the channel has.

Config via environment variables:
  TELEGRAM_BOT_TOKEN  (required)  — token from @BotFather
  TELEGRAM_CHANNEL    (required)  — channel @username or numeric chat id

Exits 0 silently when the token/channel are not configured, so the GitHub
Actions workflow never breaks before the secrets are added.
"""

import html
import json
import os
import sys
from datetime import datetime, timezone
from functools import partial
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "website" / "data"
SITE_URL = "https://hankbui.github.io/my-starred-AI-repos/"
TOP_N = 5

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
CHANNEL = os.getenv("TELEGRAM_CHANNEL", "").strip()

API = "https://api.telegram.org/bot{token}/{method}"


def esc(text: str) -> str:
    return html.escape(html.unescape(str(text)))


def truncate(text: str, limit: int = 220) -> str:
    text = str(text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def load(name: str):
    path = DATA_DIR / name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


def section_header(title: str) -> str:
    return f"<b>📌 {esc(title)}</b>"


def build_header(today: str) -> str:
    lines = [
        "<b>🤖 AI Repos — Daily Digest</b>",
        f"📅 {today}",
        f"🔗 <a href='{SITE_URL}'>Open the directory</a>",
        "",
    ]
    return "\n".join(lines)


def build_daily_top(data: dict) -> str:
    gh = (data.get("github") or {}).get("top_today") or []
    ph = (data.get("producthunt") or {}).get("winners") or {}
    lines = [section_header("⭐ Top GitHub repos hôm nay")]
    for item in gh[:TOP_N]:
        delta = int(item.get("delta_1d") or 0)
        star = f"▴ +{delta:,}⭐" if delta else f"{int(item.get('stars') or 0):,}⭐"
        lines.append(
            f"• <a href='{esc(item['url'])}'>{esc(item['name'])}</a> — {star}\n"
            f"  {esc(truncate(item.get('description') or '', 160))}"
        )
    ph_winner = ph.get("top_today") or {}
    if ph_winner.get("title"):
        lines.append("")
        lines.append(f"🚀 <b>Product Hunt hôm nay:</b> <a href='{esc(ph_winner['url'])}'>{esc(ph_winner['title'])}</a>")
    return "\n".join(lines)


def build_hf_daily(data: dict) -> str:
    digest = (data.get("digest") or {}).get("highlights") or {}
    top_paper = digest.get("top_paper") or {}
    top_models = digest.get("top_models") or []
    lines = [section_header("🧠 Hugging Face Daily")]
    if top_paper.get("title"):
        lines.append(
            f"<b>Paper:</b> <a href='{esc(top_paper.get('url') or '#')}'>{esc(top_paper['title'])}</a>\n"
            f"  {esc(truncate(top_paper.get('summary') or '', 180))}"
        )
    if top_models:
        lines.append("")
        lines.append(f"<b>Models:</b>")
        for m in top_models[:TOP_N]:
            downloads = int(m.get("downloads") or 0)
            tail = f" — {downloads:,} downloads" if downloads else ""
            lines.append(f"• <a href='{esc(m['url'])}'>{esc(m['name'])}</a>{tail}")
    return "\n".join(lines)


def build_report(data: dict) -> str:
    brief = data.get("brief") or []
    items = data.get("items") or []
    lines = [section_header("📈 AI Opportunity Report")]
    if brief:
        lines.append(esc(brief[0]))
        lines.append("")
    lines.append("<b>Breakout picks:</b>")
    for item in items[:TOP_N]:
        timing = item.get("timing") or ""
        badge = "🔥" if timing == "breakout" else "📈"
        lines.append(
            f"• {badge} <a href='{esc(item['url'])}'>{esc(item['name'])}</a> "
            f"(+{int(item.get('delta_7d') or 0):,}⭐/7d) — {esc(truncate(item.get('one_liner') or '', 140))}"
        )
    return "\n".join(lines)


def build_ideas(data: dict, today: str) -> str:
    ideas = data.get("ideas") or []
    by_date = {}
    for item in ideas:
        by_date.setdefault(str(item.get("created_at") or "")[:10], []).append(item)
    todays = by_date.pop(today, None) or (by_date.pop(max(by_date), None) if by_date else None)
    todays = todays or []
    todays.sort(key=lambda x: int(x.get("composite_score") or 0), reverse=True)
    lines = [section_header("💡 Startup Ideas mới")]
    for item in todays[:TOP_N]:
        src = (item.get("source") or "?").title()
        signal = item.get("revenue_signal") or ""
        tail = f" — 💰 {esc(signal)}" if signal else ""
        lines.append(
            f"• <a href='{esc(item.get('url') or item.get('comments_url') or '#')}'>{esc(truncate(item.get('title') or '', 120))}</a>"
            f" <i>({esc(src)})</i>{tail}"
        )
    if not todays:
        return ""
    return "\n".join(lines)


def build_automation(data: dict) -> str:
    stats = data.get("stats") or {}
    by_section = stats.get("by_section") or {}
    lines = [section_header("⚙️ Automation Radar")]
    lines.append(f"• {int(stats.get('total_repos') or 0):,} repos theo dõi · {int(stats.get('total_stars') or 0):,} ⭐ · +{int(stats.get('total_stars_7d') or 0):,}⭐/7d")
    top_sections = sorted(by_section.items(), key=lambda kv: kv[1], reverse=True)[:5]
    if top_sections:
        lines.append("")
        lines.append("Theo phân khúc:")
        for name, count in top_sections:
            lines.append(f"• {esc(name)} — {count:,}")
    return "\n".join(lines)


def build_footer(member_count) -> str:
    lines = ["", "—", "✅ Subscribe: nhấn Join để nhận tin mỗi ngày."]
    if member_count is not None:
        lines.append(f"👥 {member_count:,} người đang nhận tin.")
    lines.append(f"🌐 {SITE_URL}")
    return "\n".join(lines)


def subscriber_count():
    try:
        resp = requests.get(
            API.format(token=TOKEN, method="getChatMemberCount"),
            params={"chat_id": CHANNEL},
            timeout=15,
        )
        data = resp.json()
        if data.get("ok"):
            return int(data["result"])
        print(f"[telegram] getChatMemberCount error: {data.get('description')}")
    except Exception as exc:  # noqa: BLE001 — network hiccup should not kill the run
        print(f"[telegram] getChatMemberCount failed: {exc}")
    return None


def send(text: str) -> bool:
    try:
        resp = requests.post(
            API.format(token=TOKEN, method="sendMessage"),
            json={
                "chat_id": CHANNEL,
                "text": text,
                "parse_mode": "HTML",
                "disable_web_page_preview": False,
            },
            timeout=20,
        )
        data = resp.json()
        if data.get("ok"):
            return True
        print(f"[telegram] sendMessage error: {data.get('description')}")
    except Exception as exc:  # noqa: BLE001
        print(f"[telegram] sendMessage failed: {exc}")
    return False


def main():
    if not TOKEN or not CHANNEL:
        print("Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL). Skipping.")
        return

    today = datetime.now(timezone.utc).date().isoformat()
    messages = [build_header(today)]

    sections = (
        ("daily-top.json", build_daily_top),
        ("hf-daily.json", build_hf_daily),
        ("report.json", build_report),
        ("ideas.json", partial(build_ideas, today=today)),
        ("automation.json", build_automation),
    )
    for filename, builder in sections:
        data = load(filename)
        if data is None:
            print(f"[telegram] {filename} missing — section skipped.")
            continue
        try:
            section = builder(data)
        except Exception as exc:  # noqa: BLE001
            print(f"[telegram] failed building section from {filename}: {exc}")
            continue
        if section:
            messages.append(section)

    messages.append(build_footer(subscriber_count()))

    for text in messages:
        if not send(text):
            print("Aborting — stop posting remaining sections to avoid a broken digest.")
            sys.exit(1)


if __name__ == "__main__":
    main()
