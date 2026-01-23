- name: Generate README
  run: python scripts/main.py

- name: Commit changes
  run: |
    git config user.name "github-actions"
    git config user.email "actions@github.com"
    git add README.md
    git commit -m "chore: update starred repos" || echo "No changes"
    git push
