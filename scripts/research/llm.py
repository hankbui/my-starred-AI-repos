"""LLM integration for research analysis — auto-detects LM Studio or LLM7."""

from __future__ import annotations
import json
import os
import time
from typing import Optional
import requests

LMSTUDIO_URL = os.getenv('LMSTUDIO_URL', 'http://localhost:1234/v1')
LLM7_URL = 'https://api.llm7.io/v1'
LLM7_TOKEN = os.getenv('LLM7_TOKEN', 'unused')

CURATOR_SYS = (
    'You are a Staff AI Research Engineer and Product Strategist. '
    'Your job is to read research papers and extract technologies and product opportunities. '
    'Reply with STRICT JSON only, no prose, no markdown.'
)

OPPORTUNITY_SYS = (
    'You are a startup founder who turns AI research into product opportunities. '
    'For each technology, generate the most concrete, specific product idea you can. '
    'Reply with STRICT JSON array only, no prose, no markdown.'
)

PAPER_ANALYSIS_PROMPT = """Analyze this AI research paper for product potential. Return JSON with EXACTLY these keys:
{{
  "title": "{title}",
  "technologies": ["list of specific STANDARD technology names this paper introduces or advances"],
  "maturity": "early" | "medium" | "high",
  "confidence": <0.0-1.0>,
  "curator_score": <1-10>,
  "product_potential": ["2-3 concrete product ideas this enables"],
  "domain_applications": ["healthcare" | "education" | "robotics" | "creative" | "enterprise" | "accessibility" | "science" | "climate" | "finance" | "other"]
}}

CRITICAL: Technology names must be STANDARD research terms like:
"Mixture of Experts", "Knowledge Distillation", "KV Cache Optimization", "Sparse Attention",
"Retrieval Augmented Generation", "Reinforcement Learning from Human Feedback",
"Diffusion Models", "Vision Transformer", "Gaussian Splatting", "Chain-of-Thought Prompting",
"Speculative Decoding", "Low-Rank Adaptation", "Direct Preference Optimization",
"Multimodal Learning", "On-device AI", "Depth Estimation", "Object Detection"

NOT allowed: product descriptions like "Offline-first multimodal Android assistant",
"Custom banknote detector", "Multimodal feedback (speech, voice commands, vibration)"

Paper title: {title}
Authors: {authors}
Categories: {categories}
Published: {published}
Summary: {summary}"""

BRIEF_PROMPT = """You are an AI CTO reading today's research scan. Based on these {count} papers, write a brief with up to 5 key intelligence signals (fewer is OK if papers are few).

For each signal, focus on: what technology is moving fast, why it matters for product builders, and what concrete opportunity it creates.

Return STRICT JSON: {{"brief": ["signal 1", "signal 2", ...]}}

Even if there's only 1-2 papers, still write the best signals you can from the data.

Papers:
{papers}"""

TECHNOLOGY_EXTRACT_PROMPT = """From these analyzed papers, extract the key technologies with proper scores. For each technology:
- Count how many papers mention it
- Classify maturity (early/medium/high) — high means production-ready or widely adopted
- Estimate confidence (0.0-1.0) — based on paper depth, benchmark results, code availability
- Detect trend direction:
  - "breakout": rapid recent growth, many papers in short time
  - "rising": clear upward trajectory, growing interest
  - "emerging": just appeared, too early to tell
  - "peak": very hot but may be saturating
  - "maturing": well-established, incremental improvements
- List potential application domains (REQUIRED, at least 1)

CRITICAL RULES:
- confidence MUST be > 0.0 — infer from paper quality, benchmark results, citations
- applications MUST NOT be empty — infer at least 1-2 domains from paper content
- trend MUST differentiate — not all "emerging", use paper count + context

Return STRICT JSON array:
[{{"name": "...", "papers": <int>, "maturity": "...", "confidence": <float>, "trend": "...", "applications": ["...", "..."]}}]

Technologies found across papers (with paper context):
{technologies_list}"""

OPPORTUNITY_PROMPT = """Generate ONE concrete product opportunity for EVERY technology listed below. You CAN do this.

For each technology, produce exactly one entry:
- technology: exact name
- idea: a short product name + brief description (e.g. "AutoSlide: AI presentation generator from meeting notes")
- business_value: 1-10
- engineering_difficulty: 1-10
- competitive_advantage: "low" | "medium" | "high" | "very high"
- development_time: e.g. "2-4 weeks" or "1-3 months"

IMPORTANT: Return a JSON array with EXACTLY {count} entries, one per technology. Do not skip any.

Technologies:
{papers}"""


def pick_backend():
    lmstudio_available = False
    try:
        r = requests.get(f'{LMSTUDIO_URL}/models', timeout=2.5)
        if r.status_code < 500:
            lmstudio_available = True
    except Exception:
        pass

    if lmstudio_available:
        return {'type': 'lmstudio', 'url': LMSTUDIO_URL, 'model': 'local'}
    else:
        return {'type': 'llm7', 'url': LLM7_URL, 'model': 'default'}


def chat(messages: list[dict], temperature: float = 0.3, backend: dict = None) -> Optional[str]:
    backend = backend or pick_backend()
    url = backend['url'] + '/chat/completions'

    headers = {'Content-Type': 'application/json'}
    if backend['type'] == 'llm7':
        headers['Authorization'] = f'Bearer {LLM7_TOKEN}'

    body = {
        'model': backend['model'],
        'messages': messages,
        'temperature': temperature,
    }

    for attempt in range(3):
        try:
            resp = requests.post(url, headers=headers, json=body, timeout=120)
            if resp.status_code == 429:
                wait = 2 ** attempt
                print(f'  Rate limited, waiting {wait}s...')
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            return data['choices'][0]['message']['content']
        except Exception as e:
            print(f'  LLM attempt {attempt + 1} failed: {e}')
            if attempt < 2:
                time.sleep(2 ** attempt)
    return None


def parse_json(text: str) -> Optional[dict | list]:
    if not text:
        return None
    text = text.strip()
    text = text.removeprefix('```json').removeprefix('```').removesuffix('```').strip()
    start = text.find('{')
    if start == -1:
        start = text.find('[')
        if start == -1:
            return None
        # parse array
        depth = 0
        for i in range(start, len(text)):
            if text[i] == '[':
                depth += 1
            elif text[i] == ']':
                depth -= 1
                if depth == 0:
                    try:
                        return json.loads(text[start:i + 1])
                    except json.JSONDecodeError:
                        return None
        return None
    # parse object
    depth = 0
    for i in range(start, len(text)):
        if text[i] == '{':
            depth += 1
        elif text[i] == '}':
            depth -= 1
            if depth == 0:
                try:
                    return json.loads(text[start:i + 1])
                except json.JSONDecodeError:
                    return None
    return None


def analyze_paper(paper, backend: dict) -> Optional[dict]:
    prompt = PAPER_ANALYSIS_PROMPT.format(
        title=paper.title,
        authors=', '.join(paper.authors[:5]),
        categories=', '.join(paper.categories),
        published=paper.published,
        summary=paper.summary[:2000],
    )
    messages = [
        {'role': 'system', 'content': CURATOR_SYS},
        {'role': 'user', 'content': prompt},
    ]
    raw = chat(messages, temperature=0.2, backend=backend)
    return parse_json(raw)


def generate_brief(papers_text: str, count: int, backend: dict) -> Optional[list[str]]:
    prompt = BRIEF_PROMPT.format(count=count, papers=papers_text)
    messages = [
        {'role': 'system', 'content': CURATOR_SYS},
        {'role': 'user', 'content': prompt},
    ]
    raw = chat(messages, temperature=0.4, backend=backend)
    data = parse_json(raw)
    if data and isinstance(data, dict) and 'brief' in data:
        return data['brief']
    return None


def extract_technologies(tech_summary: str, backend: dict) -> Optional[list[dict]]:
    prompt = TECHNOLOGY_EXTRACT_PROMPT.format(technologies_list=tech_summary)
    messages = [
        {'role': 'system', 'content': CURATOR_SYS},
        {'role': 'user', 'content': prompt},
    ]
    raw = chat(messages, temperature=0.3, backend=backend)
    data = parse_json(raw)
    if data and isinstance(data, list):
        return data
    return None


def generate_opportunities(papers_data: str, backend: dict) -> Optional[list[dict]]:
    # count technologies (one per line)
    lines = [l for l in papers_data.strip().split('\n') if l.strip()]
    count = len(lines)
    if count > 15:
        lines = lines[:15]
        count = len(lines)
        print(f'    [truncated to {count} technologies for opportunities prompt]')

    papers_data = '\n'.join(lines)
    prompt = OPPORTUNITY_PROMPT.format(papers=papers_data, count=count)
    messages = [
        {'role': 'system', 'content': OPPORTUNITY_SYS},
        {'role': 'user', 'content': prompt},
    ]
    raw = chat(messages, temperature=0.5, backend=backend)
    print(f'    [RAW: {len(raw) if raw else 0} bytes]')
    if raw:
        print(f'    [RAW START]: {raw[:300]}')
        if len(raw) > 300:
            print(f'    [RAW END]: {raw[-200:]}')
    data = parse_json(raw)
    if data is None and raw:
        print(f'    [PARSE FAILED] Raw: {raw[:600]}')
    if data and isinstance(data, list):
        validated = [d for d in data if isinstance(d, dict) and 'technology' in d and 'idea' in d]
        print(f'    [PARSED: {len(data)} items, {len(validated)} valid]')
        if validated:
            return validated
        print(f'    [WARN] LLM returned data but missing required fields: {[d.get("technology", "?") for d in data[:5]]}')
        return None
    if data and isinstance(data, dict) and 'technology' in data:
        return [data]
    print(f'    [WARN] Could not parse opportunities from LLM response')
    return None
