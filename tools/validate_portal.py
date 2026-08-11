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
RESOURCE_FIELDS = {
    "id",
    "title",
    "url",
    "canonicalUrl",
    "kind",
    "topic",
    "topics",
    "reviewState",
    "useState",
    "tags",
}
WEBSITE_FIELDS = {
    "id",
    "title",
    "url",
    "canonicalUrl",
    "publisher",
    "authors",
    "publishedAt",
    "kind",
    "contentType",
    "domains",
    "topics",
    "engines",
    "languages",
    "summary",
    "reviewState",
    "useState",
    "confidence",
    "freshness",
    "tags",
}
DOCUMENT_FIELDS = {"id", "title", "sourceFormat", "level", "engine", "tags"}
RELATION_FIELDS = {"from", "to", "relation"}
COLLECTION_FIELDS = {"id", "title", "description", "topics", "resources"}
COLLECTION_MEMBER_FIELDS = {"id", "role"}
TAXONOMY_FIELDS = {"schemaVersion", "domains", "tags", "engines"}
RELATION_TYPES = {
    "related",
    "extends",
    "contrasts",
    "alternative",
    "implements",
    "derivedFrom",
    "supersedes",
    "validates",
}
COLLECTION_ROLES = {
    "foundation",
    "overview",
    "implementation",
    "production-case",
    "optimization",
    "failure-case",
    "research",
    "advanced",
}
SHA_RE = re.compile(r"^[0-9a-f]{40}$")
DOCUMENT_SOURCE_PREFIX = (
    "https://github.com/DarumaPPAP/MyResourceCenter/blob/main/sources/markdown/"
)
DOCUMENT_SOURCE_URL_RE = re.compile(
    r"https://github\.com/DarumaPPAP/MyResourceCenter/blob/main/[^\"'\s<`]+"
)
REMOVED_HOME_COPY = (
    "技術資料を、見つけやすく。",
    "技術資料を見つけやすく、理解しやすく",
)


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

    if set(manifest) != {"schemaVersion", "sourceCommit", "generatedAt", "counts"}:
        errors.append("manifest fields must match public contract exactly")
    if manifest.get("schemaVersion") != "1.2.0":
        errors.append("manifest schemaVersion must be 1.2.0")
    if not SHA_RE.fullmatch(str(manifest.get("sourceCommit", ""))):
        errors.append("manifest sourceCommit must be an exact 40-character commit SHA")
    expected_counts = {
        "resources": len(resources),
        "websites": len(websites),
        "documents": len(documents),
        "taxonomy": sum(len(taxonomy.get(k, {})) for k in ("domains", "tags", "engines")),
        "relations": len(relations),
        "collections": len(collections),
    }
    if manifest.get("counts") != expected_counts:
        errors.append(f"manifest counts mismatch: {manifest.get('counts')} != {expected_counts}")

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
    if len(website_ids) != len(websites) or None in website_ids:
        errors.append("websites require unique IDs")
    if not website_ids <= resource_ids:
        errors.append("every Website ID must exist in Resources")
    if len(set(document_ids)) != len(documents) or any(not str(x).startswith("DOC-") for x in document_ids):
        errors.append("documents require unique DOC-* IDs")

    for index, row in enumerate(resources):
        validate_fields(errors, f"resources[{index}]", row, RESOURCE_FIELDS)
        validate_public_url(errors, f"resources[{index}].url", row.get("url"))
        validate_public_url(errors, f"resources[{index}].canonicalUrl", row.get("canonicalUrl"))

    for index, row in enumerate(websites):
        validate_fields(errors, f"websites[{index}]", row, WEBSITE_FIELDS)
        for field in ("id", "title", "url", "reviewState", "useState"):
            if not row.get(field):
                errors.append(f"websites[{index}] missing {field}")
        if "status" in row or "topic" in row:
            errors.append(f"websites[{index}] legacy status/topic must not be published")
        validate_public_url(errors, f"websites[{index}].url", row.get("url"))
        validate_public_url(errors, f"websites[{index}].canonicalUrl", row.get("canonicalUrl"))

    for index, row in enumerate(documents):
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
        members = collection.get("resources", [])
        if not isinstance(members, list):
            errors.append(f"{collection_id}: resources must be an array")
            continue
        for member_index, member in enumerate(members):
            if not isinstance(member, dict):
                errors.append(f"{collection_id}: member[{member_index}] must be an object")
                continue
            validate_fields(
                errors,
                f"{collection_id}.resources[{member_index}]",
                member,
                COLLECTION_MEMBER_FIELDS,
            )
            if member.get("id") not in resource_ids:
                errors.append(f"{collection_id}: unresolved resource {member.get('id')}")
            if member.get("role") not in COLLECTION_ROLES:
                errors.append(f"{collection_id}: invalid role {member.get('role')}")

    document_html = (ROOT / "documents.html").read_text(encoding="utf-8")
    document_source_urls = DOCUMENT_SOURCE_URL_RE.findall(document_html)
    if len(set(document_source_urls)) != len(documents):
        errors.append(
            "Documents page must expose exactly one unique direct source URL for every Document"
        )
    for url in document_source_urls:
        if not url.startswith(DOCUMENT_SOURCE_PREFIX) or not url.endswith(".md"):
            errors.append(f"invalid direct Document source URL: {url}")

    other_html = "\n".join(
        (ROOT / page).read_text(encoding="utf-8")
        for page in REQUIRED_PAGES
        if page != "documents.html"
    )
    if "github.com/DarumaPPAP/MyResourceCenter/blob" in other_html:
        errors.append("private Markdown blob links are only allowed on Documents list")
    if "websites-data.json" in document_html or "websites-data.json" in other_html:
        errors.append("Portal must not reference legacy websites-data.json")

    index_html = (ROOT / "index.html").read_text(encoding="utf-8")
    for removed_copy in REMOVED_HOME_COPY:
        if removed_copy in index_html:
            errors.append(f"removed Home copy must not be restored: {removed_copy}")

    if (CATALOG / "websites-data.json").exists():
        errors.append("legacy catalog/websites-data.json must be removed")

    if errors:
        print("FAILED: Portal direct-link / Detail / Collection UX validation")
        for error in errors:
            print("-", error)
        raise SystemExit(1)

    print(
        "OK: Portal boundary validated with direct resource navigation: "
        f"{len(resources)} resources, {len(websites)} websites, {len(documents)} documents, "
        f"{len(relations)} relations, {len(collections)} collections"
    )


if __name__ == "__main__":
    main()
