(() => {
  const CATEGORY_LABELS = {
    Game: '🎮 Game',
    Graphics: '🎨 Graphics',
    AI: '🤖 AI',
    Engine: '🧱 Engine',
    Tools: '🛠 Tools',
    Research: '📄 Research'
  };

  const state = {
    days: [],
    activeDate: '',
    category: 'all',
    query: ''
  };

  const els = {
    search: document.querySelector('#trend-search'),
    days: document.querySelector('#trend-days'),
    filters: document.querySelector('#trend-filters'),
    count: document.querySelector('#trend-count'),
    updated: document.querySelector('#trend-updated'),
    list: document.querySelector('#trend-list')
  };

  const esc = value => String(value ?? '').replace(/[&<>'\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','\"':'&quot;'}[c]));

  function formatDate(dateText) {
    const d = new Date(`${dateText}T00:00:00+09:00`);
    if (Number.isNaN(d.getTime())) return dateText;
    return `${d.getMonth() + 1}/${d.getDate()}`;
  }

  function formatPublished(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat('ja-JP', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(d);
  }

  function renderDays() {
    if (!state.days.length) {
      els.days.innerHTML = '<button class="trend-day active" type="button" disabled>今日</button>';
      return;
    }

    els.days.innerHTML = state.days.map((day, index) => {
      const label = index === 0 ? '最新' : index === 1 ? '1日前' : '2日前';
      const active = day.date === state.activeDate ? ' active' : '';
      return `<button class="trend-day${active}" type="button" data-trend-date="${esc(day.date)}">${label} <span>${esc(formatDate(day.date))}</span></button>`;
    }).join('');

    els.days.querySelectorAll('[data-trend-date]').forEach(button => {
      button.addEventListener('click', () => {
        state.activeDate = button.dataset.trendDate;
        renderDays();
        renderRows();
      });
    });
  }

  function renderFilters() {
    const categories = ['all', ...Object.keys(CATEGORY_LABELS)];
    els.filters.innerHTML = categories.map(category => {
      const label = category === 'all' ? 'すべて' : CATEGORY_LABELS[category];
      const active = category === state.category ? ' active' : '';
      return `<button class="trend-filter${active}" type="button" data-trend-category="${esc(category)}">${esc(label)}</button>`;
    }).join('');

    els.filters.querySelectorAll('[data-trend-category]').forEach(button => {
      button.addEventListener('click', () => {
        state.category = button.dataset.trendCategory;
        renderFilters();
        renderRows();
      });
    });
  }

  function currentItems() {
    const day = state.days.find(x => x.date === state.activeDate);
    if (!day) return [];
    const q = state.query.toLowerCase();
    return (day.items || []).filter(item => {
      if (state.category !== 'all' && item.category !== state.category) return false;
      if (!q) return true;
      const haystack = [item.title, item.source, item.summary, ...(item.tags || [])].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }

  function renderRows() {
    const items = currentItems();
    els.count.textContent = `${items.length} 件`;

    if (!items.length) {
      els.list.innerHTML = '<div class="trend-empty">この条件のTrendはまだありません。</div>';
      return;
    }

    els.list.innerHTML = items.map((item, index) => `
      <article class="trend-row">
        <div class="trend-rank">${String(index + 1).padStart(2, '0')}</div>
        <div>
          <div class="trend-meta">
            <span class="trend-type">${esc(item.type)}</span>
            <span>${esc(CATEGORY_LABELS[item.category] || item.category)}</span>
            <span>· ${esc(item.source)}</span>
            ${item.publishedAt ? `<span>· ${esc(formatPublished(item.publishedAt))}</span>` : ''}
          </div>
          <a class="trend-title" href="${esc(item.url)}" target="_blank" rel="noreferrer">${esc(item.title)} ↗</a>
          <div class="trend-summary">${esc(item.summary)}</div>
          <div class="trend-tags">${(item.tags || []).map(tag => `<span class="trend-tag">#${esc(tag)}</span>`).join('')}</div>
        </div>
        <div class="trend-score"><small>Score</small>${esc(item.score)}</div>
      </article>
    `).join('');
  }

  function normalize(data) {
    const days = Array.isArray(data?.days) ? data.days : [];
    return days
      .filter(day => day && typeof day.date === 'string' && Array.isArray(day.items))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 3)
      .map(day => ({...day, items: day.items.slice(0, 50)}));
  }

  els.search?.addEventListener('input', () => {
    state.query = els.search.value.trim();
    renderRows();
  });

  fetch('data/trends.json', {cache:'no-store'})
    .then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })
    .then(data => {
      state.days = normalize(data);
      state.activeDate = state.days[0]?.date || '';
      els.updated.textContent = data.generatedAt ? `最終更新 ${formatPublished(data.generatedAt)} JST` : 'Trend収集待ち';
      renderDays();
      renderFilters();
      renderRows();
    })
    .catch(() => {
      els.updated.textContent = 'Trendを読み込めませんでした';
      els.list.innerHTML = '<div class="trend-empty">Trend Datasetの読み込みに失敗しました。Library本体には影響ありません。</div>';
      renderFilters();
      renderDays();
    });
})();
