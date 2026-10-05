(() => {
  const OTHER = '__other__';
  // Unicode 15.0.0 full case-fold exceptions to JavaScript lowercasing, matching Python str.casefold() after NFKC normalization.
  const CASE_FOLD_SPECIALS = {
    "\u00b5": "\u03bc",
    "\u00df": "ss",
    "\u0149": "\u02bcn",
    "\u017f": "s",
    "\u01f0": "j\u030c",
    "\u0345": "\u03b9",
    "\u0390": "\u03b9\u0308\u0301",
    "\u03b0": "\u03c5\u0308\u0301",
    "\u03c2": "\u03c3",
    "\u03d0": "\u03b2",
    "\u03d1": "\u03b8",
    "\u03d5": "\u03c6",
    "\u03d6": "\u03c0",
    "\u03f0": "\u03ba",
    "\u03f1": "\u03c1",
    "\u03f5": "\u03b5",
    "\u0587": "\u0565\u0582",
    "\uab70": "\u13a0",
    "\uab71": "\u13a1",
    "\uab72": "\u13a2",
    "\uab73": "\u13a3",
    "\uab74": "\u13a4",
    "\uab75": "\u13a5",
    "\uab76": "\u13a6",
    "\uab77": "\u13a7",
    "\uab78": "\u13a8",
    "\uab79": "\u13a9",
    "\uab7a": "\u13aa",
    "\uab7b": "\u13ab",
    "\uab7c": "\u13ac",
    "\uab7d": "\u13ad",
    "\uab7e": "\u13ae",
    "\uab7f": "\u13af",
    "\uab80": "\u13b0",
    "\uab81": "\u13b1",
    "\uab82": "\u13b2",
    "\uab83": "\u13b3",
    "\uab84": "\u13b4",
    "\uab85": "\u13b5",
    "\uab86": "\u13b6",
    "\uab87": "\u13b7",
    "\uab88": "\u13b8",
    "\uab89": "\u13b9",
    "\uab8a": "\u13ba",
    "\uab8b": "\u13bb",
    "\uab8c": "\u13bc",
    "\uab8d": "\u13bd",
    "\uab8e": "\u13be",
    "\uab8f": "\u13bf",
    "\uab90": "\u13c0",
    "\uab91": "\u13c1",
    "\uab92": "\u13c2",
    "\uab93": "\u13c3",
    "\uab94": "\u13c4",
    "\uab95": "\u13c5",
    "\uab96": "\u13c6",
    "\uab97": "\u13c7",
    "\uab98": "\u13c8",
    "\uab99": "\u13c9",
    "\uab9a": "\u13ca",
    "\uab9b": "\u13cb",
    "\uab9c": "\u13cc",
    "\uab9d": "\u13cd",
    "\uab9e": "\u13ce",
    "\uab9f": "\u13cf",
    "\uaba0": "\u13d0",
    "\uaba1": "\u13d1",
    "\uaba2": "\u13d2",
    "\uaba3": "\u13d3",
    "\uaba4": "\u13d4",
    "\uaba5": "\u13d5",
    "\uaba6": "\u13d6",
    "\uaba7": "\u13d7",
    "\uaba8": "\u13d8",
    "\uaba9": "\u13d9",
    "\uabaa": "\u13da",
    "\uabab": "\u13db",
    "\uabac": "\u13dc",
    "\uabad": "\u13dd",
    "\uabae": "\u13de",
    "\uabaf": "\u13df",
    "\uabb0": "\u13e0",
    "\uabb1": "\u13e1",
    "\uabb2": "\u13e2",
    "\uabb3": "\u13e3",
    "\uabb4": "\u13e4",
    "\uabb5": "\u13e5",
    "\uabb6": "\u13e6",
    "\uabb7": "\u13e7",
    "\uabb8": "\u13e8",
    "\uabb9": "\u13e9",
    "\uabba": "\u13ea",
    "\uabbb": "\u13eb",
    "\uabbc": "\u13ec",
    "\uabbd": "\u13ed",
    "\uabbe": "\u13ee",
    "\uabbf": "\u13ef",
    "\u13f8": "\u13f0",
    "\u13f9": "\u13f1",
    "\u13fa": "\u13f2",
    "\u13fb": "\u13f3",
    "\u13fc": "\u13f4",
    "\u13fd": "\u13f5",
    "\u1c80": "\u0432",
    "\u1c81": "\u0434",
    "\u1c82": "\u043e",
    "\u1c83": "\u0441",
    "\u1c84": "\u0442",
    "\u1c85": "\u0442",
    "\u1c86": "\u044a",
    "\u1c87": "\u0463",
    "\u1c88": "\ua64b",
    "\u1e96": "h\u0331",
    "\u1e97": "t\u0308",
    "\u1e98": "w\u030a",
    "\u1e99": "y\u030a",
    "\u1e9a": "a\u02be",
    "\u1e9b": "\u1e61",
    "\u1f50": "\u03c5\u0313",
    "\u1f52": "\u03c5\u0313\u0300",
    "\u1f54": "\u03c5\u0313\u0301",
    "\u1f56": "\u03c5\u0313\u0342",
    "\u1f80": "\u1f00\u03b9",
    "\u1f81": "\u1f01\u03b9",
    "\u1f82": "\u1f02\u03b9",
    "\u1f83": "\u1f03\u03b9",
    "\u1f84": "\u1f04\u03b9",
    "\u1f85": "\u1f05\u03b9",
    "\u1f86": "\u1f06\u03b9",
    "\u1f87": "\u1f07\u03b9",
    "\u1f90": "\u1f20\u03b9",
    "\u1f91": "\u1f21\u03b9",
    "\u1f92": "\u1f22\u03b9",
    "\u1f93": "\u1f23\u03b9",
    "\u1f94": "\u1f24\u03b9",
    "\u1f95": "\u1f25\u03b9",
    "\u1f96": "\u1f26\u03b9",
    "\u1f97": "\u1f27\u03b9",
    "\u1fa0": "\u1f60\u03b9",
    "\u1fa1": "\u1f61\u03b9",
    "\u1fa2": "\u1f62\u03b9",
    "\u1fa3": "\u1f63\u03b9",
    "\u1fa4": "\u1f64\u03b9",
    "\u1fa5": "\u1f65\u03b9",
    "\u1fa6": "\u1f66\u03b9",
    "\u1fa7": "\u1f67\u03b9",
    "\u1fb2": "\u1f70\u03b9",
    "\u1fb3": "\u03b1\u03b9",
    "\u1fb4": "\u03ac\u03b9",
    "\u1fb6": "\u03b1\u0342",
    "\u1fb7": "\u03b1\u0342\u03b9",
    "\u1fbe": "\u03b9",
    "\u1fc2": "\u1f74\u03b9",
    "\u1fc3": "\u03b7\u03b9",
    "\u1fc4": "\u03ae\u03b9",
    "\u1fc6": "\u03b7\u0342",
    "\u1fc7": "\u03b7\u0342\u03b9",
    "\u1fd2": "\u03b9\u0308\u0300",
    "\u1fd3": "\u03b9\u0308\u0301",
    "\u1fd6": "\u03b9\u0342",
    "\u1fd7": "\u03b9\u0308\u0342",
    "\u1fe2": "\u03c5\u0308\u0300",
    "\u1fe3": "\u03c5\u0308\u0301",
    "\u1fe4": "\u03c1\u0313",
    "\u1fe6": "\u03c5\u0342",
    "\u1fe7": "\u03c5\u0308\u0342",
    "\u1ff2": "\u1f7c\u03b9",
    "\u1ff3": "\u03c9\u03b9",
    "\u1ff4": "\u03ce\u03b9",
    "\u1ff6": "\u03c9\u0342",
    "\u1ff7": "\u03c9\u0342\u03b9",
    "\ufb00": "ff",
    "\ufb01": "fi",
    "\ufb02": "fl",
    "\ufb03": "ffi",
    "\ufb04": "ffl",
    "\ufb05": "st",
    "\ufb06": "st",
    "\ufb13": "\u0574\u0576",
    "\ufb14": "\u0574\u0565",
    "\ufb15": "\u0574\u056b",
    "\ufb16": "\u057e\u0576",
    "\ufb17": "\u0574\u056d"
  };

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
    const lowered = name.normalize('NFKC').trim().replace(/\s+/gu, ' ').toLowerCase();
    return Array.from(lowered, character => CASE_FOLD_SPECIALS[character] || character).join('');
  }

  function siteIconPath(row) {
    const host = websiteHost(row);
    if (!host) return '';
    const safeHost = host.includes(':') ? 'ip6_' + host.replace(/:/g, '-') : host;
    if (!/^[a-z0-9._-]+$/i.test(safeHost)) return '';
    return `assets/generated/site-icons/${safeHost}.png`;
  }

  function presentWebsites(rows, facetConfig = {}) {
    const approvedSites = new Set((facetConfig.sites || []).map(facet => facet.key));
    const approvedAuthors = new Set((facetConfig.authors || []).map(facet => facet.key));
    return (rows || []).map(row => {
      const siteKey = websiteHost(row);
      const sourceAuthorKeys = (Array.isArray(row.authors) ? row.authors : []).map(normalizeAuthor).filter(Boolean);
      const authorKeys = [...new Set(sourceAuthorKeys.filter(key => typeof key === 'string' && key))];
      return {
        ...row,
        siteKey,
        authorKeys,
        siteFacet: approvedSites.has(siteKey) ? siteKey : OTHER,
        authorFacet: authorKeys.find(key => approvedAuthors.has(key)) || OTHER,
        hasOtherAuthor: authorKeys.length === 0 || !authorKeys.some(key => approvedAuthors.has(key))
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
      const searchText = [row.title, row.publisher, row.siteKey, ...(Array.isArray(row.authors) ? row.authors : []), ...(Array.isArray(row.domains) ? row.domains : []), ...(row.topics || []), ...(row.tags || []), ...(Array.isArray(row.engines) ? row.engines : [])]
        .filter(Boolean).join(' ').toLocaleLowerCase();
      return (!term || searchText.includes(term)) &&
        (!filters.category || row.category === filters.category) &&
        (!filters.tag || (Array.isArray(row.tags) && row.tags.includes(filters.tag))) &&
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
    const fallbackIcon = '<svg class="site-icon-fallback-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><path d="M3 12h18"></path><path d="M12 3a15 15 0 0 1 0 18"></path><path d="M12 3a15 15 0 0 0 0 18"></path></svg>';
    const icon = siteIconPath(row);
    const source = catalog.safeExternalUrl(row.url || row.canonicalUrl || '');
    const title = source
      ? `<a href="${escape(source)}" target="_blank" rel="noopener noreferrer">${escape(row.title || 'Untitled')}</a>`
      : `<span>${escape(row.title || 'Untitled')}</span>`;
    const authors = Array.isArray(row.authors) && row.authors.length
      ? row.authors.filter(value => typeof value === 'string' && value.trim()).join(' / ')
      : '—';
    const tags = Array.isArray(row.tags)
      ? row.tags.filter(value => typeof value === 'string' && value.trim()).slice(0, 6)
      : [];
    const tagHtml = tags.length ? catalog.chips(tags, 'website-tag') : '<span class="website-tag">—</span>';
    const category = ['Tech','Idea'].includes(row.category) ? `<span class="website-category website-category--${row.category.toLowerCase()}">${escape(row.category)}</span>` : '';
    return `<article class="website-card">
      <div class="site-icon-box" aria-hidden="true"><span class="site-icon-fallback">${fallbackIcon}</span>${icon ? `<img class="site-icon-image" src="${escape(icon)}" alt="" loading="lazy" decoding="async">` : ''}</div>
      <div class="website-info">
        <div class="website-head"><div class="site-line">${category}<span class="site-badge">${escape(publisher)}</span><span class="site-domain">${escape(host)}</span></div><a class="website-details" href="website.html?id=${encodeURIComponent(row.id)}">詳細</a></div>
        <h2 class="website-title" tabindex="-1">${title}</h2>
        <div class="website-bottom"><div class="website-byline"><span>${escape(authors)}</span><time class="website-published-at">${escape(row.publishedAt || '—')}</time></div><div class="website-tags">${tagHtml}</div></div>
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
