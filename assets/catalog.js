(() => {
  // The Pages build fills this with content-addressed paths. A source checkout
  // can still run from a plain static server against the public Catalog.
  const release = null;
  const files = new Map();
  const assembled = new Map();
  const UNCLASSIFIED_CATEGORY = '__unclassified__';
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

  function remember(cache, key, read) {
    if (!cache.has(key)) {
      cache.set(key, read().catch(error => {
        cache.delete(key);
        throw error;
      }));
    }
    return cache.get(key);
  }

  function fetchCatalog(name) {
    return remember(files, name, async () => {
      try {
        const url = release ? release.files[name] : `catalog/${name}.json`;
        if (!url) throw new Error(`${name}.json: missing from Catalog release`);
        const response = await fetch(url, release ? undefined : {cache:'no-cache'});
        if (!response.ok) throw new Error(`${name}.json: HTTP ${response.status}`);
        return await response.json();
      } catch (error) {
        if (release) window.dispatchEvent(new Event('portal-catalog-load-error'));
        throw error;
      }
    });
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

  function load(name) {
    if (name === 'resources') {
      return remember(assembled, name, async () => {
        const [base, supplemental, websites] = await Promise.all([
          fetchCatalog('resources'), fetchCatalog('resources-06'), loadLatestWebsites()
        ]);
        return [...base, ...supplemental, ...websites.map(toResource)];
      });
    }
    if (name === 'websites') {
      return remember(assembled, name, async () => {
        const [base, latest] = await Promise.all([fetchCatalog('websites'), loadLatestWebsites()]);
        return [...base, ...latest];
      });
    }
    if (name === 'home' && !release) {
      return remember(assembled, name, async () => selectHome(
        await loadMany('document-presentation', 'resources', 'collections')
      ));
    }
    return fetchCatalog(name);
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
    if (resource.kind === 'repository') return `repository.html?id=${encodeURIComponent(resource.id)}`;
    if (resource.kind === 'website' || websiteIds.has(resource.id)) return `website.html?id=${encodeURIComponent(resource.id)}`;
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
    return `<a class="primary-button detail-action" href="${escapeHtml(safe)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)} <span class="motion-arrow" aria-hidden="true">↗</span></a>`;
  }

  // Persist only visible filter values; keep unrelated URL parameters intact.
  function bindFilterState(controls, render, {clearParams = []} = {}) {
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
      clearParams.forEach(name => url.searchParams.delete(name));
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

  function focusPaginatedResults(list, selector, fallback) {
    const title = list.querySelector(selector);
    const active = document.activeElement;
    // Let the replacement cards paint before scroll and focus read their layout.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (document.activeElement !== active || list.querySelector(selector) !== title) return;
      (title || fallback).scrollIntoView({block:'start', behavior:'instant'});
      title?.focus({preventScroll:true});
    }));
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
    const fallbackIcon = '<svg class="thumbnail-fallback-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2.75h8l4 4v14.5H6z"></path><path d="M14 2.75v4h4"></path><path d="M9 12h6"></path><path d="M9 16h6"></path></svg>';
    const fallback = `<span class="thumbnail-fallback">${fallbackIcon}<strong>${escapeHtml(doc.sourceFormat || 'DOCUMENT')}</strong><small>プレビューなし</small></span>`;
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

  function presentDocuments(rows, resourcesById) {
    return rows.map(doc => {
      const resource = resourcesById.get(doc.resourceId) || {};
      const topics = resource.topics || (resource.topic ? [resource.topic] : []);
      const categories = [...new Set(Array.isArray(doc.domains) ? doc.domains : [])];
      return {...doc, topics, categories};
    });
  }

  function filterDocuments(rows, {q = '', category = '', format = '', tag = ''} = {}) {
    const term = q.trim().toLowerCase();
    return rows.filter(doc => (!term || [doc.title, doc.engine, ...(doc.tags || []), ...(doc.topics || [])].join(' ').toLowerCase().includes(term)) &&
      (!category || (category === UNCLASSIFIED_CATEGORY ? Array.isArray(doc.domains) && doc.domains.length === 0 : doc.categories.includes(category))) &&
      (!format || doc.sourceFormat === format) && (!tag || doc.tags.includes(tag)));
  }

  function sortCollections(rows) {
    return [...rows].sort((a,b) => (a.category || 'Other').localeCompare(b.category || 'Other', 'en') || a.title.localeCompare(b.title, 'en') || a.id.localeCompare(b.id));
  }

  function readingPreview(collection) {
    const members = collection.resources || [];
    return {steps:members.slice(0,3), more:Math.max(0,members.length - 3)};
  }

  function selectHome(data) {
    const resources = byId(data.resources);
    // Feature available previews in catalog order.
    const docs = data['document-presentation'].filter(doc => doc.thumbnail).slice(0, 4)
      .map(({resourceId, title, thumbnail, canonicalUrl, sourceFormat, engine, tags}) =>
        ({resourceId, title, thumbnail, canonicalUrl, sourceFormat, engine, tags:tags.slice(0, 3)}));
    // Only show paths with at least two resolvable steps, as on the source page.
    const paths = sortCollections(data.collections)
      .filter(col => col.resources.length >= 2 && col.resources.every(step => resources.has(step.id)))
      .slice(0, 3)
      .map(({id, title, category, description, resources:members}) => ({
        id, title, category, description,
        steps:members.slice(0, 3).map(({id,role}) => ({title:resources.get(id).title, role})),
        more:Math.max(0, members.length - 3)
      }));
    return {docs, paths};
  }

  window.MRCCatalog = {
    viewerHref, documentThumbnail, thumbnailFailed, bindThumbnailFallback,
    presentDocuments, filterDocuments, sortCollections, readingPreview,
    bindFilterState, focusPaginatedResults,
    sourceCommit: release?.sourceCommit,
    unclassifiedCategoryValue: UNCLASSIFIED_CATEGORY,
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
