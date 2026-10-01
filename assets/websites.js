(() => {
  const OTHER = '__other__';

  function websiteHost(rowOrUrl) {
    const value = typeof rowOrUrl === 'string' ? rowOrUrl : rowOrUrl?.canonicalUrl || rowOrUrl?.url || '';
    try {
      const url = new URL(String(value));
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
      const host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
      if (!host || host.includes('/') || host.includes('\\') || host.includes('..')) return '';
      if (host.includes(':')) return /^[0-9a-f:.]+$/i.test(host) ? host : '';
      if (host.length > 253 || host.split('.').some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return '';
      return host;
    } catch {
      return '';
    }
  }

  function normalizeAuthor(name) {
    if (typeof name !== 'string') return '';
    return name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase()
      .replace(/ß/g, 'ss').replace(/ς/g, 'σ');
  }

  function siteIconPath(row) {
    const host = websiteHost(row);
    if (!host) return '';
    const safeHost = host.includes(':') ? `ip6-${host.replace(/:/g, '-')}` : host;
    if (!/^[a-z0-9.-]+$/i.test(safeHost)) return '';
    return `assets/generated/site-icons/${safeHost}.png`;
  }

  function presentWebsites(rows, facetConfig = {}) {
    const approvedSites = new Set((facetConfig.sites || []).map(facet => facet.key));
    const approvedAuthors = new Set((facetConfig.authors || []).map(facet => facet.key));
    return (rows || []).map(row => {
      const siteKey = websiteHost(row);
      const sourceAuthorKeys = (row.authors || []).map(normalizeAuthor).filter(Boolean);
      const authorKeys = [...new Set(sourceAuthorKeys.filter(key => typeof key === 'string' && key))];
      return {
        ...row,
        siteKey,
        authorKeys,
        siteFacet: approvedSites.has(siteKey) ? siteKey : OTHER,
        authorFacet: authorKeys.find(key => approvedAuthors.has(key)) || OTHER,
        hasOtherAuthor: authorKeys.length === 0 || authorKeys.some(key => !approvedAuthors.has(key))
      };
    });
  }

  function filterWebsites(rows, filters = {}, facetConfig = {}) {
    const term = String(filters.q || '').trim().toLocaleLowerCase();
    const presented = presentWebsites(rows, facetConfig);
    const approvedSites = new Set((facetConfig.sites || []).map(facet => facet.key));
    const approvedAuthors = new Set((facetConfig.authors || []).map(facet => facet.key));
    const selectedSite = String(filters.site || '');
    const selectedAuthor = String(filters.author || '');
    const siteKey = selectedSite.startsWith('site:') ? selectedSite.slice(5) : selectedSite;
    const authorKey = selectedAuthor.startsWith('author:') ? selectedAuthor.slice(7) : selectedAuthor;
    return presented.filter(row => {
      const searchText = [row.title, row.publisher, row.siteKey, ...(row.authors || []), ...(Array.isArray(row.domains) ? row.domains : []), ...(row.topics || []), ...(row.tags || [])]
        .filter(Boolean).join(' ').toLocaleLowerCase();
      return (!term || searchText.includes(term)) &&
        (!filters.category || row.contentType === filters.category) &&
        (!selectedSite || ((siteKey === OTHER || siteKey === 'other') ? row.siteFacet === OTHER : approvedSites.has(siteKey) && row.siteKey === siteKey)) &&
        (!selectedAuthor || ((authorKey === OTHER || authorKey === 'other') ? row.hasOtherAuthor : approvedAuthors.has(authorKey) && row.authorKeys.includes(authorKey)));
    });
  }

  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return '';
    const parsed = new Date(`${value}T00:00:00Z`);
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? '' : value;
  }

  function sortWebsites(rows, direction = 'desc') {
    const sign = direction === 'asc' ? 1 : -1;
    return (rows || []).map((row, index) => ({row, index, date:validDate(row.publishedAt)}))
      .sort((a, b) => {
        if (!a.date && b.date) return 1;
        if (a.date && !b.date) return -1;
        if (a.date && b.date && a.date !== b.date) return sign * a.date.localeCompare(b.date);
        return a.index - b.index;
      }).map(entry => entry.row);
  }

  function renderWebsiteCard(row, catalog) {
    const escape = catalog.escapeHtml;
    const host = row.siteKey || websiteHost(row) || '—';
    const publisher = typeof row.publisher === 'string' && row.publisher.trim() ? row.publisher.trim() : 'Site';
    const initial = Array.from(publisher)[0] || 'W';
    const icon = siteIconPath(row);
    const source = catalog.safeExternalUrl(row.url || row.canonicalUrl || '');
    const title = source
      ? `<a href="${escape(source)}" target="_blank" rel="noopener noreferrer">${escape(row.title || 'Untitled')}</a>`
      : `<span>${escape(row.title || 'Untitled')}</span>`;
    const authors = Array.isArray(row.authors) && row.authors.length
      ? row.authors.filter(value => typeof value === 'string' && value.trim()).join(' / ')
      : '—';
    return `<article class="website-card">
      <div class="site-icon-box" aria-hidden="true"><span class="site-icon-fallback">${escape(initial)}</span>${icon ? `<img class="site-icon-image" src="${escape(icon)}" alt="" loading="lazy" decoding="async">` : ''}</div>
      <div class="website-info">
        <div class="website-head"><div class="site-line"><span class="site-badge">${escape(publisher)}</span><span class="site-domain">${escape(host)}</span></div><a class="website-details" href="website.html?id=${encodeURIComponent(row.id)}">詳細</a></div>
        <h2 class="website-title">${title}</h2>
        <div class="website-bottom"><div class="website-byline"><span>${escape(authors)}</span><time class="website-published-at">${escape(row.publishedAt || '—')}</time></div><div class="website-categories"><span class="website-category">${escape(row.contentType || '—')}</span></div></div>
      </div>
    </article>`;
  }

  function bindSiteIconFallback(root) {
    root.addEventListener('error', event => {
      if (!event.target.matches('.site-icon-image')) return;
      event.target.hidden = true;
      event.target.closest('.site-icon-box')?.classList.add('is-missing');
    }, true);
  }

  window.MRCWebsites = {
    OTHER,
    websiteHost,
    normalizeAuthor,
    presentWebsites,
    filterWebsites,
    sortWebsites,
    siteIconPath,
    renderWebsiteCard,
    bindSiteIconFallback
  };
})();
