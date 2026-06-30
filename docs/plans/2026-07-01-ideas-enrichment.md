# Ideas Pipeline Enrichment Plan

**Goal:** Add 4 new data sources (2 Western + 2 Chinese) and 4 enrichment features to make the Find Ideas page more valuable like Starter Story.

**Architecture:** New scraper modules follow existing pattern in `scripts/ideas/sources/`. Enrichment runs as post-processing step in `cli.py`. Frontend additions in `find-ideas.html` and `styles.css`.

**Tech Stack:** Python (requests, xml.etree, pytrends), JS (vanilla), GitHub Actions (cron)

**Pipeline order:** `generate_ideas.py` → pull all sources → DB insert → **enrichment step** → JSON export

---

## Tasks

### Phase 1: Western Sources

---

### Task 1: GitHub Trending scraper

**Files:**
- Create: `scripts/ideas/sources/github_trending.py`
- Modify: `scripts/ideas/cli.py` (add github_trending to source list)
- Modify: `scripts/generate_ideas.py` (import new source)

**Details:**
- Fetch `https://api.gitterapp.com/` (unofficial GitHub Trending API, free, no key)
- Returns repos with: name, description, url, stars, stars_today, language
- Maps to idea fields: title=repo name, description=description, score=stars, category=language, url=github URL
- Includes in `find-ideas.html` source list with badge "GitHub Trending" (source code: `gh`)

**Key fields:**
```python
{
    "source": "githubtrending",
    "title": repo["name"],
    "url": repo["url"],
    "description": repo["description"][:1000],
    "score": repo["stars"],
    "category": repo["language"],
    "tags": [repo["language"]],
}
```

**Edge cases:**
- API may return empty on rate limit — retry once after 5s
- Some repos have no language → tag "unknown"
- Description may be null → use empty string

---

### Task 2: YouTube Data API scraper

**Files:**
- Create: `scripts/ideas/sources/youtube.py`
- Modify: `scripts/ideas/cli.py`
- Modify: `.env.example` (add YOUTUBE_API_KEY)
- Modify: `.github/workflows/update-repos.yml` (add YOUTUBE_API_KEY secret)

**Details:**
- Use Google YouTube Data API v3 (`google-api-python-client` or plain `requests`)
- Search queries: `"I built a"`, `"build in public"`, `"my SaaS"`, `"side project"` — rotate per run
- Free tier: 10,000 quota units/day. One search = 100 units → 100 searches/day. Each search returns 50 videos → 5000 videos/day possible
- Store channel name, view count, publish date, description
- Rate: one `search.list` call, then fetch `videos.list` for details on top results

**Key considerations:**
- Dedup by video ID
- Filters: only English results, published this year (or all time if not enough)
- Max 50 ideas per run (to stay within quota)

**Setup:**
- Get API key from Google Cloud Console → YouTube Data API v3 → Credentials
- Add `YOUTUBE_API_KEY` to `.env` and GitHub Secrets

---

### Phase 2: Chinese Sources

---

### Task 3: V2EX scraper

**Files:**
- Create: `scripts/ideas/sources/v2ex.py`
- Modify: `scripts/ideas/cli.py`
- Modify: `find-ideas.html` (add source badge styling)

**Details:**
- Scrape `https://www.v2ex.com/go/create` and `https://www.v2ex.com/go/share`
- Each page has a list of topics with title, link, author, votes, comments, timestamp
- No API key needed, HTML scraping with regex or lxml
- Rate limit: 2s delay between pages, max 3 pages per source
- V2EX tends to rate-limit aggressively — handle 429 with exponential backoff

**Mapping:**
```python
{
    "source": "v2ex",
    "title": topic_title,
    "url": "https://www.v2ex.com" + topic_link,
    "description": "",  # V2EX list page has no description, only title
    "score": upvotes,
    "num_comments": reply_count,
    "category": "share" / "create" (section name),
    "tags": ["chinese", section],
}
```

**Edge cases:**
- 429 Too Many Requests → backoff 5s, retry once, skip if fails again
- Chinese encoding — ensure UTF-8 handling
- Some topics may be pinned (sticky) — skip those (they're not new ideas)

---

### Task 4: 36Kr scraper

**Files:**
- Create: `scripts/ideas/sources/thirtysixkr.py`
- Modify: `scripts/ideas/cli.py`
- Modify: `find-ideas.html` (add source badge styling)

**Details:**
- Fetch `https://36kr.com/motif/` or use their public API at `https://36kr.com/api/search/entity-search`
- 36Kr has news articles about Chinese startups, funding rounds, and product launches
- Extract: title, summary, publish date, tags (sector/industry)
- Rate: 2s between requests, max 50 articles

**Mapping:**
```python
{
    "source": "thirtysixkr",
    "title": article_title,
    "url": article_url,
    "description": summary[:1000],
    "score": 0,  # no upvote system
    "category": sector_tag,
    "tags": [sector_tag, "china"],
}
```

**Alternative:** If 36Kr API/scraping is too brittle, use **产品猎人** (producthunter.cn) or **即刻热门** as fallback. Start with 36Kr since it has startup funding data which is high value.

**Edge cases:**
- 36Kr may block non-Chinese IPs — test locally first
- Response may be in Chinese only — keep original text, don't translate
- API structure may change — wrap in try/except with graceful skip

---

### Phase 3: Richer Data Features

---

### Task 5: Revenue detection upgrade

**Files:**
- Modify: `scripts/ideas/sources/indiehackers.py` (revenue patterns)
- Modify: `scripts/ideas/db.py` (optional: add revenue_confidence field)
- Create: `scripts/ideas/enrichment.py` (common enrichment functions)

**Details:**
- Current regex patterns miss common formats like "sold $X" (seen in IndieHackers data)
- Add new patterns:
  - `"sold \$?[\d,]+[kKmM]?"` — sold amounts
  - `"raised \$?[\d,]+[kKmM]?"` — funding rounds
  - `"\$?[\d,]+[kKmM]?/?(mo|month|year|annual)"` — revenue with slash
  - `"profit(able| margin) .{0,20}\$?[\d,]+"`
  - `"valuation \$?[\d,]+[kKmMbB]?"`
- Add `revenue_confidence` field: `"high"` (exact $X/mo), `"medium"` ($X sold/raised), `"low"` (vague revenue mention)

**Test with actual data:**
- "I sold $6,773 in 2 weeks" (from IndieHackers) → should detect "sold $6,773"
- "Hit $5k MRR" → already detected by current regex
- "Profitable at $2K/mo" → should detect
- "Raised $500k seed" → should detect as funding signal

---

### Task 6: Business model tagging

**Files:**
- Modify: `scripts/ideas/enrichment.py`

**Details:**
Simple keyword-based classifier for business model detection from title + description:

| Model | Keywords |
|---|---|
| `subscription` | "subscription", "$X/mo", "monthly", "MRR", "SaaS", "recurring" |
| `one-time` | "one-time", "buy once", "lifetime", "perpetual" |
| `marketplace` | "marketplace", "platform", "connecting", "buyers", "sellers" |
| `ads` | "ad-supported", "free with ads", "monetize with ads" |
| `freemium` | "freemium", "free tier", "free plan", "basic free" |
| `open-source-donation` | "open source", "sponsor", "donation", "GitHub sponsors" |
| `physical-product` | "shipping", "manufacturing", "hardware", "crowdfunding" |
| `consulting` | "consulting", "agency", "freelance", "services" |

Store as comma-separated string in a new `business_model` field on each idea.

---

### Task 7: Google Trends score

**Files:**
- Modify: `scripts/ideas/enrichment.py`
- Modify: `requirements.txt` (add `pytrends`)

**Details:**
- Use `pytrends` library (unofficial Google Trends API, free, no key)
- For each idea category, fetch interest_over_time for the last 12 months
- Store as `trend_score` (0-100) and `trend_direction` ("rising" / "stable" / "declining")
- Cache results in a dict to avoid hitting Trends for duplicate categories in same run
- Categories map: "AI" → "artificial intelligence", "Education" → "online learning", etc.

**Limitations:**
- pytrends may rate-limit if called too often — max 10 categories per run with 5s delay
- Some categories may return 0 data (too niche) — gracefully skip

---

### Task 8: AI potential score

**Files:**
- Modify: `scripts/ideas/enrichment.py`

**Details:**
Heuristic score (0-100) based on how likely AI can enhance or disrupt the idea:

| Factor | Points |
|---|---|
| Title contains "AI", "LLM", "GPT", "chatbot", "machine learning" | +30 |
| Description mentions repetitive/manual tasks | +20 |
| Category is "dev tool", "productivity", "education" | +15 |
| Business model is subscription or SaaS | +10 |
| Involves data analysis, content creation, or customer support | +15 |
| Category is "hardware", "manufacturing", "physical" | -20 |
| Business model is "consulting" or "services" | -10 |

Store as `ai_potential` (0-100 integer).

---

### Task 9: Frontend display

**Files:**
- Modify: `website/find-ideas.html`
- Modify: `website/styles.css` (if new badge styles needed)

**Details:**
- Add new source badges in CSS for `gh` (GitHub Trending), `yt` (YouTube), `v2ex`, `36kr`
- Show enriched fields in idea card:
  - Revenue badge → show `revenue_signal` (already exists)
  - Business model → pill badge like "Subscription" or "Marketplace"
  - AI potential → small badge if score > 50: `sparkles icon + "AI Ready"`
  - Trend direction → if "rising" show green up arrow
- Add new filter checkboxes in source-filters for new sources
- Update `SOURCE_NAMES` and `SOURCE_CLASSES` in JS

---

### Task 10: GitHub Actions update

**Files:**
- Modify: `.github/workflows/update-repos.yml`

**Details:**
- Add `YOUTUBE_API_KEY` to env (secret)
- If new Python deps needed (`pytrends`, `google-api-python-client`), add pip install step
- Ensure scraper timeout is sufficient for 4 new sources (increase from 3min to 5min)
- Sources that fail should not block others (already handled by CLI try/except pattern)

---

## Order of execution

1. **Task 1** — GitHub Trending (quickest win, 15 min)
2. **Task 2** — YouTube (needs API key, 30 min)
3. **Task 3** — V2EX (easy scrape, 20 min)
4. **Task 4** — 36Kr (may need iteration, 30 min)
5. **Task 5** — Revenue upgrade (20 min)
6. **Task 6** — Business model (15 min)
7. **Task 7** — Google Trends (20 min)
8. **Task 8** — AI potential (10 min)
9. **Task 9** — Frontend (20 min)
10. **Task 10** — CI/CD (10 min)

Total estimated: ~3 hours
