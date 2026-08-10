# Trend Automation Checklist

- Scheduled Task runs at 09:00 JST.
- Search starts from the latest 24 hours and widens only weak buckets up to seven days.
- Unity / Unreal / Graphics-Shader / C#-C++ / DCC-CG are searched as separate buckets.
- X public posts are used as discovery signals, with primary-source verification whenever possible.
- Official docs, release notes, changelogs, GitHub, engineering blogs, conferences and papers are preferred.
- General AI/business news is excluded unless it directly changes development technology or workflow.
- AI-only items do not dominate the feed; AI-for-development is treated as a supporting category.
- Low-depth articles, hype, leaks, rumors and duplicate rewrites are rejected even when the item count is low.
- Trend candidate count is not padded; maximum is 100 per day.
- Only `data/trends.json` is changed by automated Trend PRs.
- Automated branches use `trend/YYYY-MM-DD[-suffix]`.
- `Validate Trend Radar` must succeed before merge.
- `Auto Merge Trend Updates` re-checks branch, repository, base branch and changed-file scope.
- Successful automated Trend merge deploys the updated Portal.
- Trend content never auto-promotes into Websites or Documents.
