def infer_techstack(repo):
    stack = []

    lang = repo.get("language", "")
    topics = repo.get("topics", [])

    if lang:
        stack.append(lang)

    if "pytorch" in topics:
        stack.append("PyTorch")
    if "tensorflow" in topics:
        stack.append("TensorFlow")
    if "onnx" in topics:
        stack.append("ONNX")
    if "react-native" in topics:
        stack.append("React Native")
    if "expo" in topics:
        stack.append("Expo")
    if "llm" in topics:
        stack.append("LLM")

    return stack
