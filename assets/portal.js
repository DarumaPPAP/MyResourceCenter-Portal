(() => {
  const root = document.documentElement;
  const key = 'myresourcecenter-theme';
  const stored = localStorage.getItem(key);
  if (stored) root.dataset.theme = stored;

  function syncButtons() {
    document.querySelectorAll('.theme-toggle').forEach(button => {
      button.textContent = root.dataset.theme === 'dark' ? 'Light' : 'Dark';
    });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('.theme-toggle');
    if (!button) return;
    root.dataset.theme = root.dataset.theme === 'dark' ? 'light' : 'dark';
    localStorage.setItem(key, root.dataset.theme);
    syncButtons();
  });

  const globalSearch = document.querySelector('[data-global-search]');
  if (globalSearch) {
    const submit = () => {
      const value = globalSearch.value.trim();
      if (value) location.href = `documents.html?q=${encodeURIComponent(value)}`;
    };
    globalSearch.addEventListener('keydown', event => {
      if (event.key === 'Enter') submit();
    });
    document.querySelector('[data-global-search-button]')?.addEventListener('click', submit);
  }

  const items = [
    { href: 'collections.html', label: 'コレクション', icon: '◫' },
    { href: 'taxonomy.html', label: 'Taxonomy', icon: '#' },
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

  syncButtons();
})();
