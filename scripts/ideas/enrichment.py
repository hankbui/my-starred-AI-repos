"""Idea enrichment — revenue detection, business model, trends, AI potential

Runs as post-processing after all sources are collected.
"""

from __future__ import annotations

import re

# ── Revenue detection (upgraded) ──

REVENUE_PATTERNS = [
    # Explicit monthly revenue
    r"\$\d[\d,]*[kKmM]?\s*/\s*(mo|month|year|annual)",
    r"\$\d[\d,]*[kKmM]?\s*(MRR|ARR|mo|month|revenue|year|profit)",
    r"(MRR|ARR|revenue|profit)\s*[:\s]+\$?\d[\d,]*[kKmM]?",
    r"(made|earned|generating)\s+\$?\d[\d,]*[kKmM]?",
    # Sold / raised
    r"(sold|acquired|bought)\s+(for\s+)?\$?\d[\d,]*[kKmMbB]?",
    r"(raised|funding|secured)\s+\$?\d[\d,]*[kKmMbB]?",
    # Chinese revenue signals
    r"(收入|赚|盈利|营收|付费).{0,15}[\d,]+[万亿kK]?",
    r"[\d,]+[万亿kK]?.*(用户|下载|安装|收入|付费)",
    r"(融资|获投|募资|估值).{0,15}[\d,]+[万亿kK]?",
    r"(ARR|GMV|估值)\s*[:\s]*\$?\d[\d,]*[亿kKmMbB]?",
    # General with $ sign
    r"\$[\d,]+[kKmMbB]?",
]


def detect_revenue(text: str) -> str | None:
    for pat in REVENUE_PATTERNS:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return m.group(0)
    return None


# ── Business model tagging ──

BUSINESS_MODEL_RULES: list[tuple[str, list[str]]] = [
    ("subscription", ["subscription", "$x/mo", "monthly", "mrr", "saas", "recurring"]),
    ("one-time", ["one-time", "buy once", "lifetime", "perpetual", "pay once"]),
    ("marketplace", ["marketplace", "platform", "connecting", "buyers", "sellers", "two-sided"]),
    ("ads", ["ad-supported", "free with ads", "monetize with ads", "advertising"]),
    ("freemium", ["freemium", "free tier", "free plan", "basic free"]),
    ("open-source", ["open source", "sponsor", "donation", "github sponsors"]),
    ("physical", ["shipping", "manufacturing", "hardware", "crowdfunding", "indiegogo"]),
    ("consulting", ["consulting", "agency", "freelance", "services"]),
    ("app-store", ["app store", "in-app purchase", "iap", "paid app"]),
    ("api", ["api", "pay-as-you-go", "per request", "usage-based", "credits"]),
]


def detect_business_model(title: str, description: str) -> str | None:
    text = (title + " " + description).lower()
    matched = []
    for model, keywords in BUSINESS_MODEL_RULES:
        for kw in keywords:
            if kw in text:
                matched.append(model)
                break
    return ",".join(matched) if matched else None


# ── AI potential score ──

AI_POSITIVE_KEYWORDS = [
    "ai", "llm", "gpt", "chatbot", "machine learning", "deep learning",
    "neural", "transformer", "langchain", "rag", "agent", "automation",
    "computer vision", "nlp", "natural language", "recommendation",
    "predictive", "classification", "generative", "diffusion",
]

AI_NEGATIVE_KEYWORDS = [
    "hardware", "manufacturing", "physical", "mechanical",
    "construction", "mining", "logistics", "warehouse",
]


def compute_ai_potential(title: str, description: str, category: str, business_model: str | None) -> int:
    text = (title + " " + description + " " + category).lower()
    score = 0
    for kw in AI_POSITIVE_KEYWORDS:
        if kw in text:
            score += 15
    for kw in AI_NEGATIVE_KEYWORDS:
        if kw in text:
            score -= 20
    if business_model:
        bm = business_model.lower()
        if "subscription" in bm or "api" in bm:
            score += 10
        if "consulting" in bm:
            score -= 10
    # Category boost
    if any(c in category.lower() for c in ["dev tool", "productivity", "education", "saas"]):
        score += 10
    return max(0, min(100, score))


# ── Google Trends scoring ──

_CATEGORY_TRENDS_MAP: dict[str, str] = {
    "ai": "artificial intelligence",
    "llm": "large language model",
    "gpt": "chatgpt",
    "machine learning": "machine learning",
    "education": "online learning",
    "productivity": "productivity tools",
    "saas": "saas",
    "dev tool": "developer tools",
    "mobile": "mobile app development",
    "python": "python programming",
    "javascript": "javascript",
    "typescript": "typescript",
    "rust": "rust programming",
    "go": "golang",
    "api": "api development",
    "open source": "open source software",
    "nocode": "no code",
    "marketplace": "online marketplace",
    "ecommerce": "ecommerce",
    "health": "health tech",
    "finance": "fintech",
    "crypto": "cryptocurrency",
    "gaming": "game development",
    "social": "social media app",
    "video": "video streaming",
    "design": "ui design",
    "data": "data science",
    "security": "cybersecurity",
    "cloud": "cloud computing",
    "database": "database",
}

_TRENDS_CACHE: dict[str, tuple[int, str]] = {}


def _extract_trends_keywords(idea: dict) -> list[str]:
    keywords = set()
    cat = (idea.get("category") or "").lower().strip()
    if cat and cat in _CATEGORY_TRENDS_MAP:
        keywords.add(_CATEGORY_TRENDS_MAP[cat])
    for tag in (idea.get("tags") or []):
        tag_lower = str(tag).lower().strip()
        if tag_lower in _CATEGORY_TRENDS_MAP:
            keywords.add(_CATEGORY_TRENDS_MAP[tag_lower])
    text = ((idea.get("title") or "") + " " + (idea.get("description") or "")).lower()
    for key, mapped in _CATEGORY_TRENDS_MAP.items():
        if key in text:
            keywords.add(mapped)
    return list(keywords)[:2]


def fetch_trend(keyword: str) -> tuple[int, str] | None:
    if keyword in _TRENDS_CACHE:
        return _TRENDS_CACHE[keyword]
    try:
        from pytrends.request import TrendReq
        import time
        pytrends = TrendReq(hl="en-US", tz=360, timeout=10)
        pytrends.build_payload([keyword], cat=0, timeframe="today 12-m", geo="")
        df = pytrends.interest_over_time()
        time.sleep(1)
        if df is None or df.empty or keyword not in df.columns:
            _TRENDS_CACHE[keyword] = (0, "stable")
            return _TRENDS_CACHE[keyword]
        values = df[keyword].tolist()
        if not values:
            _TRENDS_CACHE[keyword] = (0, "stable")
            return _TRENDS_CACHE[keyword]
        recent = sum(values[-min(4, len(values)):]) / min(4, len(values))
        overall = sum(values) / len(values)
        score = min(100, int((recent / max(overall, 1)) * 50))
        half = len(values) // 2
        first_half = sum(values[:half]) / max(half, 1)
        second_half = sum(values[half:]) / max(len(values) - half, 1)
        if second_half > first_half * 1.15:
            direction = "rising"
        elif second_half < first_half * 0.85:
            direction = "declining"
        else:
            direction = "stable"
        _TRENDS_CACHE[keyword] = (score, direction)
        return _TRENDS_CACHE[keyword]
    except Exception:
        _TRENDS_CACHE[keyword] = (0, "stable")
        return None


def score_trends(ideas: list[dict]) -> list[dict]:
    seen_keywords: set[str] = set()
    for idea in ideas:
        if idea.get("_trend_scored"):
            continue
        kws = _extract_trends_keywords(idea)
        for kw in kws:
            if kw in seen_keywords:
                continue
            seen_keywords.add(kw)
            result = fetch_trend(kw)
            if result:
                _TRENDS_CACHE[kw] = result
    for idea in ideas:
        if idea.get("_trend_scored"):
            continue
        kws = _extract_trends_keywords(idea)
        score = 0
        direction = "stable"
        for kw in kws:
            if kw in _TRENDS_CACHE:
                s, d = _TRENDS_CACHE[kw]
                if s > score:
                    score = s
                    direction = d
        idea["trend_score"] = score
        idea["trend_direction"] = direction
        idea["_trend_scored"] = True
    return ideas


# ── Composite score ──
#
# Why: each source stores `score` in its own unit (HN = points, GitHub Trending
# = stars, Reddit/IH/AppStore = 0 because RSS exposes no signal). Sorting by
# raw `score` therefore buries real startup ideas (HN/Reddit/IH with revenue
# signals) under generic mega-repos (freeCodeCamp, awesome-*, ...).
#
# `composite_score` normalizes popularity within each source, then blends in
# enrichment signals so the default sort surfaces genuinely buildable ideas.

from datetime import datetime, timezone as _tz

_RECENCY_HALF_LIFE_DAYS = 14.0   # half-credit after 2 weeks, ~0 after ~60 days
_RECENCY_FLOOR_DAYS = 60.0


def _source_stats(ideas: list[dict]) -> dict[str, tuple[float, float]]:
    """Per-source (min, max) of raw `score`. Used for min-max normalization."""
    by_src: dict[str, list[int]] = {}
    for idea in ideas:
        src = idea.get("source") or "unknown"
        score = idea.get("score") or 0
        by_src.setdefault(src, []).append(score)
    stats = {}
    for src, scores in by_src.items():
        mx = max(scores) if scores else 0
        mn = min(scores) if scores else 0
        stats[src] = (mn, mx)
    return stats


def _normalize_popularity(score: int, src_stats: tuple[float, float]) -> float:
    mn, mx = src_stats
    if mx <= mn:
        return 0.0
    return max(0.0, min(100.0, (score - mn) / (mx - mn) * 100.0))


def _recency_score(date_str: str) -> float:
    """100 if published today, ~50 after 2 weeks, 0 after 60 days."""
    if not date_str:
        return 25.0   # unknown age — small constant rather than 0 or 100
    try:
        ds = date_str.replace("Z", "+00:00")
        dt = datetime.fromisoformat(ds)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=_tz.utc)
        days = (datetime.now(_tz.utc) - dt).days
    except (ValueError, TypeError):
        return 25.0
    if days <= 0:
        return 100.0
    if days >= _RECENCY_FLOOR_DAYS:
        return 0.0
    return 100.0 * (0.5 ** (days / _RECENCY_HALF_LIFE_DAYS))


def compute_composite(idea: dict, src_stats: dict[str, tuple[float, float]]) -> int:
    """Blend normalized popularity, AI potential, revenue signal, recency.

    Weights:
      0.40 * normalized popularity (per-source min-max of raw score)
      0.25 * ai_potential
      0.20 * revenue signal (boolean — has one or not)
      0.15 * recency (exponential decay over published date)
    """
    src = idea.get("source") or "unknown"
    pop = _normalize_popularity(idea.get("score") or 0, src_stats.get(src, (0, 0)))
    ai = max(0, min(100, idea.get("ai_potential") or 0))
    rev = 100.0 if idea.get("revenue_signal") else 0.0
    rec = _recency_score(idea.get("date_published") or "")

    composite = (
        0.40 * pop
        + 0.25 * ai
        + 0.20 * rev
        + 0.15 * rec
    )
    return round(composite)


# ── Enrichment runner ──

def enrich(idea: dict) -> dict:
    title = idea.get("title", "")
    description = idea.get("description", "")
    category = idea.get("category", "")
    raw = title + " " + description

    # Revenue (upgrade existing)
    if not idea.get("revenue_signal"):
        revenue = detect_revenue(raw)
        if revenue:
            idea["revenue_signal"] = revenue

    # Business model
    if not idea.get("business_model"):
        bm = detect_business_model(title, description)
        if bm:
            idea["business_model"] = bm

    # AI potential
    if not idea.get("ai_potential"):
        idea["ai_potential"] = compute_ai_potential(
            title, description, category, idea.get("business_model")
        )

    return idea


def enrich_all(ideas: list[dict]) -> list[dict]:
    ideas = [enrich(idea) for idea in ideas]

    # Trends scoring — wrapped so a pytrends failure (rate-limit, network, or
    # import error in CI) never blocks the rest of enrichment from running.
    try:
        ideas = score_trends(ideas)
    except Exception as e:
        print(f"  [WARN] trends scoring failed ({e}), continuing without trend signals")
        for idea in ideas:
            idea.setdefault("trend_score", 0)
            idea.setdefault("trend_direction", "stable")
            idea["_trend_scored"] = True

    # Composite score needs enrichment + trends to be done first, and needs
    # per-source stats computed over the full set (so popularity normalization
    # is fair across sources whose raw scores live on very different scales).
    src_stats = _source_stats(ideas)
    for idea in ideas:
        idea["composite_score"] = compute_composite(idea, src_stats)
        idea.pop("_trend_scored", None)   # internal marker, don't export

    # Default order: composite descending so the JSON consumer sees real startup
    # ideas first rather than mega-repos with huge raw scores.
    ideas.sort(key=lambda i: i.get("composite_score", 0), reverse=True)
    return ideas
