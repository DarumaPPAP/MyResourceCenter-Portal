# Human Portal presentation contract

The static Portal uses `catalog/document-presentation.json` for Documents, document details and Home document counts. It contains one public presentation record per document Resource. The `resourceId` joins Collections and Relations; `documentId` identifies the stable derived thumbnail. The only permitted fields are `resourceId`, `documentId`, `title`, `sourceFormat`, `thumbnail`, `engine`, `level`, `tags` and `canonicalUrl`. Raw Drive IDs, title provenance and folder topology are forbidden in this projection.

Documents display the actual projected title and first-page thumbnail, format, engine and tags. The grid does not infer language or format from filenames. Search matches titles, engines, tags and Resource topics; Category uses explicit canonical tag domains, and Format and Tags filters combine with search. Filter state is restored from the URL and supports browser history and reset.

The Viewer helper accepts approved HTTPS Drive file URLs and native Google Docs/Slides canonical URLs, derives the file ID and routes to `viewer.html`. The Viewer loads Drive Preview and provides an Original link. It does not render PDF/PPTX at runtime or route to a GitHub Original mirror. Thumbnails use a fixed neutral container, `object-fit: contain`, lazy loading, and a text fallback for null thumbnails or failed image requests.

Collections sort by category, then title. The list previews at most three explicitly ordered members, retains their catalog roles and shows `+N more`. The detail shows the full saved reading path. Empty Collections show `準備中 / Resources are being curated.` No Collection image assets are used.

Home includes the locally authored `assets/technical-environment.svg` scene illustration, search, and counts computed from the catalogs actually loaded. Websites use local Site Icons and metadata for a technical article directory; an unavailable icon falls back to text. Trends use editorial columns without changing article-body/image storage or short-lived discovery rules, with a limit of 100 items per day and three days of retention. All pages preserve responsive navigation, theme selection, focus indicators and keyboard search.

## Validation

Run from the Portal root:

```sh
python tools/validate_portal.py
python tools/validate_browser_viewer.py
python tools/validate_trends.py
python tools/validate_trend_candidates.py
node tools/test_filter_state.cjs
node tools/test_human_portal.cjs
```

The presentation validator checks strict public fields, Resource/DOC/Original uniqueness, complete document Resource coverage, canonical URL consistency, supported formats, null fallback requirements, exact thumbnail paths and PNG signature, dimensions, chunk integrity and file existence. Public URLs also reject credentials, raw whitespace/control characters, backslashes, malformed parsing and invalid ports without echoing the offending URL. Existing 100-Original inventory, formats, count consistency, relation/Collection references, forbidden private-field scanning and no GitHub Original-mirror checks remain enforced. Public Original folder metadata is now explicitly rejected rather than required.

The new behavior tests include negative URLs and asset paths, filter intersections, image failures, category/title ordering, preserved member order and roles, three-step counters, private topology rejection, bad mappings, unsupported thumbnail formats and malformed PNGs. HTTP browser verification covers desktop/mobile, light/dark, filter/reset, keyboard focus and local image fallback. Drive remote preview availability and source permissions remain external to local page validation.
