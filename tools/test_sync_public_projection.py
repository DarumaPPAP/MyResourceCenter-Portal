#!/usr/bin/env python3
"""Regression tests for the public projection importer (no network access)."""
from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from sync_public_projection import sync, CATALOGS, LATEST_WEBSITE_SHARDS


def save(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False), encoding="utf-8")


class ProjectionSyncTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name)
        self.portal = root / "portal"
        self.projection = root / "public"
        (self.portal / "catalog").mkdir(parents=True)
        (self.portal / "assets/generated").mkdir(parents=True)
        (self.projection / "assets/generated").mkdir(parents=True)
        (self.projection / "assets/generated" / "file.txt").write_bytes(b"public asset")
        self.old_doc = {"id": "DOC-1", "kind": "document"}
        self.old_web = {"id": "RES-WEB-1", "kind": "website"}
        self.new_web = {"id": "RES-WEB-2", "kind": "website"}
        self.new_repo = {"id": "RES-REPO-1", "kind": "repository"}
        save(self.portal / "catalog" / "resources.json", [self.old_doc])
        save(self.portal / "catalog" / "resources-06.json", [])
        save(self.portal / "catalog" / "websites.json", [])
        for index, name in enumerate(LATEST_WEBSITE_SHARDS):
            save(self.portal / "catalog" / name, [self.old_web] if index == 0 else [])
        save(self.portal / "catalog" / "original-documents.json", {"counts": {"total": 100}})
        save(self.portal / "catalog" / "documents.json", [])
        save(self.portal / "catalog" / "document-presentation.json", [])
        save(self.portal / "catalog" / "manifest.json", {"sourceCommit": "a" * 40})
        self.rows = {
            "resources": [self.old_doc, self.old_web, self.new_web, self.new_repo],
            "websites": [self.old_web, self.new_web],
            "repositories": [self.new_repo],
            "documents": [],
            "taxonomy": {"schemaVersion": "2.0.0"},
            "relations": [],
            "collections": [],
            "document-presentation": [],
            "website-facets": {"schemaVersion": "1.0.0"},
        }
        self.refresh_source()

    def refresh_source(self):
        for name in CATALOGS:
            save(self.projection / (name + ".json"), self.rows[name])
        counts = {name: len(rows) if isinstance(rows, list) else 0 for name, rows in self.rows.items()}
        save(self.projection / "manifest.json", {
            "schemaVersion": "1.6.0", "sourceCommit": "b" * 40, "generatedAt": "ignored",
            "counts": counts,
        })

    def test_new_public_rows_and_noop(self):
        self.assertTrue(sync(self.projection, self.portal))
        catalog = self.portal / "catalog"
        self.assertEqual([x["id"] for x in json.loads((catalog / "resources.json").read_text())],
                         ["DOC-1", "RES-REPO-1"])
        self.assertEqual([x["id"] for x in json.loads((catalog / "repositories.json").read_text())],
                         ["RES-REPO-1"])
        ids = [x["id"] for name in LATEST_WEBSITE_SHARDS
               for x in json.loads((catalog / name).read_text())]
        self.assertEqual(set(ids), {"RES-WEB-1", "RES-WEB-2"})
        self.assertTrue((self.portal / "assets/generated/file.txt").is_file())
        self.assertEqual(json.loads((catalog / "manifest.json").read_text())["counts"]["documents"], 100)
        manifest = (catalog / "manifest.json").read_bytes()
        self.assertFalse(sync(self.projection, self.portal))
        self.assertEqual((catalog / "manifest.json").read_bytes(), manifest)

    def test_retraction_removes_public_data(self):
        self.assertTrue(sync(self.projection, self.portal))
        self.rows["resources"] = [self.old_doc, self.old_web, self.new_repo]
        self.rows["websites"] = [self.old_web]
        self.refresh_source()
        self.assertTrue(sync(self.projection, self.portal))
        ids = [x["id"] for name in LATEST_WEBSITE_SHARDS
               for x in json.loads((self.portal / "catalog" / name).read_text())]
        self.assertEqual(ids, ["RES-WEB-1"])

    def test_rejects_new_original_inventory(self):
        self.rows["documents"] = [{"id": "DOC-N"}]
        self.refresh_source()
        with self.assertRaisesRegex(ValueError, "Original inventory"):
            sync(self.projection, self.portal)

    def test_rejects_unmigrated_new_document_presentation(self):
        self.rows["document-presentation"] = [{"resourceId": "RES-DOC-NEW"}]
        self.refresh_source()
        with self.assertRaisesRegex(ValueError, "presentation inventory"):
            sync(self.projection, self.portal)

    def test_rejects_uncovered_public_website(self):
        self.rows["resources"] = [self.old_doc, self.old_web, self.new_repo]
        self.refresh_source()
        with self.assertRaisesRegex(ValueError, "coverage mismatch"):
            sync(self.projection, self.portal)


if __name__ == "__main__":
    unittest.main()
