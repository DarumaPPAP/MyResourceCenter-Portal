from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def main() -> None:
    errors: list[str] = []
    documents = (ROOT / "documents.html").read_text(encoding="utf-8")
    viewer = (ROOT / "viewer.html").read_text(encoding="utf-8")
    viewer_js = (ROOT / "assets" / "viewer.js").read_text(encoding="utf-8")
    viewer_config = (ROOT / "assets" / "viewer-config.js").read_text(encoding="utf-8")
    documents_css = (ROOT / "assets" / "documents.css").read_text(encoding="utf-8")

    required_files = [
        ROOT / "viewer.html",
        ROOT / "assets" / "viewer.js",
        ROOT / "assets" / "viewer-config.js",
        ROOT / "assets" / "documents.css",
    ]
    for path in required_files:
        if not path.exists():
            errors.append(f"missing Adaptive Viewer asset: {path.relative_to(ROOT)}")

    if "viewer.html?" not in documents:
        errors.append("Documents must route the primary action through viewer.html")
    if "ブラウザで見る" not in documents:
        errors.append("Documents must expose Browser View as the primary action")
    if "viewer-config.js" not in documents:
        errors.append("Documents must load shared viewer routing config")
    if "sizeBytes" not in documents or "p.set('size'" not in documents:
        errors.append("Documents must forward sizeBytes metadata to viewer.html")
    if "format === 'PDF'" not in documents or "largePdfThresholdBytes" not in documents:
        errors.append("Documents must classify only large PDF files for Adobe routing")

    if "adobe-dc-view" not in viewer or "viewer.js" not in viewer:
        errors.append("viewer.html must include both Adobe and adaptive viewer surfaces")
    if "viewer-config.js" not in viewer:
        errors.append("viewer.html must load viewer-config.js")

    required_viewer_tokens = [
        "drive.google.com/file/d/",
        "/preview`",
        "acrobatservices.adobe.com/view-sdk/viewer.js",
        "AdobeDC.View",
        "enableLinearization",
        "APP_RENDERING_DONE",
        "APP_RENDERING_FAILED",
        "useDrivePreview",
        "format === 'PDF' && sizeBytes >= largePdfThresholdBytes",
        "requestFullscreen",
    ]
    for token in required_viewer_tokens:
        if token not in viewer_js:
            errors.append(f"Adaptive Viewer missing contract token: {token}")

    if "largePdfThresholdBytes: 25 * 1024 * 1024" not in viewer_config:
        errors.append("Default large PDF threshold must be 25 MiB")
    if "adobeClientId" not in viewer_config:
        errors.append("Viewer config must expose adobeClientId")
    if "adobeEnableLinearization: true" not in viewer_config:
        errors.append("Large PDF Adobe viewer must default to linearization")

    threshold = 25 * 1024 * 1024
    base_rows = []
    for shard in ("originals-base-01", "originals-base-02", "originals-base-03"):
        rows = load_json(ROOT / "catalog" / f"{shard}.json")
        base_rows.extend(rows)
        for index, row in enumerate(rows):
            size = row.get("sizeBytes")
            if not isinstance(size, int) or size <= 0:
                errors.append(f"{shard}[{index}] missing positive sizeBytes")

    heavy_pdfs = [
        row for row in base_rows
        if str(row.get("kind", "")).lower() == "pdf" and row.get("sizeBytes", 0) >= threshold
    ]
    if not heavy_pdfs:
        errors.append("Catalog must contain at least one large PDF that exercises Adobe routing")

    heavy_pptx = [
        row for row in base_rows
        if str(row.get("kind", "")).lower() == "pptx" and row.get("sizeBytes", 0) >= threshold
    ]
    if not heavy_pptx:
        errors.append("Catalog fixture must retain large PPTX coverage for non-Adobe routing")

    for token in ("resource-card", "resource-actions", "viewer-stage", "viewer-frame", "adobe-view", "viewer-pill"):
        if token not in documents_css:
            errors.append(f"missing responsive Adaptive Viewer style: {token}")

    if errors:
        print("FAILED: Adaptive Viewer validation")
        for error in errors:
            print("-", error)
        raise SystemExit(1)

    print(
        "OK: Adaptive Viewer contract validated "
        f"({len(heavy_pdfs)} large PDFs route to Adobe; {len(heavy_pptx)} large PPTX stay on Drive)"
    )


if __name__ == "__main__":
    main()
