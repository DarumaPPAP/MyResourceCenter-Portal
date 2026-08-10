from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote, urlparse
from zoneinfo import ZoneInfo
import json
import re
import sys

from harvest_trend_sources import fetch_text, links_from_html, page_metadata

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / 'data' / 'trend-sources.json'
CANDIDATE_PATH = ROOT / 'data' / 'trend-candidates.json'
TOKYO = ZoneInfo('Asia/Tokyo')
MAX_SNIPPET = 240
NOTE_ARTICLE_PATH = re.compile(r'/[^/]+/n/n[a-zA-Z0-9]+$')


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=TOKYO)


def clean_text(value: object) -> str:
    text = '' if value is None else str(value)
    text = re.sub(r'<[^>]+>', ' ', text)
    return ' '.join(text.split())


def note_candidates(config: dict, cutoff: datetime, diagnostics: list[dict]) -> list[dict]:
    """Harvest note from its public hashtag "new" pages.

    We intentionally do not depend on note's undocumented search JSON API because
    GitHub-hosted runners receive HTTP 403 from it. Public hashtag pages are the
    stable browser-facing path and expose a dedicated newest tab via ``?f=new``.
    """
    result: list[dict] = []
    failures = 0
    visited: set[str] = set()
    queries = [str(entry['name']) for entry in config.get('keywords', [])]

    for query in queries:
        hashtag_url = f'https://note.com/hashtag/{quote(query, safe="")}?f=new'
        try:
            html = fetch_text(hashtag_url)
            links = links_from_html(
                html,
                hashtag_url,
                ('note.com',),
                NOTE_ARTICLE_PATH,
            )[:50]
        except Exception as exc:
            failures += 1
            diagnostics.append({
                'source': 'note-hashtag',
                'target': hashtag_url,
                'status': 'error',
                'message': str(exc)[:180],
            })
            continue

        for article_url, anchor in links:
            if article_url in visited:
                continue
            visited.add(article_url)
            try:
                article_html = fetch_text(article_url)
                title, published, snippet = page_metadata(
                    article_html,
                    anchor or article_url,
                )
            except Exception as exc:
                diagnostics.append({
                    'source': 'note-hashtag',
                    'target': article_url,
                    'status': 'error',
                    'message': str(exc)[:180],
                })
                continue

            if published and published.astimezone(timezone.utc) < cutoff.astimezone(timezone.utc):
                continue

            result.append({
                'title': clean_text(title),
                'url': article_url,
                'source': 'note',
                'publishedAt': published.isoformat(timespec='seconds') if published else None,
                'matchedKeywords': [query],
                'tags': [],
                'snippet': clean_text(snippet)[:MAX_SNIPPET],
                'discoveredVia': f'note-hashtag-new:{query}',
                'needsDateVerification': published is None,
            })

    diagnostics.append({
        'source': 'note-hashtag',
        'status': 'ok' if failures == 0 else 'partial',
        'targets': len(queries),
        'failures': failures,
        'items': len(result),
        'coverage': 'public-hashtag-new-pages',
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

        previous['matchedKeywords'] = sorted(
            set(previous.get('matchedKeywords', []))
            | set(item.get('matchedKeywords', []))
        )
        previous['tags'] = list(dict.fromkeys([
            *previous.get('tags', []),
            *item.get('tags', []),
        ]))[:12]
        previous['discoveredVia'] = '|'.join(sorted(
            set(str(previous.get('discoveredVia', '')).split('|'))
            | set(str(item.get('discoveredVia', '')).split('|'))
        ))
        if not previous.get('snippet') and item.get('snippet'):
            previous['snippet'] = item['snippet']
        if previous.get('publishedAt') is None and item.get('publishedAt'):
            previous['publishedAt'] = item['publishedAt']
            previous['needsDateVerification'] = False

    def key(item: dict) -> tuple:
        dt = parse_datetime(item.get('publishedAt'))
        return (
            -(dt.timestamp() if dt else 0),
            str(item.get('source', '')),
            str(item.get('title', '')),
        )

    return sorted(merged.values(), key=key)[:limit]


def main() -> int:
    config = json.loads(CONFIG_PATH.read_text(encoding='utf-8'))
    data = json.loads(CANDIDATE_PATH.read_text(encoding='utf-8'))
    now = parse_datetime(data.get('generatedAt')) or datetime.now(TOKYO)
    lookback = int(config.get('lookbackDays', 7))
    cutoff = now - timedelta(days=lookback)

    # Remove diagnostics from superseded note implementations before refreshing.
    diagnostics = [
        row for row in data.get('diagnostics', [])
        if row.get('source') not in {'note', 'note-api', 'note-hashtag'}
    ]
    combined = list(data.get('candidates', []))
    combined.extend(note_candidates(config, cutoff, diagnostics))
    combined = dedupe_and_sort(
        combined,
        cutoff,
        int(config.get('maxCandidates', 500)),
    )

    data['candidates'] = combined
    data['diagnostics'] = diagnostics
    CANDIDATE_PATH.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + '\n',
        encoding='utf-8',
    )
    print(f'OK: refined to {len(combined)} unique candidates')
    return 0


if __name__ == '__main__':
    sys.exit(main())
