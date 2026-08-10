# Trend Automation Checklist

- Scheduled Task runs at 09:00 JST.
- Task searches recent Game / Graphics / AI / Engine / Tools / Research sources.
- Primary sources are preferred.
- Trend candidate count is not padded; maximum is 50 per day.
- Only `data/trends.json` is changed by automated Trend PRs.
- Automated branches use `trend/YYYY-MM-DD[-suffix]`.
- `Validate Trend Radar` must succeed before merge.
- `Auto Merge Trend Updates` re-checks branch, repository, base branch and changed-file scope.
- Trend content never auto-promotes into Websites or Documents.
