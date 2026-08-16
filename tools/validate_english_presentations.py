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
    pending = data.get("pending", [])

    if data.get("sourceLanguage") != "en" or data.get("presentationLanguage") != "ja":
        errors.append("English presentation language contract must be en -> ja")
    if data.get("classifiedEnglishCount") != 21:
        errors.append("classified English count must be 21 until registry audit updates it")
    if data.get("completedCount") != len(rows) or data.get("pendingCount") != len(pending):
        errors.append("completed/pending manifest counts do not match arrays")
    if len(rows) != 13 or len(pending) != 8:
        errors.append(f"current rebuild state must be completed=13/pending=8, got {len(rows)}/{len(pending)}")
    if len(rows) + len(pending) != 21:
        errors.append("completed + pending English documents must equal 21")

    all_rows = rows + pending
    slugs = [row.get("slug") for row in all_rows]
    drive_ids = [row.get("driveId") for row in all_rows]
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

    for row in pending:
        if (OUTPUT / row.get("slug", "") / "index.html").exists():
            errors.append(f"pending document must not masquerade as completed Japanese presentation: {row.get('slug')}")

    built_index = OUTPUT / "index.json"
    if not built_index.exists():
        errors.append("missing documents/English/index.json")
    else:
        built = json.loads(built_index.read_text(encoding="utf-8"))
        if built.get("completedCount") != 13 or len(built.get("presentations", [])) != 13:
            errors.append("generated English index must expose exactly 13 completed presentations")
        if built.get("pendingCount") != 8 or len(built.get("pending", [])) != 8:
            errors.append("generated English index must expose exactly 8 pending rebuilds")

    documents = (ROOT / "documents.html").read_text(encoding="utf-8")
    for required in ("english-presentations", "日本語版を読む", "Source-faithful Japanese HTML"):
        if required not in documents:
            errors.append(f"Documents page missing English routing marker: {required}")
    if "englishByDriveId" not in documents:
        errors.append("Documents page must route completed English by Drive ID")

    if errors:
        print("FAILED: English -> Japanese presentation validation")
        for error in errors:
            print("-", error)
        raise SystemExit(1)

    print("OK: 13 completed English Originals have Japanese Portal presentations; 8 remain explicitly pending Source-faithful rebuild")


if __name__ == "__main__":
    main()
