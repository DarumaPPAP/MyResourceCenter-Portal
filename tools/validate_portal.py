from __future__ import annotations

import json
import ipaddress
import re
import struct
import unicodedata
import zlib
try:
    from thumbnail_artifact import stable_thumbnail_path,validate_thumbnail_asset,no_symlink_path
except ModuleNotFoundError:
    from tools.thumbnail_artifact import stable_thumbnail_path,validate_thumbnail_asset,no_symlink_path
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
BASE_ORIGINAL_SHARDS = (
    "originals-base-01.json",
    "originals-base-02.json",
    "originals-base-03.json",
    "originals-base-04.json",
)
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
    "documents.json", "document-presentation.json", "website-facets.json", "original-documents.json", *BASE_ORIGINAL_SHARDS, "taxonomy.json",
    "relations.json", "collections.json",
} | LATEST_WEBSITE_SHARDS
FORBIDDEN_KEYS = {
    "path", "original", "images", "sourceimages", "sourcenote", "drivefileid",
    "drivepath", "localpath", "privatesource", "privaterepository", "internalnote",
    "rawmarkdown", "secret", "token", "password", "authorization", "customer",
    "projectsecret", "keyfacts", "constraints", "evidence", "searchindex", "lineage",
    "driveid", "privatetitleprovenance", "canonicalroot", "sources", "sourcefolder", "foldermetadata", "folderid", "folderids", "knowledgelibrary", "assetsroot", "logsroot", "restrictedroot",
}
FORBIDDEN_DRIVE_FOLDER_FRAGMENT = "drive.google.com/drive/folders/"
RESOURCE_FIELDS = {"id", "title", "url", "canonicalUrl", "kind", "topic", "topics", "reviewState", "useState", "tags"}
WEBSITE_FIELDS = {"id", "title", "url", "canonicalUrl", "publisher", "authors", "publishedAt", "kind", "contentType", "domains", "topics", "engines", "languages", "summary", "reviewState", "useState", "confidence", "freshness", "tags"}
DOCUMENT_FIELDS = {"id", "title", "sourceFormat", "level", "engine", "tags"}
RELATION_FIELDS = {"from", "to", "relation"}
COLLECTION_FIELDS = {"id", "title", "description", "topics", "resources", "category"}
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


def walk_strings(value):
    if isinstance(value, dict):
        for child in value.values():
            yield from walk_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from walk_strings(child)
    elif isinstance(value, str):
        yield value


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
    # Reject characters parsers/browsers can silently normalize before parsing.
    if any(ord(char) <= 0x20 or ord(char) == 0x7f or char.isspace() or char == "\\" for char in value):
        errors.append(f"{label} contains forbidden whitespace/control/backslash")
        return
    try:
        parsed = urlparse(value)
        hostname = parsed.hostname
        port = parsed.port  # Access validates both numeric ports and range.
        if parsed.scheme not in {"http", "https"} or not hostname:
            errors.append(f"{label} must use absolute http/https URL")
        if parsed.username is not None or parsed.password is not None:
            errors.append(f"{label} must not contain URL credentials")
    except (ValueError, TypeError):
        # Do not echo URL or parse exception text: either may contain secrets.
        errors.append(f"{label} is a malformed public URL")


def normalize_website_host(value: str) -> str:
    parsed = urlparse(str(value or ""))
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        return ""
    try:
        _ = parsed.port
        return ipaddress.ip_address(parsed.hostname).compressed.lower()
    except ValueError:
        try:
            host = parsed.hostname.rstrip(".").encode("idna").decode("ascii").lower()
        except UnicodeError:
            return ""
        if len(host) > 253 or any(not re.fullmatch(r"[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?", label) for label in host.split(".")):
            return ""
        return host


def normalize_author_key(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).strip()).casefold()


def validate_website_facets(errors: list[str], data: dict, websites: list[dict]) -> None:
    if not isinstance(data, dict):
        errors.append("website-facets must be an object")
        return
    extra = set(data) - {"schemaVersion", "sites", "authors"}
    if extra:
        errors.append(f"website-facets unexpected public fields: {sorted(extra)}")
    if data.get("schemaVersion") != "1.0.0":
        errors.append("website-facets schemaVersion must be 1.0.0")

    site_counts: dict[str, set[str]] = {}
    author_counts: dict[str, set[str]] = {}
    for index, row in enumerate(websites):
        identity = str(row.get("id") or f"website-{index}")
        host = normalize_website_host(row.get("canonicalUrl") or row.get("url") or "")
        if host:
            site_counts.setdefault(host, set()).add(identity)
        authors = row.get("authors") or []
        if isinstance(authors, list):
            for author in authors:
                if not isinstance(author, str) or not author.strip():
                    continue
                key = normalize_author_key(author)
                author_counts.setdefault(key, set()).add(identity)

    for kind, values, active, normalize in (
        ("sites", data.get("sites"), site_counts, normalize_website_host),
        ("authors", data.get("authors"), author_counts, normalize_author_key),
    ):
        if not isinstance(values, list):
            errors.append(f"website-facets {kind} must be an array")
            continue
        seen = set()
        for index, item in enumerate(values):
            label = f"website-facets {kind}[{index}]"
            if not isinstance(item, dict):
                errors.append(f"{label} must be an object")
                continue
            unknown = set(item) - {"key", "displayName"}
            if unknown:
                errors.append(f"{label} unexpected public fields: {sorted(unknown)}")
            key, display_name = item.get("key"), item.get("displayName")
            if not isinstance(key, str) or not key or not isinstance(display_name, str) or not display_name.strip():
                errors.append(f"{label} requires key and displayName")
                continue
            if key in seen:
                errors.append(f"website-facets {kind} contains duplicate key: {key}")
            seen.add(key)
            try:
                normalized = normalize((f"https://[{key}]" if ":" in key else f"https://{key}") if kind == "sites" else display_name)
            except (ValueError, AttributeError):
                normalized = ""
            if normalized != key:
                errors.append(f"{label} key is not normalized")
            if key not in active:
                errors.append(f"{label} key is not used by a public Website")
            elif len(active[key]) <= 3:
                errors.append(f"{label} requires more than three Websites before it can be approved")


def site_icon_path_from_host(host: str) -> str:
    safe = "ip6-" + host.replace(":", "-") if ":" in host else host
    if not safe or not re.fullmatch(r"[a-z0-9.-]+", safe):
        return ""
    return f"assets/generated/site-icons/{safe}.png"


def validate_site_icon_file(errors: list[str], label: str, asset: Path, root: Path) -> None:
    if not no_symlink_path(asset, root) or not asset.is_file():
        errors.append(f"{label}: invalid Site Icon path or symlink")
        return
    if asset.stat().st_size > 512 * 1024:
        errors.append(f"{label}: Site Icon exceeds 512 KiB")
        return
    png_errors: list[str] = []
    validate_png(png_errors, label, asset)
    if png_errors:
        errors.append(f"{label}: invalid Site Icon PNG")
        return
    try:
        data = asset.read_bytes()
        width, height = struct.unpack_from(">II", data, 16)
        if not (1 <= width <= 512 and 1 <= height <= 512):
            errors.append(f"{label}: Site Icon dimensions outside 1..512")
    except (OSError, struct.error):
        errors.append(f"{label}: unreadable Site Icon")


def validate_site_icons(errors: list[str], root: Path, websites: list[dict]) -> None:
    expected = set()
    for row in websites:
        host = normalize_website_host(row.get("canonicalUrl") or row.get("url") or "")
        path = site_icon_path_from_host(host) if host else ""
        if path:
            expected.add(path)
    icon_root = root / "assets/generated/site-icons"
    if icon_root.is_symlink():
        errors.append("Site Icon directory cannot be a symlink")
        return
    if not icon_root.exists():
        return
    for asset in icon_root.rglob("*"):
        if asset.is_dir() and not asset.is_symlink():
            continue
        try:
            relative = asset.relative_to(root).as_posix()
        except ValueError:
            errors.append("Site Icon path escapes the Portal")
            continue
        if relative not in expected:
            errors.append(f"unreferenced Site Icon asset: {relative}")
        validate_site_icon_file(errors, f"Site Icon {relative}", asset, root)


def drive_id(url: str) -> str:
    match = DRIVE_ID_RE.search(str(url or ""))
    return match.group(1) if match else ""


def validate_originals(errors: list[str]):
    meta = load("original-documents.json")
    base: list[dict] = []
    for shard in BASE_ORIGINAL_SHARDS:
        base.extend(load(shard))
    supplemental = load("resources-06.json")

    if meta.get("schemaVersion") != "2.0.0":
        errors.append("original-documents schemaVersion must be 2.0.0")
    if meta.get("storage") != "google-drive":
        errors.append("original-documents storage must be google-drive")
    validate_fields(errors, "original-documents", meta, {"schemaVersion", "storage", "counts", "catalogs", "routing", "notes"})
    # Folder topology is private. Legacy Original shards retain file navigation
    # compatibility, never folder metadata.
    for key in walk_keys(meta):
        if key.lower() in FORBIDDEN_KEYS:
            errors.append(f"original-documents: forbidden private field: {key}")
    for value in walk_strings(meta):
        if FORBIDDEN_DRIVE_FOLDER_FRAGMENT in value:
            errors.append("original-documents: private Drive folder topology")
    for shard in BASE_ORIGINAL_SHARDS:
        for row in load(shard):
            validate_fields(errors, shard, row, {"file", "kind", "url", "driveId"})
            for value in walk_strings(row):
                if FORBIDDEN_DRIVE_FOLDER_FRAGMENT in value:
                    errors.append(f"{shard}: private Drive folder topology")

    if len(base) != 46:
        errors.append(f"base Original count must be 46, got {len(base)}")
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
    expected = {"total": 100, "base": 46, "cedec2026": 54, "pdf": 79, "pptx": 21}
    if meta.get("counts") != expected:
        errors.append(f"original-documents counts mismatch: {meta.get('counts')} != {expected}")
    if (total, pdf_count, pptx_count) != (100, 79, 21):
        errors.append(f"Original inventory mismatch: total={total}, PDF={pdf_count}, PPTX={pptx_count}")

    return total


PRESENTATION_FIELDS = {"resourceId", "documentId", "title", "sourceFormat", "thumbnail", "engine", "level", "tags", "canonicalUrl"}
SOURCE_FORMATS = {"PDF", "PPTX", "GOOGLE_DOC", "GOOGLE_SLIDES", "UNKNOWN"}


def canonical_document_id(value: str) -> str:
    parsed = urlparse(str(value or ""))
    if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port:
        return ""
    if parsed.hostname == "drive.google.com":
        match = re.fullmatch(r"/file/d/([A-Za-z0-9_-]+)/view", parsed.path)
    elif parsed.hostname == "docs.google.com":
        match = re.fullmatch(r"/(?:document|presentation)/d/([A-Za-z0-9_-]+)/edit", parsed.path)
    else:
        return ""
    return match.group(1) if match else ""


def validate_png(errors: list[str], label: str, asset: Path) -> None:
    data = asset.read_bytes()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        errors.append(f"{label}: thumbnail must have PNG signature")
        return
    offset, chunks, ended = 8, [], False
    try:
        while offset < len(data):
            length = struct.unpack_from(">I", data, offset)[0]
            kind = data[offset+4:offset+8]
            payload = data[offset+8:offset+8+length]
            crc = struct.unpack_from(">I", data, offset+8+length)[0]
            if zlib.crc32(kind + payload) & 0xffffffff != crc:
                raise ValueError("invalid PNG CRC")
            chunks.append(kind)
            if kind == b"IHDR":
                if len(chunks) != 1 or length != 13:
                    raise ValueError("invalid PNG header")
                width, height = struct.unpack_from(">II", payload)
                if not (1 <= width <= 4096 and 1 <= height <= 4096):
                    raise ValueError("thumbnail dimensions outside 1..4096")
            offset += 12 + length
            if kind == b"IEND":
                ended = True
                if length or offset != len(data):
                    raise ValueError("invalid PNG ending")
                break
        if not ended or not chunks or chunks[0] != b"IHDR" or b"IDAT" not in chunks:
            raise ValueError("incomplete PNG")
    except (ValueError, struct.error) as exc:
        errors.append(f"{label}: {exc}")


def validate_presentation(errors: list[str], rows: list[dict], resources: list[dict]) -> None:
    resources_by_id = {row["id"]: row for row in resources}
    seen_res, seen_doc, seen_original = set(), set(), set()
    for index, row in enumerate(rows):
        label = f"document-presentation[{index}]"
        validate_fields(errors, label, row, PRESENTATION_FIELDS)
        if set(row) != PRESENTATION_FIELDS:
            errors.append(f"{label}: required presentation fields missing")
        resource_id, document_id = row.get("resourceId"), row.get("documentId")
        resource = resources_by_id.get(resource_id)
        if not resource or resource.get("kind") != "document":
            errors.append(f"{label}: unresolved document Resource")
        if resource_id in seen_res or not isinstance(resource_id, str) or not resource_id.startswith("RES-"):
            errors.append(f"{label}: invalid/duplicate resourceId")
        if document_id in seen_doc or not re.fullmatch(r"DOC-[A-Za-z0-9_-]+", str(document_id or "")):
            errors.append(f"{label}: invalid/duplicate documentId")
        seen_res.add(resource_id); seen_doc.add(document_id)
        for field in ("title", "engine", "level"):
            if not isinstance(row.get(field), str) or not row[field].strip():
                errors.append(f"{label}: {field} must be non-empty text")
        tags = row.get("tags")
        if not isinstance(tags, list) or any(not isinstance(tag, str) or not tag.strip() for tag in tags):
            errors.append(f"{label}: tags must be public text labels")
        source_format = row.get("sourceFormat")
        if source_format not in SOURCE_FORMATS:
            errors.append(f"{label}: invalid sourceFormat")
        canonical = row.get("canonicalUrl")
        validate_public_url(errors, f"{label}.canonicalUrl", canonical)
        try:
            original_id = canonical_document_id(canonical)
        except ValueError:
            original_id = ""
        if not original_id or original_id in seen_original:
            errors.append(f"{label}: invalid/duplicate canonical Original URL")
        seen_original.add(original_id)
        if resource and canonical != (resource.get("canonicalUrl") or resource.get("url")):
            errors.append(f"{label}: canonical URL does not match Resource")
        if source_format in {"GOOGLE_DOC", "GOOGLE_SLIDES"}:
            expected_kind = "document" if source_format == "GOOGLE_DOC" else "presentation"
            if not str(canonical).startswith(f"https://docs.google.com/{expected_kind}/d/"):
                errors.append(f"{label}: native Google format/URL mismatch")
        thumbnail = row.get("thumbnail")
        if thumbnail is None:
            continue  # Explicit format fallback; no fabricated previews.
        if source_format not in {"PDF", "PPTX"}:
            errors.append(f"{label}: unsupported sourceFormat must use null thumbnail fallback")
        if not isinstance(thumbnail, str) or not stable_thumbnail_path(thumbnail,document_id):
            errors.append(f"{label}: invalid thumbnail asset path")
            continue
        asset = ROOT / thumbnail
        if not no_symlink_path(asset,ROOT):
            errors.append(f"{label}: thumbnail file missing or outside asset root")
            continue
        if asset.suffix==".png":
            validate_png(errors,label,asset)
        if not validate_thumbnail_asset(asset):
            errors.append(f"{label}: invalid bounded static PNG/WebP")
    document_resources = {row["id"] for row in resources if row.get("kind") == "document"}
    if seen_res != document_resources:
        errors.append("document-presentation must map every document Resource exactly once")


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
    website_facets = load("website-facets.json")
    knowledge_documents = load("documents.json")
    presentation = load("document-presentation.json")
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
        "document-presentation": len(presentation),
        "taxonomy": sum(len(taxonomy.get(k, {})) for k in ("domains", "tags", "engines")),
        "relations": len(relations),
        "collections": len(collections),
        "website-facets": sum(len(website_facets.get(k, [])) for k in ("sites", "authors")) if isinstance(website_facets, dict) else -1,
    }
    if manifest.get("counts") != expected_counts:
        errors.append(f"manifest counts mismatch: {manifest.get('counts')} != {expected_counts}")

    for name, data in {
        "resources": resources,
        "websites": websites,
        "documents": knowledge_documents,
        "document-presentation": presentation,
        "taxonomy": taxonomy,
        "relations": relations,
        "collections": collections,
        "website-facets": website_facets,
    }.items():
        for key in walk_keys(data):
            if key.lower() in FORBIDDEN_KEYS:
                errors.append(f"{name}: forbidden private field: {key}")
        for value in walk_strings(data):
            if FORBIDDEN_DRIVE_FOLDER_FRAGMENT in value:
                errors.append(f"{name}: Google Drive folder URL/private topology must not be public")

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
    validate_website_facets(errors, website_facets, websites)
    validate_site_icons(errors, ROOT, websites)
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
        category = collection.get("category")
        if not isinstance(category, str) or not category.strip() or len(category) > 80:
            errors.append(f"{collection_id}: category must be a non-empty public label")
        member_ids = [member.get("id") for member in collection.get("resources", [])]
        if len(member_ids) != len(set(member_ids)):
            errors.append(f"{collection_id}: duplicate resource membership")
        for member_index, member in enumerate(collection.get("resources", [])):
            validate_fields(errors, f"{collection_id}.resources[{member_index}]", member, COLLECTION_MEMBER_FIELDS)
            if member.get("id") not in resource_ids:
                errors.append(f"{collection_id}: unresolved resource {member.get('id')}")
            if member.get("role") not in COLLECTION_ROLES:
                errors.append(f"{collection_id}: invalid role {member.get('role')}")

    validate_presentation(errors, presentation, resources)

    document_html = (ROOT / "documents.html").read_text(encoding="utf-8")
    consumer = (ROOT / "assets/human-portal.js").read_text(encoding="utf-8")
    catalog_js = (ROOT / "assets/catalog.js").read_text(encoding="utf-8")
    if "assets/human-portal.js" not in document_html or "C.loadMany('document-presentation'" not in consumer:
        errors.append("Documents page must consume document-presentation")
    if "C.viewerHref(doc)" not in consumer or "viewer.html?" not in catalog_js:
        errors.append("Documents page must use safe canonical-URL Viewer routing")
    if "Google Drive Original" not in consumer:
        errors.append("Document details must expose Google Drive Original routing")
    if "object-fit:contain" not in (ROOT / "assets/documents.css").read_text() or 'loading="lazy"' not in catalog_js or 'bindThumbnailFallback' not in consumer:
        errors.append("Document thumbnails require contain, lazy loading and error fallback")
    if "github.com/DarumaPPAP/MyResourceCenter/blob/main/sources/Original/" in document_html:
        errors.append("Documents page must not route Original documents to GitHub binary mirror")
    if "sources/markdown/" in document_html:
        errors.append("Documents page must not use Markdown as Original navigation")

    index_html = (ROOT / "index.html").read_text(encoding="utf-8")
    home_contract=('Game Development','Knowledge Portal','data-global-search','featured-title','paths-title','discovery-title','id="docs"','id="collections"')
    if "assets/human-portal.js" not in index_html or any(token not in index_html for token in home_contract):
        errors.append("Home must provide discovery hero, search and actual knowledge content")
    if any(token in index_html for token in ('stats-grid','stat-card','quick-card','quick-grid','renderStats')):
        errors.append("Home must not expose Dashboard metrics or generic menu cards")
    if any(token not in consumer for token in ("document-presentation","documentThumbnail","readingPreview")):
        errors.append("Home must use actual document and reading-guide presentation data")
    if "technical-environment.svg" not in index_html or not (ROOT / "assets/technical-environment.svg").exists():
        errors.append("Home must include the locally authored technical environment visual")

    website_html = (ROOT / "websites.html").read_text(encoding="utf-8")
    website_js_path = ROOT / "assets/websites.js"
    website_css_path = ROOT / "assets/websites.css"
    if not website_js_path.is_file() or not website_css_path.is_file():
        errors.append("Websites page requires its local filter and square-icon assets")
    else:
        website_js = website_js_path.read_text(encoding="utf-8")
        website_css = website_css_path.read_text(encoding="utf-8")
        for control in ('id="category"', 'id="site"', 'id="author"', 'id="sort"'):
            if control not in website_html:
                errors.append(f"Websites page is missing {control}")
        if "assets/websites.js" not in website_html or "assets/websites.css" not in website_html:
            errors.append("Websites page must load local Website presentation assets")
        if "C.loadMany('websites', 'website-facets')" not in website_html:
            errors.append("Websites page must consume the public Website facet projection")
        for contract in ("filterWebsites", "sortWebsites", "siteIconPath", "bindSiteIconFallback"):
            if contract not in website_js:
                errors.append(f"Websites page is missing {contract} behavior")
        if "assets/generated/site-icons/" not in website_js or "width:112px;height:112px" not in website_css:
            errors.append("Websites page must use local square Site Icons")
        if re.search(r'<img[^>]+src=["\']https?://', website_html, re.IGNORECASE):
            errors.append("Websites page must not hotlink remote Site Icons")

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
