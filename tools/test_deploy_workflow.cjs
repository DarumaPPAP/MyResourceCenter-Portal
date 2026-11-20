// Contract test for the Portal's single validation-to-production-deploy path.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const workflowPath = path.join(root, '.github/workflows/validate-portal.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const trendWorkflow = fs.readFileSync(path.join(root, '.github/workflows/auto-merge-trends.yml'), 'utf8');

assert.match(workflow, /^on:\n  pull_request:\n  push:\n    branches: \[main\]\n  workflow_dispatch:\s*$/m,
  'PR, main push, and the guarded Trend dispatch all use the unified workflow');
assert.match(workflow, /^  validate:\n/m, 'the complete validation job exists');
for (const command of [
  'python tools/validate_portal.py',
  'python tools/validate_browser_viewer.py',
  'python tools/validate_trends.py',
  'python tools/validate_trend_candidates.py',
  'node tools/test_filter_state.cjs',
  'node tools/test_human_portal.cjs',
  'node tools/test_home.cjs',
  'node tools/test_deploy_workflow.cjs'
]) {
  assert.ok(workflow.includes(command), `full validation includes ${command}`);
}

const deployStart = workflow.indexOf('\n  deploy-pages:\n');
assert.notEqual(deployStart, -1, 'the Pages deploy job exists');
const deploy = workflow.slice(deployStart);
assert.match(deploy, /^    needs: validate$/m, 'Pages depends on the full validation job');
assert.match(deploy, /github\.ref == 'refs\/heads\/main'/, 'Pages can deploy only main');
assert.match(deploy, /github\.event_name == 'push'.*github\.event_name == 'workflow_dispatch'/s,
  'the only deploy events are a main push and the unified workflow dispatch');
assert.match(deploy, /^    permissions:\n      contents: read\n      actions: read\n      pages: write\n      id-token: write$/m,
  'Pages deployment has read-only Actions artifact metadata access');
assert.match(deploy, /actions\/configure-pages@/);
assert.match(deploy, /actions\/upload-pages-artifact@/);
assert.match(deploy, /actions\/deploy-pages@/);

const artifactName = 'github-pages-${{ github.run_id }}-${{ github.run_attempt }}';
assert.ok(deploy.includes(`name: ${artifactName}`),
  'an upload attempt must use a unique Pages artifact name');
assert.ok(deploy.includes(`ARTIFACT_NAME: ${artifactName}`),
  'readiness polling must inspect the exact uploaded artifact');
assert.ok(deploy.includes(`artifact_name: ${artifactName}`),
  'deployment must select the same unique artifact as upload');
assert.match(deploy, /name: Wait for Pages artifact to become visible/,
  'deployment waits for artifact metadata after upload');
assert.match(deploy, /gh api "repos\/\$\{GITHUB_REPOSITORY\}\/actions\/runs\/\$\{GITHUB_RUN_ID\}\/artifacts\?per_page=100"/,
  'readiness gate checks artifacts in the current workflow run');
assert.match(deploy, /if \(\( count == 1 \)\); then/,
  'only one visible matching artifact permits deployment');
assert.match(deploy, /if \(\( count > 1 \)\); then/,
  'duplicate artifacts fail closed');
assert.match(deploy, /if \(\( attempt < 15 \)\); then sleep 5; fi/,
  'metadata polling is bounded');

assert.doesNotMatch(workflow.slice(0, deployStart), /^  pages: write$/m,
  'the workflow and validation job do not receive Pages permissions');

assert.equal(fs.existsSync(path.join(root, '.github/workflows/deploy-pages.yml')), false,
  'the former independently-triggered deploy workflow is removed');
assert.doesNotMatch(trendWorkflow, /pages: write|id-token: write|actions\/(?:configure-pages|upload-pages-artifact|deploy-pages)@/,
  'the Trend auto-merge workflow cannot deploy directly');
assert.match(trendWorkflow, /gh workflow run validate-portal\.yml --ref main --repo "\$\{REPO\}"/,
  'successful Trend auto-merges dispatch the unified validation workflow');
assert.match(fs.readFileSync(path.join(root, 'README.md'), 'utf8'),
  /`\.github\/workflows\/validate-portal\.yml`/,
  'README identifies the unified validation and deployment workflow');
assert.doesNotMatch(fs.readFileSync(path.join(root, 'README.md'), 'utf8'), /deploy-pages\.yml/,
  'README does not refer to the removed workflow');

console.log('OK: Portal production deployment requires full validation in the unified workflow');
