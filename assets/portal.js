(() => {
  const root = document.documentElement;
  const savedTheme = localStorage.getItem('myresourcecenter-theme');
  if (savedTheme) root.dataset.theme = savedTheme;

  document.querySelectorAll('[data-theme-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
      root.dataset.theme = next;
      localStorage.setItem('myresourcecenter-theme', next);
      button.setAttribute('aria-label', next === 'dark' ? 'ライトモードへ切替' : 'ダークモードへ切替');
      button.textContent = next === 'dark' ? '☀' : '☾';
    });
    button.textContent = root.dataset.theme === 'dark' ? '☀' : '☾';
  });

  const globalSearch = document.querySelector('[data-global-search]');
  if (globalSearch) {
    globalSearch.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      const q = globalSearch.value.trim();
      if (!q) return;
      location.href = `documents.html?q=${encodeURIComponent(q)}`;
    });
  }

  document.querySelectorAll('[data-global-search-button]').forEach(button => {
    button.addEventListener('click', () => {
      const input = document.querySelector('[data-global-search]');
      const q = input?.value.trim();
      if (!q) return;
      location.href = `documents.html?q=${encodeURIComponent(q)}`;
    });
  });

  function ensureTrendNavigation() {
    const sidebarNav = document.querySelector('.sidebar .side-nav');
    if (sidebarNav && !sidebarNav.querySelector('a[href="trend.html"]')) {
      const link = document.createElement('a');
      link.href = 'trend.html';
      link.innerHTML = '<span class="icon">↗</span>Trend Radar';
      const websites = sidebarNav.querySelector('a[href="websites.html"]');
      if (websites) websites.insertAdjacentElement('afterend', link);
      else sidebarNav.appendChild(link);
    }

    const mobileNav = document.querySelector('.mobile-nav');
    if (mobileNav && !mobileNav.querySelector('a[href="trend.html"]')) {
      const link = document.createElement('a');
      link.href = 'trend.html';
      link.textContent = 'Trend';
      mobileNav.appendChild(link);
    }
  }

  ensureTrendNavigation();
})();
