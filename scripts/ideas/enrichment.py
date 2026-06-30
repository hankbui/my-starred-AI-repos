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
    return [enrich(idea) for idea in ideas]
