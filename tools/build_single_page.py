"""Bundle the web app into one self-contained HTML file: docs/index.html.

The bundle inlines style.css, engine.js, content.js, app.js and the piece SVGs,
so it can be opened by double-clicking or hosted on GitHub Pages. Without the
FastAPI server it runs the in-browser engine (engine.js); the Qiskit engine
needs `uvicorn src.api:app`.

    python tools/build_single_page.py
"""

import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web"
OUT = ROOT / "docs" / "index.html"


def data_uri(svg: Path) -> str:
    return "data:image/svg+xml;base64," + base64.b64encode(svg.read_bytes()).decode()


def main():
    pieces = {p.stem: data_uri(p) for p in sorted((WEB / "pieces").glob("*.svg"))}
    css = (WEB / "style.css").read_text(encoding="utf-8")
    for key, uri in pieces.items():
        css = css.replace(f"url(pieces/{key}.svg)", f"url({uri})")

    html = (WEB / "index.html").read_text(encoding="utf-8")
    html = html.replace('<link rel="stylesheet" href="style.css">', f"<style>\n{css}\n</style>")
    scripts = f"<script>window.PIECE_DATA = {json.dumps(pieces)};</script>\n"
    for name in ("engine.js", "puzzles-core.js", "learn.js", "content.js", "puzzles.js", "app.js"):
        tag = f'<script src="{name}"></script>'
        assert tag in html, tag
        code = (WEB / name).read_text(encoding="utf-8").replace("</script", r"<\/script")
        html = html.replace(tag, (scripts if name == "engine.js" else "") + f"<script>\n{code}\n</script>")
    assert "pieces/" not in css
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT.relative_to(ROOT)} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
