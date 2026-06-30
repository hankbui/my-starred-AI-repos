#!/usr/bin/env python3
"""
Distill the daily data into an AI opportunity report (website/data/report.json).

For the top trending AI repos it asks an LLM for a compact, structured insight
(pain point, 2-3 concrete app ideas, monetization, opportunity score, why-now),
adds a data-driven timing badge (from 7d star growth) and a cross-source signal
(repo also surfacing in the Show HN / Product Hunt ideas feed), then writes one
brief + ranked cards designed to be read in seconds.

LLM backend (auto):
  - LM Studio  if reachable at LMSTUDIO_URL (default http://localhost:1234/v1)
  - LLM7.io    otherwise (free, OpenAI-compatible) — the default

Env (all optional):
  LMSTUDIO_URL, LMSTUDIO_MODEL
  LLM7_TOKEN (default "unused"), LLM7_MODEL (default "default")
  REPORT_TOP_N (default 25)
"""

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

REPO_ROOT = Path(__file__).resolve().parents[1]
WEBSITE_DATA = REPO_ROOT / "website" / "data"
REPOS_FILE = WEBSITE_DATA / "repos.json"
AILIST_FILE = WEBSITE_DATA / "ailist.json"
IDEAS_FILE = WEBSITE_DATA / "ideas.json"
OUTPUT_FILE = WEBSITE_DATA / "report.json"

LMSTUDIO_URL = os.getenv("LMSTUDIO_URL", "http://localhost:1234/v1")
LLM7_URL = "https://api.llm7.io/v1"
TOP_N = int(os.getenv("REPORT_TOP_N", "25"))
LLM_SLEEP = 1.5


# ── LLM backend ───────────────────────────────────────────────────────────────
def pick_backend():
    """Prefer a running LM Studio, else fall back to LLM7."""
    try:
        r = requests.get(f"{LMSTUDIO_URL}/models", timeout=2.5)
        if r.ok:
            models = [m.get("id") for m in r.json().get("data", []) if m.get("id")]
            model = os.getenv("LMSTUDIO_MODEL") or (models[0] if models else "local-model")
            print(f"  backend: LM Studio ({model})")
            return {"name": "lmstudio", "base": LMSTUDIO_URL, "model": model, "key": None}
    except Exception:
        pass
    model = os.getenv("LLM7_MODEL") or "default"
    print(f"  backend: LLM7.io ({model})")
    return {"name": "llm7", "base": LLM7_URL, "model": model, "key": os.getenv("LLM7_TOKEN") or "unused"}


def chat(backend, messages, temperature=0.4, max_retries=3):
    headers = {"Content-Type": "application/json"}
    if backend["key"]:
        headers["Authorization"] = f"Bearer {backend['key']}"
    body = {"model": backend["model"], "messages": messages, "temperature": temperature}
    for attempt in range(max_retries):
        try:
            r = requests.post(f"{backend['base']}/chat/completions", headers=headers, json=body, timeout=120)
            if r.status_code == 429:
                time.sleep(8 * (attempt + 1))
                continue
            r.raise_for_status()
            return r.json()["choices"][0]["message"]["content"]
        except Exception as exc:
            if attempt == max_retries - 1:
                raise
            time.sleep(3 * (attempt + 1))
    return ""


def parse_json(text):
    """Extract the first JSON object from a model response (handles ``` fences)."""
    if not text:
        return None
    text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
    start = text.find("{")
    if start == -1:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "{":
            depth += 1
        elif text[i] == "}":
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    return None
    return None


# ── Data prep ─────────────────────────────────────────────────────────────────
def timing_badge(delta_7d_pct, delta_7d):
    """Data-driven timing from 7d star movement."""
    pct = delta_7d_pct if isinstance(delta_7d_pct, (int, float)) else None
    delta = delta_7d if isinstance(delta_7d, (int, float)) else 0
    if pct is None and not delta:
        return "steady"
    if (pct is not None and pct >= 8) or delta >= 1500:
        return "breakout"
    if (pct is not None and pct >= 3) or delta >= 400:
        return "emerging"
    if (pct is not None and pct < 0.5) and delta < 100:
        return "saturated"
    return "steady"


def load_candidates():
    """Top trending AI repos with growth signal, de-duplicated."""
    repos = []
    if REPOS_FILE.exists():
        data = json.loads(REPOS_FILE.read_text())
        repos = data.get("trending_repos") or data.get("starred_repos") or []
    if not repos and AILIST_FILE.exists():
        repos = json.loads(AILIST_FILE.read_text()).get("repos", [])

    def score(r):
        return (r.get("star_delta_7d") or 0, r.get("trend_score") or 0, r.get("stars") or 0)

    repos = sorted(repos, key=score, reverse=True)
    seen, out = set(), []
    for r in repos:
        if r["name"] in seen:
            continue
        seen.add(r["name"])
        out.append(r)
        if len(out) >= TOP_N:
            break
    return out


def cross_signal_index():
    """Lowercased blob of idea titles → to flag repos with launch activity."""
    if not IDEAS_FILE.exists():
        return ""
    ideas = json.loads(IDEAS_FILE.read_text()).get("ideas", [])
    return " ".join((i.get("title") or "") for i in ideas).lower()


def has_cross_signal(repo, idea_blob):
    name = (repo.get("repo_name") or repo["name"].split("/")[-1]).lower()
    return len(name) >= 4 and name in idea_blob


# ── LLM prompts ───────────────────────────────────────────────────────────────
ITEM_SYS = (
    "You are an analyst who turns trending open-source AI repos into concrete, buildable product opportunities. "
    "Reply with STRICT JSON only, no prose, no markdown. Be specific and concise."
)


def item_prompt(repo):
    return (
        f"Repo: {repo['name']} ({repo.get('stars', 0)} stars, 7-day star change: "
        f"{repo.get('star_delta_7d', 'n/a')} / {repo.get('star_delta_7d_pct', 'n/a')}%). "
        f"Category: {repo.get('category', '')}. Description: {repo.get('description', '')}\n\n"
        "Return JSON with EXACTLY these keys:\n"
        '{"one_liner": "<=12 words what it is",'
        ' "pain_point": "the problem it solves and who would pay",'
        ' "app_ideas": ["2-3 concrete apps a solo dev could ship in ~2 weeks"],'
        ' "monetization": "best-fit model e.g. freemium / B2B API wrapper / vertical SaaS",'
        ' "opportunity": <integer 1-10, higher = more open whitespace>,'
        ' "why_now": "one line on timing / momentum"}'
    )


def generate_item(backend, repo, idea_blob):
    raw = chat(backend, [{"role": "system", "content": ITEM_SYS}, {"role": "user", "content": item_prompt(repo)}])
    data = parse_json(raw) or {}
    ideas = data.get("app_ideas") or []
    if isinstance(ideas, str):
        ideas = [ideas]
    return {
        "name": repo["name"],
        "url": repo.get("url") or f"https://github.com/{repo['name']}",
        "stars": repo.get("stars", 0),
        "category": repo.get("category", ""),
        "delta_7d": repo.get("star_delta_7d"),
        "delta_7d_pct": repo.get("star_delta_7d_pct"),
        "timing": timing_badge(repo.get("star_delta_7d_pct"), repo.get("star_delta_7d")),
        "cross_signal": has_cross_signal(repo, idea_blob),
        "one_liner": str(data.get("one_liner", "")).strip(),
        "pain_point": str(data.get("pain_point", "")).strip(),
        "app_ideas": [str(x).strip() for x in ideas][:3],
        "monetization": str(data.get("monetization", "")).strip(),
        "opportunity": int(data["opportunity"]) if str(data.get("opportunity", "")).strip().lstrip("-").isdigit() else 5,
        "why_now": str(data.get("why_now", "")).strip(),
    }


def generate_brief(backend, items):
    top = sorted(items, key=lambda i: i["opportunity"], reverse=True)[:12]
    lines = [f"- {i['name']} (opp {i['opportunity']}, {i['timing']}): {i['one_liner']}" for i in top]
    prompt = (
        "From these distilled AI repo opportunities, write a punchy daily brief: 3-5 bullet points a "
        "founder can read in 15 seconds, calling out the single best opportunity and any breakout timing. "
        "Return JSON only: {\"brief\": [\"bullet\", ...]}\n\n" + "\n".join(lines)
    )
    raw = chat(backend, [{"role": "system", "content": ITEM_SYS}, {"role": "user", "content": prompt}], temperature=0.5)
    data = parse_json(raw) or {}
    brief = data.get("brief") or []
    return [str(b).strip() for b in brief if str(b).strip()][:5]


def main():
    print("=" * 60)
    print("AI Opportunity Report generator")
    print("=" * 60)

    backend = pick_backend()
    candidates = load_candidates()
    idea_blob = cross_signal_index()
    print(f"  candidates: {len(candidates)} repos")

    items = []
    for index, repo in enumerate(candidates, start=1):
        try:
            items.append(generate_item(backend, repo, idea_blob))
            print(f"  [{index}/{len(candidates)}] {repo['name']}")
        except Exception as exc:
            print(f"  [{index}/{len(candidates)}] {repo['name']} — FAILED: {exc}")
        time.sleep(LLM_SLEEP)

    if not items:
        print("No items generated — leaving previous report.json untouched.")
        raise SystemExit(1)

    items.sort(key=lambda i: (i["cross_signal"], i["opportunity"], i["delta_7d"] or 0), reverse=True)

    brief = []
    try:
        brief = generate_brief(backend, items)
    except Exception as exc:
        print(f"  brief failed: {exc}")

    now = datetime.now(timezone.utc)
    payload = {
        "date": now.date().isoformat(),
        "generated_at": now.isoformat(),
        "backend": backend["name"],
        "model": backend["model"],
        "brief": brief,
        "items": items,
    }
    WEBSITE_DATA.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved → {OUTPUT_FILE}  ({len(items)} items, {len(brief)} brief bullets)")


if __name__ == "__main__":
    main()
