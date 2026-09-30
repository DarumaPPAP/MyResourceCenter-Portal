from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    errors: list[str] = []
    documents = (ROOT / "documents.html").read_text(encoding="utf-8")
    consumer = (ROOT / "assets/human-portal.js").read_text(encoding="utf-8")
    catalog_js = (ROOT / "assets/catalog.js").read_text(encoding="utf-8")
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

    if "assets/human-portal.js" not in documents or "C.viewerHref(doc)" not in consumer or "viewer.html?" not in catalog_js:
        errors.append("Documents must route the primary action through safe Viewer helper")
    for token in ("drive.google.com", "docs.google.com", "[A-Za-z0-9_-]+", "url.protocol !== 'https:'", "url.username", "url.password"):
        if token not in catalog_js:
            errors.append(f"Viewer URL helper must validate canonical Original: {token}")
    if "Google Drive Original" not in consumer or "doc.canonicalUrl" not in consumer:
        errors.append("Document details must expose approved canonical Original navigation")
    if "ブラウザで読む" not in consumer or "プレビューを開きます" not in documents:
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

    if "/^[A-Za-z0-9_-]+$/" not in viewer_js:
        errors.append("Viewer must reject malformed Drive IDs")
    if "rel=\"noopener noreferrer\"" not in viewer:
        errors.append("Original navigation requires safe external link isolation")

    for token in ("document-entry", "document-thumbnail", "object-fit:contain", "viewer-stage", "viewer-frame"):
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
