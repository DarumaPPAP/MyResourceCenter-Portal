from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlencode
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import json
import re
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / 'data' / 'trend-sources.json'
CANDIDATE_PATH = ROOT / 'data' / 'trend-candidates.json'
TOKYO = ZoneInfo('Asia/Tokyo')
USER_AGENT = 'MyResourceCenter-Portal-TrendHarvester/1.1 (+https://github.com/DarumaPPAP/MyResourceCenter-Portal)'
TIMEOUT = 20
MAX_SNIPPET = 240


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=TOKYO)


def fetch_json(url: str) -> dict:
    request = Request(url, headers={
        'User-Agent': USER_AGENT,
        'Accept': 'application/json',
        'Cache-Control': 'no-cache',
    })
    with urlopen(request, timeout=TIMEOUT) as response:
        return json.loads(response.read().decode('utf-8', errors='replace'))


def clean_text(value: object) -> str:
    text = '' if value is None else str(value)
    text = re.sub(r'<[^>]+>', ' ', text)
    return ' '.join(text.split())


def note_candidates(config: dict, cutoff: datetime, diagnostics: list[dict]) -> list[dict]:
    result: list[dict] = []
    failures = 0
    queries = [str(entry['name']) for entry in config.get('keywords', [])]

    for query in queries:
        start = 0
        # noteの検索APIは公開仕様ではないため、1回の取得量を小さくして負荷と互換性を優先する。
        size = 20
        for _ in range(25):
            params = urlencode({
                'context': 'note',
                'q': query,
                'size': size,
                'start': start,
                'sort': 'new',
            })
            url = f'https://note.com/api/v3/searches?{params}'
            try:
                payload = fetch_json(url)
            except Exception as exc:
                failures += 1
                diagnostics.append({
                    'source': 'note-api',
                    'target': f'note-search:{query}:{start}',
                    'status': 'error',
                    'message': str(exc)[:180],
                })
                break

            notes = payload.get('data', {}).get('notes', {}) if isinstance(payload, dict) else {}
            contents = notes.get('contents', []) if isinstance(notes, dict) else []
            if not isinstance(contents, list) or not contents:
                break

            oldest: datetime | None = None
            for item in contents:
                if not isinstance(item, dict):
                    continue
                published = parse_datetime(item.get('publish_at'))
                if published and (oldest is None or published < oldest):
                    oldest = published
                if published and published.astimezone(timezone.utc) < cutoff.astimezone(timezone.utc):
                    continue

                user = item.get('user', {}) if isinstance(item.get('user'), dict) else {}
                urlname = str(user.get('urlname', '')).strip()
                key = str(item.get('key', '')).strip()
                if not urlname or not key:
                    continue

                title = clean_text(item.get('name'))
                description = clean_text(item.get('description'))
                result.append({
                    'title': title,
                    'url': f'https://note.com/{quote(urlname, safe="")}/n/{quote(key, safe="")}',
                    'source': 'note',
                    'publishedAt': published.isoformat(timespec='seconds') if published else None,
                    'matchedKeywords': [query],
                    'tags': [],
                    'snippet': description[:MAX_SNIPPET],
                    'discoveredVia': f'note-search-api:{query}',
                    'needsDateVerification': published is None,
                })

            is_last = notes.get('is_last_page') if isinstance(notes, dict) else None
            if is_last is True or len(contents) < size:
                break
            if oldest and oldest.astimezone(timezone.utc) < cutoff.astimezone(timezone.utc):
                break
            start += size
            time.sleep(0.05)

    diagnostics.append({
        'source': 'note-api',
        'status': 'ok' if failures == 0 else 'partial',
        'targets': len(queries),
        'failures': failures,
        'items': len(result),
        'coverage': 'search-api-newest-best-effort',
    })
    return result


def remove_ambiguous_matches(item: dict) -> dict | None:
    matches = {str(value) for value in item.get('matchedKeywords', [])}
    haystack = ' '.join([
        str(item.get('title', '')),
        str(item.get('snippet', '')),
        ' '.join(str(tag) for tag in item.get('tags', [])),
    ]).lower()

    if 'Unity' in matches:
        data_platform_markers = (
            'unity catalog',
            'databricks unity',
            'databricks',
            'unity ai gateway',
        )
        game_unity_markers = (
            'unity engine', 'unity 6', 'unity editor', 'unity3d',
            'monobehaviour', 'gameobject', 'scriptableobject', 'urp', 'hdrp',
            'addressables', 'rendergraph', 'shader graph', 'il2cpp', 'ugui',
        )
        if any(marker in haystack for marker in data_platform_markers) and not any(marker in haystack for marker in game_unity_markers):
            matches.remove('Unity')

    if not matches:
        return None
    item['matchedKeywords'] = sorted(matches)
    return item


def dedupe_and_sort(items: list[dict], cutoff: datetime, limit: int) -> list[dict]:
    merged: dict[str, dict] = {}
    for original in items:
        if not isinstance(original, dict):
            continue
        item = remove_ambiguous_matches(dict(original))
        if item is None:
            continue
        published = parse_datetime(item.get('publishedAt'))
        if published and published.astimezone(timezone.utc) < cutoff.astimezone(timezone.utc):
            continue
        url = str(item.get('url', '')).strip()
        if not url:
            continue

        previous = merged.get(url)
        if previous is None:
            merged[url] = item
            continue

        previous['matchedKeywords'] = sorted(set(previous.get('matchedKeywords', [])) | set(item.get('matchedKeywords', [])))
        previous['tags'] = list(dict.fromkeys([*previous.get('tags', []), *item.get('tags', [])]))[:12]
        previous['discoveredVia'] = '|'.join(sorted(set(str(previous.get('discoveredVia', '')).split('|')) | set(str(item.get('discoveredVia', '')).split('|'))))
        if not previous.get('snippet') and item.get('snippet'):
            previous['snippet'] = item['snippet']
        if previous.get('publishedAt') is None and item.get('publishedAt'):
            previous['publishedAt'] = item['publishedAt']
            previous['needsDateVerification'] = False

    def key(item: dict) -> tuple:
        dt = parse_datetime(item.get('publishedAt'))
        return (-(dt.timestamp() if dt else 0), str(item.get('source', '')), str(item.get('title', '')))

    return sorted(merged.values(), key=key)[:limit]


def main() -> int:
    config = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
    data = json.loads(CANDIDATE_PATH.read_text(encoding='utf-8'))
    now = parse_datetime(data.get('generatedAt')) or datetime.now(TOKYO)
    lookback = int(config.get('lookbackDays', 7))
    cutoff = now - timedelta(days=lookback)
    diagnostics = list(data.get('diagnostics', []))

    # HTML-based note search is intentionally superseded by the JSON search API.
    diagnostics = [row for row in diagnostics if row.get('source') != 'note']
    combined = list(data.get('candidates', []))
    combined.extend(note_candidates(config, cutoff, diagnostics))
    combined = dedupe_and_sort(combined, cutoff, int(config.get('maxCandidates', 500)))

    data['candidates'] = combined
    data['diagnostics'] = diagnostics
    CANDIDATE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'OK: refined to {len(combined)} unique candidates')
    return 0


if __name__ == '__main__':
    sys.exit(main())
