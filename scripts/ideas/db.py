from __future__ import annotations

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path


SCHEMA = """
CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    source TEXT NOT NULL,
    title TEXT NOT NULL,
    url TEXT,
    description TEXT,
    revenue_signal TEXT,
    category TEXT,
    tags TEXT,
    score INTEGER DEFAULT 0,
    num_comments INTEGER DEFAULT 0,
    comments_url TEXT,
    date_published TEXT,
    date_collected TEXT NOT NULL,
    raw_snippet TEXT,
    summary TEXT,
    business_model TEXT,
    trend_score INTEGER DEFAULT 0,
    trend_direction TEXT,
    ai_potential INTEGER DEFAULT 0,
    composite_score INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ideas_source ON ideas(source);
CREATE INDEX IF NOT EXISTS idx_ideas_score ON ideas(score DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_composite ON ideas(composite_score DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_date ON ideas(date_collected DESC);
CREATE INDEX IF NOT EXISTS idx_ideas_category ON ideas(category);
"""


class IdeasDB:
    def __init__(self, db_path: str | Path):
        self.db_path = Path(db_path)
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(self.db_path))
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self._migrate_composite_column()

    def _migrate_composite_column(self) -> None:
        """Add composite_score column if an older DB lacks it (backward compat)."""
        cols = {row["name"] for row in self.conn.execute("PRAGMA table_info(ideas)").fetchall()}
        if "composite_score" not in cols:
            self.conn.execute("ALTER TABLE ideas ADD COLUMN composite_score INTEGER DEFAULT 0")

    def upsert(self, idea: dict) -> bool:
        now = datetime.now(timezone.utc).isoformat()
        idea.setdefault("date_collected", now)
        tags = idea.get("tags")
        if isinstance(tags, list):
            idea["tags"] = json.dumps(tags)

        self.conn.execute(
            """INSERT OR REPLACE INTO ideas
               (id, source, title, url, description, revenue_signal, category, tags,
                score, num_comments, comments_url, date_published, date_collected,
                raw_snippet, summary, business_model, trend_score, trend_direction,
                ai_potential, composite_score)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                idea["id"],
                idea["source"],
                idea["title"],
                idea.get("url"),
                idea.get("description"),
                idea.get("revenue_signal"),
                idea.get("category"),
                idea.get("tags"),
                idea.get("score", 0),
                idea.get("num_comments", 0),
                idea.get("comments_url"),
                idea.get("date_published"),
                idea["date_collected"],
                idea.get("raw_snippet"),
                idea.get("summary"),
                idea.get("business_model"),
                idea.get("trend_score", 0),
                idea.get("trend_direction"),
                idea.get("ai_potential", 0),
                idea.get("composite_score", 0),
            ),
        )
        return self.conn.total_changes > 0

    def write_composite_scores(self, scored: list[dict]) -> int:
        """Persist composite_score (and refreshed enrichment fields) back to rows
        that already exist. `scored` is the post-enrichment idea list."""
        updated = 0
        for idea in scored:
            cur = self.conn.execute(
                """UPDATE ideas
                   SET composite_score = ?,
                       ai_potential = ?,
                       business_model = ?,
                       trend_score = ?,
                       trend_direction = ?,
                       revenue_signal = ?
                   WHERE id = ?""",
                (
                    idea.get("composite_score", 0),
                    idea.get("ai_potential", 0),
                    idea.get("business_model"),
                    idea.get("trend_score", 0),
                    idea.get("trend_direction"),
                    idea.get("revenue_signal"),
                    idea["id"],
                ),
            )
            updated += cur.rowcount
        self.conn.commit()
        return updated

    def get_source_count(self, source: str) -> int:
        row = self.conn.execute(
            "SELECT COUNT(*) as cnt FROM ideas WHERE source = ?", (source,)
        ).fetchone()
        return row["cnt"] if row else 0

    def get_all_ideas(self, limit: int = 5000, offset: int = 0) -> list[dict]:
        rows = self.conn.execute(
            "SELECT * FROM ideas ORDER BY score DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [dict(r) for r in rows]

    def close(self):
        self.conn.close()
