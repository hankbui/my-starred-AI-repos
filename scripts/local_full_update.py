#!/usr/bin/env python3
"""
Local Full Update — chạy trên Mac Studio (hoặc MacBook qua symlink tới Mac Studio).
- Cào dữ liệu repo từ GitHub API
- Phân loại agent/skill + use-case bằng LLM local (endpoint trên Mac Studio)
- Lưu append-only history (không ghi đè/xóa cũ)
- Commit & push lên GitHub tự động
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
load_dotenv(ENV_FILE)

# ---------- Config ----------
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
GITHUB_USERNAME = os.getenv("GITHUB_USERNAME", "hankbui")
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://localhost:11434")  # endpoint LLM local trên Mac Studio
LLM_MODEL = os.getenv("LLM_MODEL", "llama3.1")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")

REPOS_OUTPUT = ROOT / "website" / "data" / "repos.json"
SKILLS_OUTPUT = ROOT / "website" / "data" / "agent-skills.json"
VIDEO_OUTPUT = ROOT / "website" / "data" / "video-production.json"
HISTORY_DIR = ROOT / "data" / "history" / "agent-skills"
STATE_FILE = ROOT / "data" / "history" / "local_update_state.json"

MAX_REPOS = 300
PER_PAGE = 100
FAIL_ABORT = 5          # consecutive LLM failures before aborting (checkpoint kept)
LLM_TIMEOUT = 180

# Preferred chat models when the configured LLM_MODEL is not loaded.
MODEL_PREFERENCE = [
    "qwen3.8-27b", "qwen/qwen3.8-27b", "gpt-oss-20b", "qwen3-coder-next",
    "qwen/qwen3-coder-next", "minimax-h3", "kimi-k3.1-pro-superexpert-12gb",
    "google/gemma-4-e4b", "nvidia/nemotron-3-nano-omni",
]

HEADERS = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "User-Agent": "my-starred-ai-local-update",
    "X-GitHub-Api-Version": "2022-11-28",
}

USE_CASES = [
    "marketing", "coding", "writing", "design", "sales", "research",
    "data", "finance", "legal", "healthcare", "education",
    "customer-support", "productivity", "ai",
]

CLASSIFY_SYSTEM = (
    "You classify GitHub repos. Respond ONLY with valid JSON: "
    "{\"is_agent\": bool, \"is_skill\": bool, \"use_cases\": [string]}. "
    "Allowed use_cases: " + ", ".join(USE_CASES) + "."
)


# ---------- GitHub crawling (cào dữ liệu ra ngoài) ----------

def fetch_github_repos() -> List[Dict[str, Any]]:
    """Cào danh sách starred repos của user từ GitHub API."""
    if not GITHUB_TOKEN:
        raise SystemExit("ERROR: GITHUB_TOKEN not found in .env")

    repos: List[Dict[str, Any]] = []
    page = 1
    while len(repos) < MAX_REPOS:
        url = (
            f"https://api.github.com/users/{GITHUB_USERNAME}/starred"
            f"?per_page={PER_PAGE}&page={page}&sort=updated&direction=desc"
        )
        resp = requests.get(url, headers=HEADERS, timeout=60)
        if resp.status_code != 200:
            print(f"  [WARN] GitHub API HTTP {resp.status_code} at page {page}, stopping.")
            break
        batch = resp.json()
        if not batch:
            break
        for item in batch:
            repo = item.get("repo", item)
            repos.append({
                "id": repo["id"],
                "name": repo["full_name"],
                "owner": repo["owner"]["login"],
                "repo_name": repo["name"],
                "url": repo["html_url"],
                "description": repo.get("description") or "",
                "stars": repo.get("stargazers_count", 0),
                "forks": repo.get("forks_count", 0),
                "language": repo.get("language") or "",
                "topics": (repo.get("topics") or [])[:5],
                "pushed_at": (repo.get("pushed_at") or repo.get("updated_at") or "")[:10],
                "category": "",  # sẽ gán rule-based sau khi crawl
                "trend_score": 0,
                "delta_7d": 0,
            })
        page += 1
        time.sleep(0.2)
        if len(batch) < PER_PAGE:
            break

    print(f"  Crawled {len(repos)} starred repos from GitHub API")
    return repos


# ---------- LLM local classification ----------

def llm_headers() -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"
    return headers


def resolve_model() -> str | None:
    """Pick a loaded chat model from LM Studio (configured model first)."""
    try:
        r = requests.get(f"{LLM_BASE_URL}/v1/models", headers=llm_headers(), timeout=10)
        if r.status_code != 200:
            return None
        ids = [m.get("id", "") for m in r.json().get("data", []) if m.get("id")]
        if not ids:
            return None
    except Exception as e:  # noqa: BLE001
        print(f"  [LM Studio] not reachable at {LLM_BASE_URL}: {e}")
        return None

    for want in [LLM_MODEL, *MODEL_PREFERENCE]:
        for mid in ids:
            if mid == want or mid.split("/")[-1] == want.split("/")[-1]:
                return mid
    # fallback: first non-embedding model
    for mid in ids:
        if "embedding" not in mid.lower():
            return mid
    return None


def llm_classify(repo: Dict[str, Any]) -> Dict[str, Any] | None:
    """Gọi LLM local để phân loại agent/skill + use-case.

    Returns None when the endpoint is unreachable (caller aborts or retries,
    checkpoint stays intact). Returns a default item when the LLM answered but
    the JSON was unparseable (that repo is still marked done).
    """
    name = repo.get("name", "") or ""
    desc = (repo.get("description", "") or "")[:400]
    topics = repo.get("topics") or []
    category = repo.get("category", "") or ""

    prompt = f"""
Repo name: {name}
Description: {desc}
Topics: {', '.join(topics)}
Category: {category}

Classify into JSON: {{"is_agent": bool, "is_skill": bool, "use_cases": [string]}}
Use only these use_cases: {', '.join(USE_CASES)}
"""

    payload = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": CLASSIFY_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }

    # Thử /v1/chat/completions trước (OpenAI-compatible, hoạt động với LM Studio)
    try:
        resp = requests.post(f"{LLM_BASE_URL}/v1/chat/completions", json=payload, headers=llm_headers(), timeout=LLM_TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            raw = data.get("choices", [{}])[0].get("message", {}).get("content", "")
            if raw.strip():
                return _parse_llm_json(raw, repo)
        else:
            print(f"    [WARN] /v1/chat/completions HTTP {resp.status_code}")
    except Exception as e:
        print(f"    [WARN] /v1/chat/completions failed: {e}")

    # Fallback: Ollama /api/chat
    payload_ollama = {
        "model": LLM_MODEL,
        "messages": [
            {"role": "system", "content": CLASSIFY_SYSTEM},
            {"role": "user", "content": prompt},
        ],
        "stream": False,
        "options": {"temperature": 0.2},
    }
    try:
        resp = requests.post(f"{LLM_BASE_URL}/api/chat", json=payload_ollama, headers=llm_headers(), timeout=LLM_TIMEOUT)
        if resp.status_code == 200:
            data = resp.json()
            raw = data.get("message", {}).get("content", "")
            if raw.strip():
                return _parse_llm_json(raw, repo)
    except Exception as e:
        print(f"    [WARN] Ollama /api/chat failed: {e}")

    # Endpoint không trả lời được -> None (caller abort/retry, KHÔNG đánh dấu done)
    return None


def _parse_llm_json(raw: str, repo: Dict[str, Any]) -> Dict[str, Any]:
    raw = raw.strip()
    if raw.startswith("```json"):
        raw = raw[7:]
    elif raw.startswith("```"):
        raw = raw[3:]
    if raw.endswith("```"):
        raw = raw[:-3]
    raw = raw.strip()
    try:
        parsed = json.loads(raw)
    except Exception:
        parsed = {}

    return {
        "id": repo.get("name", ""),
        "name": repo.get("name", ""),
        "url": repo.get("url", ""),
        "description": (repo.get("description", "") or "")[:300],
        "stars": repo.get("stars", 0),
        "category": repo.get("category", ""),
        "language": repo.get("language", ""),
        "topics": [t for t in (repo.get("topics") or []) if t][:10],
        "trend_score": round(repo.get("trend_score", 0) or 0, 1),
        "delta_7d": repo.get("delta_7d", 0) or 0,
        "is_agent": bool(parsed.get("is_agent", False)),
        "is_skill": bool(parsed.get("is_skill", False)),
        "use_cases": [uc for uc in (parsed.get("use_cases") or []) if uc in USE_CASES],
    }


def _default_item(repo: Dict[str, Any]) -> Dict[str, Any]:
    return {
        "id": repo.get("name", ""),
        "name": repo.get("name", ""),
        "url": repo.get("url", ""),
        "description": (repo.get("description", "") or "")[:300],
        "stars": repo.get("stars", 0),
        "category": repo.get("category", ""),
        "language": repo.get("language", ""),
        "topics": [t for t in (repo.get("topics") or []) if t][:10],
        "trend_score": round(repo.get("trend_score", 0) or 0, 1),
        "delta_7d": repo.get("delta_7d", 0) or 0,
        "is_agent": False,
        "is_skill": False,
        "use_cases": [],
    }


# ---------- Build payload ----------

def build_payload(classified: List[Dict[str, Any]]) -> Dict[str, Any]:
    agents = [r for r in classified if r["is_agent"]]
    skills = [r for r in classified if r["is_skill"]]
    agents.sort(key=lambda r: r["stars"], reverse=True)
    skills.sort(key=lambda r: r["stars"], reverse=True)

    all_uc = sorted({uc for r in classified for uc in r["use_cases"]})

    return {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "stats": {
            "agents": len(agents),
            "skills": len(skills),
            "use_cases": len(all_uc),
        },
        "use_cases": all_uc,
        "agents": agents,
        "skills": skills,
    }


# ---------- Append-only history ----------

def save_history_snapshot(payload: Dict[str, Any]) -> Path:
    HISTORY_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    path = HISTORY_DIR / f"agent-skills-{stamp}.json"
    path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    return path


# ---------- Checkpoint / resume ----------

def repos_signature(repos: List[Dict[str, Any]]) -> str:
    import hashlib
    names = sorted((r.get("name") or "") for r in repos)
    return hashlib.sha1("\n".join(names).encode("utf-8")).hexdigest()


def load_state() -> Dict[str, Any]:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text(encoding="utf-8"))
        except Exception:  # noqa: BLE001
            pass
    return {}


def save_state(state: Dict[str, Any]) -> None:
    STATE_FILE.parent.mkdir(parents=True, exist_ok=True)
    tmp = STATE_FILE.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")
    tmp.replace(STATE_FILE)


def clear_state() -> None:
    if STATE_FILE.exists():
        STATE_FILE.unlink()


# ---------- Git ----------

def git_commit_push(files: List[Path]) -> None:
    if not files:
        print("  Nothing to commit.")
        return

    rel_files = [str(f.relative_to(ROOT)) for f in files]

    # Kiểm tra có thay đổi thực sự không
    r1 = subprocess.run(["git", "diff", "--quiet", "--", *rel_files], cwd=ROOT)
    r2 = subprocess.run(["git", "diff", "--cached", "--quiet", "--", *rel_files], cwd=ROOT)
    if r1.returncode == 0 and r2.returncode == 0:
        print("  No changes detected, skipping commit.")
        return

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    subprocess.run(["git", "add", *rel_files], cwd=ROOT, check=True)
    subprocess.run(
        ["git", "commit", "-m", f"chore: local update agent-skills data ({stamp}) [skip ci]"],
        cwd=ROOT,
        check=True,
    )
    subprocess.run(["git", "push"], cwd=ROOT, check=True)
    print(f"  Committed & pushed: {', '.join(rel_files)}")


# ---------- Main ----------


CATEGORY_RULES = [
    ("Vision & Media", ["vision","image","video","audio","voice","speech","ocr","transcription","tts","whisper","diffusion"]),
    ("Data & Evaluation", ["dataset","benchmark","eval","evaluation","synthetic data","label","annotation","leaderboard","scoring"]),
    ("Infrastructure", ["deployment","infra","infrastructure","runtime","serving","server","docker","kubernetes","serverless","cloud","gpu"]),
    ("Developer Tools", ["cli","sdk","editor","extension","plugin","debug","testing","monitoring","observability","terminal"]),
    ("Agents & Automation", ["agent","multi-agent","workflow","automation","browser","scraper","crawler","orchestr","task runner"]),
    ("AI Engineering", ["llm","rag","embedding","prompt","vector","semantic search","langchain","llamaindex","guardrail","tool calling"]),
    ("Models & Inference", ["model","transformer","checkpoint","fine-tun","inference","quantiz","llama","mistral","qwen","gemma","deepseek"]),
    ("Applications", ["assistant","copilot","chatbot","chat","app","studio","workspace","productivity"]),
    ("Research & Knowledge", ["research","paper","arxiv","knowledge","docs","documentation","tutorial","course","awesome"]),
]

def categorize_repo(repo):
    text = ' '.join([repo.get('name',''), repo.get('description','') or '', repo.get('language','') or '', ' '.join(repo.get('topics') or [])]).lower()
    for cat, kws in CATEGORY_RULES:
        if any(k in text for k in kws):
            return cat
    return 'Other'

def activity_for_repo(repo):
    pushed = repo.get('pushed_at') or repo.get('updated_at') or ''
    try:
        pushed_date = datetime.fromisoformat(pushed[:10]) if pushed else None
    except Exception:
        pushed_date = None
    if not pushed_date:
        return 'Quiet'
    days = (datetime.now(timezone.utc).date() - pushed_date.date()).days
    if days <= 3: return 'Hot'
    if days <= 14: return 'Active'
    if days <= 45: return 'Steady'
    return 'Quiet'

def main() -> None:
    global LLM_MODEL
    print("=" * 60)
    print("Local Full Update (GitHub crawl + LLM local classify)")
    print("=" * 60)
    print(f"  LLM endpoint: {LLM_BASE_URL}")
    print(f"  LLM model (configured): {LLM_MODEL}")

    # 0. Resolve a loaded model (LM Studio / Ollama) before doing any work
    resolved = resolve_model()
    if not resolved:
        print(f"  [ERROR] LM Studio not reachable at {LLM_BASE_URL}")
        print("  → Open LM Studio (load a chat model), then re-run — progress is kept.")
        raise SystemExit(2)
    if resolved != LLM_MODEL:
        print(f"  [LM Studio] using loaded model '{resolved}' (configured '{LLM_MODEL}' not loaded)")
    LLM_MODEL = resolved

    # 1. Crawl GitHub
    repos = fetch_github_repos()

    # Assign category + activity rule-based (fast, no LLM needed)
    for r in repos:
        if not r.get('category'):
            r['category'] = categorize_repo(r)
        if not r.get('activity'):
            r['activity'] = activity_for_repo(r)
        if not r.get('stack_layer'):
            r['stack_layer'] = 'Other'

    # 2. Luu du lieu goc repos.json
    REPOS_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    # repos duoc crawl tu GitHub starred API -> gan cho starred_repos (mac dinh view cua index.html)
    # cung gan cung cho trending_repos de ca hai view deu co du lieu
    repos_payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "trending_repos": repos,
        "starred_repos": repos,
    }
    REPOS_OUTPUT.write_text(json.dumps(repos_payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  Wrote {REPOS_OUTPUT.relative_to(ROOT)} (starred={len(repos)}, trending={len(repos)})")

    # 3. Classify bang LLM local (resume-aware checkpoint)
    sig = repos_signature(repos)
    state = load_state()
    if state.get("signature") == sig and isinstance(state.get("classified"), list):
        done = set(state.get("done") or [])
        classified = [it for it in state["classified"] if it.get("name") in done]
        print(f"  Resuming from checkpoint: {len(done)}/{len(repos)} done")
    else:
        done = set()
        classified = []
        print("  Starting fresh classification (no matching checkpoint)")

    consecutive_fail = 0
    for i, repo in enumerate(repos, 1):
        name = repo.get("name") or ""
        if name in done:
            continue
        item = llm_classify(repo)
        if item is None:
            consecutive_fail += 1
            print(f"  [{i}/{len(repos)}] {name[:60]:60s} LLM unreachable ({consecutive_fail}/{FAIL_ABORT})")
            if consecutive_fail >= FAIL_ABORT:
                save_state({"signature": sig, "done": sorted(done),
                            "classified": classified})
                print(f"  [ABORT] LM Studio unreachable {consecutive_fail}x — checkpoint saved "
                      f"({len(done)}/{len(repos)} done). Restart LM Studio and re-run to resume.")
                raise SystemExit(3)
            continue
        consecutive_fail = 0
        classified.append(item)
        done.add(name)
        save_state({"signature": sig, "done": sorted(done), "classified": classified})
        print(f"  [{i}/{len(repos)}] {item['name'][:60]:60s} -> agent={item['is_agent']} skill={item['is_skill']}")
        time.sleep(0.1)  # tranh qua tai LLM local

    print(f"  Classified: {len(classified)}/{len(repos)}")

    # 4. Build payload
    payload = build_payload(classified)
    print(f"  Agents: {payload['stats']['agents']} | Skills: {payload['stats']['skills']} | Use-cases: {payload['stats']['use_cases']}")

    # 5. Append-only history (khong ghi de/xoa cu)
    hist_path = save_history_snapshot(payload)
    print(f"  History snapshot: {hist_path.relative_to(ROOT)}")

    # 6. Cap nhat file chinh cho frontend
    SKILLS_OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    SKILLS_OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
    print(f"  Wrote {SKILLS_OUTPUT.relative_to(ROOT)}")

    # 6b. Crawl valuable video tools (append-only pool) then build
    #     video-production data (video / image / automation / workflow tabs)
    VIDEO_OUTPUT = ROOT / "website" / "data" / "video-production.json"
    crawl = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "crawl_video_tools.py")],
        cwd=ROOT,
    )
    if crawl.returncode != 0:
        print("  [WARN] crawl_video_tools.py failed — using existing pool")
    vp = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "generate_video_production.py")],
        cwd=ROOT,
    )
    if vp.returncode != 0:
        print("  [WARN] generate_video_production.py failed — keeping previous data")

    # 7. Commit & push
    git_commit_push([REPOS_OUTPUT, SKILLS_OUTPUT, VIDEO_OUTPUT, hist_path])

    # 8. Done — clear checkpoint so the next run starts fresh
    clear_state()
    print("  Checkpoint cleared — update complete.")


if __name__ == "__main__":
    main()