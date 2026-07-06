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

PAPER_ANALYSIS_PROMPT = """Analyze this AI research paper for product potential. Return JSON with EXACTLY these keys:
{{
  "title": "{title}",
  "technologies": ["list of specific technology names this paper introduces or advances"],
  "maturity": "early" | "medium" | "high",
  "confidence": <0.0-1.0>,
  "curator_score": <1-10>,
  "product_potential": ["2-3 concrete product ideas this enables"]
}}

Paper title: {title}
Authors: {authors}
Categories: {categories}
Published: {published}
Summary: {summary}"""

BRIEF_PROMPT = """You are an AI CTO reading today's research scan. Based on these {count} papers, write a brief with exactly 5 key intelligence signals.

For each signal, focus on:
1. What technology is moving fast
2. Why it matters for product builders
3. What concrete opportunity it creates

Return STRICT JSON: {{"brief": ["signal 1", "signal 2", "signal 3", "signal 4", "signal 5"]}}

Papers:
{papers}"""

TECHNOLOGY_EXTRACT_PROMPT = """From these analyzed papers, extract the key technologies. For each technology:
- Count how many papers mention it
- Classify maturity (early/medium/high)
- Estimate confidence (0-1)
- Detect trend direction (rising/breakout/emerging/peak)
- List potential application domains

Return STRICT JSON array:
[{{"name": "...", "papers": <int>, "maturity": "...", "confidence": <float>, "trend": "...", "applications": ["..."]}}]

Technologies found across papers:
{technologies_list}"""

OPPORTUNITY_PROMPT = """You are a startup founder who reads research to find product opportunities. Based on each analyzed paper, generate the single most promising product opportunity per paper.

For each paper, extract:
- The core technology from the "technologies" field
- A concrete, specific product idea (1-2 sentences, name it)
- Business value (1-10), engineering difficulty (1-10)
- Competitive advantage (low/medium/high/very high)
- Development time estimate in weeks

Return STRICT JSON array only:
[{{"technology": "<technology name>", "idea": "<product idea name: one-liner>", "business_value": <int>, "engineering_difficulty": <int>, "competitive_advantage": "<low|medium|high|very high>", "development_time": "<X-Y weeks>"}}]

Papers with their technologies and product potential:
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
    # truncate if too long (keep ~10 papers max)
    lines = papers_data.strip().split('\n\n')
    if len(lines) > 10:
        papers_data = '\n\n'.join(lines[:10])
        print(f'    [truncated to {len(lines[:10])} papers for opportunities prompt]')

    prompt = OPPORTUNITY_PROMPT.format(papers=papers_data)
    messages = [
        {'role': 'system', 'content': CURATOR_SYS},
        {'role': 'user', 'content': prompt},
    ]
    raw = chat(messages, temperature=0.5, backend=backend)
    data = parse_json(raw)
    if data and isinstance(data, list):
        # validate each item has required fields
        validated = [d for d in data if isinstance(d, dict) and 'technology' in d and 'idea' in d]
        if validated:
            return validated
        print(f'    [WARN] LLM returned data but missing required fields')
        return None
    if data and isinstance(data, dict) and 'technology' in data:
        # single object returned instead of array
        return [data]
    print(f'    [WARN] Could not parse opportunities from LLM response')
    return None
