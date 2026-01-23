def render_category(title, icon, repos):
    return f"""
## {icon} {title}

{render_table(repos)}
"""
