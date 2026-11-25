(() => {
  const root = document.documentElement;

  const detailParents = {
    'document.html': 'documents.html',
    'website.html': 'websites.html',
    'repository.html': 'repositories.html',
    'collection.html': 'collections.html'
  };
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

  function initializeMotion() {
    let failed = false;
    let observer, outgoingContent, activeTransition, pressedPointer, releaseTimer;

    function guard(action) {
      return (...args) => {
        if (failed) return;
        try {
          action(...args);
        } catch (error) {
          failed = true;
          root.dataset.motionDisabled = '';
          delete root.dataset.pageMotion;
          delete root.dataset.motionSettled;
          delete root.dataset.motionVisited;
          delete root.dataset.motionPressed;
          clearTimeout(releaseTimer);
          outgoingContent?.removeAttribute('data-outgoing-content');
          try { activeTransition?.skipTransition(); } catch { /* Native transition already ended. */ }
          try { observer?.disconnect(); } catch { /* The observer may be the failing API. */ }
          try { args[0]?.viewTransition?.skipTransition(); } catch { /* CSS falls back to the live page. */ }
          console.warn('Portal motion could not run', error);
        }
      };
    }

    function listen(target, type, handler, capture = false) {
      target?.addEventListener(type, guard(handler), capture);
    }

    function startMotion() {
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

      function releasePointer() {
        pressedPointer = undefined;
        clearTimeout(releaseTimer);
        releaseTimer = undefined;
        delete root.dataset.motionPressed;
      }
      const motion = matchMedia('(prefers-reduced-motion: no-preference)');
      listen(window, 'pageswap', ({activation, viewTransition}) => {
        delete root.dataset.pageMotion;
        delete root.dataset.motionSettled;
        if (pressedPointer !== undefined) releasePointer();
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
        // Do not cover a sticky header or a restored scroll position with a stale view.
        // The old surface is clipped to at most one viewport of visible content.
        if (window.scrollY <= 1) {
          outgoingContent = document.querySelector('.content');
          outgoingContent?.setAttribute('data-outgoing-content', '');
        }
      });
      function finishSurface() {
        if (root.dataset.pageMotion) root.dataset.motionSettled = '';
      }
      function skipSurface() {
        if (activeTransition) {
          activeTransition.skipTransition();
          activeTransition = null;
        }
        finishSurface();
      }
      function revealPage(event) {
        outgoingContent?.removeAttribute('data-outgoing-content');
        outgoingContent = null;
        if (!motion.matches || !('onpagereveal' in window)) return;
        const activation = window.navigation?.activation;
        const traversal = takeTraversal();
        const kind = transitionKind(activation?.from?.url, activation?.entry?.url) || traversal || root.dataset.pageMotion;
        if (kind && root.dataset.pageMotion !== kind) {
          root.dataset.pageMotion = kind;
          root.dataset.motionVisited = '';
        }
        if (!event) return;
        activeTransition = event.viewTransition || null;
        if (!activeTransition) {
          finishSurface();
          return;
        }
        const current = activeTransition;
        current.finished.then(guard(() => {
          if (activeTransition === current) {
            activeTransition = null;
            finishSurface();
          }
        }), guard(() => {
          if (activeTransition === current) {
            activeTransition = null;
            finishSurface();
          }
        }));
        // Restored scroll positions must never be masked by the outgoing page.
        if (!kind || window.scrollY > 1) skipSurface();
      }

      // Activate from the navigation record even if pagereveal precedes this deferred script.
      listen(window, 'pagereveal', revealPage);
      revealPage();

      // Remove the old visual immediately on real interaction, before it can
      // obscure the target. No pause, translation, or opacity on the live page.
      for (const type of ['pointerdown', 'keydown', 'focusin', 'wheel', 'scroll']) {
        listen(window, type, skipSurface, {capture:true, passive:true});
      }
      listen(motion, 'change', () => { if (!motion.matches) skipSurface(); });

      const content = document.querySelector('.content');
      listen(content, 'pointerdown', event => {
        if (!motion.matches || !event.isPrimary) return;
        if (!event.target.closest('.initial-result, #list.page-arriving > article')) return;
        clearTimeout(releaseTimer);
        releaseTimer = undefined;
        pressedPointer = event.pointerId;
        root.dataset.motionPressed = '';
      }, true);
      listen(window, 'pointerup', event => {
        if (event.pointerId !== pressedPointer) return;
        // Touch sends its compatibility mouse/focus events after pointerup.
        // A canceled gesture can omit click, so also release after a bounded delay.
        releaseTimer = setTimeout(guard(releasePointer), 350);
      }, true);
      listen(window, 'pointercancel', event => {
        if (event.pointerId === pressedPointer) releasePointer();
      }, true);
      listen(window, 'click', () => {
        if (releaseTimer !== undefined) releasePointer();
      });
      listen(window, 'blur', () => {
        if (pressedPointer !== undefined) releasePointer();
      });
      // Observe just the first successful population of a result list.
      const results = document.querySelector('#list, #grid, #trend-list');
      if (results && motion.matches && typeof MutationObserver === 'function') {
        const revealFirstResults = () => {
          const cards = results.querySelectorAll('.document-entry, .website-card, .repository-card, .reading-guide, .trend-row');
          if (!cards.length && !results.querySelector('.empty, .trend-empty:not([data-motion-loading])')) return;
          observer.disconnect();
          for (let index = 0; index < Math.min(3, cards.length); index++) {
            cards[index].classList.add('initial-result');
            cards[index].style.setProperty('--result-order', index);
          }
        };
        observer = new MutationObserver(guard(revealFirstResults));
        observer.observe(results, {childList:true, subtree:true});
        revealFirstResults();
      }
    }

    guard(startMotion)();
  }

  initializeMotion();
})();
