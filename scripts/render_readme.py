def render_table(repos):
    rows = []
    for repo in repos:
        rows.append(f"""
<tr>
  <td><a href="{repo['url']}">{repo['name']}</a></td>
  <td>{repo['description'] or ''}</td>
</tr>
""")

    return f"""
<table>
  <colgroup>
    <col style="width: 22%">
    <col style="width: 78%">
  </colgroup>
  <thead>
    <tr>
      <th align="left">Repository</th>
      <th align="left">Description</th>
    </tr>
  </thead>
  <tbody>
    {''.join(rows)}
  </tbody>
</table>
"""
