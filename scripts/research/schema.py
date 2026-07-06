from __future__ import annotations
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Optional


@dataclass
class Paper:
    id: str
    title: str
    authors: list[str]
    categories: list[str]
    published: str
    updated: str
    summary: str
    pdf_url: str
    comment: str = ''
    technologies: list[str] = field(default_factory=list)
    maturity: str = 'early'
    confidence: float = 0.0
    curator_score: float = 0.0
    product_potential: list[str] = field(default_factory=list)
    hanverse_applications: list[str] = field(default_factory=list)


@dataclass
class Technology:
    name: str
    papers: int = 1
    maturity: str = 'early'
    confidence: float = 0.0
    trend: str = 'emerging'
    applications: list[str] = field(default_factory=list)


@dataclass
class ProductOpportunity:
    technology: str
    idea: str
    business_value: int = 5
    engineering_difficulty: int = 5
    competitive_advantage: str = 'medium'
    development_time: str = '2-4 weeks'


@dataclass
class DashboardCard:
    id: str
    title: str
    value: str
    label: str
    detail: str
    color: str = 'accent'


@dataclass
class ResearchReport:
    meta: dict
    brief: list[str]
    top_cards: list[DashboardCard]
    papers: list[Paper]
    technologies: list[Technology]
    product_opportunities: list[ProductOpportunity]

    def to_dict(self):
        return {
            'meta': self.meta,
            'brief': self.brief,
            'top_cards': [asdict(c) for c in self.top_cards],
            'papers': [asdict(p) for p in self.papers],
            'technologies': [asdict(t) for t in self.technologies],
            'product_opportunities': [asdict(o) for o in self.product_opportunities],
        }
