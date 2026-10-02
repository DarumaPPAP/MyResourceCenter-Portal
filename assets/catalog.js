(() => {
  const cache = new Map();
  const latestWebsiteShards = [
    'websites-latest-01',
    'websites-latest-02',
    'websites-latest-03',
    'websites-latest-04'
  ];
  const resourcePublicFields = [
    'id', 'title', 'url', 'canonicalUrl', 'kind', 'topic', 'topics', 'reviewState', 'useState', 'category', 'tags'
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
    if (resource.kind === 'document') return `document.html?id=${encodeURIComponent(resource.id)}`;
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

  // Persist only visible filter values; keep unrelated URL parameters intact.
  function bindFilterState(controls, render) {
    const restore = () => {
      const params = new URLSearchParams(location.search);
      controls.forEach(control => { control.value = params.get(control.id) || ''; });
    };
    const persist = () => {
      const url = new URL(location.href);
      controls.forEach(control => {
        if (control.value) url.searchParams.set(control.id, control.value);
        else url.searchParams.delete(control.id);
      });
      history.replaceState(null, '', url);
    };
    restore();
    controls.forEach(control => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', persist));
    document.getElementById('clear')?.addEventListener('click', () => {
      persist();
      controls[0]?.focus();
    });
    document.addEventListener('click', event => {
      if (event.target.closest('[data-reset-filters]')) document.getElementById('clear')?.click();
    });
    window.addEventListener('popstate', () => { restore(); render(); });
  }

  // Viewer IDs are derived only from the approved public canonical URL.
  function viewerHref(doc) {
    try {
      const url = new URL(doc.canonicalUrl);
      const match = url.hostname === 'drive.google.com' ? url.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]+)\/view$/) : url.hostname === 'docs.google.com' ? url.pathname.match(/^\/(?:presentation|document)\/d\/([A-Za-z0-9_-]+)\/edit$/) : null;
      if (url.protocol !== 'https:' || url.port || url.username || url.password || !match) return '';
      return `viewer.html?${new URLSearchParams({id:match[1], format:doc.sourceFormat || 'UNKNOWN', title:doc.title || 'Document'})}`;
    } catch { return ''; }
  }

  function documentThumbnail(doc) {
    const fallback = `<span class="thumbnail-fallback">${escapeHtml(doc.sourceFormat || 'DOCUMENT')}<small>プレビューなし</small></span>`;
    const valid = /^assets\/generated\/documents\/DOC-[A-Za-z0-9_-]+\.(?:png|webp)$/.test(doc.thumbnail || '');
    return `<div class="document-thumbnail${valid ? '' : ' is-missing'}">${valid ? `<img src="${escapeHtml(doc.thumbnail)}" alt="" loading="lazy" decoding="async">` : ''}${fallback}</div>`;
  }

  function thumbnailFailed(image) {
    image.hidden = true;
    image.closest('.document-thumbnail')?.classList.add('is-missing');
  }

  function bindThumbnailFallback(root) {
    // Capture error because image errors do not bubble; handles cards added by filters.
    root.addEventListener('error', event => {
      if (event.target.matches('.document-thumbnail img')) thumbnailFailed(event.target);
    }, true);
  }

  function presentDocuments(rows, resourcesById, taxonomy = {}) {
    return rows.map(doc => {
      const resource = resourcesById.get(doc.resourceId) || {};
      const topics = resource.topics || (resource.topic ? [resource.topic] : []);
      const categories = [...new Set(Array.isArray(doc.domains) ? doc.domains : (doc.tags || []).map(tag => taxonomy.tags?.[tag]?.domain).filter(Boolean))];
      return {...doc, topics, categories};
    });
  }

  function filterDocuments(rows, {q = '', category = '', format = '', tag = ''} = {}) {
    const term = q.trim().toLowerCase();
    return rows.filter(doc => (!term || [doc.title, doc.engine, ...(doc.tags || []), ...(doc.topics || [])].join(' ').toLowerCase().includes(term)) &&
      (!category || doc.categories.includes(category)) && (!format || doc.sourceFormat === format) && (!tag || doc.tags.includes(tag)));
  }

  function sortCollections(rows) {
    return [...rows].sort((a,b) => (a.category || 'Other').localeCompare(b.category || 'Other', 'en') || a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id));
  }

  function readingPreview(collection) {
    const members = collection.resources || [];
    return {steps:members.slice(0,3), more:Math.max(0,members.length - 3)};
  }

  window.MRCCatalog = {
    viewerHref, documentThumbnail, thumbnailFailed, bindThumbnailFallback,
    presentDocuments, filterDocuments, sortCollections, readingPreview,
    bindFilterState,
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
