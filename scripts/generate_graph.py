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
        repos = repos_data.get("repos", repos_data.get("items", []))
    else:
        repos = []

    ideas_data = load_json(DATA / "ideas.json")
    ideas = ideas_data.get("ideas", [])

    research = load_json(RESEARCH_JSON / "index.json")
    papers = research.get("papers", [])
    technologies = research.get("technologies", [])

    # ── Build nodes ──
    nodes: dict[str, dict] = {}
    inverted: dict[str, list[str]] = defaultdict(list)
    frequency: Counter = Counter()

    def add_node(node_id: str, node_type: str, label: str, href: str = "", meta: dict | None = None):
        if node_id not in nodes:
            nodes[node_id] = {
                "id": node_id,
                "type": node_type,
                "label": label,
                "href": href,
                **(meta or {}),
            }

    def index_tokens(node_id: str, tokens: set[str]):
        for tok in tokens:
            inverted[tok].append(node_id)
            frequency[tok] += 1

    # Repo nodes
    for r in repos:
        name = r.get("full_name", r.get("name", ""))
        if not name:
            continue
        nid = build_node_id("repo", name)
        desc = r.get("description") or ""
        topics = " ".join(r.get("topics", []))
        lang = r.get("language") or ""
        stars = r.get("stargazers_count", r.get("stars", 0))
        add_node(nid, "repo", name, f"https://github.com/{name}", {"stars": stars, "language": lang})
        tokens = tokenize(desc + " " + topics + " " + lang)
        tokens |= extract_phrases(desc + " " + topics)
        index_tokens(nid, tokens)

    # Idea nodes
    for idea in ideas:
        iid = build_node_id("idea", idea.get("id", ""))
        title = idea.get("title", "")
        desc = idea.get("description", "")
        tags = " ".join(idea.get("tags", []))
        cat = idea.get("category", "")
        revenue = idea.get("revenue_signal") or ""
        add_node(iid, "idea", title, idea.get("url", ""), {
            "source": idea.get("source", ""),
            "score": idea.get("score", 0),
            "revenue": bool(idea.get("revenue_signal")),
            "composite_score": idea.get("composite_score", 0),
        })
        tokens = tokenize(title + " " + desc + " " + tags + " " + cat + " " + revenue)
        tokens |= extract_phrases(title + " " + desc + " " + tags)
        index_tokens(iid, tokens)

    # Technology nodes
    for t in technologies:
        tn = t.get("name", "")
        if not tn:
            continue
        nid = build_node_id("tech", tn)
        add_node(nid, "tech", tn, f"technologies.html?q={tn}", {
            "confidence": t.get("confidence", 0),
            "maturity": t.get("maturity", ""),
            "trend": t.get("trend", ""),
        })
        tokens = tokenize(tn) | extract_phrases(tn)
        index_tokens(nid, tokens)

    # Paper nodes
    for p in papers:
        pid = build_node_id("paper", p.get("id", ""))
        title = p.get("title", "")
        summary = p.get("summary", "")
        add_node(pid, "paper", title[:80], p.get("url", ""), {
            "confidence": p.get("confidence", 0),
        })
        tokens = tokenize(title + " " + summary)
        tokens |= extract_phrases(title + " " + summary)
        # Also add technology mentions as strong links
        for tech_name in p.get("technologies", []):
            tech_nid = build_node_id("tech", tech_name)
            if tech_nid in nodes:
                tokens.add(tech_name.lower())
        index_tokens(pid, tokens)

    # ── Filter common tokens (>30% of all nodes) ──
    total_nodes = len(nodes)
    common_threshold = max(3, total_nodes * 0.30)
    common_tokens = {tok for tok, count in frequency.items() if count > common_threshold}

    # ── Build edges ──
    edges: list[dict] = []
    edge_set: set[tuple[str, str]] = set()

    for tok, node_ids in inverted.items():
        if tok in common_tokens:
            continue
        ids = [nid for nid in node_ids if nid in nodes]
        if len(ids) < 2:
            continue
        for i in range(len(ids)):
            for j in range(i + 1, len(ids)):
                src, tgt = ids[i], ids[j]
                if src == tgt:
                    continue
                key = (src, tgt) if src < tgt else (tgt, src)
                if key in edge_set:
                    continue
                edge_set.add(key)
                weight = 3 if tok in STRONG_TECH_KEYWORDS else 1
                edges.append({"source": src, "target": tgt, "weight": weight, "keyword": tok})

    # ── Merge multi-keyword edges ──
    edge_map: dict[tuple[str, str], list[str]] = defaultdict(list)
    for e in edges:
        key = (e["source"], e["target"])
        edge_map[key].append(e["keyword"])

    merged_edges = []
    for (src, tgt), keywords in edge_map.items():
        weight = min(10, 1 + sum(3 if kw in STRONG_TECH_KEYWORDS else 1 for kw in keywords))
        merged_edges.append({
            "source": src,
            "target": tgt,
            "weight": weight,
            "keywords": keywords[:5],
        })

    # ── Prune to top 200 nodes by degree ──
    degree: Counter = Counter()
    for e in merged_edges:
        degree[e["source"]] += e["weight"]
        degree[e["target"]] += e["weight"]

    top_nodes = {nid for nid, _ in degree.most_common(200)}
    # Always keep nodes with degree > 0
    pruned_nodes = {nid: n for nid, n in nodes.items() if nid in top_nodes and degree.get(nid, 0) > 0}
    pruned_node_ids = set(pruned_nodes.keys())

    pruned_edges = [
        e for e in merged_edges
        if e["source"] in pruned_node_ids and e["target"] in pruned_node_ids
    ]

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
