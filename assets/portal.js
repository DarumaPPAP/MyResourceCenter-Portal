(() => {
  const root = document.documentElement;

  const detailParents = {
    'document.html': 'documents.html',
    'website.html': 'websites.html',
    'repository.html': 'repositories.html',
    'collection.html': 'collections.html'
  };
  const pageName = url => url && (new URL(url).pathname.split('/').pop() || 'index.html');
  function transitionKind(from, to) {
    const source = pageName(from);
    const target = pageName(to);
    if (!source || !target || source === target || source === 'viewer.html' || target === 'viewer.html') return '';
    if (detailParents[target] === source) return 'forward';
    if (detailParents[source] === target) return 'back';
    return 'crossfade';
  }

  const traverseKey = 'mrc-motion-traverse';
  function takeTraversal() {
    try {
      const saved = sessionStorage.getItem(traverseKey);
      if (!saved) return '';
      sessionStorage.removeItem(traverseKey);
      const {from, to, time} = JSON.parse(saved);
      return to === location.href && Date.now() - time < 2500 ? transitionKind(from, to) : '';
    } catch {
      return '';
    }
  }

  let pressedPointer;
  const motion = matchMedia('(prefers-reduced-motion: no-preference)');
  window.addEventListener('pageswap', ({activation, viewTransition}) => {
    delete root.dataset.pageMotion;
    delete root.dataset.motionSettled;
    delete root.dataset.motionPressed;
    pressedPointer = undefined;
    if (!viewTransition) return;
    const kind = transitionKind(activation?.from?.url, activation?.entry?.url);
    if (!kind || !motion.matches) {
      viewTransition.skipTransition();
      return;
    }
    // Some history traversals lack an incoming snapshot or NavigationActivation.from.
    if (activation.navigationType === 'traverse') {
      try {
        sessionStorage.setItem(traverseKey, JSON.stringify({
          from:activation.from.url, to:activation.entry.url, time:Date.now()
        }));
      } catch { /* History still traverses without the visual fallback. */ }
    }
    // Capture one non-interactive heading. The destination's live content stays clickable.
    document.querySelector('.content h1')?.setAttribute('data-outgoing-heading', '');
  });
  function revealPage() {
    document.querySelector('[data-outgoing-heading]')?.removeAttribute('data-outgoing-heading');
    if (!motion.matches || !('onpagereveal' in window)) return;
    const activation = window.navigation?.activation;
    const traversal = takeTraversal();
    const kind = transitionKind(activation?.from?.url, activation?.entry?.url) || traversal;
    if (kind && root.dataset.pageMotion !== kind) {
      root.dataset.pageMotion = kind;
      root.dataset.motionVisited = '';
    }
  }

  // Activate from the navigation record even if pagereveal precedes this deferred script.
  window.addEventListener('pagereveal', revealPage);
  revealPage();

  const content = document.querySelector('.content');
  content?.addEventListener('animationend', ({target, animationName}) => {
    if (target === content && animationName.startsWith('portal-page-')) root.dataset.motionSettled = '';
  });

  content?.addEventListener('pointerdown', event => {
    if (!event.isPrimary) return;
    pressedPointer = event.pointerId;
    root.dataset.motionPressed = '';
  }, true);
  const resumeMotion = event => {
    if (event.pointerId !== pressedPointer) return;
    pressedPointer = undefined;
    delete root.dataset.motionPressed;
  };
  window.addEventListener('pointerup', resumeMotion, true);
  window.addEventListener('pointercancel', resumeMotion, true);
  content?.addEventListener('focusin', () => {
    if (root.dataset.pageMotion && pressedPointer === undefined) root.dataset.motionSettled = '';
  });

  // Observe just the first successful population of a result list.
  const results = document.querySelector('#list, #grid, #trend-list');
  if (results && motion.matches && typeof MutationObserver === 'function') {
    const revealFirstResults = () => {
      const cards = results.querySelectorAll('.document-entry, .website-card, .repository-card, .reading-guide, .trend-row');
      if (!cards.length && !results.querySelector('.empty, .trend-empty')) return;
      observer.disconnect();
      for (let index = 0; index < Math.min(3, cards.length); index++) {
        cards[index].classList.add('initial-result');
        cards[index].style.setProperty('--result-order', index);
      }
    };
    const observer = new MutationObserver(revealFirstResults);
    observer.observe(results, {childList:true, subtree:true});
    revealFirstResults();
  }

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
      const target = ['websites.html','repositories.html'].includes(requested) ? requested : 'documents.html';
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

  // すべてのページでナビゲーションの表示順・表記・アイコンを共通化する。
  const navigationItems = [
    { href: 'index.html', label: 'ホーム', icon: '⌂' },
    { href: 'documents.html', label: 'ドキュメント', icon: '▤' },
    { href: 'websites.html', label: 'Webサイト', icon: '◎' },
    {
      href: 'repositories.html',
      label: 'リポジトリ',
      svg: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v17H7.5A2.5 2.5 0 0 0 5 21.5z"/><path d="M5 4.5V21a2 2 0 0 0 2 2h13"/><path d="M9 7h7"/></svg>'
    },
    { href: 'collections.html', label: 'コレクション', icon: '◫' },
    { href: 'taxonomy.html', label: '分野・タグ', icon: '#' },
    { href: 'trend.html', label: 'トレンド', icon: '↗' }
  ];
  const current = location.pathname.split('/').pop() || 'index.html';
  const activePage = detailParents[current] || current;

  document.querySelectorAll('.side-nav, .mobile-nav').forEach(nav => {
    const isMobile = nav.classList.contains('mobile-nav');
    nav.setAttribute('aria-label', isMobile ? 'モバイルナビゲーション' : 'メインナビゲーション');

    // 各HTMLに残る旧表記や旧順序に依存しないよう、単一の定義から再生成する。
    nav.replaceChildren(...navigationItems.map(item => {
      const link = document.createElement('a');
      link.href = item.href;
      if (item.href === activePage) {
        link.classList.add('active');
        link.setAttribute('aria-current', 'page');
        const indicator = document.createElement('span');
        indicator.className = 'nav-indicator';
        indicator.setAttribute('aria-hidden', 'true');
        link.appendChild(indicator);
      }
      if (!isMobile) {
        const icon = document.createElement('span');
        icon.className = 'icon';
        icon.setAttribute('aria-hidden', 'true');
        if (item.svg) icon.innerHTML = item.svg; // 固定されたローカルSVGのみを使用する。
        else icon.textContent = item.icon;
        link.appendChild(icon);
      }
      link.appendChild(document.createTextNode(item.label));
      return link;
    }));
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
