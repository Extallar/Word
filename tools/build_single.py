"""index.html + style.css + data/words.js + app.js -> 한 파일(dist/single.html)로 합치기."""
import re, sys, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else root / 'dist' / 'single.html'
html = (root / 'index.html').read_text(encoding='utf-8')
html = html.replace('<link rel="stylesheet" href="style.css">', '<style>\n' + (root / 'style.css').read_text(encoding='utf-8') + '</style>')
for src in re.findall(r'<script src="([^"]+)"></script>', html):
    html = html.replace(f'<script src="{src}"></script>', '<script>\n' + (root / src).read_text(encoding='utf-8') + '</script>')
out.parent.mkdir(parents=True, exist_ok=True)
out.write_text(html, encoding='utf-8')
print(out, len(html))
