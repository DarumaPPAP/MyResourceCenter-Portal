from __future__ import annotations

from datetime import date, datetime
from pathlib import Path
from urllib.parse import urlparse
import json
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
TREND_PATH = ROOT / 'data' / 'trends.json'

CATEGORIES = {
    'Unity',
    'Unreal',
    'Graphics',
    'Programming',
    'DCC',
    'Game',
    'AI',
    'Tools',
    'Research',
    'Engine',
}
TYPES = {'HOT', 'NEW', 'RELEASE', 'UPDATE', 'PAPER', 'RESEARCH', 'CASE', 'TOOL'}
ID_RE = re.compile(r'^TREND-\d{8}-\d{3}$')
MAX_DAYS = 3
MAX_ITEMS_PER_DAY = 100
MAX_TITLE_LENGTH = 180
MAX_SOURCE_LENGTH = 120
MAX_SUMMARY_LENGTH = 140
MAX_TAGS = 8
MAX_TAG_LENGTH = 40


def parse_iso_datetime(value: str) -> None:
    datetime.fromisoformat(value.replace('Z', '+00:00'))


def validate_url(value: str) -> bool:
    parsed = urlparse(value)
    return parsed.scheme in {'http', 'https'} and bool(parsed.netloc)


def validate(data: dict) -> list[str]:
    errors: list[str] = []

    if data.get('schemaVersion') != '1.0':
        errors.append('schemaVersion must be 1.0')

    generated_at = data.get('generatedAt')
    if generated_at is not None:
        if not isinstance(generated_at, str):
            errors.append('generatedAt must be null or ISO-8601 string')
        else:
            try:
                parse_iso_datetime(generated_at)
            except ValueError:
                errors.append('generatedAt is not valid ISO-8601')

    days = data.get('days')
    if not isinstance(days, list):
        return errors + ['days must be an array']
    if len(days) > MAX_DAYS:
        errors.append(f'days exceeds retention: {len(days)} > {MAX_DAYS}')

    ids: set[str] = set()
    urls: set[str] = set()
    day_dates: list[str] = []

    for day_index, day in enumerate(days):
        prefix = f'days[{day_index}]'
        if not isinstance(day, dict):
            errors.append(f'{prefix} must be an object')
            continue

        day_value = day.get('date')
        if not isinstance(day_value, str):
            errors.append(f'{prefix}.date must be YYYY-MM-DD')
        else:
            try:
                date.fromisoformat(day_value)
                day_dates.append(day_value)
            except ValueError:
                errors.append(f'{prefix}.date is not valid YYYY-MM-DD')

        items = day.get('items')
        if not isinstance(items, list):
            errors.append(f'{prefix}.items must be an array')
            continue
        if len(items) > MAX_ITEMS_PER_DAY:
            errors.append(f'{prefix}.items exceeds hard limit: {len(items)} > {MAX_ITEMS_PER_DAY}')

        previous_score = 101
        for item_index, item in enumerate(items):
            item_prefix = f'{prefix}.items[{item_index}]'
            if not isinstance(item, dict):
                errors.append(f'{item_prefix} must be an object')
                continue

            item_id = item.get('id')
            if not isinstance(item_id, str) or not ID_RE.fullmatch(item_id):
                errors.append(f'{item_prefix}.id must match TREND-YYYYMMDD-NNN')
            elif item_id in ids:
                errors.append(f'duplicate trend id: {item_id}')
            else:
                ids.add(item_id)

            title = item.get('title')
            if not isinstance(title, str) or not title.strip() or len(title) > MAX_TITLE_LENGTH:
                errors.append(f'{item_prefix}.title must be 1..{MAX_TITLE_LENGTH} chars')

            url = item.get('url')
            if not isinstance(url, str) or not validate_url(url):
                errors.append(f'{item_prefix}.url must be an http(s) URL')
            elif url in urls:
                errors.append(f'duplicate trend url: {url}')
            else:
                urls.add(url)

            source = item.get('source')
            if not isinstance(source, str) or not source.strip() or len(source) > MAX_SOURCE_LENGTH:
                errors.append(f'{item_prefix}.source must be 1..{MAX_SOURCE_LENGTH} chars')

            published_at = item.get('publishedAt')
            if published_at is not None:
                if not isinstance(published_at, str):
                    errors.append(f'{item_prefix}.publishedAt must be null or ISO-8601 string')
                else:
                    try:
                        parse_iso_datetime(published_at)
                    except ValueError:
                        errors.append(f'{item_prefix}.publishedAt is not valid ISO-8601')

            category = item.get('category')
            if category not in CATEGORIES:
                errors.append(f'{item_prefix}.category must be one of {sorted(CATEGORIES)}')

            trend_type = item.get('type')
            if trend_type not in TYPES:
                errors.append(f'{item_prefix}.type must be one of {sorted(TYPES)}')

            summary = item.get('summary')
            if not isinstance(summary, str) or not summary.strip() or len(summary) > MAX_SUMMARY_LENGTH:
                errors.append(f'{item_prefix}.summary must be 1..{MAX_SUMMARY_LENGTH} chars')

            tags = item.get('tags')
            if not isinstance(tags, list):
                errors.append(f'{item_prefix}.tags must be an array')
            else:
                if len(tags) > MAX_TAGS:
                    errors.append(f'{item_prefix}.tags exceeds {MAX_TAGS}')
                if len(tags) != len(set(tags)):
                    errors.append(f'{item_prefix}.tags contains duplicates')
                for tag in tags:
                    if not isinstance(tag, str) or not tag.strip() or len(tag) > MAX_TAG_LENGTH:
                        errors.append(f'{item_prefix}.tags entries must be 1..{MAX_TAG_LENGTH} chars')

            score = item.get('score')
            if not isinstance(score, int) or isinstance(score, bool) or not 0 <= score <= 100:
                errors.append(f'{item_prefix}.score must be integer 0..100')
            else:
                if score > previous_score:
                    errors.append(f'{prefix}.items must be sorted by score descending')
                previous_score = score

    if day_dates != sorted(day_dates, reverse=True):
        errors.append('days must be sorted newest first')
    if len(day_dates) != len(set(day_dates)):
        errors.append('day dates must be unique')

    return errors


def main() -> int:
    try:
        data = json.loads(TREND_PATH.read_text(encoding='utf-8'))
    except (OSError, json.JSONDecodeError) as exc:
        print(f'FAILED: cannot load {TREND_PATH}: {exc}')
        return 1

    if not isinstance(data, dict):
        print('FAILED: trends.json root must be an object')
        return 1

    errors = validate(data)
    if errors:
        print('FAILED: Trend Radar validation')
        for error in errors:
            print('-', error)
        return 1

    total = sum(len(day.get('items', [])) for day in data.get('days', []))
    print(f'OK: Trend Radar dataset: {len(data.get("days", []))} days / {total} items / max {MAX_ITEMS_PER_DAY} items per day')
    return 0


if __name__ == '__main__':
    sys.exit(main())
