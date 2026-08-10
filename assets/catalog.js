(() => {
  const cache = new Map();

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  async function load(name) {
    if (!cache.has(name)) {
      cache.set(name, fetch(`catalog/${name}.json`, { cache: 'no-store' }).then(response => {
        if (!response.ok) throw new Error(`${name}.json: HTTP ${response.status}`);
        return response.json();
      }));
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
