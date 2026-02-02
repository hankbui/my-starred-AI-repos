# ⭐ My Starred AI Repositories

Auto-updated daily via GitHub Actions.

## 🌐 Website

View the full list with search, filtering, and categorization:
**[https://hankbui.github.io/my-starred-AI-repos/](https://hankbui.github.io/my-starred-AI-repos/)**

## 📁 Project Structure

```
my-starred-AI-repos/
├── .github/workflows/
│   └── update-and-deploy.yml  # GitHub Actions workflow
├── scripts/
│   ├── generate_data.py       # Fetch repos from GitHub API
│   └── generate_website.py    # Generate static HTML website
├── website/
│   ├── index.html             # Main website
│   ├── styles.css             # Dark theme styles
│   └── app.js                 # Client-side filtering/sorting
├── data/
│   ├── repos.json             # Repository data
│   └── stats.json             # Statistics summary
└── requirements.txt           # Python dependencies
```

## 🔄 How It Works

1. **GitHub Actions** runs daily at midnight (UTC)
2. **generate_data.py** fetches your starred repos from GitHub API
3. **generate_website.py** creates the static HTML page
4. **GitHub Pages** deploys the website automatically

## 🚀 Manual Trigger

You can manually trigger the workflow from the GitHub Actions tab.

## 📊 Categories

- 🤖 AI / LLM
- 👁️ Vision / OCR
- ⚙️ Automation
- 📊 Data / ML
- 🔧 Dev Tools
- 🌐 Web / Cloud
- 🔐 Security
- 📦 Other

## 🛠️ Development

```bash
# Install dependencies
pip install -r requirements.txt

# Generate data
python scripts/generate_data.py

# Generate website
python scripts/generate_website.py
```
