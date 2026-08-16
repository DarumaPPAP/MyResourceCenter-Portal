from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    errors: list[str] = []
    documents = (ROOT / "documents.html").read_text(encoding="utf-8")
    viewer = (ROOT / "viewer.html").read_text(encoding="utf-8")
    viewer_js = (ROOT / "assets" / "viewer.js").read_text(encoding="utf-8")
    documents_css = (ROOT / "assets" / "documents.css").read_text(encoding="utf-8")

    required_files = [
        ROOT / "viewer.html",
        ROOT / "assets" / "viewer.js",
        ROOT / "assets" / "documents.css",
    ]
    for path in required_files:
        if not path.exists():
            errors.append(f"missing Browser Viewer asset: {path.relative_to(ROOT)}")

    if "viewer.html?id=" not in documents:
        errors.append("Documents must route the primary action through viewer.html")
    if "ブラウザで見る" not in documents:
        errors.append("Documents must expose Browser View as the primary action")
    if "Originalをダウンロード" in documents:
        errors.append("Download must not be the primary Documents navigation")
    if "docs.google.com/presentation" in documents:
        errors.append("Documents must not route PPTX through Google Slides edit URLs")
    if "/preview`" in documents:
        errors.append("Documents must not embed a malformed preview literal")

    if "viewer-frame" not in viewer or "viewer.js" not in viewer:
        errors.append("viewer.html must include the Viewer iframe and viewer.js")
    if "drive.google.com/file/d/" not in viewer_js or "/preview" not in viewer_js:
        errors.append("Viewer must use Google Drive /preview routing")
    if "docs.google.com/presentation" in viewer_js:
        errors.append("Viewer must not use Google Slides edit routing")
    if "requestFullscreen" not in viewer_js:
        errors.append("Viewer must support Full Screen")

    for token in ("resource-card", "resource-actions", "viewer-stage", "viewer-frame"):
        if token not in documents_css:
            errors.append(f"missing responsive Browser Viewer style: {token}")

    if errors:
        print("FAILED: Browser Viewer validation")
        for error in errors:
            print("-", error)
        raise SystemExit(1)

    print("OK: Browser Viewer routing and responsive UI contract validated")


if __name__ == "__main__":
    main()
