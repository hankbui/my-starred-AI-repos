"""Discovery Graph — connects 3 data silos into a unified edge table.

Nodes: repositories, startup ideas, research technologies, papers.
Edges: keyword overlap between any two entities (≥2 shared keywords or 1 strong keyword).

Output: website/data/graph.json — consumed by discovery-graph.html
"""

from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "website" / "data"
RESEARCH_JSON = ROOT / "website" / "research" / "json"
OUTPUT = DATA / "graph.json"

STOPWORDS = frozenset({
    "a", "an", "the", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "by", "from", "as", "is", "it", "be", "are", "was", "were",
    "been", "being", "have", "has", "had", "do", "does", "did", "will", "would",
    "can", "could", "may", "might", "shall", "should", "not", "no", "nor",
    "using", "based", "new", "large", "small", "high", "low", "best", "good",
    "this", "that", "these", "those", "we", "you", "they", "our", "their",
    "use", "used", "set", "via", "vs", "per", "such", "more", "very", "own",
})

STRONG_TECH_KEYWORDS = frozenset({
    "transformer", "diffusion", "rag", "gpt", "llm", "vlm", "mcp", "a2a",
    "langchain", "llamaindex", "autogpt", "graphrag", "speculative decoding",
    "flash attention", "kv cache", "pagedattention", "mixture of experts",
    "moe", "lora", "qlora", "sft", "rlhf", "dpo", "grpo", "ppo",
    "vae", "gan", "nerf", "3d gaussian", "slam", "nerfstudio",
    "whisper", "bark", "cosyvoice", "voicebox", "audioldm",
    "clip", "siglip", "blip", "florence", "pali",
    "sam", "detr", "yolo", "grounding dino",
    "llava", "cogvlm", "internvl", "qwen-vl",
    "deepseek", "qwen", "mistral", "llama", "phi", "gemma",
    "stable diffusion", "sdxl", "flux", "midjourney",
    "opencv", "mediapipe", "tesseract",
    "sentence transformer", "bert", "t5", "bart",
    "langgraph", "crewai", "pydantic ai",
    "chromadb", "pinecone", "weaviate", "qdrant",
    "vllm", "tgi", "ollama", "llamacpp",
    "mlx", "coreml", "tensorrt", "onnx",
    "fastapi", "gradio", "streamlit", "chainlit",
})


def load_json(path: Path) -> dict | list:
    if not path.exists():
        return {}
    return json.loads(path.read_text())


def tokenize(text: str) -> set[str]:
    text = text.lower()
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    tokens = {t for t in text.split() if len(t) > 2 and t not in STOPWORDS}
    return tokens


def extract_phrases(text: str) -> set[str]:
    """Extract multi-word phrases (2-3 words) that match strong keywords."""
    text = text.lower()
    found = set()
    for kw in STRONG_TECH_KEYWORDS:
        if kw in text:
            found.add(kw)
    return found


def build_node_id(entity_type: str, key: str) -> str:
    return f"{entity_type}:{key}"


def build_nodes_and_edges() -> dict:
    # ── Load all 3 datasets ──
    repos_data = load_json(DATA / "repos.json")
    if isinstance(repos_data, dict):
        repos = repos_data.get("starred_repos", repos_data.get("repos", repos_data.get("items", [])))
    else:
        repos = []
    # Also include trending repos
    trending = repos_data.get("trending_repos", []) if isinstance(repos_data, dict) else []
    if trending:
        existing_names = {r.get("full_name", r.get("name", "")) for r in repos}
        for r in trending:
            name = r.get("full_name", r.get("name", ""))
            if name and name not in existing_names:
                repos.append(r)

    ideas_data = load_json(DATA / "ideas.json")
    ideas = ideas_data.get("ideas", [])

    research = load_json(RESEARCH_JSON / "index.json")
    papers = research.get("papers", [])
    technologies = research.get("technologies", [])

    # ── Pre-process text for matching ──

    def norm(text: str) -> str:
        return re.sub(r"[^a-z0-9\s]", " ", text.lower())

    def text_set(text: str) -> set[str]:
        return {t for t in norm(text).split() if len(t) > 2 and t not in STOPWORDS}

    # Tech → normalized index for matching
    tech_index: dict[str, dict] = {}
    for t in technologies:
        tn = t.get("name", "")
        if not tn:
            continue
        tech_index[tn] = t

    # ── Build nodes ──
    nodes: dict[str, dict] = {}

    def add_n(node_id: str, node_type: str, label: str, href: str = "", meta: dict | None = None):
        if node_id not in nodes:
            nodes[node_id] = {
                "id": node_id,
                "type": node_type,
                "label": label,
                "href": href,
                **(meta or {}),
            }

    all_tech_aliases: dict[str, str] = {}
    for tn in tech_index:
        all_tech_aliases[tn.lower()] = tn
        all_tech_aliases[tn.lower().replace(" ", "")] = tn
        all_tech_aliases[tn.lower().replace("-", "")] = tn

    # ── Edge building ──
    # We only build cross-type edges with explicit match rules:
    #   1. Paper ↔ Technology  (explicit from data)
    #   2. Technology ↔ Repo   (tech name appears in repo description/topics)
    #   3. Technology ↔ Idea   (tech name appears in idea title/description)
    #   4. Repo ↔ Idea         (shared technology interest — both reference same tech)

    edges: list[dict] = []
    edge_set: set[tuple[str, str]] = set()

    def add_edge(src: str, tgt: str, weight: int, keywords: list[str]):
        a, b = (src, tgt) if src < tgt else (tgt, src)
        key = (a, b)
        if key in edge_set:
            return
        edge_set.add(key)
        edges.append({"source": src, "target": tgt, "weight": weight, "keywords": keywords[:3]})

    # ── 1. Paper ↔ Technology (direct from research data) ──
    for p in papers:
        pid = build_node_id("paper", p.get("id", ""))
        title = p.get("title", "")[:80]
        add_n(pid, "paper", title, p.get("url", ""), {"confidence": p.get("confidence", 0)})
        for tech_name in p.get("technologies", []):
            tn = tech_name.strip()
            tid = build_node_id("tech", tn)
            add_n(tid, "tech", tn, f"technologies.html?q={tn}", {
                "confidence": tech_index.get(tn, {}).get("confidence", 0),
                "maturity": tech_index.get(tn, {}).get("maturity", ""),
                "trend": tech_index.get(tn, {}).get("trend", ""),
            })
            add_edge(pid, tid, 5, [tn])

    # ── 2. Technology ↔ Repo (tech name in repo topics/description) ──
    # Limit to top 200 repos by stars to keep things manageable
    sorted_repos = sorted(repos, key=lambda r: r.get("stargazers_count", r.get("stars", 0)), reverse=True)
    for r in sorted_repos[:300]:
        name = r.get("full_name", r.get("name", ""))
        if not name:
            continue
        rid = build_node_id("repo", name)
        desc = r.get("description") or ""
        topics = " ".join(r.get("topics", []))
        lang = r.get("language") or ""
        stars = r.get("stargazers_count", r.get("stars", 0))
        add_n(rid, "repo", name, f"https://github.com/{name}", {"stars": stars, "language": lang})

        haystack = (desc + " " + topics + " " + lang).lower()
        matched_techs = set()
        for tn in tech_index:
            alias = tn.lower()
            if alias in haystack or alias.replace(" ", "") in haystack or alias.replace("-", "") in haystack:
                matched_techs.add(tn)
        # Also check strong keywords
        for kw in STRONG_TECH_KEYWORDS:
            if kw in haystack:
                matched_techs.add(kw)
        for tn in matched_techs:
            tid = build_node_id("tech", tn)
            add_n(tid, "tech", tn)
            add_edge(rid, tid, 3, [tn])

    # ── 3. Technology ↔ Idea (tech name in idea title/description) ──
    for idea in ideas:
        iid = build_node_id("idea", idea.get("id", ""))
        title = idea.get("title", "")
        desc = idea.get("description", "")
        tags = " ".join(idea.get("tags", []))
        revenue = bool(idea.get("revenue_signal"))
        add_n(iid, "idea", title, idea.get("url", ""), {
            "source": idea.get("source", ""),
            "score": idea.get("score", 0),
            "revenue": revenue,
            "composite_score": idea.get("composite_score", 0),
        })

        haystack = (title + " " + desc + " " + tags).lower()
        matched_techs = set()
        for tn in tech_index:
            alias = tn.lower()
            if alias in haystack or alias.replace(" ", "") in haystack or alias.replace("-", "") in haystack:
                matched_techs.add(tn)
        for kw in STRONG_TECH_KEYWORDS:
            if kw in haystack:
                matched_techs.add(kw)
        for tn in matched_techs:
            tid = build_node_id("tech", tn)
            add_n(tid, "tech", tn)
            add_edge(iid, tid, 3, [tn])

    # ── 4. Repo ↔ Idea (both connected to same technology) ──
    # Find repo-idea pairs that share at least one technology
    repo_techs: dict[str, set[str]] = {}
    idea_techs: dict[str, set[str]] = {}
    for e in edges:
        s, t = e["source"], e["target"]
        if s.startswith("repo:") and t.startswith("tech:"):
            repo_techs.setdefault(s, set()).add(t)
        elif s.startswith("tech:") and t.startswith("repo:"):
            repo_techs.setdefault(t, set()).add(s)
        if s.startswith("idea:") and t.startswith("tech:"):
            idea_techs.setdefault(s, set()).add(t)
        elif s.startswith("tech:") and t.startswith("idea:"):
            idea_techs.setdefault(t, set()).add(s)

    for rid, rtechs in repo_techs.items():
        for iid, itechs in idea_techs.items():
            shared = rtechs & itechs
            if shared:
                add_edge(rid, iid, 2, [tn.replace("tech:", "") for tn in list(shared)[:3]])

    # ── Stratified node selection (200 max, fair per-type representation) ──
    degree: Counter = Counter()
    for e in edges:
        degree[e["source"]] += e["weight"]
        degree[e["target"]] += e["weight"]

    # Group node IDs by type, then sort each group by degree descending
    by_type_nodes: dict[str, list[str]] = defaultdict(list)
    for nid in nodes:
        t = nodes[nid]["type"]
        by_type_nodes[t].append(nid)
    for t in by_type_nodes:
        by_type_nodes[t].sort(key=lambda nid: degree.get(nid, 0), reverse=True)

    available = {t: len(nids) for t, nids in by_type_nodes.items()}
    # Fixed per-type budgets for balanced representation
    budgets = {
        "paper": min(available.get("paper", 0), 30),
        "tech": min(available.get("tech", 0), 50),
        "idea": min(available.get("idea", 0), 80),
    }
    used = sum(budgets.values())
    budgets["repo"] = min(available.get("repo", 0), 200 - used)

    top_node_ids: set[str] = set()
    for t, budget in budgets.items():
        top_node_ids.update(by_type_nodes[t][:budget])

    pruned_nodes = {nid: n for nid, n in nodes.items() if nid in top_node_ids}
    pruned_ids = set(pruned_nodes.keys())
    pruned_edges = [e for e in edges if e["source"] in pruned_ids and e["target"] in pruned_ids]

    by_type = Counter(n["type"] for n in pruned_nodes.values())

    # ── Stats ──
    by_type = Counter(n["type"] for n in pruned_nodes.values())

    graph = {
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "nodes": list(pruned_nodes.values()),
        "edges": pruned_edges,
        "stats": {
            "nodes": len(pruned_nodes),
            "edges": len(pruned_edges),
            "by_type": dict(by_type),
        },
    }

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(graph, indent=2, ensure_ascii=False))
    print(f"Discovery Graph written to {OUTPUT}")
    print(f"  Nodes: {graph['stats']['nodes']} ({', '.join(f'{k}={v}' for k,v in by_type.items())})")
    print(f"  Edges: {graph['stats']['edges']}")
    return graph


if __name__ == "__main__":
    build_nodes_and_edges()
