#!/usr/bin/env python3
"""
Research Intelligence Pipeline — daily AI Technology Radar.

Flow:
  1. Fetch new papers from arXiv API + RSS
  2. Load + deduplicate against existing cache
  3. Score papers by product potential (Research Curator)
  4. LLM-analyze top-ranked papers for technologies, maturity, product ideas
  5. Generate brief, technology map, product opportunities
  6. Output JSON to website/research/json/
  7. Archive daily copy
"""

import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

# add parent so we can import research module
sys.path.insert(0, str(Path(__file__).resolve().parent))

from research import arxiv, llm, curator
from research.schema import ResearchReport

REPO_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = REPO_ROOT / 'website' / 'research' / 'json'
ARCHIVE_DIR = DATA_DIR / 'archive'
CACHE_FILE = DATA_ROOT / 'research_cache.json' if (DATA_ROOT := REPO_ROOT / 'data').exists() else DATA_DIR / 'cache.json'

MAX_PAPERS_PER_SCAN = 200
TOP_N_ANALYZE = 15


def ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    ARCHIVE_DIR.mkdir(parents=True, exist_ok=True)
    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)


def load_cache() -> set[str]:
    if CACHE_FILE.exists():
        try:
            with open(CACHE_FILE) as f:
                return set(json.load(f))
        except Exception:
            pass
    return set()


def save_cache(ids: set[str]):
    with open(CACHE_FILE, 'w') as f:
        json.dump(sorted(ids), f)


def load_existing_report() -> dict:
    path = DATA_DIR / 'index.json'
    if path.exists():
        try:
            with open(path) as f:
                return json.load(f)
        except Exception:
            pass
    return {}


def save_report(data: dict, is_archive: bool = True):
    path = DATA_DIR / 'index.json'
    with open(path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    print(f'  Saved: {path} ({len(json.dumps(data))} bytes)')

    if is_archive:
        date_str = data.get('meta', {}).get('date', datetime.now().strftime('%Y-%m-%d'))
        archive_path = ARCHIVE_DIR / f'{date_str}.json'
        with open(archive_path, 'w') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print(f'  Archived: {archive_path}')

    # update latest.json (always points to latest)
    latest_path = DATA_DIR / 'latest.json'
    with open(latest_path, 'w') as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


def main():
    print('=' * 60)
    print('RESEARCH INTELLIGENCE PIPELINE')
    print(f'Started: {datetime.now().isoformat()}')
    print('=' * 60)

    ensure_dirs()

    # 1. Detect LLM backend
    print('\n[1/6] Detecting LLM backend...')
    backend = llm.pick_backend()
    print(f'  Backend: {backend["type"]} ({backend["url"]})')
    backend_name = f'llm7' if backend['type'] == 'llm7' else 'lmstudio'

    # 2. Load cache + existing data
    print('\n[2/6] Loading state...')
    existing_ids = load_cache()
    existing_report = load_existing_report()
    existing_paper_ids = set()
    if existing_report and 'papers' in existing_report:
        for p in existing_report['papers']:
            existing_paper_ids.add(p.get('id', ''))
    existing_ids |= existing_paper_ids
    print(f'  Existing papers in cache: {len(existing_ids)}')

    # 3. Fetch new papers
    print('\n[3/6] Fetching new papers from arXiv...')
    all_papers = arxiv.fetch_all(existing_ids=existing_ids)
    if not all_papers:
        print('  No new papers found. Using existing data if available.')
        if existing_report:
            print('  Existing report available — will re-generate with current LLM.')
            # still continue to re-analyze existing papers
        else:
            print('  No data to process. Exiting.')
            return

    # merge with existing papers for re-analysis
    if existing_report and 'papers' in existing_report:
        existing_paper_objs = []
        from research.schema import Paper
        for p in existing_report['papers']:
            try:
                existing_paper_objs.append(Paper(**{k: v for k, v in p.items() if k in Paper.__dataclass_fields__}))
            except Exception:
                pass
        # add new papers
        existing_ids_new = {p.id for p in existing_paper_objs}
        for p in all_papers:
            if p.id not in existing_ids_new:
                existing_paper_objs.append(p)
        all_papers = existing_paper_objs

    all_ids = {p.id for p in all_papers}
    print(f'  Total papers in dataset: {len(all_ids)}')

    # 4. Curate: score by product potential, pick top N
    print(f'\n[4/6] Curating {len(all_papers)} papers...')
    top_papers = curator.rank_papers(all_papers, top_n=TOP_N_ANALYZE)
    print(f'  Top {len(top_papers)} papers by curator score:')
    for p in top_papers[:5]:
        print(f'    {p.curator_score:.1f} — {p.title[:70]}')

    # 5. LLM analyze top papers
    print(f'\n[5/6] LLM-analyzing top {len(top_papers)} papers...')

    # load previously analyzed cache to skip re-analysis
    analysis_cache = {}
    if existing_report and 'papers' in existing_report:
        for p in existing_report['papers']:
            if p.get('technologies') or p.get('confidence'):
                analysis_cache[p.get('id', '')] = {
                    'title': p.get('title', ''),
                    'technologies': p.get('technologies', []),
                    'maturity': p.get('maturity', 'early'),
                    'confidence': p.get('confidence', 0),
                    'curator_score': p.get('curator_score', 0),
                    'product_potential': p.get('product_potential', []),
                    'domain_applications': p.get('domain_applications', []),
                }

    analyzed = []
    for i, paper in enumerate(top_papers):
        cached = analysis_cache.get(paper.id)
        if cached:
            print(f'  [{i + 1}/{len(top_papers)}] (cached) {paper.title[:60]}...')
            analyzed.append(cached)
            continue

        print(f'  [{i + 1}/{len(top_papers)}] {paper.title[:60]}...')
        result = llm.analyze_paper(paper, backend)
        if result:
            analyzed.append(result)
        else:
            analyzed.append(None)
            print(f'    [WARN] Analysis failed')
        if i < len(top_papers) - 1:
            time.sleep(3.0)  # be kind to the API

    # 5b. Generate brief
    print('\n  Generating intelligence brief...')
    papers_text = '\n\n'.join(
        f'- {p.title} ({", ".join(p.categories)})' for p in top_papers[:10]
    )
    brief = llm.generate_brief(papers_text, len(top_papers), backend)

    # 5c. Extract technologies
    print('  Extracting technologies...')
    valid_analyzed = [a for a in analyzed if a]
    if valid_analyzed:
        tech_summary = '\n'.join(
            f'{a.get("title", "?")[:60]}: {", ".join(a.get("technologies", ["?"]))}'
            for a in valid_analyzed
        )
        tech_data = llm.extract_technologies(tech_summary, backend)
    else:
        tech_summary = ''
        tech_data = None

    # 5d. Generate product opportunities
    print('  Generating product opportunities...')
    top_opp_papers = valid_analyzed[:8] if valid_analyzed else []
    papers_for_opp = '\n\n'.join(
        f'Paper: {top_papers[i].title[:80]}\nTechnologies: {", ".join(a.get("technologies", ["n/a"]))}\nProduct potential: {"; ".join(a.get("product_potential", ["n/a"]))}'
        for i, a in enumerate(valid_analyzed) if a and a.get('technologies')
    )[:4000] if top_opp_papers else ''
    opp_data = llm.generate_opportunities(papers_for_opp, backend) if papers_for_opp else None

    # 6. Build report
    print('\n[6/6] Building research report...')
    report = curator.build_report(
        all_papers=top_papers,
        analyzed=analyzed,
        brief=brief or [],
        tech_data=tech_data,
        opp_data=opp_data,
        backend_name=backend_name,
    )

    report_dict = report.to_dict()
    save_report(report_dict, is_archive=True)

    # Update cache with all IDs
    save_cache(all_ids)

    print(f'\n{"=" * 60}')
    print(f'DONE — {report.meta["technologies_discovered"]} technologies, '
          f'{report.meta["opportunities_identified"]} opportunities')
    print(f'Saved to: {DATA_DIR / "index.json"}')
    print(f'{"=" * 60}')


if __name__ == '__main__':
    main()
