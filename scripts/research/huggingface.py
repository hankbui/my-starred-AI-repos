"""HuggingFace Daily Papers collector — free, no API key needed."""

from __future__ import annotations
import time
from datetime import datetime, timezone
from typing import Optional
import requests

from .schema import Paper

HF_DAILY_API = 'https://huggingface.co/api/daily_papers'


def fetch_daily_papers(existing_ids: set[str] = None, max_papers: int = 30) -> list[Paper]:
    try:
        resp = requests.get(
            f'{HF_DAILY_API}?limit={max_papers}',
            headers={'User-Agent': 'my-starred-ai-repos/1.0 (research-pipeline)'},
            timeout=30,
        )
        resp.raise_for_status()
        data = resp.json()
    except Exception as e:
        print(f'  [WARN] HuggingFace API error: {e}')
        return []

    papers = []
    seen = set(existing_ids or [])

    for entry in data:
        raw = entry.get('paper', {})
        arxiv_id = raw.get('id', '')
        if not arxiv_id:
            continue
        if arxiv_id in seen:
            continue

        authors = []
        for a in raw.get('authors', []):
            name = a.get('name', '')
            if name:
                authors.append(name)

        published = ''
        if raw.get('publishedAt'):
            published = raw['publishedAt'][:10]

        summary = raw.get('summary', '')
        ai_summary = raw.get('ai_summary', '') or ''

        # combine abstract + AI summary for richer context
        combined_summary = summary
        if ai_summary and ai_summary not in summary:
            combined_summary = summary + '\n\nAI Summary: ' + ai_summary

        github_url = raw.get('githubRepo', '') or ''

        categories = ['cs.AI']
        keywords = raw.get('ai_keywords', []) or []
        if keywords:
            categories.extend(['cs.' + kw.replace(' ', '_')[:20] for kw in keywords[:3]])

        paper = Paper(
            id=arxiv_id,
            title=raw.get('title', ''),
            authors=authors,
            categories=categories,
            published=published,
            updated=published,
            summary=combined_summary[:3000],
            pdf_url=f'https://arxiv.org/pdf/{arxiv_id}',
            comment=github_url,
        )
        papers.append(paper)
        seen.add(arxiv_id)

    print(f'  HuggingFace Daily Papers: {len(papers)} new papers')
    return papers


def fetch_all(existing_ids: set[str] = None) -> list[Paper]:
    papers = fetch_daily_papers(existing_ids=existing_ids)
    time.sleep(1)
    return papers
