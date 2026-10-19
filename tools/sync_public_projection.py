#!/usr/bin/env python3
"""Import an already-validated, allowlisted MyResourceCenter public projection.

Keep the Portal's legacy shard layout intact; never read the private MRC catalog.
The producer owns policy/metadata. This tool only adapts its public view for Portal.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
from datetime import datetime, timezone
from pathlib import Path

CATALOGS = (
    "resources", "websites", "repositories", "documents", "taxonomy",
    "relations", "collections", "document-presentation", "website-facets",
)
LATEST_WEBSITE_SHARDS = tuple(f"websites-latest-{n:02}.json" for n in range(1, 5))
RESOURCE_FIELDS = (
    "id", "title", "url", "canonicalUrl", "kind", "topic", "topics",
    "reviewState", "useState", "category", "tags",
)


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, value) -> None:
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def ordered_subset(ids: list[str], source: dict[str, dict]) -> list[dict]:
    return [source[identity] for identity in ids if identity in source]


def by_id(rows: list[dict], label: str) -> dict[str, dict]:
    if not isinstance(rows, list) or any(not isinstance(row, dict) or not isinstance(row.get("id"), str) for row in rows):
        raise ValueError(f"{label}: expected array of objects with IDs")
    indexed = {row["id"]: row for row in rows}
    if len(indexed) != len(rows):
        raise ValueError(f"{label}: duplicate ID")
    return indexed


def inventory(root: Path) -> dict[str, str]:
    tracked = [root / "catalog" / (name + ".json") for name in CATALOGS]
    tracked += [root / "catalog" / name for name in ("resources-06.json", *LATEST_WEBSITE_SHARDS)]
    assets = root / "assets" / "generated"
    if assets.exists():
        tracked.extend(p for p in assets.rglob("*") if p.is_file())
    return {
        str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
        for p in tracked if p.is_file()
    }


def sync(projection: Path, portal: Path) -> bool:
    projection = projection.resolve()
    portal = portal.resolve()
    catalog = portal / "catalog"
    if not catalog.is_dir():
        raise ValueError("Portal catalog directory does not exist")

    manifest = read_json(projection / "manifest.json")
    if manifest.get("schemaVersion") != "1.6.0" or not isinstance(manifest.get("sourceCommit"), str) or len(manifest["sourceCommit"]) != 40:
        raise ValueError("Unexpected public projection manifest; do not import")
    incoming = {name: read_json(projection / (name + ".json")) for name in CATALOGS}
    resources = by_id(incoming["resources"], "resources")
    websites = by_id(incoming["websites"], "websites")
    repositories = by_id(incoming["repositories"], "repositories")
    if not set(websites) <= set(resources) or not set(repositories) <= set(resources):
        raise ValueError("Public resource coverage mismatch")
    if any(resources[k].get("kind") != "website" for k in websites) or any(resources[k].get("kind") != "repository" for k in repositories):
        raise ValueError("Public resource kind mismatch")

    for key, rows in incoming.items():
        expected = manifest.get("counts", {}).get(key)
        if isinstance(rows, list) and expected != len(rows):
            raise ValueError(f"{key}: public manifest count mismatch")
    if manifest["counts"].get("documents") != read_json(catalog / "original-documents.json")["counts"]["total"]:
        raise ValueError("Original inventory requires a separate reviewed migration")

    old_base = [row["id"] for row in read_json(catalog / "resources.json")]
    old_supplemental = [row["id"] for row in read_json(catalog / "resources-06.json")]
    old_web_base = [row["id"] for row in read_json(catalog / "websites.json")]
    old_shards = [[row["id"] for row in read_json(catalog / name)] for name in LATEST_WEBSITE_SHARDS]
    old_latest = {identity for shard in old_shards for identity in shard}
    supplemental_ids = set(old_supplemental)
    base_ids = set(old_base)
    old_web_base_ids = set(old_web_base)

    # Each Resource has exactly one placement. Newly approved non-Websites go to
    # the base file; newly approved Websites go through the latest Website shards.
    new_base = [identity for identity, row in resources.items()
                if identity not in supplemental_ids and identity not in base_ids
                and row["kind"] != "website"]
    base = ordered_subset(old_base + new_base, resources)
    supplemental = ordered_subset(old_supplemental, resources)
    latest_ids = [identity for identity, row in resources.items()
                  if row["kind"] == "website" and identity not in base_ids
                  and identity not in supplemental_ids]
    if len(base) + len(supplemental) + len(latest_ids) != len(resources):
        raise ValueError("Resource partition lost or duplicated entries")

    # Preserve the existing shard membership to minimize diffs. Allocate newly
    # approved Websites to the smallest shard, with a deterministic tie-break.
    partitions = [[identity for identity in shard if identity in websites and identity in latest_ids]
                  for shard in old_shards]
    previously_assigned = {identity for shard in partitions for identity in shard}
    for identity in latest_ids:
        if identity not in websites:
            raise ValueError("Unresolved public Website resource")
        if identity not in previously_assigned:
            slot = min(range(len(partitions)), key=lambda index: (len(partitions[index]), index))
            partitions[slot].append(identity)
            previously_assigned.add(identity)
    if {identity for shard in partitions for identity in shard} != set(latest_ids):
        raise ValueError("Website partition coverage mismatch")

    before = inventory(portal)
    write_json(catalog / "resources.json", base)
    write_json(catalog / "resources-06.json", supplemental)
    write_json(catalog / "websites.json", ordered_subset(old_web_base, websites))
    for name, part in zip(LATEST_WEBSITE_SHARDS, partitions):
        write_json(catalog / name, ordered_subset(part, websites))
    for name in CATALOGS:
        if name not in ("resources", "websites"):
            write_json(catalog / (name + ".json"), incoming[name])

    # All public assets are supplied by the validated producer. Avoid stale
    # previews and do not copy any private originals, caches, or source notes.
    source_assets = projection / "assets" / "generated"
    destination_assets = portal / "assets" / "generated"
    if not source_assets.is_dir() or source_assets.is_symlink():
        raise ValueError("Projection is missing its safe generated asset directory")
    if any(path.is_symlink() for path in source_assets.rglob("*")):
        raise ValueError("Symlink in public generated assets")
    if destination_assets.is_symlink():
        raise ValueError("Portal generated assets directory is a symlink")
    if destination_assets.exists():
        shutil.rmtree(destination_assets)
    shutil.copytree(source_assets, destination_assets)

    if inventory(portal) == before:
        print("NOOP: published public data and assets are already current")
        return False
    write_json(catalog / "manifest.json", {
        **manifest,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
    })
    print(f"SYNCED: public projection from {manifest['sourceCommit']} ({manifest['counts']})")
    return True


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--projection", type=Path, required=True)
    parser.add_argument("--portal", type=Path, default=Path(__file__).resolve().parents[1])
    args = parser.parse_args()
    sync(args.projection, args.portal)


if __name__ == "__main__":
    main()
