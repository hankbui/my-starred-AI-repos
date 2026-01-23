def categorize_repos(repos):
    categories = {
        "AI / LLM": [],
        "OCR / Vision": [],
        "Dev Tools": [],
        "Other": [],
    }

    for repo in repos:
        topics = repo.get("topics", [])
        name = repo["name"].lower()
        tech = repo.get("techstack", [])

        if any(t in topics for t in ["llm", "ai", "language-model"]) or "llm" in tech:
            categories["AI / LLM"].append(repo)

        elif any(t in topics for t in ["ocr", "vision", "cv"]):
            categories["OCR / Vision"].append(repo)

        elif any(t in topics for t in ["tool", "devtool", "cli"]):
            categories["Dev Tools"].append(repo)

        else:
            categories["Other"].append(repo)

    return categories
