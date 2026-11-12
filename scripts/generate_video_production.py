"""Video Production Classifier — find video / image / video-production-automation repos.

Reads website/data/repos.json (trending + starred), website/data/ailist.json
(full landscape) and website/data/features.json (1.6k repo metadata), dedupes,
then classifies each repo into tabs:
  - video:      video generation, editing, avatars, captions, ...
  - image:      image generation, ComfyUI, upscalers, ...
  - automation: video production pipelines / batch automation

Each repo also gets "cases" (filter-by-case chips) such as video-gen, image-gen,
editing, avatar, voice, captions, comfyui, shorts, pipeline, upscaler, 3d.

Relevance uses a two-tier keyword system:
  - metadata (name/description/topics/category): any STRONG or WEAK keyword
  - README text: one STRONG keyword, or >= 2 distinct WEAK keywords
(generic words like "youtube" or "logo" appearing once in a README alone
 don't pull in an unrelated repo).

README text (from data/readme_markdown_cache.json, fallback data/readme_cache.json)
is included as a cleaned excerpt so the website search can match words in READMEs.

Output: website/data/video-production.json
"""

from __future__ import annotations

import html as html_mod
import json
import re
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPOS_INPUT = ROOT / "website" / "data" / "repos.json"
AILIST_INPUT = ROOT / "website" / "data" / "ailist.json"
FEATURES_INPUT = ROOT / "website" / "data" / "features.json"
README_FULL = ROOT / "data" / "readme_markdown_cache.json"
README_CACHE = ROOT / "data" / "readme_cache.json"
OUTPUT = ROOT / "website" / "data" / "video-production.json"

READ_EXCERPT_LEN = 1200
MIN_WEAK_README_HITS = 3

# High-precision terms — count anywhere (name, description, topics, README).
STRONG_KEYWORDS = [
    "stable diffusion", "comfyui", "text-to-video", "text to video",
    "video generation", "video-generation", "video gen", "image generation",
    "text-to-image", "text to image", "image-to-video", "img2vid", "vid2vid",
    "v2v", "i2v", "t2v", "ffmpeg", "sora", "wan2", "wan 2", "cogvideo",
    "animatediff", "ltx-video", "hunyuan video", "movie gen", "lipsync",
    "lip sync", "lip-sync", "talking head", "digital human", "deepfake",
    "face swap", "face-swap", "yt-dlp", "text to speech", "text-to-speech",
    "whisper", "subtitle", "subtitles", "midjourney", "diffusion model",
    "sdxl", "sd3", "img2img", "txt2img", "inpaint", "outpaint",
    "frame interpolation", "super resolution", "super-resolution", "remotion",
    "video editor", "video editing", "edit videos", "motion capture", "mocap",
    "gaussian splat", "nerf", "voiceover", "voice-over", "dubbing",
    "faceless", "tts", "video automation", "video pipeline",
    "ai avatar", "avatar generation", "music generation", "auto-edit",
]

# Lower-precision terms — count in metadata, or need >= 2 distinct hits in README.
WEAK_KEYWORDS = [
    "video", "videos", "film", "movie", "cinematic", "animation", "anime",
    "avatar", "footage", "clip", "clips", "reel", "reels", "shorts",
    "youtube", "tiktok", "twitch", "livestream", "live streaming", "streaming",
    "obs", "frame", "keyframe", "vlog", "storyboard", "rotoscope",
    "photo", "photos", "image", "images", "illustration", "drawing", "sketch",
    "painting", "artwork", "ai art", "digital art", "logo", "icon", "wallpaper",
    "meme", "graphic", "graphics", "lora", "diffusion", "upscale", "upscaling",
    "photo editing", "image edit", "matting", "remove background",
    "background removal", "favicon", "music", "audio", "voice", "speech",
    "song", "3d", "mesh", "blender", "screen recording", "screenshot",
    "kling", "veo", "gen-3", "mochi", "hallo", "echomimic", "musev",
]

AUTOMATION_KEYWORDS = [
    "automation", "automated", "workflow", "pipeline", "n8n", "faceless",
    "batch", "orchestration", "autopilot", "scheduled", "cron", "zapier",
    "no-code", "auto-generate", "mass produc", "creator", "agent",
    "schedule", "queue",
]

CASE_KEYWORDS = {
    "video-gen": [
        "text-to-video", "video generation", "video-generation", "video gen",
        "sora", "wan2", "wan 2", "cogvideo", "hunyuan", "ltx", "animatediff",
        "mochi", "video diffusion", "t2v", "i2v", "image-to-video", "img2vid",
        "vid2vid", "v2v", "gen-3", "kling", "veo", "movie gen", "video model",
        "world model", "frame generation", "video gen",
    ],
    "image-gen": [
        "text-to-image", "image generation", "stable diffusion", "comfyui",
        "flux", "midjourney", "txt2img", "img2img", "text to image", "sd3",
        "sdxl", "dalle", "dall-e", "lora", "diffusion model", "inpaint",
        "outpaint", "canvas", "photoshop",
    ],
    "editing": [
        "video editor", "video editing", "edit videos", "editing", "ffmpeg",
        "timeline", "non-linear", "nle", "cut", "trim", "montage", "remotion",
        "auto-cut", "clip maker", "split", "merge", "concat", "transcode",
        "convert video", "compression", "video conversion", "cropping",
    ],
    "avatar": [
        "avatar", "talking head", "lipsync", "lip sync", "lip-sync",
        "digital human", "deepfake", "face swap", "face-swap", "heygen",
        "musev", "echomimic", "hallo", "portrait anim",
    ],
    "voice": [
        "tts", "text to speech", "text-to-speech", "voice", "dubbing",
        "voiceover", "voice-over", "music", "song", "audio", "speech",
        "f5-tts", "chatterbox", "kokoro", "elevenlabs", "sound effect",
        "stem separation",
    ],
    "captions": [
        "subtitle", "caption", "transcription", "transcribe", "whisper",
        "srt", "vtt", "karaoke", "auto-caption", "translate video",
    ],
    "comfyui": ["comfyui", "comfy", "node pack"],
    "shorts": [
        "shorts", "tiktok", "reels", "faceless", "viral", "youtube",
        "yt-dlp", "downloader", "video downloader", "livestream",
        "live streaming", "obs", "twitch", "streaming", "podcast",
        "moneyprinter", "content creation",
    ],
    "pipeline": [
        "automation", "automated", "workflow", "pipeline", "n8n", "batch",
        "orchestration", "scheduled", "cron", "zapier", "auto-generate",
        "faceless", "mass produc", "agent", "queue", "schedule",
    ],
    "upscaler": [
        "upscale", "upscaling", "super resolution", "super-resolution",
        "enhance", "restore", "denoise", "deblur", "frame interpolation",
        "interpolate", "rife", "realesrgan", "real-esrgan", "4k", "8k",
        "sharpen", "colorize", "hdr",
    ],
    "3d": [
        "3d", "mesh", "splat", "gaussian", "nerf", "blender", "mocap",
        "motion capture", "rigging", "skeleton", "model generation",
        "texture", "lighting", "camera",
    ],
}


def kw_match(hay: str, keywords: list) -> bool:
    """Word-boundary keyword match (avoids 'art' in 'start' style false hits)."""
    for kw in keywords:
        if re.search(r"\b" + re.escape(kw) + r"\b", hay):
            return True
    return False


def kw_hits(hay: str, keywords: list) -> list:
    return [kw for kw in keywords if re.search(r"\b" + re.escape(kw) + r"\b", hay)]


def strip_readme(text: str) -> str:
    """Clean markdown/HTML README text down to searchable plain text."""
    if not text:
        return ""
    text = html_mod.unescape(text)
    text = re.sub(r"<!--.*?-->", " ", text, flags=re.DOTALL)
    text = re.sub(r"```[\s\S]*?```", " ", text)
    text = re.sub(r"<[^>\n]+>", " ", text)
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", " ", text)
    text = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", text)
    text = re.sub(r"[*_`#>|]+", " ", text)
    text = re.sub(r"https?://\S+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:READ_EXCERPT_LEN]


def build_readme_index() -> dict:
    """owner/repo -> cleaned searchable README text."""
    index = {}
    if README_FULL.exists():
        try:
            full = json.loads(README_FULL.read_text())
            for key, entry in full.items():
                if entry.get("status") == "ready" and entry.get("markdown"):
                    index[key.lower()] = strip_readme(entry["markdown"])
        except Exception as e:  # noqa: BLE001
            print(f"  [WARN] readme_markdown_cache.json: {e}")
    if README_CACHE.exists():
        try:
            cache = json.loads(README_CACHE.read_text())
            for key, entry in cache.items():
                k = key.lower()
                if k not in index and isinstance(entry, dict):
                    text = strip_readme(entry.get("excerpt") or "")
                    if text:
                        index[k] = text
        except Exception as e:  # noqa: BLE001
            print(f"  [WARN] readme_cache.json: {e}")
    return index


def load_repos() -> list:
    repos = {}
    if REPOS_INPUT.exists():
        data = json.loads(REPOS_INPUT.read_text())
        items = (data.get("trending_repos") or []) + (data.get("starred_repos") or [])
        for r in items:
            repos[(r.get("name") or "").lower()] = r
    if AILIST_INPUT.exists():
        data = json.loads(AILIST_INPUT.read_text())
        for r in data.get("repos") or []:
            repos.setdefault((r.get("name") or "").lower(), r)
    if FEATURES_INPUT.exists():
        data = json.loads(FEATURES_INPUT.read_text())
        for f in data.get("features") or []:
            name = f.get("repo") or f"{f.get('owner', '')}/{f.get('repo_name', '')}"
            r = {
                "name": name,
                "url": f.get("url", ""),
                "description": f.get("repo_description", ""),
                "stars": f.get("stars", 0),
                "forks": f.get("forks", 0),
                "language": f.get("language", ""),
                "topics": f.get("topics", []),
                "category": f.get("category", ""),
                "pushed_at": f.get("updated_at", ""),
            }
            repos.setdefault(name.lower(), r)
    return list(repos.values())


def classify_repo(repo: dict, readme_text: str) -> dict | None:
    name = repo.get("name", "") or ""
    desc = repo.get("description", "") or ""
    topics = [t.lower() for t in (repo.get("topics") or [])]
    category = repo.get("category", "") or ""
    meta = f"{name} {desc} {' '.join(topics)} {category}".lower()
    readme = (readme_text or "").lower()

    meta_hits = set(kw_hits(meta, STRONG_KEYWORDS)) | set(kw_hits(meta, WEAK_KEYWORDS))
    readme_strong = kw_hits(readme, STRONG_KEYWORDS)
    readme_weak = set(kw_hits(readme, WEAK_KEYWORDS))

    relevant = bool(meta_hits) or bool(readme_strong) or len(readme_weak) >= MIN_WEAK_README_HITS
    if not relevant:
        return None

    tab_video = bool(
        meta_hits & _set(VIDEO_SIGNS)
        or readme_strong and (set(readme_strong) & _set(VIDEO_SIGNS))
        or len(readme_weak & _set(VIDEO_SIGNS)) >= MIN_WEAK_README_HITS
    )
    tab_image = bool(
        meta_hits & _set(IMAGE_SIGNS)
        or readme_strong and (set(readme_strong) & _set(IMAGE_SIGNS))
        or len(readme_weak & _set(IMAGE_SIGNS)) >= MIN_WEAK_README_HITS
    )
    if not (tab_video or tab_image):
        return None

    auto_hay = meta + " " + readme
    tab_automation = kw_match(auto_hay, AUTOMATION_KEYWORDS)

    case_hay = auto_hay
    cases = []
    for case, kws in CASE_KEYWORDS.items():
        if kw_match(case_hay, kws):
            cases.append(case)
    if not cases:
        cases = ["editing"] if tab_video else ["image-gen"]

    return {
        "id": repo.get("name", ""),
        "name": name,
        "url": repo.get("url", ""),
        "description": (desc or "")[:300],
        "stars": repo.get("stars", 0),
        "forks": repo.get("forks", 0),
        "language": repo.get("language", ""),
        "category": category,
        "topics": topics[:8],
        "delta_7d": repo.get("delta_7d", 0) or 0,
        "trend_score": round(repo.get("trend_score", 0) or 0, 1),
        "pushed_at": (repo.get("pushed_at") or "")[:10],
        "tabs": [t for t, ok in (("video", tab_video), ("image", tab_image),
                                 ("automation", tab_automation)) if ok],
        "cases": cases,
        "readme": readme_text,
    }


def _set(lst):
    return set(lst)


# Keywords that signal the "video" tab vs the "image" tab.
VIDEO_SIGNS = [
    "video", "videos", "film", "movie", "cinematic", "animation", "anime",
    "footage", "clip", "clips", "reel", "reels", "shorts", "youtube", "tiktok",
    "twitch", "livestream", "live streaming", "obs", "frame", "keyframe",
    "vlog", "storyboard", "rotoscope", "sora", "wan2", "wan 2", "cogvideo",
    "animatediff", "ltx-video", "hunyuan video", "lipsync", "lip sync",
    "lip-sync", "talking head", "deepfake", "face swap", "face-swap", "yt-dlp",
    "whisper", "subtitle", "subtitles", "text-to-video", "text to video",
    "video generation", "video-generation", "video gen", "image-to-video",
    "img2vid", "vid2vid", "v2v", "i2v", "t2v", "ffmpeg", "remotion",
    "video editor", "video editing", "edit videos", "dubbing", "voiceover",
    "voice-over", "faceless", "kling", "veo", "gen-3", "mochi", "avatar",
    "ai avatar", "avatar generation", "auto-edit", "video automation",
    "video pipeline", "moneyprinter",
]

IMAGE_SIGNS = [
    "image", "images", "photo", "photos", "illustration", "drawing", "sketch",
    "painting", "artwork", "ai art", "digital art", "logo", "icon", "wallpaper",
    "meme", "graphic", "graphics", "lora", "diffusion", "upscale", "upscaling",
    "photo editing", "image edit", "matting", "remove background",
    "background removal", "favicon", "stable diffusion", "comfyui", "flux",
    "midjourney", "dalle", "dall-e", "img2img", "txt2img", "inpaint",
    "outpaint", "sdxl", "sd3", "diffusion model", "super resolution",
    "super-resolution", "frame interpolation", "blender", "3d", "mesh",
    "gaussian splat", "nerf", "screenshot", "screen recording", "mocap",
    "motion capture",
]


def main():
    print("=" * 60)
    print("Video Production Classifier")
    print("=" * 60)

    if not REPOS_INPUT.exists() and not AILIST_INPUT.exists() and not FEATURES_INPUT.exists():
        print("  [ERROR] no input data found")
        return

    repos = load_repos()
    print(f"  Loaded {len(repos)} unique repos")

    readme_index = build_readme_index()
    print(f"  README index: {len(readme_index)} repos")

    classified = []
    for r in repos:
        key = (r.get("name") or "").lower()
        text = readme_index.get(key, "")
        item = classify_repo(r, text)
        if item:
            classified.append(item)

    video = [r for r in classified if "video" in r["tabs"]]
    image = [r for r in classified if "image" in r["tabs"] and "video" not in r["tabs"]]
    automation = [r for r in classified if "automation" in r["tabs"]]

    for lst in (video, image, automation):
        lst.sort(key=lambda r: r["stars"], reverse=True)
    classified.sort(key=lambda r: r["stars"], reverse=True)

    all_cases = set()
    for r in classified:
        all_cases.update(r["cases"])
    all_cases = sorted(all_cases)

    print(f"  Video: {len(video)}")
    print(f"  Image: {len(image)}")
    print(f"  Automation: {len(automation)}")
    print(f"  Total relevant: {len(classified)}")
    print(f"  Cases ({len(all_cases)}): {', '.join(all_cases)}")
    if video:
        print(f"  Top video: {video[0]['name']} ⭐{video[0]['stars']}")
    if image:
        print(f"  Top image: {image[0]['name']} ⭐{image[0]['stars']}")

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "video": len(video),
            "image": len(image),
            "automation": len(automation),
            "total": len(classified),
            "cases": len(all_cases),
        },
        "cases": all_cases,
        "video": video,
        "image": image,
        "automation": automation,
        "all": classified,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"\n  Wrote {OUTPUT.relative_to(ROOT)} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
