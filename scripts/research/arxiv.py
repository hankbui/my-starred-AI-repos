"""arXiv API and RSS collector — free, no API key needed."""

from __future__ import annotations
import re
import time
import xml.etree.ElementTree as ET
from datetime import datetime, timezone, timedelta
from typing import Optional
import requests

from .schema import Paper

ARXIV_API = 'https://export.arxiv.org/api/query'
ARXIV_RSS = 'https://rss.arxiv.org/rss/'

CATEGORIES = [
    'cs.AI', 'cs.CL', 'cs.CV', 'cs.LG', 'cs.HC',
    'cs.IR', 'cs.SD', 'cs.MM', 'cs.MA', 'cs.NE',
]

CATEGORY_LABELS = {
    'cs.AI': 'Artificial Intelligence',
    'cs.CL': 'Computation and Language',
    'cs.CV': 'Computer Vision',
    'cs.LG': 'Machine Learning',
    'cs.HC': 'Human-Computer Interaction',
    'cs.IR': 'Information Retrieval',
    'cs.SD': 'Sound',
    'cs.MM': 'Multimedia',
    'cs.MA': 'Multiagent Systems',
    'cs.NE': 'Neural and Evolutionary Computing',
}

NS = {'atom': 'http://www.w3.org/2005/Atom', 'arxiv': 'http://arxiv.org/schemas/atom'}


def build_query(categories: list[str] = None, max_results: int = 200,
                days_back: int = 3) -> str:
    cats = categories or CATEGORIES
    cat_query = '+OR+'.join(f'cat:{c}' for c in cats)
    # only recent papers
    since = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime('%Y%m%d')
    return (
        f'{ARXIV_API}?search_query=({cat_query})'
        f'&sortBy=submittedDate&sortOrder=descending'
        f'&max_results={max_results}'
    )


def parse_arxiv_response(xml_text: str) -> list[Paper]:
    root = ET.fromstring(xml_text)
    papers = []
    for entry in root.findall('atom:entry', NS):
        try:
            paper = _parse_entry(entry)
            if paper:
                papers.append(paper)
        except Exception as e:
            continue
    return papers


def _parse_entry(entry) -> Optional[Paper]:
    id_tag = entry.find('atom:id', NS)
    if id_tag is None or not id_tag.text:
        return None
    arxiv_id = id_tag.text.strip().split('/')[-1].split('v')[0]

    title = _clean_html(entry.findtext('atom:title', '', NS))
    summary = _clean_html(entry.findtext('atom:summary', '', NS))

    authors = []
    for author in entry.findall('atom:author', NS):
        name = author.findtext('atom:name', '', NS)
        if name:
            authors.append(name.strip())

    categories = []
    for cat in entry.findall('atom:category', NS):
        term = cat.get('term', '')
        if term:
            categories.append(term)

    published = entry.findtext('atom:published', '', NS)[:10]
    updated = entry.findtext('atom:updated', '', NS)[:10]

    pdf_url = ''
    for link in entry.findall('atom:link', NS):
        if link.get('title') == 'pdf':
            pdf_url = link.get('href', '')
            break
    if not pdf_url:
        pdf_url = f'https://arxiv.org/abs/{arxiv_id}'

    comment = entry.findtext('arxiv:comment', '', NS) or ''

    return Paper(
        id=arxiv_id,
        title=title,
        authors=authors,
        categories=categories,
        published=published,
        updated=updated,
        summary=summary,
        pdf_url=pdf_url,
        comment=comment,
    )


def _clean_html(text: str) -> str:
    if not text:
        return ''
    text = re.sub(r'<[^>]+>', ' ', text)
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def fetch_new_papers(categories: list[str] = None, max_results: int = 200,
                     days_back: int = 3, existing_ids: set[str] = None) -> list[Paper]:
    url = build_query(categories, max_results, days_back)
    headers = {'User-Agent': 'my-starred-ai-repos/1.0 (research-pipeline)'}

    try:
        resp = requests.get(url, headers=headers, timeout=60)
        resp.raise_for_status()
        papers = parse_arxiv_response(resp.text)
    except Exception as e:
        print(f'  [WARN] arXiv API error: {e}')
        papers = []

    if existing_ids:
        before = len(papers)
        papers = [p for p in papers if p.id not in existing_ids]
        if before - len(papers):
            print(f'  Dedup: removed {before - len(papers)} existing papers')

    print(f'  arXiv API: {len(papers)} new papers from {url[:80]}...')
    return papers


def fetch_rss_daily(category: str = 'cs.AI', existing_ids: set[str] = None) -> list[Paper]:
    url = f'{ARXIV_RSS}{category}'
    try:
        resp = requests.get(url, headers={'User-Agent': 'my-starred-ai-repos/1.0'}, timeout=30)
        resp.raise_for_status()
        root = ET.fromstring(resp.text)
    except Exception as e:
        print(f'  [WARN] arXiv RSS error for {category}: {e}')
        return []

    papers = []
    for item in root.findall('.//item'):
        title = _clean_html(item.findtext('title', ''))
        link = item.findtext('link', '')
        desc = _clean_html(item.findtext('description', ''))
        arxiv_id = ''
        if link:
            m = re.search(r'/(\d+\.\d+)', link)
            if m:
                arxiv_id = m.group(1)

        if not arxiv_id:
            continue
        if existing_ids and arxiv_id in existing_ids:
            continue

        papers.append(Paper(
            id=arxiv_id,
            title=title,
            authors=[],
            categories=[category],
            published=datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            updated=datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            summary=desc,
            pdf_url=link or f'https://arxiv.org/abs/{arxiv_id}',
        ))

    return papers


def fetch_all(existing_ids: set[str] = None) -> list[Paper]:
    all_papers = []
    seen = set(existing_ids or [])

    papers = fetch_new_papers(existing_ids=seen)
    for p in papers:
        if p.id not in seen:
            all_papers.append(p)
            seen.add(p.id)
    time.sleep(3)

    for cat in CATEGORIES[:3]:
        rss_papers = fetch_rss_daily(cat, existing_ids=seen)
        for p in rss_papers:
            if p.id not in seen:
                # enrich with API data if we have minimal info
                all_papers.append(p)
                seen.add(p.id)
        time.sleep(1)

    return all_papers
