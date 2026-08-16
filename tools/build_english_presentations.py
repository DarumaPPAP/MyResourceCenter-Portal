from __future__ import annotations

import html
import json
import re
import shutil
import urllib.parse
import urllib.request
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "catalog" / "english-presentations.json"
OUTPUT_ROOT = ROOT / "documents" / "English"
RAW_ROOT = "https://raw.githubusercontent.com/DarumaPPAP/MyResourceCenter/main/"
RAW_IMAGE_ROOT = RAW_ROOT + "sources/markdown/images/"

STYLE = r"""
:root{color-scheme:light;--bg:#f4f7fb;--panel:#fff;--soft:#f8fafc;--line:#dbe3ef;--text:#172033;--muted:#68758a;--accent:#2563eb;--code:#0b1220;--codeText:#e7edf7;--shadow:0 14px 38px rgba(33,51,82,.08)}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#0a0f18;--panel:#111827;--soft:#151f2e;--line:#263449;--text:#e8eef7;--muted:#9aa9bd;--accent:#7eb1ff;--code:#060b13;--codeText:#e7edf7;--shadow:none}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,"Noto Sans JP","Hiragino Sans",system-ui,-apple-system,sans-serif;line-height:1.78}.top{position:sticky;top:0;z-index:20;background:color-mix(in srgb,var(--panel) 90%,transparent);backdrop-filter:blur(12px);border-bottom:1px solid var(--line)}.top-inner{max-width:1180px;margin:auto;padding:12px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}.back,.source{display:inline-flex;align-items:center;gap:7px;text-decoration:none;border:1px solid var(--line);background:var(--panel);border-radius:10px;padding:9px 12px;font-size:13px}.source{color:#fff;background:var(--accent);border-color:var(--accent);font-weight:700}.meta{max-width:1180px;margin:22px auto 0;padding:0 24px}.badge{display:inline-flex;padding:5px 9px;border-radius:999px;background:color-mix(in srgb,var(--accent) 12%,var(--panel));color:var(--accent);font-size:12px;font-weight:800}.meta p{margin:8px 0 0;color:var(--muted);font-size:13px}.article{max-width:1180px;margin:16px auto 50px;padding:30px 42px;border:1px solid var(--line);border-radius:18px;background:var(--panel);box-shadow:var(--shadow);overflow:hidden}.article h1{font-size:34px;line-height:1.3;margin:.2em 0 .8em;letter-spacing:-.025em}.article h2{font-size:24px;line-height:1.4;margin:2.2em 0 .7em;padding-top:.15em;border-top:1px solid var(--line)}.article h3{font-size:19px;margin:1.7em 0 .55em}.article p,.article li{font-size:15.5px}.article a{color:var(--accent);overflow-wrap:anywhere}.article blockquote{margin:1.3em 0;padding:12px 16px;border-left:4px solid var(--accent);background:var(--soft);color:var(--muted)}.article img{display:block;max-width:100%;height:auto;margin:22px auto;border:1px solid var(--line);border-radius:12px;background:#fff}.article table{width:100%;border-collapse:collapse;margin:18px 0;display:block;overflow-x:auto}.article th,.article td{border:1px solid var(--line);padding:9px 11px;text-align:left;vertical-align:top;min-width:110px}.article th{background:var(--soft)}.article pre{overflow:auto;padding:16px;border-radius:12px;background:var(--code);color:var(--codeText);font-size:13px;line-height:1.55}.article code{font-family:"Cascadia Code",Consolas,monospace}.article :not(pre)>code{background:var(--soft);border:1px solid var(--line);padding:2px 5px;border-radius:5px}.article hr{border:0;border-top:1px solid var(--line);margin:30px 0}.footer{max-width:1180px;margin:0 auto 36px;padding:0 24px;color:var(--muted);font-size:12px}.notice{margin-top:18px;padding:13px 15px;border:1px solid var(--line);background:var(--soft);border-radius:12px;color:var(--muted);font-size:13px}
@media(max-width:760px){.top-inner{padding:10px 14px}.top-inner span{display:none}.meta{padding:0 14px}.article{margin:12px 10px 34px;padding:22px 18px;border-radius:14px}.article h1{font-size:27px}.article h2{font-size:21px}.article p,.article li{font-size:15px}}
"""


def fetch_text(repo_path: str) -> str:
    quoted = urllib.parse.quote(repo_path, safe="/")
    req = urllib.request.Request(RAW_ROOT + quoted, headers={"User-Agent": "MyResourceCenter-Portal"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read().decode("utf-8")


def first_heading(md: str, fallback: str) -> str:
    match = re.search(r"^#\s+(.+)$", md, flags=re.MULTILINE)
    return match.group(1).strip() if match else fallback


def rewrite_images(rendered: str) -> str:
    prefix = html.escape(RAW_IMAGE_ROOT, quote=True)
    return rendered.replace('src="images/', f'src="{prefix}')


def build_page(row: dict) -> tuple[str, str]:
    source = fetch_text(row["markdownPath"])
    title = first_heading(source, Path(row["originalFilename"]).stem)
    body = markdown.markdown(
        source,
        extensions=["extra", "tables", "fenced_code", "sane_lists", "toc"],
        output_format="html5",
    )
    body = rewrite_images(body)
    original = f'https://drive.google.com/file/d/{urllib.parse.quote(row["driveId"])}/view'
    page = f"""<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)} | MyResourceCenter</title>
<meta name="description" content="英語OriginalをSource-faithfulに日本語再構築したMyResourceCenter Presentationです。">
<style>{STYLE}</style>
</head>
<body>
<header class="top"><div class="top-inner"><a class="back" href="../../../documents.html">← <span>Documentsへ戻る</span></a><a class="source" href="{html.escape(original, quote=True)}" target="_blank" rel="noopener noreferrer">Original Source ↗</a></div></header>
<section class="meta"><span class="badge">日本語再構築版 · Source language: English</span><p>{html.escape(row['originalFilename'])}</p><div class="notice">このページはHuman向け日本語Presentationです。事実確認・AI Groundingの正本はGoogle DriveのOriginal Sourceです。</div></section>
<article class="article">{body}</article>
<footer class="footer">MyResourceCenter · English → Japanese Source-faithful Presentation · <a href="{html.escape(original, quote=True)}" target="_blank" rel="noopener noreferrer">Canonical Original</a></footer>
</body></html>"""
    return title, page


def main() -> None:
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rows = data.get("presentations", [])
    pending = data.get("pending", [])
    if data.get("classifiedEnglishCount") != 21:
        raise SystemExit("classifiedEnglishCount must remain 21 until the registry is re-audited")
    if data.get("completedCount") != len(rows) or data.get("pendingCount") != len(pending):
        raise SystemExit("English presentation completion counts do not match manifest arrays")
    if len(rows) + len(pending) != 21:
        raise SystemExit("completed + pending English documents must equal 21")

    if OUTPUT_ROOT.exists():
        shutil.rmtree(OUTPUT_ROOT)
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)

    built = []
    for row in rows:
        title, page = build_page(row)
        out_dir = OUTPUT_ROOT / row["slug"]
        out_dir.mkdir(parents=True, exist_ok=True)
        (out_dir / "index.html").write_text(page, encoding="utf-8")
        built.append({"slug": row["slug"], "title": title, "driveId": row["driveId"], "path": f"documents/English/{row['slug']}/index.html"})

    output = {
        "classifiedEnglishCount": 21,
        "completedCount": len(built),
        "pendingCount": len(pending),
        "presentations": built,
        "pending": pending,
    }
    (OUTPUT_ROOT / "index.json").write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Built {len(built)} completed English -> Japanese static HTML presentations; {len(pending)} pending Source-faithful rebuild")


if __name__ == "__main__":
    main()
