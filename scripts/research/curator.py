"""Research Curator — scores papers by product potential, filters to top candidates."""

from __future__ import annotations
import re
from datetime import datetime, timezone
from typing import Optional
from .schema import Paper, Technology, ProductOpportunity, DashboardCard, ResearchReport
from . import llm


PRODUCT_KEYWORDS = [
    # big AI challenges & pain points
    'safety', 'alignment', 'hallucination', 'bias', 'fairness',
    'interpretability', 'explainability', 'robustness', 'reliability',
    'privacy', 'security', 'trust', 'transparency',
    'scalability', 'cost', 'efficiency', 'throughput',
    'evaluation', 'benchmark', 'monitoring', 'observability',

    # real-world impact domains
    'healthcare', 'medical', 'clinical', 'diagnosis', 'drug',
    'climate', 'environment', 'energy', 'sustainability',
    'education', 'accessibility', 'assistive',
    'scientific discovery', 'biology', 'genomics', 'materials',
    'robotics', 'autonomous', 'decision making',

    # building AI products
    'application', 'tool', 'platform', 'framework',
    'deploy', 'serving', 'inference', 'pipeline',
    'api', 'sdk', 'workflow', 'automation',
    'agent', 'assistant', 'chatbot', 'copilot',
    'search', 'recommend', 'personalized', 'adaptive',
    'real-time', 'interactive', 'user study', 'human',

    # access & adoption
    'open source', 'democratiz', 'accessible', 'affordable',
    'on-device', 'mobile', 'edge', 'browser', 'webassembly',
    'fine-tuning', 'adaptation', 'customization', 'few-shot',

    # core AI capabilities
    'reasoning', 'planning', 'retrieval', 'generation',
    'multimodal', 'vision', 'speech', 'language', 'code',
    'memory', 'long context', 'tool use',
]

TREND_KEYWORDS = [
    'attention', 'transformer', 'diffusion', 'reinforcement',
    'graph neural', 'graph network', 'contrastive',
    'self-supervised', 'foundation model', 'large language',
    'retrieval augmented', 'multimodal', 'quantization',
    'sparse', 'mixture of experts', 'moe', 'kv cache',
    'speculative decoding', 'prompt engineering',
    'agent', 'reasoning', 'planning', 'tool use',
    'world model', 'embodied', 'multimodal generation',
    'long context', 'in-context learning',
]


def curator_score(paper: Paper) -> float:
    score = 0.0
    text = f'{paper.title} {paper.summary} {paper.comment}'.lower()
    categories = ' '.join(paper.categories).lower()

    # product potential keywords
    product_hits = sum(1 for kw in PRODUCT_KEYWORDS if re.search(rf'\b{re.escape(kw)}\b', text))
    score += min(product_hits * 0.5, 3.0)

    # trending area bonus
    trend_hits = sum(1 for kw in TREND_KEYWORDS if re.search(rf'\b{re.escape(kw)}\b', text))
    score += min(trend_hits * 0.3, 1.5)

    # recency bonus (papers from last 2 days get a boost)
    if paper.published:
        from datetime import datetime, timezone
        try:
            pub = datetime.strptime(paper.published[:10], '%Y-%m-%d').replace(tzinfo=timezone.utc)
            now = datetime.now(timezone.utc)
            days_ago = (now - pub).days
            if days_ago <= 1:
                score += 1.0
            elif days_ago <= 3:
                score += 0.5
        except ValueError:
            pass

    # CS.HC and cs.IR papers get a bonus (more product-relevant)
    if 'cs.HC' in categories:
        score += 1.0
    if 'cs.IR' in categories:
        score += 0.5
    if 'cs.SD' in categories:
        score += 0.5

    # papers with code/benchmark references
    if re.search(r'\b(code|github|open.?source|benchmark|dataset)\b', text):
        score += 0.5
    if re.search(r'\b(release|demo|web.?app|prototype)\b', text):
        score += 0.5

    return round(min(score, 10.0), 1)


def rank_papers(papers: list[Paper], top_n: int = 30) -> list[Paper]:
    for paper in papers:
        paper.curator_score = curator_score(paper)
    papers.sort(key=lambda p: p.curator_score, reverse=True)
    return papers[:top_n]


def _extract_technologies_from_text(text: str) -> list[str]:
    known_techs = [
        'Transformer', 'Attention', 'Diffusion', 'GAN', 'VAE', 'RNN', 'LSTM', 'GRU',
        'CNN', 'GNN', 'GCN', 'Graph Neural', 'RL', 'Reinforcement Learning',
        'Contrastive Learning', 'Self-Supervised', 'Transfer Learning',
        'Federated Learning', 'Continual Learning', 'Meta-Learning', 'Few-Shot',
        'Knowledge Distillation', 'Model Compression', 'Quantization', 'Pruning',
        'KV Cache', 'Speculative Decoding', 'Mixture of Experts', 'MoE',
        'Retrieval Augmented', 'RAG', 'Prompt Engineering', 'In-Context Learning',
        'Instruction Tuning', 'RLHF', 'DPO', 'PPO',
        'Multimodal', 'Vision-Language', 'Speech Recognition', 'TTS',
        'Named Entity Recognition', 'Semantic Parsing', 'Information Extraction',
        'Knowledge Graph', 'Graph Neural Network', 'Node Classification',
        'Anomaly Detection', 'Outlier Detection', 'Time Series',
        'Generative Model', 'Normalizing Flow', 'Autoregressive',
        'Sparse Attention', 'Linear Attention', 'Flash Attention',
        'Memory Network', 'Neural Memory', 'Differentiable Memory',
        'Neural Architecture Search', 'Hyperparameter Optimization',
        'Causal Inference', 'Counterfactual', 'Interpretability',
        'Adversarial', 'Robustness', 'Uncertainty Quantification',
        'Gaussian Process', 'Bayesian', 'Variational Inference',
        'Neural Radiance Field', 'NeRF', '3D Reconstruction',
        'Object Detection', 'Segmentation', 'Tracking', 'Depth Estimation',
        'Optical Flow', 'Pose Estimation', 'Face Recognition',
        'Recommender System', 'Collaborative Filtering',
        'Graph Attention', 'Heterogeneous Graph', 'Temporal Graph',
        'Cross-Modal', 'Multi-Task', 'Multi-Agent', 'Distributed Training',
        'Federated Averaging', 'Differential Privacy', 'Secure Aggregation',
        'Edge Computing', 'On-Device', 'Mobile Inference', 'WebAssembly',
        'Vector Database', 'Approximate Nearest Neighbor', 'Embedding',
        'Long Context', 'Contextual Retrieval', 'Sentence Embedding',
        'Vision Transformer', 'ViT', 'ConvNeXt', 'EfficientNet', 'ResNet',
    ]
    found = []
    for tech in known_techs:
        if tech.lower() in text.lower():
            found.append(tech)
    return found


def classify_maturity(confidence: float, technologies: list[str]) -> str:
    if confidence >= 0.85 and len(technologies) >= 2:
        return 'high'
    elif confidence >= 0.6:
        return 'medium'
    return 'early'


def infer_trend_from_score(curator_score: float, confidence: float) -> str:
    if confidence >= 0.8 and curator_score >= 7:
        return 'breakout'
    elif confidence >= 0.6 and curator_score >= 5:
        return 'rising'
    elif curator_score >= 4:
        return 'emerging'
    return 'emerging'


def build_report(
    all_papers: list[Paper],
    analyzed: list[dict],
    brief: list[str],
    tech_data: Optional[list[dict]],
    opp_data: Optional[list[dict]],
    backend_name: str,
) -> ResearchReport:

    now = datetime.now()
    date_str = now.strftime('%Y-%m-%d')

    # build technologies from analyzed + curated data
    tech_map = {}
    if tech_data:
        for t in tech_data:
            tech_map[t['name']] = Technology(**t)

    # fallback: extract from analyzed papers
    for paper_data in analyzed:
        if not paper_data:
            continue
        for tech_name in paper_data.get('technologies', []):
            if tech_name not in tech_map:
                tech_map[tech_name] = Technology(name=tech_name)

    # fallback: extract from paper titles when LLM analysis is unavailable
    if not tech_map:
        for paper in all_papers:
            for tech in _extract_technologies_from_text(paper.title):
                if tech not in tech_map:
                    tech_map[tech] = Technology(name=tech)

    # FIX: override empty fields with inferred values
    for t in tech_map.values():
        if not t.confidence or t.confidence == 0.0:
            # infer from curator score of the highest-scoring paper using this tech
            max_score = 0.0
            for paper_data in analyzed:
                if not paper_data:
                    continue
                if t.name in paper_data.get('technologies', []):
                    cs = paper_data.get('curator_score', 5)
                    max_score = max(max_score, cs)
            t.confidence = min(max_score / 10.0, 0.95) if max_score else 0.5
        if t.trend == 'emerging' and t.confidence >= 0.6:
            t.trend = 'rising'
        if t.trend == 'emerging' and t.confidence >= 0.8:
            t.trend = 'breakout'
        if not t.applications:
            # collect from paper domain_applications
            domains = set()
            for paper_data in analyzed:
                if not paper_data:
                    continue
                if t.name in paper_data.get('technologies', []):
                    for d in paper_data.get('domain_applications', []):
                        domains.add(d)
            t.applications = list(domains) if domains else ['general AI']
        if t.maturity == 'early' and t.confidence >= 0.7:
            t.maturity = 'medium'
        if t.maturity == 'medium' and t.confidence >= 0.9:
            t.maturity = 'high'

    # count technologies by trend
    trend_counts = {'breakout': 0, 'rising': 0, 'emerging': 0, 'peak': 0, 'maturing': 0}
    for t in tech_map.values():
        trend_counts[t.trend] = trend_counts.get(t.trend, 0) + 1

    # build product opportunities
    opportunities = []
    if opp_data:
        for o in opp_data:
            opportunities.append(ProductOpportunity(**o))

    # build dashboard cards
    cards = _build_cards(date_str, all_papers, tech_map, trend_counts, analyzed)

    meta = {
        'date': date_str,
        'papers_tracked': len(all_papers),
        'technologies_discovered': len(tech_map),
        'opportunities_identified': len(opportunities),
        'last_update': now.strftime('%Y-%m-%d %H:%M UTC'),
        'backend': backend_name,
        'model': 'Research Curator v1',
    }

    # convert analyzed back to Paper objects with enriched data
    enriched_papers = []
    for i, paper in enumerate(all_papers):
        if i < len(analyzed) and analyzed[i]:
            a = analyzed[i]
            paper.technologies = a.get('technologies', paper.technologies)
            paper.maturity = a.get('maturity', classify_maturity(a.get('confidence', 0), paper.technologies))
            paper.confidence = a.get('confidence', paper.confidence)
            paper.product_potential = a.get('product_potential', paper.product_potential)
            paper.domain_applications = a.get('domain_applications', paper.domain_applications)
        enriched_papers.append(paper)

    return ResearchReport(
        meta=meta,
        brief=brief or [],
        top_cards=cards,
        papers=enriched_papers,
        technologies=list(tech_map.values()),
        product_opportunities=opportunities,
    )


def _build_cards(date_str, papers, tech_map, trend_counts, analyzed):
    valid = [a for a in analyzed if a] if analyzed else []
    top_paper = valid[0] if valid else {}
    top_tech = max(tech_map.values(), key=lambda t: (t.confidence or 0) * (t.papers or 1)) if tech_map else None
    most_practical = max(valid, key=lambda a: a.get('confidence', 0)) if valid else {}
    most_innovative = max(valid, key=lambda a: len(a.get('technologies', []))) if valid else {}

    # compute average opportunity score from product_potential
    scores = []
    for a in valid:
        if a and a.get('product_potential'):
            scores.append(a.get('confidence', 0.5) * 10)
    avg_score = round(sum(scores) / len(scores), 1) if scores else 0

    # count trend clusters — "emerging" counts too
    trend_clusters = sum(1 for t in tech_map.values() if t.trend in ('breakout', 'rising', 'emerging'))

    return [
        DashboardCard(
            id='new_technologies',
            title='New Technologies',
            value=str(len(tech_map)),
            label='discovered this scan',
            detail=', '.join(list(tech_map.keys())[:8]) if tech_map else 'None yet',
            color='accent',
        ),
        DashboardCard(
            id='emerging_trends',
            title='Emerging Trends',
            value=str(trend_clusters),
            label='active trend clusters',
            detail=', '.join(
                t.name for t in sorted(tech_map.values(), key=lambda x: x.confidence, reverse=True)[:5]
            ) if tech_map else 'None yet',
            color='green',
        ),
        DashboardCard(
            id='highest_potential',
            title='Highest Potential',
            value=str(avg_score),
            label='avg opportunity score',
            detail=top_paper.get('title', 'N/A')[:80],
            color='amber',
        ),
        DashboardCard(
            id='biggest_surprise',
            title='Biggest Surprise',
            value=top_paper.get('title', '—')[:30] if top_paper else '—',
            label=f"confidence {top_paper.get('confidence', 0):.0%}" if top_paper else '',
            detail=top_paper.get('summary', '')[:120] if top_paper else '',
            color='purple',
        ),
        DashboardCard(
            id='most_practical',
            title='Most Practical',
            value=most_practical.get('title', 'N/A')[:30] if most_practical else '—',
            label='highest confidence paper',
            detail=', '.join(most_practical.get('product_potential', [])[:2]) if most_practical else '',
            color='success',
        ),
        DashboardCard(
            id='most_innovative',
            title='Most Innovative',
            value=str(len([t for t in tech_map.values() if t.maturity == 'early'])),
            label='early-stage technologies',
            detail=most_innovative.get('title', 'N/A')[:80] if most_innovative else '',
            color='blue',
        ),
    ]
