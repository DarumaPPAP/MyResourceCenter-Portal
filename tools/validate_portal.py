from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog"

REQUIRED_PAGES = {
    "index.html",
    "documents.html",
    "document.html",
    "websites.html",
    "website.html",
    "collections.html",
    "collection.html",
    "taxonomy.html",
}
REQUIRED_CATALOG = {
    "manifest.json",
    "resources.json",
    "websites.json",
    "documents.json",
    "taxonomy.json",
    "relations.json",
    "collections.json",
}
FORBIDDEN_KEYS = {
    "path",
    "original",
    "images",
    "sourceimages",
    "sourcenote",
    "drivefileid",
    "driveid",
    "drivepath",
    "localpath",
    "privatesource",
    "privaterepository",
    "internalnote",
    "rawmarkdown",
    "secret",
    "token",
    "password",
    "authorization",
    "customer",
    "projectsecret",
    "keyfacts",
    "constraints",
    "evidence",
    "searchindex",
    "lineage",
}


def load(name: str):
    return json.loads((CATALOG / name).read_text(encoding="utf-8"))


def walk_keys(value):
    if isinstance(value, dict):
        for key, child in value.items():
            yield key
            yield from walk_keys(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_keys(child)


def main() -> None:
    errors: list[str] = []

    for page in sorted(REQUIRED_PAGES):
        if not (ROOT / page).exists():
            errors.append(f"missing page: {page}")
    for name in sorted(REQUIRED_CATALOG):
        if not (CATALOG / name).exists():
            errors.append(f"missing public catalog: catalog/{name}")
    if errors:
        raise SystemExit("FAILED: Portal structure\n- " + "\n- ".join(errors))

    manifest = load("manifest.json")
    resources = load("resources.json")
    websites = load("websites.json")
    documents = load("documents.json")
    taxonomy = load("taxonomy.json")
    relations = load("relations.json")
    collections = load("collections.json")

    if manifest.get("schemaVersion") != "1.2.0":
        errors.append("manifest schemaVersion must be 1.2.0")
    expected_counts = {
        "resources": len(resources),
        "websites": len(websites),
        "documents": len(documents),
        "taxonomy": sum(len(taxonomy.get(k, {})) for k in ("domains", "tags", "engines")),
        "relations": len(relations),
        "collections": len(collections),
    }
    for key, value in expected_counts.items():
        if manifest.get("counts", {}).get(key) != value:
            errors.append(f"manifest count mismatch: {key}")

    for name, data in {
        "resources": resources,
        "websites": websites,
        "documents": documents,
        "taxonomy": taxonomy,
        "relations": relations,
        "collections": collections,
    }.items():
        for key in walk_keys(data):
            if key.lower() in FORBIDDEN_KEYS:
                errors.append(f"{name}: forbidden private field: {key}")

    resource_ids = {row.get("id") for row in resources}
    website_ids = {row.get("id") for row in websites}
    document_ids = [row.get("id") for row in documents]
    if len(resource_ids) != len(resources) or None in resource_ids:
        errors.append("resources require unique IDs")
    if not website_ids <= resource_ids:
        errors.append("every Website ID must exist in Resources")
    if len(set(document_ids)) != len(documents) or any(not str(x).startswith("DOC-") for x in document_ids):
        errors.append("documents require unique DOC-* IDs")

    allowed_doc_fields = {"id", "title", "sourceFormat", "level", "engine", "tags"}
    for index, row in enumerate(documents):
        extra = set(row) - allowed_doc_fields
        if extra:
            errors.append(f"documents[{index}] unexpected fields: {sorted(extra)}")

    for index, row in enumerate(websites):
        for field in ("id", "title", "url", "reviewState", "useState"):
            if not row.get(field):
                errors.append(f"websites[{index}] missing {field}")
        if "status" in row or "topic" in row:
            errors.append(f"websites[{index}] legacy status/topic must not be published")

    for index, edge in enumerate(relations):
        if edge.get("from") not in resource_ids or edge.get("to") not in resource_ids:
            errors.append(f"relations[{index}] unresolved endpoint")

    collection_ids: set[str] = set()
    for index, collection in enumerate(collections):
        collection_id = collection.get("id")
        if not collection_id or collection_id in collection_ids:
            errors.append(f"collections[{index}] invalid/duplicate id")
        collection_ids.add(collection_id)
        for member in collection.get("resources", []):
            if member.get("id") not in resource_ids:
                errors.append(f"{collection_id}: unresolved resource {member.get('id')}")

    html = "\n".join((ROOT / page).read_text(encoding="utf-8") for page in REQUIRED_PAGES)
    if "github.com/DarumaPPAP/MyResourceCenter/blob" in html:
        errors.append("Portal must not link directly to private Markdown blobs")
    if "websites-data.json" in html:
        errors.append("Portal must not reference legacy websites-data.json")

    if (CATALOG / "websites-data.json").exists():
        errors.append("legacy catalog/websites-data.json must be removed")

    if errors:
        print("FAILED: Portal Detail / Collection UX validation")
        for error in errors:
            print("-", error)
        raise SystemExit(1)

    print(
        "OK: Portal PR4 boundary validated: "
        f"{len(resources)} resources, {len(websites)} websites, {len(documents)} documents, "
        f"{len(relations)} relations, {len(collections)} collections"
    )


if __name__ == "__main__":
    main()
