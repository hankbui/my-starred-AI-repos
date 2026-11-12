"""Video Tools Crawler — discover valuable GitHub tools for each production case.

For every pipeline case (trends, ideas, assets, publish, thumbnails, analytics,
video-gen, image-gen, editing, avatar, voice, captions, upscaler, pipeline,
comfyui, shorts, 3d) runs GitHub repository-search queries, filters for
maintained/valuable tools (stars >= MIN_STARS, pushed within MAX_AGE_DAYS,
not archived, has description), and appends new finds to an append-only pool:

    data/video-tools-pool.json

generate_video_production.py merges this pool into the classification so the
website picks the tools up on the next daily build.

Run:  python3 scripts/crawl_video_tools.py [min_stars]
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
load_dotenv(ROOT / ".env")

POOL_FILE = ROOT / "data" / "video-tools-pool.json"
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN", "")
MIN_STARS = int(sys.argv[1]) if len(sys.argv) > 1 else 20
MAX_AGE_DAYS = 730
PER_QUERY = 30

HEADERS = {
    "Accept": "application/vnd.github+json",
    "User-Agent": "my-starred-ai-video-crawler",
    "X-GitHub-Api-Version": "2022-11-28",
}
if GITHUB_TOKEN:
    HEADERS["Authorization"] = f"Bearer {GITHUB_TOKEN}"

# case -> list of GitHub search queries
QUERIES: dict[str, list[str]] = {
    "trends": [
        "trend finder in:name,description",
        "trending topics tracker in:name,description",
        "viral video finder in:name,description",
        "exploding topics in:name,description",
        "youtube trends analytics in:name,description",
        "topic:trends",
    ],
    "ideas": [
        "content idea generator in:name,description",
        "video script generator in:name,description",
        "youtube title generator in:name,description",
        "storyboard generator in:name,description",
        "content calendar in:name,description",
    ],
    "assets": [
        "stock video api in:name,description",
        "pexels api wrapper in:name,description",
        "royalty free music library in:name,description",
        "sound effects library in:name,description",
        "stock footage downloader in:name,description",
        "topic:stock-footage",
    ],
    "publish": [
        "youtube uploader in:name,description",
        "social media scheduler in:name,description",
        "tiktok uploader in:name,description",
        "auto upload youtube in:name,description",
        "cross post social media in:name,description",
        "topic:social-media-scheduler",
    ],
    "thumbnails": [
        "thumbnail generator in:name,description",
        "youtube thumbnail downloader in:name,description",
        "hashtag generator in:name,description",
        "youtube seo tag generator in:name,description",
        "topic:thumbnail",
    ],
    "analytics": [
        "youtube analytics in:name,description",
        "tiktok analytics in:name,description",
        "social media analytics in:name,description",
        "video analytics in:name,description",
        "channel analytics in:name,description",
    ],
    "video-gen": [
        "topic:text-to-video",
        "text to video in:name,description",
        "ai video generator in:name,description",
        "video generation model in:name,description",
        "topic:video-generation",
    ],
    "image-gen": [
        "topic:text-to-image",
        "stable diffusion ui in:name,description",
        "ai image generator in:name,description",
        "topic:comfyui",
        "topic:stable-diffusion",
    ],
    "editing": [
        "topic:video-editing",
        "video editor in:name,description",
        "ffmpeg gui in:name,description",
        "auto video editor in:name,description",
        "video editing automation in:name,description",
    ],
    "avatar": [
        "talking avatar in:name,description",
        "lipsync video in:name,description",
        "digital human in:name,description",
        "face swap video in:name,description",
        "talking head generation in:name,description",
    ],
    "tts": [
        "text to speech in:name,description",
        "topic:tts",
        "voice cloning in:name,description",
        "vietnamese tts in:name,description",
        "chinese tts in:name,description",
        "mandarin tts in:name,description",
        "tts api in:name,description",
        "openai compatible tts in:name,description",
        "streaming tts in:name,description",
        "tts srt subtitle in:name,description",
        "script to speech in:name,description",
        "audiobook tts in:name,description",
        "multilingual tts in:name,description",
        "awesome tts in:name,description",
        "voice changer in:name,description",
        "dubbing in:name,description",
        "orpheus tts in:name,description",
        "stable tts in:name,description",
    ],
    "captions": [
        "auto subtitle generator in:name,description",
        "whisper subtitle in:name,description",
        "video transcription in:name,description",
        "caption generator in:name,description",
        "topic:subtitles",
    ],
    "upscaler": [
        "video upscaler in:name,description",
        "super resolution video in:name,description",
        "upscale ai in:name,description",
        "frame interpolation in:name,description",
        "topic:super-resolution",
    ],
    "pipeline": [
        "faceless video generator in:name,description",
        "faceless youtube automation in:name,description",
        "short video automation in:name,description",
        "video automation workflow in:name,description",
        "topic:faceless-video",
    ],
    "comfyui": [
        "topic:comfyui",
        "comfyui custom nodes in:name,description",
        "comfyui workflow in:name,description",
        "topic:comfyui-nodes",
    ],
    "shorts": [
        "shorts generator in:name,description",
        "tiktok video maker in:name,description",
        "reels generator in:name,description",
        "short video maker in:name,description",
    ],
    "3d": [
        "3d model generator in:name,description",
        "gaussian splatting in:name,description",
        "nerf reconstruction in:name,description",
        "text to 3d in:name,description",
    ],
}


# Curated repos per the TTS shortlist (Vietnamese / English / Chinese models,
# aggregators). Fetched directly via /repos API — bypasses the star filter but
# still skips archived/forked repos.
SEED_REPOS = [
    "pnnbao97/VieNeu-TTS",
    "NTT123/vietTTS",
    "hexgrad/kokoro",
    "resemble-ai/chatterbox",
    "rhasspy/piper",
    "neuphonic/neutts-air",
    "FunAudioLLM/CosyVoice",
    "QwenLM/Qwen3-TTS",
    "index-tts/index-tts",
    "2noise/ChatTTS",
    "fishaudio/fish-speech",
    "RVC-Boss/GPT-SoVITS",
    "myshell-ai/MeloTTS",
    "SWivid/F5-TTS",
    "SWivid/E2-TTS",
    "yl4579/StyleTTS2",
    "coqui-ai/TTS",
    "myshell-ai/OpenVoice",
    "suno-ai/bark",
    "huggingface/parler-tts",
    "neonbjb/tortoise-tts",
    "jaywalnut310/vits",
    "espnet/espnet",
    "PaddlePaddle/PaddleSpeech",
    "BloombergAi/awesome-tts",
    "licyk/Mizuoto",
]


def load_pool() -> dict:
    if POOL_FILE.exists():
        try:
            return json.loads(POOL_FILE.read_text())
        except Exception:  # noqa: BLE001
            print("  [WARN] pool unreadable, starting fresh")
    return {}


def search(query: str) -> list:
    url = "https://api.github.com/search/repositories"
    params = {
        "q": query + f" stars:>={MIN_STARS} pushed:>={(datetime.now(timezone.utc) - timedelta(days=MAX_AGE_DAYS)).date()}",
        "sort": "stars",
        "order": "desc",
        "per_page": PER_QUERY,
    }
    for attempt in range(3):
        try:
            r = requests.get(url, headers=HEADERS, params=params, timeout=30)
            if r.status_code == 200:
                return r.json().get("items", [])
            if r.status_code in (403, 429):
                reset = r.headers.get("X-RateLimit-Reset")
                wait = 65 if reset is None else max(0, int(reset) - int(time.time())) + 2
                print(f"    rate limited, sleeping {wait}s")
                time.sleep(wait)
                continue
            print(f"    HTTP {r.status_code}: {r.text[:120]}")
            return []
        except Exception as e:  # noqa: BLE001
            print(f"    error: {e}")
            time.sleep(3)
    return []


def fetch_seed(full_name: str) -> dict | None:
    r = requests.get(f"https://api.github.com/repos/{full_name}",
                     headers=HEADERS, timeout=30)
    if r.status_code != 200:
        print(f"    seed {full_name}: HTTP {r.status_code}")
        return None
    it = r.json()
    if it.get("archived") or it.get("fork"):
        return None
    return {
        "name": it.get("full_name", full_name),
        "url": it.get("html_url", f"https://github.com/{full_name}"),
        "description": (it.get("description") or "").strip() or full_name,
        "stars": it.get("stargazers_count", 0),
        "forks": it.get("forks_count", 0),
        "language": it.get("language") or "",
        "topics": [t.lower() for t in (it.get("topics") or [])][:8],
        "pushed_at": (it.get("pushed_at") or "")[:10],
        "source_query": "seed",
        "added_at": datetime.now(timezone.utc).isoformat(),
    }


def main():
    print("=" * 60)
    print(f"Video Tools Crawler (min {MIN_STARS} stars, < {MAX_AGE_DAYS}d old)")
    print("=" * 60)

    pool = load_pool()
    seen = set()
    for entries in pool.values():
        if isinstance(entries, dict):
            for name in entries:
                seen.add(name.lower())
    # one-time migration: legacy "voice" pool key -> "tts"
    if isinstance(pool.get("voice"), dict):
        pool.setdefault("tts", {}).update(pool.pop("voice"))
    added = 0

    for case, queries in QUERIES.items():
        pool.setdefault(case, {})
        before = len(pool[case])
        for q in queries:
            items = search(q)
            got = 0
            for it in items:
                if it.get("archived") or it.get("fork"):
                    continue
                name = it.get("full_name", "")
                if not name or name.lower() in seen:
                    continue
                desc = (it.get("description") or "").strip()
                if not desc:
                    continue
                pool[case][name] = {
                    "name": name,
                    "url": it.get("html_url", ""),
                    "description": desc[:300],
                    "stars": it.get("stargazers_count", 0),
                    "forks": it.get("forks_count", 0),
                    "language": it.get("language") or "",
                    "topics": [t.lower() for t in (it.get("topics") or [])][:8],
                    "pushed_at": (it.get("pushed_at") or "")[:10],
                    "source_query": q,
                    "added_at": datetime.now(timezone.utc).isoformat(),
                }
                seen.add(name.lower())
                got += 1
                added += 1
            print(f"  [{case}] '{q}' -> +{got}")
            time.sleep(3 if not GITHUB_TOKEN else 1)
        print(f"  [{case}] total: +{len(pool[case]) - before} (pool {len(pool[case])})")

    # Curated TTS seeds (bypass star filter)
    pool.setdefault("tts", {})
    seed_added = 0
    for full in SEED_REPOS:
        if full.lower() in seen:
            continue
        entry = fetch_seed(full)
        time.sleep(1 if GITHUB_TOKEN else 3)
        if not entry:
            continue
        pool["tts"][full] = entry
        seen.add(full.lower())
        seed_added += 1
        added += 1
        print(f"  [seed] +{full} ⭐{entry['stars']}")
    print(f"  [tts] seeds: +{seed_added}")

    POOL_FILE.parent.mkdir(parents=True, exist_ok=True)
    POOL_FILE.write_text(json.dumps(pool, indent=2, ensure_ascii=False))
    size_kb = POOL_FILE.stat().st_size / 1024
    total = sum(len(v) for v in pool.values() if isinstance(v, dict))
    print(f"\n  Wrote {POOL_FILE.relative_to(ROOT)} ({size_kb:.1f} KB, {total} repos)")
    print(f"  New this run: {added}")


if __name__ == "__main__":
    main()