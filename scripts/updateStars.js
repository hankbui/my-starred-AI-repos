const fs = require("fs");

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

    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status}`);
    }

    const data = await res.json();
    if (data.length === 0) break;

    all.push(...data);
    page++;
  }

  return all;
}

async function run() {
  const user = "hankbui"; 

  const repos = await fetchAllStars(user);

  let md = `# ⭐ Repositories I Starred\n\n`;
  md += `Total: **${repos.length} repositories**\n\n`;
  md += `Auto-updated daily via GitHub Actions.\n\n`;

  for (const r of repos) {
    md += `- [${r.full_name}](${r.html_url})`;
    if (r.description) md += ` — ${r.description}`;
    md += `\n`;
  }

  fs.writeFileSync("README.md", md);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
