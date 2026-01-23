import requests

GITHUB_USER = "hankbui"   
PER_PAGE = 100

def fetch_starred():
    page = 1
    repos = []

    while True:
        url = f"https://api.github.com/users/{GITHUB_USER}/starred"
        resp = requests.get(url, params={"per_page": PER_PAGE, "page": page})
        data = resp.json()

        if not data:
            break

        for r in data:
            repos.append({
                "name": r["full_name"],
                "url": r["html_url"],
                "description": r["description"] or "",
                "topics": r.get("topics", [])
            })

        page += 1

    return repos
