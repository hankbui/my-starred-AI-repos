def infer_techstack(repo):
    stack = []

    if repo.get("language"):
        stack.append(repo["language"])

    topics = repo.get("topics", [])

    if "llm" in topics:
        stack.append("LLM")
    if "pytorch" in topics:
        stack.append("PyTorch")
    if "onnx" in topics:
        stack.append("ONNX")
    if "react-native" in topics:
        stack.append("React Native")

    return stack
