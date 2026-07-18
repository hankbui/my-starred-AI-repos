#!/usr/bin/env python3
"""
Generate China AI Landscape — Chinese open-source AI ecosystem, auto-discovered from GitHub.

Two sources (both optional):
  1. GitHub search for repos from Chinese AI orgs/companies
  2. Gitee trending (if GITEE_TOKEN env var is set)

Output: website/data/china-landscape.json
"""

import json
import os
import re
import time
from datetime import datetime, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv

from generate_data import GITHUB_API_URL, normalize_repo

REPO_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(REPO_ROOT / ".env")
WEBSITE_DATA_DIR = REPO_ROOT / "website" / "data"
OUTPUT_FILE = WEBSITE_DATA_DIR / "china-landscape.json"

GITHUB_TOKEN = os.getenv("SITE_DEPLOY_TOKEN") or os.getenv("GITHUB_TOKEN") or ""
HEADERS = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {GITHUB_TOKEN}",
    "User-Agent": "my-starred-ai-repos",
    "X-GitHub-Api-Version": "2022-11-28",
}

CHINESE_ORGS = [
    "PaddlePaddle", "modelscope", "THUDM", "InternLM", "deepseek-ai",
    "QwenLM", "01-ai", "ZhipuAI", "Baichuan-Inc", "MiniMax-AI",
    "StepFun", "MoonshotAI", "OpenMOSS", "XVERSE", "FlagOpen",
    "ColossalAI", "hpcaitech", "OpenMMLab", "Megvii", "SenseTime",
    "X-PLUG", "PKU-YuanGroup", "BAAI", "TsinghuaAI",
    "TencentARC", "Tencent", "alibaba", "AlibabaResearch",
    "aliyun", "baidu", "bytedance", "Doubao-Dev",
]

CHINESE_AI_QUERIES = [
    'org:alibaba topic:llm stars:>200',
    'org:alibaba topic:deep-learning stars:>500',
    'org:baidu topic:llm stars:>200',
    'org:PaddlePaddle stars:>1000',
    'org:THUDM stars:>300',
    'org:THUDM topic:llm',
    'org:InternLM stars:>200',
    'org:deepseek-ai stars:>200',
    'org:QwenLM stars:>200',
    'org:01-ai stars:>200',
    'org:modelscope stars:>300',
    'org:OpenMOSS stars:>100',
    'org:ColossalAI stars:>300',
    'org:hpcaitech stars:>300',
    'org:OpenMMLab stars:>500',
    'org:Megvii stars:>200',
    'org:SenseTime stars:>200',
    'org:TencentARC stars:>200',
    'org:BAAI stars:>300',
    'org:PKU-YuanGroup stars:>100',
    'org:FlagOpen stars:>100',
    'org:X-PLUG stars:>100',
    'org:MoonshotAI stars:>100',
    'org:Baichuan-Inc stars:>100',
    'org:ZhipuAI stars:>100',
    'topic:chatglm stars:>200',
    'topic:qwen stars:>200',
    'topic:deepseek stars:>200',
    'topic:internlm stars:>100',
    'topic:chinese-llm stars:>100',
]

PAGES_PER_QUERY = 2
MAX_REPOS = 500
SEARCH_SLEEP = 2.0


def classify_chinese_category(repo):
    name = (repo.get("name") or "").lower()
    desc = (repo.get("description") or "").lower()
    topics = " ".join(r.lower() for r in (repo.get("topics") or []))
    text = name + " " + desc + " " + topics

    if re.search(r'\b(llm|language.model|chat|dialogue|gpt|transformer)\b', text):
        return "LLM Model"
    if re.search(r'\b(agent|tool.use|function.call|multi.agent)\b', text):
        return "Agent Framework"
    if re.search(r'\b(framework|sdk|library|api)\b', text):
        return "Dev Tool"
    if re.search(r'\b(train|fine.tune|finetune|instruct|alignment|rlhf|dpo)\b', text):
        return "Training"
    if re.search(r'\b(inference|serving|deploy|optimiz|quantiz|engine|runtime)\b', text):
        return "Inference"
    if re.search(r'\b(video|image|vision|ocr|detection|recognition|segmentation|face|pose)\b', text):
        return "Vision"
    if re.search(r'\b(audio|voice|speech|tts|whisper|music|song)\b', text):
        return "Audio"
    if re.search(r'\b(dataset|data|benchmark|evaluation|eval)\b', text):
        return "Data"
    if re.search(r'\b(embedding|vector|retrieval|rag|search|index)\b', text):
        return "RAG & Search"
    if re.search(r'\b(platform|studio|dashboard|web|ui|app|console)\b', text):
        return "Platform"
    return "Other"


def _get(url, params=None, max_retries=4):
    for attempt in range(max_retries):
        resp = requests.get(url, headers=HEADERS, params=params, timeout=30)
        if resp.status_code == 403 and "rate limit" in resp.text.lower():
            reset = resp.headers.get("X-RateLimit-Reset")
            wait = 60
            if reset and reset.isdigit():
                wait = max(5, int(reset) - int(time.time()) + 2)
            print(f"    rate limited, sleeping {min(wait, 120)}s")
            time.sleep(min(wait, 120))
            continue
        if resp.status_code in (502, 503) and attempt < max_retries - 1:
            time.sleep(3 * (attempt + 1))
            continue
        return resp
    return resp


def search_github_repos():
    by_id = {}
    for query in CHINESE_AI_QUERIES:
        for page in range(1, PAGES_PER_QUERY + 1):
            resp = _get(
                f"{GITHUB_API_URL}/search/repositories",
                params={"q": query, "sort": "stars", "order": "desc", "per_page": 100, "page": page},
            )
            if resp.status_code != 200:
                print(f"  [WARN] search '{query}' p{page}: HTTP {resp.status_code}")
                break
            items = resp.json().get("items", [])
            for repo in items:
                if repo.get("fork") or repo.get("archived"):
                    continue
                by_id[repo["id"]] = repo
            print(f"  query '{query}' p{page}: +{len(items)} (total {len(by_id)})")
            time.sleep(SEARCH_SLEEP)
            if len(items) < 100:
                break

    repos = [normalize_repo(r) for r in by_id.values()]
    repos.sort(key=lambda r: r["stars"], reverse=True)
    repos = repos[:MAX_REPOS]

    for repo in repos:
        repo["china_category"] = classify_chinese_category(repo)

    return repos


def fetch_already_starred():
    existing_file = WEBSITE_DATA_DIR / "repos.json"
    if not existing_file.exists():
        return []
    data = json.loads(existing_file.read_text(encoding="utf-8"))
    combined = data.get("starred_repos", []) + data.get("trending_repos", [])
    by_id = {}
    for r in combined:
        by_id[r.get("id") or r.get("name")] = r
    return list(by_id.values())


def fetch_gitee_trending():
    token = os.getenv("GITEE_TOKEN")
    if not token:
        print("  GITEE_TOKEN not set — skipping Gitee")
        return []

    repos = []
    headers = {"User-Agent": "my-starred-ai-repos"}
    for page in range(1, 4):
        try:
            resp = requests.get(
                "https://gitee.com/api/v5/repos",
                params={
                    "access_token": token,
                    "type": "all",
                    "sort": "stars",
                    "direction": "desc",
                    "page": page,
                    "per_page": 50,
                },
                headers=headers,
                timeout=15,
            )
            if resp.status_code != 200:
                print(f"    Gitee page {page}: HTTP {resp.status_code}")
                break
            items = resp.json()
            for item in items:
                repos.append({
                    "id": f"gitee-{item.get('id')}",
                    "name": f"{item['owner']['login']}/{item['name']}",
                    "owner": item["owner"]["login"],
                    "repo_name": item["name"],
                    "url": item.get("html_url") or f"https://gitee.com/{item['owner']['login']}/{item['name']}",
                    "stars": item.get("stargazers_count", 0),
                    "forks": item.get("forks_count", 0),
                    "description": item.get("description") or "",
                    "language": item.get("language") or "",
                    "topics": [],
                    "category": "",
                    "default_branch": item.get("default_branch", "main"),
                    "china_category": classify_chinese_category(item),
                    "source": "gitee",
                })
            print(f"    Gitee page {page}: +{len(items)}")
            time.sleep(0.5)
        except requests.RequestException as e:
            print(f"    Gitee error: {e}")
            break

    return repos


def merge_history(existing, china_repos):
    existing_by_name = {}
    for r in existing:
        existing_by_name[r.get("name")] = r

    for repo in china_repos:
        match = existing_by_name.get(repo["name"])
        if match:
            repo["star_history"] = match.get("star_history", [])
            repo["readme_excerpt"] = match.get("readme_excerpt", "")

    return china_repos


def main():
    print("=" * 60)
    print("China AI Landscape Generator")
    print("=" * 60)

    print("\n[1/2] Searching GitHub for Chinese AI repos...")
    repos = search_github_repos()
    print(f"  found {len(repos)} repos via GitHub search")

    print("\n[2/2] Fetching Gitee trending (optional)...")
    gitee = fetch_gitee_trending()
    print(f"  found {len(gitee)} repos via Gitee")

    all_repos = repos + gitee
    by_key = {}
    for r in all_repos:
        key = r.get("name") or r.get("id")
        by_key[key] = r
    all_repos = list(by_key.values())
    all_repos.sort(key=lambda r: r["stars"], reverse=True)

    existing = fetch_already_starred()
    all_repos = merge_history(existing, all_repos)

    for idx, repo in enumerate(all_repos, start=1):
        repo["rank"] = idx

    category_counts = {}
    for r in all_repos:
        cat = r.get("china_category", "Other")
        category_counts[cat] = category_counts.get(cat, 0) + 1

    payload = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "counts": {
            "repos": len(all_repos),
            "github": len(repos),
            "gitee": len(gitee),
        },
        "categories": {cat: count for cat, count in sorted(category_counts.items(), key=lambda x: -x[1])},
        "repos": all_repos,
    }

    WEBSITE_DATA_DIR.mkdir(parents=True, exist_ok=True)
    OUTPUT_FILE.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved → {OUTPUT_FILE}")
    print(f"repos={len(all_repos)} (github={len(repos)}, gitee={len(gitee)})")
    print(f"categories: {json.dumps(category_counts, ensure_ascii=False)}")


if __name__ == "__main__":
    main()
