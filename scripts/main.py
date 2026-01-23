from scripts.fetch_starred import fetch_starred
from scripts.categorize import categorize_repos
from scripts.render_readme import render_readme


def main():
    # 1. Fetch all starred repos
    repos = fetch_starred()

    # 2. Categorize repos
    categorized = categorize_repos(repos)

    # 3. Render README content
    markdown = render_readme(categorized)

    # 4. Write README.md (overwrite)
    with open("README.md", "w", encoding="utf-8") as f:
        f.write(markdown)


if __name__ == "__main__":
    main()
