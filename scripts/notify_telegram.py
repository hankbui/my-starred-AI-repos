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
import tempfile
from datetime import datetime, timezone
from functools import partial
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = REPO_ROOT / "website" / "data"
WEBSITE_DIR = REPO_ROOT / "website"
SITE_URL = "https://hankbui.github.io/my-starred-AI-repos/"
TOP_N = 5

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "").strip()
CHANNEL = os.getenv("TELEGRAM_CHANNEL", "").strip()

API = "https://api.telegram.org/bot{token}/{method}"


def load_threads():
    """Return {section_key: message_thread_id} from the TG_THREADS JSON secret."""
    raw = os.getenv("TG_THREADS", "").strip()
    if not raw:
        return {}
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        print("[telegram] TG_THREADS is not valid JSON — ignoring.")
        return {}
    threads = {}
    for key, value in data.items():
        try:
            threads[key] = int(value)
        except (TypeError, ValueError):
            print(f"[telegram] TG_THREADS key '{key}' is not a number — ignoring.")
    return threads


def esc(text: str) -> str:
    return html.escape(html.unescape(str(text)))


def truncate(text: str, limit: int = 220) -> str:
    text = str(text).strip()
    if len(text) <= limit:
        return text
    return text[: limit - 1].rstrip() + "…"


def load(name: str):
    for base in (DATA_DIR, WEBSITE_DIR):
        path = base / name
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
    return None


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


def build_agent_skills(data: dict) -> str:
    stats = data.get("stats") or {}
    agents = data.get("agents") or []
    skills = data.get("skills") or []

    def key(item):
        return int(item.get("trend_score") or 0)

    top_agents = sorted(agents, key=key, reverse=True)[:3]
    top_skills = sorted(skills, key=key, reverse=True)[:3]
    lines = [section_header("🤖 Agent & Skills")]
    lines.append(
        f"• {int(stats.get('agents') or 0):,} agents · {int(stats.get('skills') or 0):,} skills · "
        f"{int(stats.get('use_cases') or 0):,} use cases"
    )
    lines.append("")
    lines.append("<b>Agents:</b>")
    for item in top_agents:
        lines.append(
            f"• <a href='{esc(item['url'])}'>{esc(item['name'])}</a> "
            f"— {int(item.get('stars') or 0):,}⭐ (+{int(item.get('delta_7d') or 0):,}/7d)"
        )
    lines.append("")
    lines.append("<b>Skills:</b>")
    for item in top_skills:
        lines.append(
            f"• <a href='{esc(item['url'])}'>{esc(item['name'])}</a> "
            f"— {esc(truncate(item.get('description') or '', 100))}"
        )
    return "\n".join(lines)


def build_tech_radar(data: dict) -> str:
    brief = data.get("brief") or []
    top_cards = data.get("top_cards") or []
    techs = data.get("technologies") or []
    opps = data.get("product_opportunities") or []
    lines = [section_header("🛰️ Tech Radar")]
    if brief:
        lines.append(esc(truncate(brief[0], 280)))
    rising = [t for t in techs if (t.get("trend") or "") == "rising"][:5]
    if rising:
        lines.append("")
        lines.append("<b>Công nghệ đang lên:</b> " + " · ".join(esc(t.get("name") or "") for t in rising))
    if opps:
        lines.append("")
        lines.append("<b>Cơ hội sản phẩm:</b>")
        for o in opps[:3]:
            lines.append(f"• {esc(truncate(o.get('idea') or '', 140))} <i>(value {o.get('business_value')}/10)</i>")
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


def send(text: str, thread_id=None) -> bool:
    payload = {
        "chat_id": CHANNEL,
        "text": text,
        "parse_mode": "HTML",
        "disable_web_page_preview": False,
    }
    if thread_id is not None:
        payload["message_thread_id"] = thread_id
    try:
        resp = requests.post(
            API.format(token=TOKEN, method="sendMessage"),
            json=payload,
            timeout=20,
        )
        data = resp.json()
        if data.get("ok"):
            return True
        print(f"[telegram] sendMessage error: {data.get('description')}")
    except Exception as exc:  # noqa: BLE001
        print(f"[telegram] sendMessage failed: {exc}")
    return False


def _pdf_clean(text: str) -> str:
    text = str(text)
    for before, after in (
        ("—", "-"), ("–", "-"), ("…", "..."), ("·", ". "),
        ("‘", "'"), ("’", "'"), ("“", '"'), ("”", '"'),
        ("•", "- "), ("›", ">"), ("»", ">>"), ("«", "<<"),
    ):
        text = text.replace(before, after)
    return "".join(ch for ch in text if ord(ch) < 0x2FFF and ch not in "\x00")


def build_report_pdf(data: dict, out_dir: Path) -> Path:
    """Render the full market report to a PDF that Telegram previews inline."""
    try:
        from fpdf import FPDF
    except ImportError:
        print("[telegram] fpdf2 not installed — skipping PDF attachment.")
        return None

    pdf = FPDF(format="A4", unit="mm")
    pdf.set_auto_page_break(auto=True, margin=15)

    font = None
    for candidate in (
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans.ttf",
    ):
        if Path(candidate).exists():
            font = candidate
            break
    if font:
        pdf.add_font("sans", "", font, uni=True)
        pdf.add_font("sans", "B", str(font).replace("DejaVuSans.ttf", "DejaVuSans-Bold.ttf"), uni=True)
    else:
        pdf.set_font("helvetica", size=11)

    def f(size, style="B"):
        pdf.set_font("sans" if font else "helvetica", style=style, size=size)
        pdf.set_x(pdf.l_margin)

    pdf.add_page()
    f(18)
    pdf.multi_cell(0, 9, _pdf_clean(f"AI Opportunity Report — {data.get('date') or ''}"))
    f(10, "")
    pdf.multi_cell(0, 5, _pdf_clean("Model: %s  |  Backend: %s" % (data.get("model") or "-", data.get("backend") or "-")))
    pdf.ln(3)

    for brief in (data.get("brief") or []):
        f(11, "")
        pdf.multi_cell(0, 6, _pdf_clean(brief))
        pdf.ln(2)

    for item in (data.get("items") or []):
        pdf.add_page()
        f(13)
        pdf.multi_cell(0, 8, _pdf_clean(item.get("name") or ""))
        f(9, "")
        pdf.cell(0, 5, _pdf_clean(
            f"{int(item.get('stars') or 0):,} stars  ·  +{int(item.get('delta_7d') or 0):,} in 7d  ·  "
            f"timing: {item.get('timing') or 'n/a'}"), new_x="LMARGIN", new_y="NEXT")
        pdf.ln(2)
        if item.get("one_liner"):
            f(10, "")
            pdf.multi_cell(0, 5, _pdf_clean("One-liner: " + item["one_liner"]))
        if item.get("pain_point"):
            f(10, "")
            pdf.multi_cell(0, 5, _pdf_clean("Pain point: " + item["pain_point"]))
        ideas = item.get("app_ideas") or []
        if ideas:
            f(10, "")
            pdf.multi_cell(0, 5, _pdf_clean("App ideas:"))
            for idea in ideas[:3]:
                f(10, "")
                pdf.multi_cell(0, 5, _pdf_clean("  • " + str(idea)))
        if item.get("monetization"):
            f(10, "")
            pdf.multi_cell(0, 5, _pdf_clean("Monetization: " + str(item["monetization"])))

    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"ai-opportunity-report-{data.get('date') or 'latest'}.pdf"
    pdf.output(str(path))
    return path


def send_document(path: Path, caption: str, thread_id=None) -> bool:
    payload = {
        "chat_id": CHANNEL,
        "caption": caption,
        "parse_mode": "HTML",
    }
    if thread_id is not None:
        payload["message_thread_id"] = thread_id
    try:
        with open(path, "rb") as handle:
            resp = requests.post(
                API.format(token=TOKEN, method="sendDocument"),
                data=payload,
                files={"document": (path.name, handle)},
                timeout=60,
            )
        data = resp.json()
        if data.get("ok"):
            return True
        print(f"[telegram] sendDocument error: {data.get('description')}")
    except Exception as exc:  # noqa: BLE001
        print(f"[telegram] sendDocument failed: {exc}")
    return False


def main():
    if not TOKEN or not CHANNEL:
        print("Telegram not configured (TELEGRAM_BOT_TOKEN / TELEGRAM_CHANNEL). Skipping.")
        return

    today = datetime.now(timezone.utc).date().isoformat()
    threads = load_threads()
    messages = [(build_header(today), None)]

    sections = (
        ("daily-top.json", build_daily_top, "github"),
        ("hf-daily.json", build_hf_daily, "hf"),
        ("report.json", build_report, "report"),
        ("ideas.json", partial(build_ideas, today=today), "ideas"),
        ("automation.json", build_automation, "automation"),
        ("agent-skills.json", build_agent_skills, "agentskills"),
        ("research/json/latest.json", build_tech_radar, "techradar"),
    )
    for filename, builder, key in sections:
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
            messages.append((section, threads.get(key)))

    messages.append((build_footer(subscriber_count()), None))

    for text, thread_id in messages:
        if not send(text, thread_id=thread_id):
            print("Aborting — stop posting remaining sections to avoid a broken digest.")
            sys.exit(1)

    report = load("report.json")
    if report:
        tmp = Path(tempfile.gettempdir())
        pdf_path = build_report_pdf(report, tmp)
        if pdf_path is not None and not send_document(pdf_path, "📄 Full AI Opportunity Report (PDF) — đọc ngay trong Telegram", thread_id=threads.get("report")):
            sys.exit(1)


if __name__ == "__main__":
    main()
