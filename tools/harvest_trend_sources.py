from __future__ import annotations

from argparse import ArgumentParser
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import quote, urlencode, urljoin, urlparse
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo
import json
import re
import sys
import time
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
CONFIG_PATH = ROOT / 'data' / 'trend-sources.json'
OUTPUT_PATH = ROOT / 'data' / 'trend-candidates.json'
TOKYO = ZoneInfo('Asia/Tokyo')
USER_AGENT = 'MyResourceCenter-Portal-TrendHarvester/1.0 (+https://github.com/DarumaPPAP/MyResourceCenter-Portal)'
MAX_SNIPPET = 240
TIMEOUT = 20


class LinkCollector(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.links: list[tuple[str, str]] = []
        self.href: str | None = None
        self.text: list[str] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        if tag.lower() == 'a':
            self.href = dict(attrs).get('href')
            self.text = []

    def handle_data(self, data: str) -> None:
        if self.href is not None:
            self.text.append(data)

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() == 'a' and self.href is not None:
            self.links.append((self.href, ' '.join(''.join(self.text).split())))
            self.href = None
            self.text = []


def fetch_bytes(url: str, accept: str = '*/*') -> bytes:
    request = Request(url, headers={
        'User-Agent': USER_AGENT,
        'Accept': accept,
        'Cache-Control': 'no-cache',
    })
    with urlopen(request, timeout=TIMEOUT) as response:
        return response.read()


def fetch_text(url: str, accept: str = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8') -> str:
    return fetch_bytes(url, accept).decode('utf-8', errors='replace')


def clean_text(value: str | None) -> str:
    if not value:
        return ''
    return ' '.join(unescape(re.sub(r'<[^>]+>', ' ', value)).split())


def parse_datetime(value: str | None) -> datetime | None:
    if not value:
        return None
    text = value.strip()
    try:
        dt = datetime.fromisoformat(text.replace('Z', '+00:00'))
        return dt if dt.tzinfo else dt.replace(tzinfo=TOKYO)
    except ValueError:
        pass
    try:
        dt = parsedate_to_datetime(text)
        return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        return None


def recent(dt: datetime | None, cutoff: datetime) -> bool:
    return dt is None or dt.astimezone(timezone.utc) >= cutoff.astimezone(timezone.utc)


def aliases_by_keyword(config: dict) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for entry in config.get('keywords', []):
        name = str(entry['name'])
        result[name] = [name, *[str(x) for x in entry.get('aliases', [])]]
    return result


def keyword_pattern(values: list[str]) -> re.Pattern[str]:
    parts: list[str] = []
    for value in values:
        value = value.strip()
        token = re.escape(value)
        if re.fullmatch(r'[A-Za-z0-9_.+#\- ]+', value):
            parts.append(rf'(?<![A-Za-z0-9]){token}(?![A-Za-z0-9])')
        else:
            parts.append(token)
    return re.compile('|'.join(parts), re.IGNORECASE)


def candidate(title: str, url: str, source: str, published: datetime | None, matched: set[str], via: str, snippet: str = '', tags: list[str] | None = None) -> dict:
    return {
        'title': clean_text(title),
        'url': url,
        'source': source,
        'publishedAt': published.isoformat(timespec='seconds') if published else None,
        'matchedKeywords': sorted(matched),
        'tags': list(dict.fromkeys(tags or []))[:12],
        'snippet': clean_text(snippet)[:MAX_SNIPPET],
        'discoveredVia': via,
        'needsDateVerification': published is None,
    }


def parse_feed(data: bytes, source: str, matched: set[str], via: str, cutoff: datetime) -> list[dict]:
    root = ET.fromstring(data)
    result: list[dict] = []
    if root.tag.endswith('rss'):
        for item in root.findall('.//item'):
            published = parse_datetime(item.findtext('pubDate'))
            link = item.findtext('link') or ''
            if link and recent(published, cutoff):
                result.append(candidate(
                    item.findtext('title') or '', link, source, published, matched, via,
                    item.findtext('description') or ''))
        return result

    ns = {'a': 'http://www.w3.org/2005/Atom'}
    entries = root.findall('.//a:entry', ns) or root.findall('.//entry')
    for entry in entries:
        title = entry.findtext('a:title', default='', namespaces=ns) or entry.findtext('title') or ''
        published = parse_datetime(
            entry.findtext('a:published', default=None, namespaces=ns)
            or entry.findtext('a:updated', default=None, namespaces=ns)
            or entry.findtext('published') or entry.findtext('updated'))
        link = ''
        for node in entry.findall('a:link', ns) + entry.findall('link'):
            if node.attrib.get('href') and node.attrib.get('rel', 'alternate') in ('alternate', ''):
                link = node.attrib['href']
                break
        summary = entry.findtext('a:summary', default='', namespaces=ns) or entry.findtext('a:content', default='', namespaces=ns) or entry.findtext('summary') or ''
        if link and recent(published, cutoff):
            result.append(candidate(title, link, source, published, matched, via, summary))
    return result


def harvest_zenn(config: dict, cutoff: datetime, diagnostics: list[dict]) -> list[dict]:
    topic_map: dict[str, set[str]] = {}
    for entry in config.get('keywords', []):
        for topic in entry.get('zennTopics', []):
            topic_map.setdefault(str(topic), set()).add(str(entry['name']))

    result: list[dict] = []
    failures = 0
    for topic, matched in sorted(topic_map.items()):
        url = f'https://zenn.dev/topics/{quote(topic)}/feed'
        try:
            result.extend(parse_feed(fetch_bytes(url, 'application/rss+xml,application/xml,text/xml,*/*'), 'Zenn', matched, f'zenn-topic-feed:{topic}', cutoff))
        except Exception as exc:
            failures += 1
            diagnostics.append({'source': 'Zenn', 'target': url, 'status': 'error', 'message': str(exc)[:180]})

    # Coverage booster: title keyword hits from Zenn's public latest JSON endpoint.
    # It is optional because Zenn does not document this endpoint; official Topic RSS above is the primary path.
    alias_map = aliases_by_keyword(config)
    api_failures = 0
    for page in range(1, 31):
        url = f'https://zenn.dev/api/articles?order=latest&page={page}'
        try:
            payload = json.loads(fetch_text(url, 'application/json'))
        except Exception as exc:
            api_failures += 1
            diagnostics.append({'source': 'ZennLatest', 'target': url, 'status': 'error', 'message': str(exc)[:180]})
            break
        articles = payload.get('articles', []) if isinstance(payload, dict) else []
        if not articles:
            break
        oldest: datetime | None = None
        for article in articles:
            published = parse_datetime(article.get('published_at'))
            if published and (oldest is None or published < oldest):
                oldest = published
            if published and not recent(published, cutoff):
                continue
            title = str(article.get('title', ''))
            matched = {name for name, values in alias_map.items() if keyword_pattern(values).search(title)}
            if not matched:
                continue
            path = str(article.get('path', ''))
            if path.startswith('/'):
                article_url = 'https://zenn.dev' + path
            else:
                article_url = 'https://zenn.dev/' + path.lstrip('/') if path else ''
            if article_url:
                result.append(candidate(title, article_url, 'Zenn', published, matched, 'zenn-latest-api:title-match'))
        if oldest and oldest.astimezone(timezone.utc) < cutoff.astimezone(timezone.utc):
            break
        if not isinstance(payload, dict) or payload.get('next_page') is None:
            break
        time.sleep(0.05)

    diagnostics.append({
        'source': 'Zenn', 'status': 'ok' if failures == 0 else 'partial',
        'targets': len(topic_map), 'failures': failures, 'items': len(result),
        'coverage': 'official-topic-rss+latest-title-fallback', 'apiFallbackFailures': api_failures,
    })
    return result


def harvest_qiita(config: dict, cutoff: datetime, diagnostics: list[dict]) -> list[dict]:
    tag_map: dict[str, set[str]] = {}
    for entry in config.get('keywords', []):
        for tag in entry.get('qiitaTags', []):
            tag_map.setdefault(str(tag), set()).add(str(entry['name']))

    result: list[dict] = []
    failures = 0
    for tag, matched in sorted(tag_map.items()):
        oldest: datetime | None = None
        for page in range(1, 4):
            url = f'https://qiita.com/api/v2/tags/{quote(tag, safe="")}/items?per_page=100&page={page}'
            try:
                items = json.loads(fetch_text(url, 'application/json'))
            except Exception as exc:
                failures += 1
                diagnostics.append({'source': 'Qiita', 'target': url, 'status': 'error', 'message': str(exc)[:180]})
                break
            if not isinstance(items, list) or not items:
                break
            for item in items:
                published = parse_datetime(item.get('created_at') or item.get('updated_at'))
                if published and (oldest is None or published < oldest):
                    oldest = published
                if not recent(published, cutoff):
                    continue
                tags = [str(x.get('name', '')) for x in item.get('tags', []) if isinstance(x, dict)]
                result.append(candidate(str(item.get('title', '')), str(item.get('url', '')), 'Qiita', published, matched, f'qiita-tag-api:{tag}', str(item.get('body', ''))[:1000], tags))
            if len(items) < 100 or (oldest and oldest.astimezone(timezone.utc) < cutoff.astimezone(timezone.utc)):
                break
            time.sleep(0.1)

    diagnostics.append({'source': 'Qiita', 'status': 'ok' if failures == 0 else 'partial', 'targets': len(tag_map), 'failures': failures, 'items': len(result), 'coverage': 'official-api-tag-newest'})
    return result


def page_metadata(html: str, fallback: str) -> tuple[str, datetime | None, str]:
    title_match = re.search(r'<title[^>]*>(.*?)</title>', html, re.I | re.S)
    title = clean_text(title_match.group(1)) if title_match else fallback
    published = None
    for pattern in (
        r'<meta[^>]+property=["\']article:published_time["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+content=["\']([^"\']+)["\'][^>]+property=["\']article:published_time["\']',
        r'"datePublished"\s*:\s*"([^"]+)"',
        r'<time[^>]+datetime=["\']([^"\']+)',
    ):
        match = re.search(pattern, html, re.I | re.S)
        if match:
            published = parse_datetime(match.group(1))
            if published:
                break
    snippet = ''
    for pattern in (
        r'<meta[^>]+name=["\']description["\'][^>]+content=["\']([^"\']+)',
        r'<meta[^>]+property=["\']og:description["\'][^>]+content=["\']([^"\']+)',
    ):
        match = re.search(pattern, html, re.I | re.S)
        if match:
            snippet = clean_text(match.group(1))
            break
    return title, published, snippet


def links_from_html(html: str, base: str, hosts: tuple[str, ...], path_pattern: re.Pattern[str]) -> list[tuple[str, str]]:
    parser = LinkCollector()
    parser.feed(html)
    seen: set[str] = set()
    result: list[tuple[str, str]] = []
    for href, text in parser.links:
        absolute = urljoin(base, href)
        parsed = urlparse(absolute)
        if not any(parsed.netloc == host or parsed.netloc.endswith('.' + host) for host in hosts):
            continue
        if not path_pattern.search(parsed.path):
            continue
        clean_url = absolute.split('#', 1)[0].split('?', 1)[0]
        if clean_url not in seen:
            seen.add(clean_url)
            result.append((clean_url, text))
    return result


def harvest_note(config: dict, cutoff: datetime, diagnostics: list[dict]) -> list[dict]:
    alias_map = aliases_by_keyword(config)
    result: list[dict] = []
    visited: set[str] = set()
    failures = 0
    article_path = re.compile(r'/[^/]+/n/n[a-zA-Z0-9]+$')
    for query in alias_map:
        search_url = 'https://note.com/search?' + urlencode({'context': 'note', 'q': query, 'sort': 'new'})
        try:
            links = links_from_html(fetch_text(search_url), search_url, ('note.com',), article_path)[:20]
        except Exception as exc:
            failures += 1
            diagnostics.append({'source': 'note', 'target': search_url, 'status': 'error', 'message': str(exc)[:180]})
            continue
        for article_url, anchor in links:
            if article_url in visited:
                continue
            visited.add(article_url)
            try:
                html = fetch_text(article_url)
                title, published, snippet = page_metadata(html, anchor or article_url)
            except Exception as exc:
                diagnostics.append({'source': 'note', 'target': article_url, 'status': 'error', 'message': str(exc)[:180]})
                continue
            if published and not recent(published, cutoff):
                continue
            haystack = f'{title}\n{snippet}\n{clean_text(html)[:20000]}'
            matched = {name for name, values in alias_map.items() if keyword_pattern(values).search(haystack)}
            matched.add(query)
            result.append(candidate(title, article_url, 'note', published, matched, f'note-native-search:{query}', snippet))
    diagnostics.append({'source': 'note', 'status': 'ok' if failures == 0 else 'partial', 'targets': len(alias_map), 'failures': failures, 'items': len(result), 'coverage': 'native-search-best-effort'})
    return result


def harvest_hatena(config: dict, cutoff: datetime, diagnostics: list[dict]) -> list[dict]:
    alias_map = aliases_by_keyword(config)
    result: list[dict] = []
    failures = 0
    for feed in config.get('hatenaFeeds', []):
        url = str(feed['url'])
        source = str(feed.get('name') or urlparse(url).netloc)
        try:
            for item in parse_feed(fetch_bytes(url, 'application/atom+xml,application/rss+xml,application/xml,text/xml,*/*'), source, set(), f'hatena-feed:{source}', cutoff):
                haystack = f"{item['title']}\n{item['snippet']}"
                matched = {name for name, values in alias_map.items() if keyword_pattern(values).search(haystack)}
                if matched:
                    item['matchedKeywords'] = sorted(matched)
                    result.append(item)
        except Exception as exc:
            failures += 1
            diagnostics.append({'source': 'Hatena', 'target': url, 'status': 'error', 'message': str(exc)[:180]})

    visited = {item['url'] for item in result}
    for query in alias_map:
        tag_url = f'https://d.hatena.ne.jp/keyword/{quote(query)}'
        try:
            links = links_from_html(fetch_text(tag_url), tag_url, ('hatenablog.com', 'hatenadiary.com'), re.compile(r'/entry/'))[:20]
        except Exception as exc:
            failures += 1
            diagnostics.append({'source': 'Hatena', 'target': tag_url, 'status': 'error', 'message': str(exc)[:180]})
            continue
        for article_url, anchor in links:
            if article_url in visited:
                continue
            visited.add(article_url)
            try:
                html = fetch_text(article_url)
                title, published, snippet = page_metadata(html, anchor or article_url)
            except Exception as exc:
                diagnostics.append({'source': 'Hatena', 'target': article_url, 'status': 'error', 'message': str(exc)[:180]})
                continue
            if published and not recent(published, cutoff):
                continue
            haystack = f'{title}\n{snippet}\n{clean_text(html)[:20000]}'
            matched = {name for name, values in alias_map.items() if keyword_pattern(values).search(haystack)}
            matched.add(query)
            result.append(candidate(title, article_url, urlparse(article_url).netloc, published, matched, f'hatena-keyword:{query}', snippet))

    diagnostics.append({'source': 'Hatena', 'status': 'ok' if failures == 0 else 'partial', 'targets': len(alias_map) + len(config.get('hatenaFeeds', [])), 'failures': failures, 'items': len(result), 'coverage': 'known-feeds+keyword-page-best-effort'})
    return result


def dedupe(items: list[dict], cutoff: datetime, limit: int) -> list[dict]:
    merged: dict[str, dict] = {}
    for item in items:
        url = item.get('url')
        if not url:
            continue
        published = parse_datetime(item.get('publishedAt'))
        if published and not recent(published, cutoff):
            continue
        if url not in merged:
            merged[url] = item
            continue
        current = merged[url]
        current['matchedKeywords'] = sorted(set(current.get('matchedKeywords', [])) | set(item.get('matchedKeywords', [])))
        current['tags'] = list(dict.fromkeys([*current.get('tags', []), *item.get('tags', [])]))[:12]
        current['discoveredVia'] = '|'.join(sorted(set(str(current.get('discoveredVia', '')).split('|')) | set(str(item.get('discoveredVia', '')).split('|'))))
        if not current.get('snippet') and item.get('snippet'):
            current['snippet'] = item['snippet']
        if current.get('publishedAt') is None and item.get('publishedAt'):
            current['publishedAt'] = item['publishedAt']
            current['needsDateVerification'] = False

    def sort_key(item: dict) -> tuple:
        dt = parse_datetime(item.get('publishedAt'))
        return (-(dt.timestamp() if dt else 0), item.get('source', ''), item.get('title', ''))

    return sorted(merged.values(), key=sort_key)[:limit]


def main() -> int:
    parser = ArgumentParser(description='Harvest deterministic/native-source Trend Radar candidates.')
    parser.add_argument('--config', default=str(CONFIG_PATH))
    parser.add_argument('--output', default=str(OUTPUT_PATH))
    parser.add_argument('--now', help='ISO8601 time for deterministic testing')
    args = parser.parse_args()

    config = json.loads(Path(args.config).read_text(encoding='utf-8'))
    if config.get('schemaVersion') != '1.0':
        print('FAILED: trend-sources schemaVersion must be 1.0')
        return 1
    now = parse_datetime(args.now) if args.now else datetime.now(TOKYO)
    if now is None:
        print('FAILED: invalid --now')
        return 1
    lookback = int(config.get('lookbackDays', 7))
    cutoff = now - timedelta(days=lookback)
    diagnostics: list[dict] = []
    harvesters = {'zenn': harvest_zenn, 'qiita': harvest_qiita, 'hatena': harvest_hatena, 'note': harvest_note}
    items: list[dict] = []
    for source_id in config.get('enabledHarvesters', harvesters.keys()):
        items.extend(harvesters[source_id](config, cutoff, diagnostics))

    items = dedupe(items, cutoff, int(config.get('maxCandidates', 500)))
    output = {
        'schemaVersion': '1.0',
        'generatedAt': now.isoformat(timespec='seconds'),
        'lookbackDays': lookback,
        'candidates': items,
        'diagnostics': diagnostics,
    }
    Path(args.output).write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(f'OK: harvested {len(items)} unique candidates')
    for row in diagnostics:
        if 'targets' in row:
            print(f"- {row.get('source')}: {row.get('status')} / {row.get('items', 0)} items / {row.get('failures', 0)} failures")
    return 0


if __name__ == '__main__':
    sys.exit(main())
