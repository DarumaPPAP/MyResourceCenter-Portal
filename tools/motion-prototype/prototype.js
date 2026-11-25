(() => {
  const root = document.documentElement;
  const names = {a:'静止', b:'淡入', c:'方向', d:'積層', e:'現在地'};
  const params = new URLSearchParams(location.search);
  const variant = params.get('motion') || sessionStorage.getItem('prototype-motion') || 'e';
  root.dataset.prototype = Object.hasOwn(names, variant) ? variant : 'e';
  sessionStorage.setItem('prototype-motion', root.dataset.prototype);
  if (params.has('slow')) sessionStorage.setItem('prototype-speed', params.get('slow') === '1' ? '4' : '1');
  root.style.setProperty('--proto-speed', sessionStorage.getItem('prototype-speed') || '1');

  const parents = {document:'documents', website:'websites', collection:'collections', repository:'repositories'};
  const route = url => url && new URL(url).pathname.split('/').pop().replace(/\.html$/, '');
  function directionFor(activation) {
    const from = route(activation?.from?.url);
    const to = route(activation?.entry?.url);
    if (!from || !to || from === to || activation.navigationType !== 'push') return '';
    return parents[to] === from ? 'forward' : parents[from] === to ? 'back' : 'peer';
  }
  window.addEventListener('pageswap', ({activation}) => {
    const direction = directionFor(activation);
    if (direction) root.dataset.prototypeLeave = direction;
  });
  window.addEventListener('pagereveal', event => {
    delete root.dataset.prototypeLeave;
    const direction = directionFor(window.navigation?.activation);
    if (direction) root.dataset.prototypeRoute = direction;
    if (!direction || ['a','b','c'].includes(root.dataset.prototype)) event.viewTransition?.skipTransition();
  });

  document.addEventListener('DOMContentLoaded', () => {
    // The picker sits outside the recorded surface. Use controls=0 for timings.
    if (params.get('controls') === '0') sessionStorage.setItem('prototype-controls', '0');
    if (params.get('controls') === '1') sessionStorage.removeItem('prototype-controls');
    if (sessionStorage.getItem('prototype-controls') === '0') return;

    const picker = document.createElement('nav');
    picker.className = 'proto-picker';
    picker.setAttribute('aria-label', 'Prototype variants');
    picker.innerHTML = '<span class="proto-picker-highlight" aria-hidden="true"></span>' +
      Object.entries(names).map(([key, name]) => '<button class="proto-picker-item" data-variant="' +
        key + '" aria-label="' + key.toUpperCase() + ' ' + name + '">' + name + '</button>').join('') +
      '<span class="proto-picker-divider" aria-hidden="true"></span><button class="proto-picker-item proto-picker-replay" aria-label="Replay the last transition (R)">↻</button>';
    const highlight = picker.firstElementChild;
    const buttons = [...picker.querySelectorAll('[data-variant]')];
    const select = button => {
      const value = button.dataset.variant;
      root.dataset.prototype = value;
      delete root.dataset.prototypeRoute;
      sessionStorage.setItem('prototype-motion', value);
      for (const item of buttons) {
        item.toggleAttribute('data-active', item === button);
        if (item === button) item.setAttribute('aria-current', 'true');
        else item.removeAttribute('aria-current');
      }
      highlight.style.transform = 'translateX(' + button.offsetLeft + 'px)';
      highlight.style.width = button.offsetWidth + 'px';
    };
    const replay = () => {
      const current = new URL(location.href);
      const referrer = document.referrer && new URL(document.referrer);
      if (referrer?.origin !== current.origin || referrer.pathname === current.pathname) return;
      sessionStorage.setItem('prototype-replay', current.href);
      location.href = referrer.href;
    };
    const pending = sessionStorage.getItem('prototype-replay');
    if (pending) {
      sessionStorage.removeItem('prototype-replay');
      window.addEventListener('load', () => location.assign(pending), {once:true});
    }
    document.body.append(picker);
    select(buttons.find(button => button.dataset.variant === root.dataset.prototype));
    for (const button of buttons) button.addEventListener('click', () => select(button));
    picker.querySelector('.proto-picker-replay').addEventListener('click', replay);
    window.addEventListener('keydown', event => {
      if (event.key.toLowerCase() === 'r' && !event.target.closest('input, select, textarea, [contenteditable]')) replay();
    });
    requestAnimationFrame(() => requestAnimationFrame(() => { picker.dataset.ready = ''; }));
  });
})();
