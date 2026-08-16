from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse

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
    "resources-06.json",
    "websites.json",
    "documents.json",
    "original-documents.json",
    "taxonomy.json",
    "relations.json",
    "collections.json",
}
FORBIDDEN_KEYS = {
    "path", "original", "images", "sourceimages", "sourcenote", "drivefileid",
    "driveid", "drivepath", "localpath", "privatesource", "privaterepository",
    "internalnote", "rawmarkdown", "secret", "token", "password", "authorization",
    "customer", "projectsecret", "keyfacts", "constraints", "evidence", "searchindex",
    "lineage",
}
RESOURCE_FIELDS = {"id", "title", "url", "canonicalUrl", "kind", "topic", "topics", "reviewState", "useState", "tags"}
WEBSITE_FIELDS = {"id", "title", "url", "canonicalUrl", "publisher", "authors", "publishedAt", "kind", "contentType", "domains", "topics", "engines", "languages", "summary", "reviewState", "useState", "confidence", "freshness", "tags"}
DOCUMENT_FIELDS = {"id", "title", "sourceFormat", "level", "engine", "tags"}
RELATION_FIELDS = {"from", "to", "relation"}
COLLECTION_FIELDS = {"id", "title", "description", "topics", "resources"}
COLLECTION_MEMBER_FIELDS = {"id", "role"}
TAXONOMY_FIELDS = {"schemaVersion", "domains", "tags", "engines"}
RELATION_TYPES = {"related", "extends", "contrasts", "alternative", "implements", "derivedFrom", "supersedes", "validates"}
COLLECTION_ROLES = {"foundation", "overview", "implementation", "production-case", "optimization", "failure-case", "research", "advanced"}
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
REMOVED_HOME_COPY = ("技術資料を、見つけやすく。", "技術資料を見つけやすく、理解しやすく")


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


def validate_fields(errors: list[str], label: str, row: dict, allowed: set[str]) -> None:
    extra = set(row) - allowed
    if extra:
        errors.append(f"{label} unexpected public fields: {sorted(extra)}")


def validate_public_url(errors: list[str], label: str, value) -> None:
    if value is None:
        return
    if not isinstance(value, str) or not value:
        errors.append(f"{label} must be a non-empty string")
        return
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        errors.append(f"{label} must use absolute http/https URL")


def validate_original_documents(errors: list[str], data: dict) -> tuple[int, int, int, int]:
    expected_top = {"schemaVersion", "storage", "sourceCommit", "counts", "groups", "presentations"}
    if set(data) != expected_top:
        errors.append("original-documents fields must match public contract exactly")
    if data.get("schemaVersion") != "1.1.0":
        errors.append("original-documents schemaVersion must be 1.1.0")
    if data.get("storage") != "git-lfs":
        errors.append("original-documents storage must be git-lfs")
    if not SHA_RE.fullmatch(str(data.get("sourceCommit", ""))):
        errors.append("original-documents sourceCommit must be exact 40-character SHA")

    allowed_languages = {"ja", "en", "unknown"}
    allowed_formats = {"PDF", "PPTX"}
    seen: set[tuple[str, str]] = set()
    by_language = {"ja": 0, "en": 0, "unknown": 0}
    by_format = {"PDF": 0, "PPTX": 0}

    groups = data.get("groups", [])
    if not isinstance(groups, list):
        errors.append("original-documents groups must be an array")
        groups = []

    for index, group in enumerate(groups):
        if not isinstance(group, dict):
            errors.append(f"original-documents.groups[{index}] must be an object")
            continue
        if set(group) != {"language", "format", "sourceRoot", "files"}:
            errors.append(f"original-documents.groups[{index}] invalid fields")
            continue
        language = group.get("language")
        source_format = group.get("format")
        root = group.get("sourceRoot")
        files = group.get("files")
        if language not in allowed_languages:
            errors.append(f"original-documents.groups[{index}] invalid language: {language}")
        if source_format not in allowed_formats:
            errors.append(f"original-documents.groups[{index}] invalid format: {source_format}")
        expected_root = "sources/Original/PDF/" if source_format == "PDF" else "sources/Original/pptx/"
        if root != expected_root:
            errors.append(f"original-documents.groups[{index}] invalid sourceRoot: {root}")
        if not isinstance(files, list):
            errors.append(f"original-documents.groups[{index}].files must be an array")
            continue
        suffix = ".pdf" if source_format == "PDF" else ".pptx"
        for file in files:
            if not isinstance(file, str) or not file.lower().endswith(suffix):
                errors.append(f"original-documents.groups[{index}] invalid filename: {file}")
                continue
            key = (source_format, file)
            if key in seen:
                errors.append(f"duplicate Original document: {source_format}:{file}")
            seen.add(key)
            if language in by_language:
                by_language[language] += 1
            if source_format in by_format:
                by_format[source_format] += 1

    total = len(seen)
    expected_counts = {
        "total": total,
        "japanese": by_language["ja"],
        "english": by_language["en"],
        "unclassified": by_language["unknown"],
    }
    if data.get("counts") != expected_counts:
        errors.append(f"original-documents counts mismatch: {data.get('counts')} != {expected_counts}")

    presentations = data.get("presentations", {})
    if not isinstance(presentations, dict):
        errors.append("original-documents presentations must be an object")
    else:
        valid_keys = {f"{fmt}:{file}" for fmt, file in seen}
        for key, href in presentations.items():
            if key not in valid_keys:
                errors.append(f"presentation references unknown Original: {key}")
            if not isinstance(href, str) or not href.startswith("documents/English/") or not href.endswith("/index.html"):
                errors.append(f"invalid English presentation path: {key}: {href}")

    return total, by_language["ja"], by_language["en"], by_language["unknown"]


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
    resources = load("resources.json") + load("resources-06.json")
    websites = load("websites.json")
    knowledge_documents = load("documents.json")
    original_documents = load("original-documents.json")
    taxonomy = load("taxonomy.json")
    relations = load("relations.json")
    collections = load("collections.json")

    original_total, ja_count, en_count, unknown_count = validate_original_documents(errors, original_documents)

    if set(manifest) != {"schemaVersion", "sourceCommit", "generatedAt", "counts", "documentRouting"}:
        errors.append("manifest fields must match public contract exactly")
    if manifest.get("schemaVersion") != "1.3.0":
        errors.append("manifest schemaVersion must be 1.3.0")
    if not SHA_RE.fullmatch(str(manifest.get("sourceCommit", ""))):
        errors.append("manifest sourceCommit must be an exact 40-character commit SHA")
    if manifest.get("sourceCommit") != original_documents.get("sourceCommit"):
        errors.append("manifest and original-documents sourceCommit must match")

    expected_counts = {
        "resources": len(resources),
        "websites": len(websites),
        "documents": original_total,
        "taxonomy": sum(len(taxonomy.get(k, {})) for k in ("domains", "tags", "engines")),
        "relations": len(relations),
        "collections": len(collections),
    }
    if manifest.get("counts") != expected_counts:
        errors.append(f"manifest counts mismatch: {manifest.get('counts')} != {expected_counts}")
    expected_routing = {
        "japanese": ja_count,
        "english": en_count,
        "unclassified": unknown_count,
        "formats": {"PDF": 61, "PPTX": 21},
    }
    if manifest.get("documentRouting") != expected_routing:
        errors.append(f"manifest documentRouting mismatch: {manifest.get('documentRouting')} != {expected_routing}")

    for name, data in {
        "resources": resources,
        "websites": websites,
        "documents": knowledge_documents,
        "taxonomy": taxonomy,
        "relations": relations,
        "collections": collections,
    }.items():
        for key in walk_keys(data):
            if key.lower() in FORBIDDEN_KEYS:
                errors.append(f"{name}: forbidden private field: {key}")

    resource_ids = {row.get("id") for row in resources}
    website_ids = {row.get("id") for row in websites}
    document_ids = [row.get("id") for row in knowledge_documents]
    if len(resource_ids) != len(resources) or None in resource_ids:
        errors.append("resources require unique IDs")
    if len(website_ids) != len(websites) or None in website_ids:
        errors.append("websites require unique IDs")
    if not website_ids <= resource_ids:
        errors.append("every Website ID must exist in Resources")
    if len(set(document_ids)) != len(knowledge_documents) or any(not str(x).startswith("DOC-") for x in document_ids):
        errors.append("legacy knowledge documents require unique DOC-* IDs")

    for index, row in enumerate(resources):
        validate_fields(errors, f"resources[{index}]", row, RESOURCE_FIELDS)
        validate_public_url(errors, f"resources[{index}].url", row.get("url"))
        validate_public_url(errors, f"resources[{index}].canonicalUrl", row.get("canonicalUrl"))
    for index, row in enumerate(websites):
        validate_fields(errors, f"websites[{index}]", row, WEBSITE_FIELDS)
        validate_public_url(errors, f"websites[{index}].url", row.get("url"))
        validate_public_url(errors, f"websites[{index}].canonicalUrl", row.get("canonicalUrl"))
    for index, row in enumerate(knowledge_documents):
        validate_fields(errors, f"documents[{index}]", row, DOCUMENT_FIELDS)
    if not isinstance(taxonomy, dict):
        errors.append("taxonomy must be an object")
    else:
        validate_fields(errors, "taxonomy", taxonomy, TAXONOMY_FIELDS)

    for index, edge in enumerate(relations):
        validate_fields(errors, f"relations[{index}]", edge, RELATION_FIELDS)
        if edge.get("from") not in resource_ids or edge.get("to") not in resource_ids:
            errors.append(f"relations[{index}] unresolved endpoint")
        if edge.get("relation") not in RELATION_TYPES:
            errors.append(f"relations[{index}] invalid relation type: {edge.get('relation')}")

    collection_ids: set[str] = set()
    for index, collection in enumerate(collections):
        validate_fields(errors, f"collections[{index}]", collection, COLLECTION_FIELDS)
        collection_id = collection.get("id")
        if not collection_id or collection_id in collection_ids:
            errors.append(f"collections[{index}] invalid/duplicate id")
        collection_ids.add(collection_id)
        for member_index, member in enumerate(collection.get("resources", [])):
            if not isinstance(member, dict):
                errors.append(f"{collection_id}: member[{member_index}] must be an object")
                continue
            validate_fields(errors, f"{collection_id}.resources[{member_index}]", member, COLLECTION_MEMBER_FIELDS)
            if member.get("id") not in resource_ids:
                errors.append(f"{collection_id}: unresolved resource {member.get('id')}")
            if member.get("role") not in COLLECTION_ROLES:
                errors.append(f"{collection_id}: invalid role {member.get('role')}")

    document_html = (ROOT / "documents.html").read_text(encoding="utf-8")
    if "C.load('original-documents')" not in document_html:
        errors.append("Documents page must load catalog/original-documents.json")
    if "sources/Original/" not in json.dumps(original_documents, ensure_ascii=False):
        errors.append("Original catalog must route to sources/Original/")
    if "sources/markdown/" in document_html:
        errors.append("Documents page must not use legacy Markdown as primary navigation")

    other_html = "\n".join((ROOT / page).read_text(encoding="utf-8") for page in REQUIRED_PAGES if page != "documents.html")
    if "websites-data.json" in document_html or "websites-data.json" in other_html:
        errors.append("Portal must not reference legacy websites-data.json")

    index_html = (ROOT / "index.html").read_text(encoding="utf-8")
    if "original-documents" not in index_html:
        errors.append("Home must load Original document routing")
    for removed_copy in REMOVED_HOME_COPY:
        if removed_copy in index_html:
            errors.append(f"removed Home copy must not be restored: {removed_copy}")

    if (CATALOG / "websites-data.json").exists():
        errors.append("legacy catalog/websites-data.json must be removed")

    if errors:
        print("FAILED: Portal Original-first validation")
        for error in errors:
            print("-", error)
        raise SystemExit(1)

    print(
        "OK: Original-first Portal validated: "
        f"{len(resources)} resources, {len(websites)} websites, {original_total} Original documents "
        f"(JA={ja_count}, EN={en_count}, unknown={unknown_count}), "
        f"{len(relations)} relations, {len(collections)} collections"
    )


if __name__ == "__main__":
    main()
