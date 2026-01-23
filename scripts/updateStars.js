const fs = require("fs");

const CATEGORIES = {
  "AI Agents": {
    topics: ["agent", "ai-agent", "agents", "autonomous-agent"],
    keywords: ["agent", "multi-agent", "autonomous"]
  },
  "LLM / Models": {
    topics: ["llm", "language-model", "transformer", "foundation-model"],
    keywords: ["llm", "language model", "model", "inference"]
  },
  "Automation / Workflow": {
    topics: ["automation", "workflow", "orchestration", "pipeline"],
    keywords: ["automation", "workflow", "orchestrator", "scheduler"]
  },
  "Chinese / Language": {
    topics: ["chinese", "zh", "nlp"],
    keywords: ["chinese", "mandarin", "hsk", "pinyin"]
  },
  "Tools / Infra": {
    topics: ["tooling", "infrastructure", "sdk", "framework"],
    keywords: ["framework", "sdk", "infra", "tool"]
  }
};
const CATEGORY_META = {
  "AI Agents": "🤖 AI Agents",
  "LLM / Models": "🧠 LLM / Models",
  "Automation / Workflow": "⚙️ Automation / Workflow",
  "Chinese / Language": "🀄 Chinese / Language",
  "Tools / Infra": "🧰 Tools / Infra",
  "Others": "📦 Others"
};
async function fetchAllStars(user) {
  let page = 1;
  let all = [];

  while (true) {
    const res = await fetch(
      `https://api.github.com/users/${user}/starred?per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
        },
      }
    );

    if (!res.ok) throw new Error(`GitHub API error ${res.status}`);

    const data = await res.json();
    if (data.length === 0) break;

    all.push(...data);
    page++;
  }

  return all;
}

function classify(repo) {
  const matches = [];

  const topics = repo.topics || [];
  const text = `${repo.name} ${repo.description || ""}`.toLowerCase();

  for (const [category, rule] of Object.entries(CATEGORIES)) {
    const topicHit = rule.topics.some(t => topics.includes(t));
    const keywordHit = rule.keywords.some(k => text.includes(k));

    if (topicHit || keywordHit) {
      matches.push(category);
    }
  }

  if (matches.length === 0) matches.push("Others");
  return matches;
}

async function run() {
  const user = "hankbui"; // ← đổi
  const repos = await fetchAllStars(user);

  const grouped = {};

  for (const repo of repos) {
    const cats = classify(repo);
    for (const c of cats) {
      if (!grouped[c]) grouped[c] = [];
      grouped[c].push(repo);
    }
  }

  let md = `# ⭐ Starred Repositories (Auto-Curated)\n\n`;
  md += `Total: **${repos.length} repositories**\n\n`;
  md += `Updated daily via GitHub Actions.\n\n`;

for (const [category, list] of Object.entries(grouped)) {
  const title = CATEGORY_META[category] || category;

  md += `## ${title}\n\n`;
  md += `| Repository | Description |\n`;
  md += `|------------|-------------|\n`;

  for (const r of list) {
    const desc = (r.description || "").replace(/\|/g, "\\|");
    md += `| [${r.full_name}](${r.html_url}) | ${desc} |\n`;
  }

  md += `\n`;
}

  fs.writeFileSync("README.md", md);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
