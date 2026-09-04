(() => {
  const cache = new Map();
  const latestWebsiteShards = [
    'websites-latest-01',
    'websites-latest-02',
    'websites-latest-03',
    'websites-latest-04'
  ];
  const resourcePublicFields = [
    'id', 'title', 'url', 'canonicalUrl', 'kind', 'topic', 'topics', 'reviewState', 'useState', 'tags'
  ];

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function fetchCatalog(name) {
    const response = await fetch(`catalog/${name}.json`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`${name}.json: HTTP ${response.status}`);
    return response.json();
  }

  function toResource(row) {
    return Object.fromEntries(
      resourcePublicFields
        .filter(key => row?.[key] != null)
        .map(key => [key, row[key]])
    );
  }

  async function loadLatestWebsites() {
    const shards = await Promise.all(latestWebsiteShards.map(fetchCatalog));
    return shards.flat();
  }

  async function load(name) {
    if (!cache.has(name)) {
      if (name === 'resources') {
        cache.set(name, Promise.all([
          fetchCatalog('resources'),
          fetchCatalog('resources-06'),
          loadLatestWebsites()
        ]).then(([baseResources, supplementalResources, latestWebsites]) => [
          ...baseResources,
          ...supplementalResources,
          ...latestWebsites.map(toResource)
        ]));
      } else if (name === 'websites') {
        cache.set(name, Promise.all([
          fetchCatalog('websites'),
          loadLatestWebsites()
        ]).then(([baseWebsites, latestWebsites]) => [
          ...baseWebsites,
          ...latestWebsites
        ]));
      } else {
        cache.set(name, fetchCatalog(name));
      }
    }
    return cache.get(name);
  }

  async function loadMany(...names) {
    const values = await Promise.all(names.map(load));
    return Object.fromEntries(names.map((name, index) => [name, values[index]]));
  }

  function query(name) {
    return new URLSearchParams(location.search).get(name) || '';
  }

  function byId(rows) {
    return new Map((rows || []).map(row => [row.id, row]));
  }

  function chips(values, className = 'tag') {
    return (values || []).map(value => `<span class="${className}">${escapeHtml(value)}</span>`).join('');
  }

  function safeExternalUrl(value) {
    if (!value) return '';
    try {
      const url = new URL(String(value));
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
      return url.href;
    } catch {
      return '';
    }
  }

  const relationLabels = {
    related: '関連',
    extends: '拡張',
    contrasts: '対比',
    alternative: '代替案',
    implements: '実装',
    derivedFrom: '派生',
    supersedes: '後継',
    validates: '検証'
  };

  const roleLabels = {
    foundation: '基礎',
    overview: '概要',
    implementation: '実装',
    'production-case': 'Production Case',
    optimization: '最適化',
    'failure-case': '失敗例',
    research: 'Research',
    advanced: '発展'
  };

  function relationLabel(value) {
    return relationLabels[value] || value;
  }

  function roleLabel(value) {
    return roleLabels[value] || value;
  }

  function resourceHref(resource, websiteIds = new Set()) {
    if (!resource) return '';
    if (websiteIds.has(resource.id)) return `website.html?id=${encodeURIComponent(resource.id)}`;
    return safeExternalUrl(resource.url || resource.canonicalUrl || '');
  }

  function relationEntries(resourceId, relations, resourcesById) {
    return (relations || []).filter(edge => edge.from === resourceId || edge.to === resourceId).map(edge => {
      const outgoing = edge.from === resourceId;
      const otherId = outgoing ? edge.to : edge.from;
      return {
        edge,
        outgoing,
        otherId,
        resource: resourcesById.get(otherId)
      };
    });
  }

  function collectionEntries(resourceId, collections) {
    return (collections || []).flatMap(collection => {
      const member = (collection.resources || []).find(item => item.id === resourceId);
      return member ? [{ collection, member }] : [];
    });
  }

  function externalLink(url, label = 'Sourceを開く') {
    const safe = safeExternalUrl(url);
    if (!safe) return '';
    return `<a class="primary-button detail-action" href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} ↗</a>`;
  }

  window.MRCCatalog = {
    load,
    loadMany,
    query,
    byId,
    chips,
    escapeHtml,
    safeExternalUrl,
    relationLabel,
    roleLabel,
    resourceHref,
    relationEntries,
    collectionEntries,
    externalLink
  };
})();
