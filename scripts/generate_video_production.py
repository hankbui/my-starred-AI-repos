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
POOL_INPUT = ROOT / "data" / "video-tools-pool.json"
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
    "social media scheduling", "social media scheduler",
    "social media automation", "youtube automation", "viral video",
    "viral content", "exploding topics", "google trends",
    "short-form video", "short form video", "content creation",
    "content creator", "content calendar", "content plan", "stock video",
    "royalty-free", "royalty free", "b-roll", "cross-post",
    "cross-posting", "crossposting", "post scheduling", "scheduled post",
    "scheduled posts", "auto upload", "upload video", "youtube uploader",
    "trending video", "trending videos", "trend analysis", "niche research",
    "keyword research", "script writer", "scriptwriting", "screenplay",
    "storyboard", "content ideas", "idea generation", "topic ideation",
    "hashtag", "hashtags", "thumbnail generator", "thumbnail maker",
    "thumbnails", "watch time", "click-through rate", "streamer",
    "content automation", "faceless channel", "faceless youtube",
    "social media management", "social media scheduling", "trending topics",
    "viral finder", "trend finder", "viral video finder",
]

# Lower-precision terms — count in metadata, or need >= 3 distinct hits in README.
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
    "creator", "creators", "streamer", "podcast", "influencer", "stock",
    "template", "font", "sfx", "schedule", "scheduler", "upload",
    "downloader", "viral", "trend", "trending", "niche", "instagram",
    "creator economy", "content creator", "content creators",
]

AUTOMATION_KEYWORDS = [
    "automation", "automated", "workflow", "pipeline", "n8n", "faceless",
    "batch", "orchestration", "autopilot", "scheduled", "cron", "zapier",
    "no-code", "auto-generate", "mass produc", "creator", "agent",
    "schedule", "queue",
]

# Strong terms specific to the video-production *workflow* (trends -> ideas ->
# assets -> publishing -> analytics). These pull in pipeline tools that have no
# video/image generation keywords of their own (trend finders, schedulers, ...).
WORKFLOW_STRONG = [
    "viral video", "viral content", "viral finder", "trend finder",
    "trend analysis", "trending video", "trending videos", "trending topics",
    "exploding topics", "google trends", "niche research", "keyword research",
    "content ideas", "idea generation", "topic ideation", "content ideation",
    "script writer", "scriptwriting", "screenplay", "storyboard",
    "content calendar", "content plan", "content creation", "content creator",
    "content automation", "faceless channel", "faceless youtube",
    "social media scheduling", "social media scheduler",
    "social media automation", "social media management", "youtube automation",
    "cross-post", "cross-posting", "crossposting", "post scheduling",
    "scheduled post", "scheduled posts", "auto upload", "upload video",
    "youtube uploader", "stock video", "royalty-free", "royalty free",
    "b-roll", "thumbnail generator", "thumbnail maker", "thumbnails",
    "hashtag", "hashtags", "short-form video", "short form video",
    "watch time", "click-through rate", "shorts", "reels", "tiktok",
    "instagram", "podcast",
]

# Context words: a workflow-case match only counts when the repo also clearly
# operates in the video/content-creator space (keeps metabase/airflow out).
WF_CONTEXT = [
    "video", "videos", "youtube", "tiktok", "instagram", "shorts", "reels",
    "creator", "creators", "content creation", "content creator",
    "social media", "streamer", "streamers", "podcast", "podcasts",
    "faceless", "channel", "channels", "niche", "influencer", "influencers",
    "vlog", "vlogging", "socials", "livestream",
    "twitch", "film", "movie", "footage", "animation", "creator economy",
    "video editing", "content automation", "faceless channel",
]

# Workflow-stage cases (ordered along the production pipeline).
WORKFLOW_CASES = ["trends", "ideas", "assets", "publish", "thumbnails", "analytics"]

VIDEO_CASE_SET = {"video-gen", "editing", "avatar", "voice", "captions",
                  "comfyui", "shorts", "upscaler", "3d", "pipeline"}
IMAGE_CASE_SET = {"image-gen"}
WORKFLOW_CASE_SET = set(WORKFLOW_CASES)

CASE_KEYWORDS = {
    "trends": [
        "trend", "trends", "trending", "viral", "niche", "exploding topics",
        "exploding", "google trends", "trend finder", "trendfinder",
        "trendspotter", "trend analysis", "keyword research", "keyword tool",
        "social listening", "buzzsumo", "viral finder", "viral video",
        "viral content", "hashtag research", "topic research", "ninchi",
        "1of10", "gpt-trends", "trending topics", "trending videos",
    ],
    "ideas": [
        "ideation", "idea generation", "idea generator", "idea tool",
        "brainstorm", "content ideas", "content ideation", "topic ideation",
        "script writer", "scriptwriting", "screenplay", "storyboard",
        "copywriting", "copywriter", "content plan", "content calendar",
        "title generator",
    ],
    "assets": [
        "stock footage", "stock video", "stock music", "footage", "b-roll",
        "broll", "royalty-free", "royalty free", "free music",
        "music library", "sound effect", "sound effects", "sfx", "pexels",
        "pixabay", "unsplash", "template", "templates", "screen recording",
        "screen recorder", "asset library", "media library", "brand kit",
        "meme template", "public domain", "cc0", "clip art",
    ],
    "publish": [
        "upload", "uploading", "scheduler", "scheduling", "schedule",
        "post to", "autopost", "auto-post", "cross-post", "crossposting",
        "cross posting", "buffer", "hootsuite", "social media management",
        "social media scheduler", "social media scheduling",
        "social media automation", "publishing", "posting",
        "content distribution", "distribution", "youtube uploader",
        "tiktok upload", "auto upload", "upload video", "scheduled post",
        "scheduled posts", "post scheduling", "socials", "auto poster",
    ],
    "thumbnails": [
        "thumbnail", "thumbnails", "hashtag", "hashtags",
        "title generator", "tag generator", "description generator",
        "cover image", "cover photo", "open graph", "meta tag",
        "thumbnail generator", "thumbnail maker", "thumbnail ai",
        "ctr", "seo tool", "seo tools", "seo title", "seo description",
        "seo optimized", "seo optimization",
    ],
    "analytics": [
        "analytics", "engagement", "impressions", "watch time", "retention",
        "click-through", "click through", "a/b test", "ab test",
        "performance dashboard", "analytics dashboard",
        "audience analytics", "channel analytics", "video analytics",
        "social analytics",
    ],
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
    if POOL_INPUT.exists():
        data = json.loads(POOL_INPUT.read_text())
        for case, entries in data.items():
            if not isinstance(entries, dict):
                continue
            for name, r in entries.items():
                repos.setdefault(name.lower(), {
                    "name": r.get("name", name),
                    "url": r.get("url", ""),
                    "description": r.get("description", ""),
                    "stars": r.get("stars", 0),
                    "forks": r.get("forks", 0),
                    "language": r.get("language", ""),
                    "topics": r.get("topics", []),
                    "pushed_at": r.get("pushed_at", ""),
                    "_src": "crawl",
                    "_seed_case": case,
                })
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

    # Workflow relevance: trend/idea/asset/publish/analytics lifecycle tools
    # (they may have no video/image generation keywords of their own).
    # A generic workflow-case word (analytics/publish/...) only counts when the
    # repo also shows video/content-creator context — keeps metabase/airflow out.
    wf_meta = kw_match(meta, WORKFLOW_STRONG)
    wf_readme = len(set(kw_hits(readme, WORKFLOW_STRONG))) >= 2
    wf_case_meta = kw_match(meta, WF_CONTEXT) and any(
        kw_match(meta, CASE_KEYWORDS[c]) for c in WORKFLOW_CASES
    )
    tab_workflow = wf_meta or wf_readme or wf_case_meta

    if not (tab_video or tab_image or tab_workflow):
        return None

    auto_hay = meta + " " + readme
    tab_automation = kw_match(auto_hay, AUTOMATION_KEYWORDS) and (tab_video or tab_image)

    case_hay = auto_hay
    cases = []
    for case, kws in CASE_KEYWORDS.items():
        if kw_match(case_hay, kws):
            cases.append(case)
    # Crawled tools are guaranteed the case that found them (and its tab).
    seed = repo.get("_seed_case")
    if seed:
        if seed in VIDEO_CASE_SET:
            tab_video = True
        if seed in IMAGE_CASE_SET:
            tab_image = True
        if seed in WORKFLOW_CASE_SET:
            tab_workflow = True
        if seed not in cases:
            cases.append(seed)
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
        "src": repo.get("_src", "starred"),
        "tabs": [t for t, ok in (("video", tab_video), ("image", tab_image),
                                 ("automation", tab_automation),
                                 ("workflow", tab_workflow)) if ok],
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
    crawled = sum(1 for r in repos if r.get("_src") == "crawl")
    print(f"  Loaded {len(repos)} unique repos ({crawled} from crawl pool)")

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
    workflow = [r for r in classified if "workflow" in r["tabs"]]

    for lst in (video, image, automation, workflow):
        lst.sort(key=lambda r: r["stars"], reverse=True)
    classified.sort(key=lambda r: r["stars"], reverse=True)

    all_cases = set()
    for r in classified:
        all_cases.update(r["cases"])
    all_cases = sorted(all_cases)

    print(f"  Video: {len(video)}")
    print(f"  Image: {len(image)}")
    print(f"  Automation: {len(automation)}")
    print(f"  Workflow: {len(workflow)}")
    print(f"  Total relevant: {len(classified)}")
    print(f"  Cases ({len(all_cases)}): {', '.join(all_cases)}")
    if video:
        print(f"  Top video: {video[0]['name']} ⭐{video[0]['stars']}")
    if image:
        print(f"  Top image: {image[0]['name']} ⭐{image[0]['stars']}")
    if workflow:
        print(f"  Top workflow: {workflow[0]['name']} ⭐{workflow[0]['stars']}")

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "video": len(video),
            "image": len(image),
            "automation": len(automation),
            "workflow": len(workflow),
            "total": len(classified),
            "cases": len(all_cases),
        },
        "cases": all_cases,
        "video": video,
        "image": image,
        "automation": automation,
        "workflow": workflow,
        "all": classified,
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False))
    size_kb = OUTPUT.stat().st_size / 1024
    print(f"\n  Wrote {OUTPUT.relative_to(ROOT)} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
