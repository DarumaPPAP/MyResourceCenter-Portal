(() => {
  const root = document.documentElement;
  const key = 'myresourcecenter-theme';
  let stored;
  try { stored = localStorage.getItem(key); } catch { /* Storage can be disabled. */ }
  if (stored === 'light' || stored === 'dark') root.dataset.theme = stored;

  function syncButtons() {
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.textContent = root.dataset.theme === 'dark' ? 'ライトに切替' : 'ダークに切替';
      button.setAttribute('aria-label', `${root.dataset.theme === 'dark' ? 'ライト' : 'ダーク'}モードに切り替える`);
    });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('.theme-toggle');
    if (!button) return;
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    try { localStorage.setItem(key, root.dataset.theme); } catch { /* Theme still works in memory. */ }
    syncButtons();
  });

  const globalSearch = document.querySelector('[data-global-search]');
  if (globalSearch) {
    const submit = () => {
      const value = globalSearch.value.trim();
      const requested = document.querySelector('[data-search-target]')?.value;
      const target = requested === 'websites.html' ? requested : 'documents.html';
      location.href = value ? `${target}?q=${encodeURIComponent(value)}` : target;
    };
    globalSearch.addEventListener('keydown', event => {
      if (event.key === 'Enter') submit();
    });
    document.querySelector('[data-global-search-button]')?.addEventListener('click', submit);
  }

  document.addEventListener('keydown', event => {
    const editing = event.target.closest('input,textarea,select,[contenteditable]');
    if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !editing) {
      const search = globalSearch || document.querySelector('input[type="search"]');
      if (search) { event.preventDefault(); search.focus(); }
    }
  });

  const items = [
    { href: 'collections.html', label: 'コレクション', icon: '◫' },
    { href: 'taxonomy.html', label: '分野・タグ', icon: '#' },
    { href: 'trend.html', label: 'トレンド', icon: '↗' }
  ];
  const current = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.side-nav').forEach(nav => {
    items.forEach(item => {
      if (nav.querySelector(`a[href="${item.href}"]`)) return;
      const link = document.createElement('a');
      link.href = item.href;
      link.innerHTML = `<span class="icon">${item.icon}</span>${item.label}`;
      if (current === item.href || (item.href === 'collections.html' && current === 'collection.html')) link.classList.add('active');
      nav.appendChild(link);
    });
  });
  document.querySelectorAll('.mobile-nav').forEach(nav => {
    items.forEach(item => {
      if (nav.querySelector(`a[href="${item.href}"]`)) return;
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = item.label;
      nav.appendChild(link);
    });
  });

  const activePage = ({ 'document.html': 'documents.html', 'website.html': 'websites.html', 'collection.html': 'collections.html' })[current] || current;
  document.querySelectorAll('.side-nav, .mobile-nav').forEach(nav => {
    nav.setAttribute('aria-label', nav.classList.contains('side-nav') ? 'メインナビゲーション' : 'モバイルナビゲーション');
    nav.querySelectorAll('a').forEach(link => {
      const selected = link.getAttribute('href') === activePage;
      link.classList.toggle('active', selected);
      if (selected) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
      if (nav.classList.contains('mobile-nav')) {
        if (link.getAttribute('href') === 'documents.html') link.textContent = '資料';
        if (link.getAttribute('href') === 'websites.html') link.textContent = 'Webサイト';
      }
    });
  });
  const main = document.querySelector('main');
  if (main) {
    if (!main.id) main.id = 'main-content';
    main.tabIndex = -1;
    const skip = document.createElement('a');
    skip.className = 'skip-link';
    skip.href = `#${main.id}`;
    skip.textContent = '本文へスキップ';
    document.body.prepend(skip);
  }
  syncButtons();
})();
