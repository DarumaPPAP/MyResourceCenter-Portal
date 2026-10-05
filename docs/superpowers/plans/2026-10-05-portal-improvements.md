# Portal Improvements Implementation Plan

> Status: Approved for implementation by the user on 2026-10-05; work in progress.
> Source: attached `貼り付けたテキスト.txt` (“Spec: MyResourceCenter Portal 改善・修正設計”).

## Goal

Improve the production deployment boundary and document discovery across `MyResourceCenter-Portal` and `MyResourceCenter`, while preserving MyResourceCenter as the canonical source of facts, publishing only allowlisted public projections, and keeping each change independently verifiable and reversible.

## Current baseline and reconciliations

- Portal `main` is at `a8890a8c5cec1f54306aae939e77cecf18a315f1`; MRC `main` is at `e841737c073683abfdfe2927ba0bbd3498bf1621`.
- PR #84, Website pagination, is already merged. It is not an outstanding merge candidate.
- Trend already loads `assets/portal.js`, `assets/site.css`, and uses the shared shell in the current Portal baseline. Phase 2 will fix the stale navigation, set the shared theme default, and align retention copy; it will not add a duplicate shell integration.
- The 116 public document presentation rows currently have 12 non-empty domain arrays and 104 empty arrays. The registered domains are `Graphics`, `Programming`, `AI`, `Tools`, `GameDevelopment`, `Audio`, `DCC`, `Research`, and `Security`. MRC currently rebuilds presentation domains from `document-identities.json`, which conflicts with the requested presentation-level ownership and must be corrected.
- Existing Website legacy metadata remains out of scope. The previously reported inventory gaps (publisher 1, authors 66, publishedAt 64, contentType 63) must remain explicit in the final status; this work will not invent or bulk-complete those facts.

## Invariants

- Do not infer document domains in Portal. Canonical document domains come only from MRC `catalog/document-presentation.json` and must belong to MRC `catalog/taxonomy.json`.
- Keep the current public projection allowlist and schema version unless implementation evidence shows a shape change is necessary. Do not expose private identity fields or read Drive Originals.
- Do not change Website metadata, Trend scoring/data rules, viewer routing, collections/relations, backend behavior, or introduce server-side pagination.
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
2. Validate every `public-metadata-approved` presentation has a non-empty array of unique domain strings, each in `catalog/taxonomy.json`'s domain registry. Keep multiple domains valid and do not impose a new maximum.
3. Make public projection construction and public-boundary validation reject missing, malformed, duplicate, or unknown approved-document domains without widening `security/public-schema.json` or exposing identity data.
4. Generate a reviewable candidate report for the 104 empty rows using only existing canonical catalog metadata (titles, topics, tags, engine, and available summaries). Candidate suggestions remain non-canonical until reviewed; do not access Drive Originals. Resolve uncertain rows with explicit human review before committing canonical values.
5. Add fixture and regression tests in the knowledge-brain and projection/boundary test suites. Update the registration/governance contract to state presentation-level domain ownership.

**Acceptance:** the MRC validators and safe public projection reject invalid domains; approved public presentations have reviewed, non-empty registered domains; projection fields remain allowlisted. Any candidate row that cannot be responsibly resolved is reported as a blocker rather than silently assigned.

### PR 4 — Portal canonical domains and taxonomy routing

1. Sync the allowlisted MRC public projection to the Portal using the existing publish boundary.
2. In `assets/catalog.js`, consume `doc.domains` directly and remove tag-to-domain inference.
3. Extend `tools/validate_portal.py` to require non-empty, unique document domains present in `taxonomy.domains`; do not apply this requirement to the separate legacy `catalog/documents.json` records.
4. In `taxonomy.html`, route document domain links to `?category=...` and document tag links to `?tag=...`; keep Website and engine routes aligned with existing controls.
5. Add exact route and domain-membership regression coverage. Update the stale test fixture that fabricates `taxonomy.tags[tag].domain`.

**Acceptance:** Portal displays and filters only canonical domains from the public projection; its validator rejects non-canonical domains; taxonomy links use the exact supported filters.

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

The user clarified that this attached specification is an implementation request. Ambiguous document-domain candidates still require explicit review before canonical values are committed. The currently known Website legacy-metadata gaps are intentionally unchanged and must remain visible in the completion report.
