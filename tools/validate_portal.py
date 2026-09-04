from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "catalog"

LATEST_WEBSITE_SHARDS = {
    "websites-latest-01.json",
    "websites-latest-02.json",
    "websites-latest-03.json",
    "websites-latest-04.json",
}
RESOURCE_FIELD_ORDER = (
    "id", "title", "url", "canonicalUrl", "kind", "topic", "topics",
    "reviewState", "useState", "tags",
)

REQUIRED_PAGES = {
    "index.html", "documents.html", "document.html", "websites.html", "website.html",
    "collections.html", "collection.html", "taxonomy.html",
}
REQUIRED_CATALOG = {
    "manifest.json", "resources.json", "resources-06.json", "websites.json",
    "documents.json", "original-documents.json", "originals-base-01.json",
    "originals-base-02.json", "originals-base-03.json", "taxonomy.json",
    "relations.json", "collections.json",
} | LATEST_WEBSITE_SHARDS
FORBIDDEN_KEYS = {
    "path", "original", "images", "sourceimages", "sourcenote", "drivefileid",
    "drivepath", "localpath", "privatesource", "privaterepository", "internalnote",
    "rawmarkdown", "secret", "token", "password", "authorization", "customer",
    "projectsecret", "keyfacts", "constraints", "evidence", "searchindex", "lineage",
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
DRIVE_ID_RE = re.compile(r"/d/([^/]+)")
PPTX_SUPPLEMENTAL_IDS = {
    "1Qwi3KM9tMrS5l6UTV2hxq-2bdKZ_I65D",
    "1xCFGRnfIEqsL_QJeAol9NKVo1e0gczU3",
    "1o4ac9OZbTpmKnJG7WHGceGfTX6m3cBst",
    "1MW1xyfZMHH94TSffUtr7VZU55fmqTfgK",
    "14H8ECh-O866I5cARXLfWZfikDimyAS1F",
    "1EI-NZzaPy1LNZIMUgZFYCi3MIHWJd7nV",
    "1EjDPNwlzQTuIx6GwEIabRH5q3z77AtGc",
    "1Exs8DZWIN3wlGiGtCK3TtU0CDCo2UrW8",
    "1ydyK0Uy7ZLLm8be6638JbIflCoeUZt-6",
    "1Rb5W0y2ugXeDr1Kw4MpN3lybaxz0TXYr",
}


def load(name: str):
    return json.loads((CATALOG / name).read_text(encoding="utf-8"))


def project_resource(row: dict) -> dict:
    return {key: row[key] for key in RESOURCE_FIELD_ORDER if key in row}


def load_latest_websites() -> list[dict]:
    rows: list[dict] = []
    for name in sorted(LATEST_WEBSITE_SHARDS):
        rows.extend(load(name))
    return rows


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


def drive_id(url: str) -> str:
    match = DRIVE_ID_RE.search(str(url or ""))
    return match.group(1) if match else ""


def validate_originals(errors: list[str]):
    meta = load("original-documents.json")
    base = load("originals-base-01.json") + load("originals-base-02.json") + load("originals-base-03.json")
    supplemental = load("resources-06.json")

    if meta.get("schemaVersion") != "2.0.0":
        errors.append("original-documents schemaVersion must be 2.0.0")
    if meta.get("storage") != "google-drive":
        errors.append("original-documents storage must be google-drive")
    root = meta.get("canonicalRoot", {})
    if root.get("id") != "1vuhaa1uwMAlcLlelNda6zi48O43-NJhs":
        errors.append("original-documents canonicalRoot id mismatch")

    if len(base) != 28:
        errors.append(f"base Original count must be 28, got {len(base)}")
    if len(supplemental) != 54:
        errors.append(f"supplemental Original count must be 54, got {len(supplemental)}")

    urls: list[str] = []
    pdf_count = 0
    pptx_count = 0

    for index, row in enumerate(base):
        kind = str(row.get("kind", "")).lower()
        if kind not in {"pdf", "pptx"}:
            errors.append(f"base Original[{index}] invalid kind: {kind}")
        if not row.get("file"):
            errors.append(f"base Original[{index}] missing file")
        url = row.get("url")
        validate_public_url(errors, f"base Original[{index}].url", url)
        if "drive.google.com/" not in str(url):
            errors.append(f"base Original[{index}] must route to Google Drive")
        if not row.get("driveId") or row.get("driveId") != drive_id(url):
            errors.append(f"base Original[{index}] Drive ID mismatch")
        urls.append(url)
        pdf_count += kind == "pdf"
        pptx_count += kind == "pptx"

    for index, row in enumerate(supplemental):
        url = row.get("url")
        validate_public_url(errors, f"supplemental Original[{index}].url", url)
        if "drive.google.com/" not in str(url):
            errors.append(f"supplemental Original[{index}] must route to Google Drive")
        file_id = drive_id(url)
        if not file_id:
            errors.append(f"supplemental Original[{index}] missing Drive ID in URL")
        urls.append(url)
        if file_id in PPTX_SUPPLEMENTAL_IDS:
            pptx_count += 1
        else:
            pdf_count += 1

    if len(urls) != len(set(urls)):
        errors.append("Original Drive URLs must be unique")

    total = len(urls)
    expected = {"total": 82, "base": 28, "cedec2026": 54, "pdf": 61, "pptx": 21}
    if meta.get("counts") != expected:
        errors.append(f"original-documents counts mismatch: {meta.get('counts')} != {expected}")
    if (total, pdf_count, pptx_count) != (82, 61, 21):
        errors.append(f"Original inventory mismatch: total={total}, PDF={pdf_count}, PPTX={pptx_count}")

    return total


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
    latest_websites = load_latest_websites()
    resources = load("resources.json") + load("resources-06.json") + [project_resource(row) for row in latest_websites]
    websites = load("websites.json") + latest_websites
    knowledge_documents = load("documents.json")
    taxonomy = load("taxonomy.json")
    relations = load("relations.json")
    collections = load("collections.json")
    original_total = validate_originals(errors)

    if manifest.get("schemaVersion") != "1.3.0":
        errors.append("manifest schemaVersion must be 1.3.0")
    if not SHA_RE.fullmatch(str(manifest.get("sourceCommit", ""))):
        errors.append("manifest sourceCommit must be a 40-character SHA")

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
    if len(resource_ids) != len(resources) or None in resource_ids:
        errors.append("resources require unique IDs")
    if len(website_ids) != len(websites) or None in website_ids:
        errors.append("websites require unique IDs")
    if not website_ids <= resource_ids:
        errors.append("every Website ID must exist in Resources")

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
            validate_fields(errors, f"{collection_id}.resources[{member_index}]", member, COLLECTION_MEMBER_FIELDS)
            if member.get("id") not in resource_ids:
                errors.append(f"{collection_id}: unresolved resource {member.get('id')}")
            if member.get("role") not in COLLECTION_ROLES:
                errors.append(f"{collection_id}: invalid role {member.get('role')}")

    document_html = (ROOT / "documents.html").read_text(encoding="utf-8")
    for required in ("original-documents", "originals-base-01", "originals-base-02", "originals-base-03", "resources-06"):
        if required not in document_html:
            errors.append(f"Documents page must load {required}")
    if "Google Drive Original" not in document_html:
        errors.append("Documents page must expose Google Drive Original routing")
    if "github.com/DarumaPPAP/MyResourceCenter/blob/main/sources/Original/" in document_html:
        errors.append("Documents page must not route Original documents to GitHub binary mirror")
    if "sources/markdown/" in document_html:
        errors.append("Documents page must not use Markdown as Original navigation")

    index_html = (ROOT / "index.html").read_text(encoding="utf-8")
    if "resources-06" not in index_html or "originals-base-01" not in index_html:
        errors.append("Home must load Drive Original catalogs")

    if (CATALOG / "websites-data.json").exists():
        errors.append("legacy catalog/websites-data.json must be removed")

    if errors:
        print("FAILED: Portal Drive Original validation")
        for error in errors:
            print("-", error)
        raise SystemExit(1)

    print(
        "OK: Drive Original Portal validated: "
        f"{len(resources)} resources, {len(websites)} websites, {original_total} Original documents, "
        f"{len(relations)} relations, {len(collections)} collections"
    )


if __name__ == "__main__":
    main()
