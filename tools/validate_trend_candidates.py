from __future__ import annotations

from datetime import datetime
from pathlib import Path
from urllib.parse import urlparse
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
PATH = ROOT / 'data' / 'trend-candidates.json'
MAX_CANDIDATES = 500
MAX_SNIPPET = 240


def valid_url(value: object) -> bool:
    if not isinstance(value, str):
        return False
    parsed = urlparse(value)
    return parsed.scheme == 'https' and bool(parsed.netloc)


def valid_datetime(value: object) -> bool:
    if value is None:
        return True
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace('Z', '+00:00'))
        return True
    except ValueError:
        return False


def validate(data: object) -> list[str]:
    errors: list[str] = []
    if not isinstance(data, dict):
        return ['root must be an object']
    if data.get('schemaVersion') != '1.0':
        errors.append('schemaVersion must be 1.0')
    if not valid_datetime(data.get('generatedAt')):
        errors.append('generatedAt must be ISO8601 or null')
    lookback = data.get('lookbackDays')
    if not isinstance(lookback, int) or isinstance(lookback, bool) or not 1 <= lookback <= 7:
        errors.append('lookbackDays must be integer 1..7')

    candidates = data.get('candidates')
    if not isinstance(candidates, list):
        errors.append('candidates must be an array')
        return errors
    if len(candidates) > MAX_CANDIDATES:
        errors.append(f'candidates exceeds {MAX_CANDIDATES}')

    seen: set[str] = set()
    forbidden = {'body', 'html', 'content', 'renderedBody', 'markdown'}
    for index, item in enumerate(candidates):
        prefix = f'candidates[{index}]'
        if not isinstance(item, dict):
            errors.append(f'{prefix} must be an object')
            continue
        if forbidden.intersection(item):
            errors.append(f'{prefix} contains forbidden full-content field')
        if not isinstance(item.get('title'), str) or not item['title'].strip():
            errors.append(f'{prefix}.title is required')
        url = item.get('url')
        if not valid_url(url):
            errors.append(f'{prefix}.url must be https URL')
        elif url in seen:
            errors.append(f'{prefix}.url is duplicated')
        else:
            seen.add(url)
        if not isinstance(item.get('source'), str) or not item['source'].strip():
            errors.append(f'{prefix}.source is required')
        if not valid_datetime(item.get('publishedAt')):
            errors.append(f'{prefix}.publishedAt must be ISO8601 or null')
        matched = item.get('matchedKeywords')
        if not isinstance(matched, list) or not matched or not all(isinstance(x, str) and x.strip() for x in matched):
            errors.append(f'{prefix}.matchedKeywords must be a non-empty string array')
        tags = item.get('tags')
        if not isinstance(tags, list) or not all(isinstance(x, str) for x in tags):
            errors.append(f'{prefix}.tags must be a string array')
        snippet = item.get('snippet')
        if not isinstance(snippet, str) or len(snippet) > MAX_SNIPPET:
            errors.append(f'{prefix}.snippet must be string <= {MAX_SNIPPET} chars')
        if not isinstance(item.get('discoveredVia'), str) or not item['discoveredVia'].strip():
            errors.append(f'{prefix}.discoveredVia is required')
        if not isinstance(item.get('needsDateVerification'), bool):
            errors.append(f'{prefix}.needsDateVerification must be boolean')

    if not isinstance(data.get('diagnostics'), list):
        errors.append('diagnostics must be an array')
    return errors


def main() -> int:
    try:
        data = json.loads(PATH.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as exc:
        print(f'FAILED: {exc}')
        return 1
    errors = validate(data)
    if errors:
        print('FAILED: invalid Trend candidate dataset')
        for error in errors:
            print('-', error)
        return 1
    print(f"OK: {len(data.get('candidates', []))} Trend candidates")
    return 0


if __name__ == '__main__':
    sys.exit(main())
