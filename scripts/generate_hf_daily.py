"""Hugging Face Daily Digest — collect, score, and summarise the HF firehose.

HuggingFace is overwhelming: thousands of models, papers, spaces, datasets,
every day. This script collapses it into one digestible JSON so the website can
show "what's actually hot today" instead of forcing users to scroll HF itself.

Sources (all public, no API key):
  - Daily Papers    https://huggingface.co/api/daily_papers
  - Trending Models https://huggingface.co/api/models?sort=likes7d
  - Trending Spaces https://huggingface.co/api/spaces?sort=likes7d
  - Trending Datasets https://huggingface.co/api/datasets?sort=likes7d

Output: website/data/hf-daily.json
"""

from __future__ import annotations

import json
import re
import time
import urllib.request
import urllib.error
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "website" / "data" / "hf-daily.json"

HF_BASE = "https://huggingface.co/api"
HEADERS = {
    "User-Agent": "my-starred-ai-repos/1.0 (hf-daily-pipeline)",
    "Accept": "application/json",
}

# ---- fetch helpers -------------------------------------------------------

def _get(url: str, retries: int = 2) -> list | dict | None:
    last_err = None
    for attempt in range(retries + 1):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read().decode("utf-8", "replace"))
        except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, ValueError) as e:
            last_err = e
            if attempt < retries:
                time.sleep(2 * (attempt + 1))
    print(f"  [WARN] GET failed: {url} -> {last_err}")
    return None


def fetch_daily_papers(limit: int = 30) -> list[dict]:
    data = _get(f"{HF_BASE}/daily_papers?limit={limit}") or []
    out = []
    for entry in data:
        raw = entry.get("paper", {}) or {}
        pid = raw.get("id") or entry.get("paper_id") or ""
        if not pid:
            continue
        authors = [a.get("name", "") for a in raw.get("authors", []) if a.get("name")]
        out.append({
            "id": pid,
            "title": raw.get("title", ""),
            "authors": authors[:8],
            "published": (raw.get("publishedAt") or "")[:10],
            "submitted_on": (entry.get("submittedOnDailyAt") or "")[:10],
            "summary": (raw.get("ai_summary") or raw.get("summary") or "")[:600],
            "github": raw.get("githubRepo") or "",
            "upvotes": entry.get("paper", {}).get("upvotes") or entry.get("upvotes") or 0,
            "url": f"https://huggingface.co/papers/{pid}",
            "pdf_url": f"https://arxiv.org/pdf/{pid.split('v')[0]}",
        })
    return out


def _fetch_trending(kind: str, limit: int) -> list[dict]:
    """kind in {'models','spaces','datasets'}."""
    url = f"{HF_BASE}/{kind}?sort=likes7d&full=false&limit={limit}"
    data = _get(url) or []
    out = []
    for item in data:
        if not isinstance(item, dict):
            continue
        mid = item.get("id") or item.get("modelId") or ""
        if not mid:
            continue
        tags = item.get("tags") or []
        license_tag = next((t.split(":", 1)[1] for t in tags if t.startswith("license:")), "")
        libs = [t for t in tags if t in {"transformers", "pytorch", "tensorflow", "jax", "safetensors", "gguf", "onnx"}]

        if kind == "models":
            url_key = mid
        elif kind == "spaces":
            url_key = f"spaces/{mid}"
        elif kind == "datasets":
            url_key = f"datasets/{mid}"
        else:
            url_key = mid

        out.append({
            "id": mid,
            "author": item.get("author") or mid.split("/")[0],
            "name": mid.split("/")[-1],
            "likes": item.get("likes") or 0,
            "trending_score": item.get("trendingScore") or 0,
            "downloads": item.get("downloads") or 0,
            "pipeline_tag": item.get("pipeline_tag") or "",
            "tags": [t for t in tags if not t.startswith("license:") and ":" not in t][:8],
            "library": libs[:3],
            "license": license_tag,
            "last_modified": (item.get("lastModified") or "")[:10],
            "created_at": (item.get("createdAt") or "")[:10],
            "url": f"https://huggingface.co/{url_key}",
        })
    return out


# ---- enrichment ----------------------------------------------------------

STOPWORDS = {
    "the", "a", "an", "of", "for", "and", "to", "in", "on", "with", "via", "by",
    "from", "as", "is", "are", "be", "we", "our", "their", "this", "that",
    "model", "models", "data", "based", "using", "learning", "system", "system",
    "ai", "ml", "llm", "new", "image", "video", "text", "language",
}

# Topics that map a free-text tag/pipeline to a digest "theme"
THEME_KEYWORDS = {
    "Vision": ["image", "vision", "video", "vlm", "vl", "vit", "diffusion", "segment", "ocr", "depth"],
    "Language": ["text-generation", "llm", "transformer", "chat", "instruct", "mixtral", "mistral", "qwen", "llama", "gemma", "phi"],
    "Audio": ["audio", "speech", "tts", "asr", "whisper", "voice", "music"],
    "Agents": ["agent", "tool", "function", "rag", "reasoning", "mcp"],
    "Multimodal": ["multimodal", "clip", "image-text", "any-to-any", "omni"],
    "Safety/Align": ["safety", "alignment", "rlhf", "guard", "moderation"],
    "Infra/Quant": ["quantiz", "gguf", "awq", "onnx", "inference", "vllm", "finetune", "lora"],
}


def _tokenize(text: str) -> list[str]:
    return [w for w in re.findall(r"[a-zA-Z][a-zA-Z0-9_-]{2,}", text.lower()) if w not in STOPWORDS]


def classify_theme(text: str) -> list[str]:
    t = text.lower()
    themes = []
    for theme, kws in THEME_KEYWORDS.items():
        if any(kw in t for kw in kws):
            themes.append(theme)
    return themes[:3] or ["Other"]


def top_keywords(items: list[dict], fields: list[str], n: int = 15) -> list[dict]:
    counter = Counter()
    for it in items:
        for f in fields:
            for tok in _tokenize(str(it.get(f, ""))):
                counter[tok] += 1
    # drop ultra-rare (1) and ultra-common (>30%)
    threshold = max(2, len(items) // 3)
    return [{"word": w, "count": c} for w, c in counter.most_common(n * 3) if 1 < c <= threshold][:n]


def build_digest(papers, models, spaces, datasets) -> dict:
    # headlines: 3 highest-trending models + 1 top paper
    top_models = sorted(models, key=lambda m: m.get("trending_score", 0), reverse=True)[:5]
    top_paper = max(papers, key=lambda p: p.get("upvotes", 0)) if papers else None

    # aggregate themes across everything
    all_texts = (
        [f"{p['title']} {p['summary']}" for p in papers]
        + [f"{m['name']} {' '.join(m['tags'])} {m['pipeline_tag']}" for m in models]
        + [f"{s['name']} {' '.join(s['tags'])}" for s in spaces]
        + [f"{d['name']} {' '.join(d['tags'])}" for d in datasets]
    )
    theme_counter: Counter[str] = Counter()
    for txt in all_texts:
        for theme in classify_theme(txt):
            theme_counter[theme] += 1

    # surface trending orgs
    org_counter = Counter(m.get("author", "") for m in models if m.get("author"))
    top_orgs = [{"name": o, "count": c} for o, c in org_counter.most_common(8) if o]

    # trending keywords (combined vocab)
    flat = [{"text": t} for t in all_texts]
    keywords = top_keywords(
        [{"x": t} for t in all_texts],
        fields=["x"],
        n=20,
    )

    return {
        "highlights": {
            "top_paper": top_paper,
            "top_models": top_models,
            "hot_themes": theme_counter.most_common(6),
            "trending_orgs": top_orgs,
        },
        "keyword_cloud": keywords,
    }


# ---- main ----------------------------------------------------------------

def main() -> None:
    print("=" * 60)
    print("HuggingFace Daily Digest")
    print("=" * 60)

    print("  Fetching daily papers...")
    papers = fetch_daily_papers(limit=30)
    print(f"    -> {len(papers)} papers")

    print("  Fetching trending models (likes7d)...")
    models = _fetch_trending("models", limit=40)
    print(f"    -> {len(models)} models")

    print("  Fetching trending spaces (likes7d)...")
    spaces = _fetch_trending("spaces", limit=30)
    print(f"    -> {len(spaces)} spaces")

    print("  Fetching trending datasets (likes7d)...")
    datasets = _fetch_trending("datasets", limit=30)
    print(f"    -> {len(datasets)} datasets")

    print("  Building digest...")
    digest = build_digest(papers, models, spaces, datasets)

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "sources": {
            "papers": len(papers),
            "models": len(models),
            "spaces": len(spaces),
            "datasets": len(datasets),
        },
        "digest": digest,
        "papers": papers,
        "models": models,
        "spaces": spaces,
        "datasets": datasets,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"\n  Wrote {OUTPUT.relative_to(ROOT)} ({size_kb:.1f} KB)")
    print(f"  Highlights: {len(digest['highlights']['top_models'])} top models, "
          f"{len(digest['highlights']['hot_themes'])} themes, "
          f"{len(digest['keyword_cloud'])} keywords")


if __name__ == "__main__":
    main()
