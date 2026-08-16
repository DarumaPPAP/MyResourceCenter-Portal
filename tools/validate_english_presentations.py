from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "catalog" / "english-presentations.json"
OUTPUT = ROOT / "documents" / "English"
JAPANESE_RE = re.compile(r"[ぁ-んァ-ヶ一-龠々]")


def main() -> None:
    errors: list[str] = []
    data = json.loads(MANIFEST.read_text(encoding="utf-8"))
    rows = data.get("presentations", [])

    if data.get("sourceLanguage") != "en" or data.get("presentationLanguage") != "ja":
        errors.append("English presentation language contract must be en -> ja")
    if data.get("count") != 21 or len(rows) != 21:
        errors.append(f"English presentation count must be 21, got {len(rows)}")

    slugs = [row.get("slug") for row in rows]
    drive_ids = [row.get("driveId") for row in rows]
    if len(slugs) != len(set(slugs)):
        errors.append("English presentation slugs must be unique")
    if len(drive_ids) != len(set(drive_ids)):
        errors.append("English presentation Drive IDs must be unique")

    for row in rows:
        slug = row.get("slug", "")
        drive_id = row.get("driveId", "")
        target = OUTPUT / slug / "index.html"
        if not target.exists():
            errors.append(f"missing generated presentation: {target.relative_to(ROOT)}")
            continue
        text = target.read_text(encoding="utf-8")
        if len(text) < 3000:
            errors.append(f"generated presentation is suspiciously small: {slug}")
        if not JAPANESE_RE.search(text):
            errors.append(f"generated presentation has no Japanese content: {slug}")
        if "日本語再構築版" not in text:
            errors.append(f"generated presentation missing Japanese rebuild badge: {slug}")
        if "Source language: English" not in text:
            errors.append(f"generated presentation missing source language: {slug}")
        if f"https://drive.google.com/file/d/{drive_id}/view" not in text:
            errors.append(f"generated presentation missing canonical Original link: {slug}")

    built_index = OUTPUT / "index.json"
    if not built_index.exists():
        errors.append("missing documents/English/index.json")
    else:
        built = json.loads(built_index.read_text(encoding="utf-8"))
        if built.get("count") != 21 or len(built.get("presentations", [])) != 21:
            errors.append("generated English index must contain 21 presentations")

    documents = (ROOT / "documents.html").read_text(encoding="utf-8")
    for required in ("english-presentations", "日本語版を読む", "Source-faithful Japanese HTML"):
        if required not in documents:
            errors.append(f"Documents page missing English routing marker: {required}")
    if "englishByDriveId" not in documents:
        errors.append("Documents page must route English by Drive ID")

    if errors:
        print("FAILED: English -> Japanese presentation validation")
        for error in errors:
            print("-", error)
        raise SystemExit(1)

    print("OK: 21 English Originals have generated Japanese Portal presentations with Original links")


if __name__ == "__main__":
    main()
