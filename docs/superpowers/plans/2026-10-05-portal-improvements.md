# Portal Improvements Implementation Plan

> Status: Approved for implementation by the user on 2026-10-05; work in progress.
> Source: attached `貼り付けたテキスト.txt` (“Spec: MyResourceCenter Portal 改善・修正設計”).

## Goal

Improve the production deployment boundary and document discovery across `MyResourceCenter-Portal` and `MyResourceCenter`, while preserving MyResourceCenter as the canonical source of facts, publishing only allowlisted public projections, and keeping each change independently verifiable and reversible.

## Current baseline and reconciliations

- Starting handoff baseline: Portal `main` at `a8890a8c5cec1f54306aae939e77cecf18a315f1`; MRC `main` at `e841737c073683abfdfe2927ba0bbd3498bf1621`.
- PR #84, Website pagination, is already merged. It is not an outstanding merge candidate.
- Trend already loads `assets/portal.js`, `assets/site.css`, and uses the shared shell in the current Portal baseline. Phase 2 will fix the stale navigation, set the shared theme default, and align retention copy; it will not add a duplicate shell integration.
- Initial domain inventory: 12 of 116 public document presentations had values and 104 were empty. After evidence review and MRC PR #111, 79 of those candidates have supported domains and 25 remain correctly unclassified as `domains: []`. MRC `main` now owns domains in `catalog/document-presentation.json`; Portal receives the allowlisted projection only. The registered domains remain `Graphics`, `Programming`, `AI`, `Tools`, `GameDevelopment`, `Audio`, `DCC`, `Research`, and `Security`.
- Existing Website legacy metadata remains out of scope. The previously reported inventory gaps (publisher 1, authors 66, publishedAt 64, contentType 63) must remain explicit in the final status; this work will not invent or bulk-complete those facts.
- PRs #85, #86 and #87 are merged in the Portal; MRC PRs #111 and #112 are merged. The canonical Domain and taxonomy-routing Portal changes are being delivered as the current change.

## Invariants

- Do not infer document domains in Portal. Canonical document domains come only from MRC `catalog/document-presentation.json` and must belong to MRC `catalog/taxonomy.json`.
- Keep the current public projection allowlist and schema version unless implementation evidence shows a shape change is necessary. Do not expose private identity fields or read Drive Originals.
- Do not backfill legacy Website metadata or change Trend scoring/data rules, viewer routing, collections/relations or backend behavior. New Website registration requirements are handled separately; Category remains limited to the existing Tech/Idea taxonomy. Do not introduce server-side pagination.
- Run each repository's required validators before proposing its PR. Keep production deploy impossible unless the complete Portal validation job succeeds.

## Implementation sequence

### PR 1 — Portal production deploy gate

1. Use `.github/workflows/validate-portal.yml` as the single validation and Pages deployment workflow.
2. Preserve its complete validation set: `validate_portal.py`, `validate_browser_viewer.py`, `validate_trends.py`, `validate_trend_candidates.py`, `test_filter_state.cjs`, `test_human_portal.cjs`, and `test_home.cjs`.
3. Add a Pages deploy job that runs only for `main` after `needs: validate`; keep Pages permissions scoped to that job. Support the normal `main` push and a dispatch to this same workflow from the Trend auto-merge job.
4. Remove `.github/workflows/deploy-pages.yml` after confirming its Pages steps are represented. Inspect `.github/workflows/auto-merge-trends.yml`, remove its independent deploy path, and have it dispatch the unified workflow after a successful bot merge. This preserves Trend publishing despite the `GITHUB_TOKEN` workflow-recursion rule; the dispatch still runs the complete validation job before deploying.
5. Update README workflow references and add a workflow contract check if the current tests do not assert the dependency and event conditions.

**Acceptance:** PRs never deploy; a failed validation cannot reach Pages; every Pages deployment follows the full validation job; any manual or bot dispatch targets only the unified workflow and cannot bypass validation; no independent production deploy path remains.

### PR 2 — Trend shared-shell details and copy

1. In `trend.html`, replace the broken `index.html#tags` destination with the current taxonomy route or rely on shared navigation where the duplicate link is unnecessary.
2. Set the root `data-theme="light"` default and verify the existing shared `portal.js` handles theme toggle, navigation, and mobile naming.
3. Change the Trend page retention copy from 50 to 100 items/day; align `README.md` and `docs/human-portal.md` where needed.
4. Add/adjust Portal tests for the shared script, absence of the broken fragment, theme control contract, and unchanged Trend data/script contract.

**Acceptance:** Trend uses the current shared shell without changing `assets/trend.js`, `data/trends.json`, scoring, categories, discovery rules, or retention behavior; user-facing limits consistently say 100/day.

### PR 3 — MRC canonical document domains

1. Make `catalog/document-presentation.json` the sole authoritative owner of public document domains. Adjust `tools/build_knowledge_brain.py` so rebuilding does not overwrite presentation domains from the identity index; remove the identity/presentation equality assumption from `tools/validate_knowledge_brain.py` while retaining ID/title/resource integrity checks.
2. Validate every `public-metadata-approved` presentation has a `domains` array. Allow zero or more unique values; every present value must be in `catalog/taxonomy.json`'s domain registry. Keep multiple domains valid and do not impose a new maximum.
3. Make public projection construction and public-boundary validation reject missing, malformed, duplicate, or unknown approved-document domains without widening `security/public-schema.json` or exposing identity data.
4. Generate a reviewable audit for the 104 empty rows using existing canonical metadata and available source evidence; do not access Drive Originals. Do not infer from event names, filename-only clues, `CEDEC2026`, `General` engine, weak title associations, or Portal behavior. Set only sufficiently supported canonical values; retain `[]` whenever evidence is insufficient.
5. Add fixture and regression tests in the knowledge-brain and projection/boundary test suites. Update the registration/governance contract to state presentation-level domain ownership.

**Acceptance:** the MRC validators and safe public projection accept `domains: []` and reject missing/non-array, duplicate, or unknown values; supported values are registered canonical domains; unsupported rows stay `[]`; projection fields remain allowlisted.

### PR 4 — Portal canonical domains and taxonomy routing

1. Sync the allowlisted MRC public projection to the Portal using the existing publish boundary.
2. In `assets/catalog.js`, consume `doc.domains` directly and remove tag-to-domain inference. Represent an empty array as UI-only “未分類” without adding it to taxonomy; unclassified documents stay visible and searchable.
3. Extend `tools/validate_portal.py` to require document domains to be arrays, allow empty arrays, and require any values to be unique members of `taxonomy.domains`; do not apply this requirement to the separate legacy `catalog/documents.json` records.
4. In `taxonomy.html`, route document domain links to `?category=...` and document tag links to `?tag=...`; keep Website and engine routes aligned with existing controls.
5. Add exact route and domain-membership regression coverage. Update the stale test fixture that fabricates `taxonomy.tags[tag].domain`.

**Acceptance:** Portal displays and filters only canonical domains from the public projection, never infers missing values, and keeps unclassified documents in list/search; its validator rejects non-canonical domains; taxonomy links use the exact supported filters.

### PR 5 — Documents pagination

1. Add local 20-item pagination to `documents.html`, `assets/human-portal.js`, and `assets/documents.css`; do not refactor pagination into a shared framework.
2. Apply search/category/format/tag filters before slicing results. Show visible range and filtered/total counts.
3. Store pages in `?page=`; omit page 1; filter changes reset to page 1 with `replaceState`; page navigation uses `pushState`; restore Back/Forward, repair malformed values, and clamp oversized pages.
4. Keep pagination controls semantic and keyboard/screen-reader accessible (`nav`, `aria-label`, `aria-current`, meaningful Previous/Next), and focus the results on page change.
5. Extend `tools/test_human_portal.cjs` and `tools/test_filter_state.cjs` for ordering, URL state, invalid/clamped pages, filter reset, history, empty results, and accessible markup.

**Acceptance:** each page renders at most 20 filtered documents; direct links, reload, Back/Forward, and filter changes preserve the specified URL behavior.

### PR 6 — Browser smoke-test feasibility

1. After PRs 1–5 land, assess a small browser smoke suite on GitHub-hosted runners for the six pages and critical user paths in the source spec.
2. First record installation/runtime stability and maintenance cost. Do not add an unstable browser install to the required production deploy gate.
3. If stable, add browser smoke coverage as a separate check and document its scope; otherwise document the blocker and retain the existing deterministic tests.

## Verification

Portal checks for affected PRs:

```text
node tools/test_filter_state.cjs
node tools/test_human_portal.cjs
node tools/test_home.cjs
node tools/test_deploy_workflow.cjs
python tools/validate_portal.py
python tools/validate_browser_viewer.py
python tools/validate_trends.py
python tools/validate_trend_candidates.py
```

MRC checks for the domain work:

```text
python -B -m unittest discover -s tools -p 'test_*.py'
python -B tools/validate_knowledge_brain.py
python -B tools/validate_taxonomy.py
python -B tools/build_public_projection.py --output /tmp/public-catalog
python -B tools/validate_public_boundary.py --path /tmp/public-catalog
python -B tools/validate_safe_pipeline.py
```

Run the focused tests for any changed workflow, taxonomy route, pagination state, domain validation, and public projection in addition to these commands. Do not claim completion until actual outputs are checked.

## Open blocker and completion reporting

The user clarified that this attached specification is an implementation request and later amended Domain handling: unsupported candidates remain `domains: []`, which is valid. The currently known Website legacy-metadata gaps remain unresolved and must be visible in the completion report.

## Direct Website requirement from the user

After the attached Portal improvement phases, implement the separately stated Website registration/search requirements across MRC and Portal: publisher, authors, publishedAt, and existing contentType are required for new Websites; do not create new Categories; only Site/Author values with more than three items become approval candidates, and only explicitly approved values get dedicated filters, otherwise they use Other; Category/Site/Author filters combine with AND; sort by publishedAt ascending/descending; keep safe hostname-scoped local Site Icon caching and the square icon list UI; preserve Public Boundary and validators. Do not fabricate missing legacy facts. Report the current legacy gaps explicitly (publisher 1, authors 66, publishedAt 64, contentType 63) as a blocker until canonical metadata is reviewed.
