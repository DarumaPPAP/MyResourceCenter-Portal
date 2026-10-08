/* Repository presentation consumes only the derived public projection. */
(() => {
  function repositoryIdentity(value) {
    if (typeof value !== 'string' || /[\s\x00-\x20\x7f\\]/.test(value) || !/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9_.-]+$/i.test(value)) return null;
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:' || url.hostname !== 'github.com' || url.username || url.password || url.port || url.search || url.hash || /^https:\/\/github\.com:/i.test(value)) return null;
      const match = url.pathname.match(/^\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?)\/([A-Za-z0-9_.-]{1,100})$/);
      if (!match || match[1].includes('--') || ['.','..'].includes(match[2]) || match[2].endsWith('.git') || value.includes('/../') || value.endsWith('/..')) return null;
      return {url:`https://github.com/${match[1]}/${match[2]}`,path:`${match[1]} / ${match[2]}`,searchPath:`${match[1]}/${match[2]}`};
    } catch { return null; }
  }
  function filterRepositories(rows,{q='',tag=''}={}) {
    const term=q.trim().toLowerCase();
    return rows.filter(row => {
      const identity=repositoryIdentity(row.canonicalUrl);
      return row.kind==='repository' && identity && (!tag || (row.tags || []).includes(tag)) &&
        (!term || [row.title,identity.path,identity.searchPath,row.summary,...(row.topics || []),...(row.tags || [])].join(' ').toLowerCase().includes(term));
    });
  }
  const glyph='<svg class="repository-glyph" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m7 7-5 5 5 5m10-10 5 5-5 5M14 4l-4 16"/></svg>';
  function renderCard(row,C) {
    const identity=repositoryIdentity(row.canonicalUrl);if(!identity)return '';
    const e=C.escapeHtml;
    return `<article class="repository-card">
      <a class="repository-card-link" href="${e(identity.url)}" target="_blank" rel="noopener noreferrer" aria-label="${e(row.title)} — GitHubでRepositoryを開く（新しいタブ）"></a>
      ${glyph}<div class="repository-copy"><div class="repository-head"><span class="repository-path">${e(identity.path)}</span><a class="repository-details" href="repository.html?id=${encodeURIComponent(row.id)}">詳細 <span class="sr-only">${e(row.title)}</span> →</a></div>
      <h2>${e(row.title)}</h2>${row.summary?`<p class="repository-summary">${e(row.summary)}</p>`:''}
      ${row.topics?.length?`<p class="repository-topics">${row.topics.map(e).join(' · ')}</p>`:''}
      <div class="repository-bottom"><div class="tag-cloud">${C.chips(row.tags)}</div><span class="repository-open" aria-hidden="true">GitHubで開く ↗</span></div></div></article>`;
  }
  function renderDetail(row,data,C) {
    const identity=repositoryIdentity(row.canonicalUrl);if(!identity)return '<div class="empty">Repository URLを確認できません。</div>';
    const e=C.escapeHtml,byId=C.byId(data.resources),memberships=C.collectionEntries(row.id,data.collections),related=C.relationEntries(row.id,data.relations,byId);
    const link=resource=>{const href=C.resourceHref(resource);return href?`<a href="${e(href)}">${e(resource.title)}</a>`:e(resource.title);};
    return `<div class="detail-shell"><div class="detail-main"><section class="detail-hero"><div class="eyebrow">IMPLEMENTATION REFERENCE</div><h1>${e(row.title)}</h1><p class="repository-path">${e(identity.path)}</p>${row.summary?`<p>${e(row.summary)}</p>`:''}<div class="detail-actions">${C.externalLink(identity.url,'GitHubでRepositoryを開く')}<a href="repositories.html">← リポジトリ一覧</a></div></section>
      ${row.topics?.length?`<section class="detail-section"><h2>Topics</h2><p class="repository-topics">${row.topics.map(e).join(' · ')}</p></section>`:''}
      <section class="detail-section"><h2>Tags</h2><div class="tag-cloud">${(row.tags || []).map(tag=>`<a class="tag" href="repositories.html?tag=${encodeURIComponent(tag)}">${e(tag)}</a>`).join('') || 'タグなし'}</div></section>
      <section class="detail-section"><h2>Resource 状態</h2><dl class="detail-grid">${[['reviewState','Review'],['useState','Use'],['confidence','Confidence'],['freshness','Freshness']].map(([key,label])=>`<div><dt>${label}</dt><dd>${e(row[key] || '—')}</dd></div>`).join('')}</dl></section></div>
      <aside class="detail-side"><section class="detail-section"><h2>Collections</h2>${memberships.map(({collection,member})=>`<p><a href="collection.html?id=${encodeURIComponent(collection.id)}">${e(collection.title)}</a><small> · ${e(C.roleLabel(member.role))}</small></p>`).join('') || '<p>Collection未所属です。</p>'}</section>
      <section class="detail-section"><h2>関連資料</h2>${related.filter(entry=>entry.resource).map(entry=>`<p>${link(entry.resource)}<small> · ${e(C.relationLabel(entry.edge.relation))}</small></p>`).join('') || '<p>関連資料なし</p>'}</section></aside></div>`;
  }
  window.MRCRepositories={repositoryIdentity,filterRepositories,renderCard,renderDetail};
  window.addEventListener('DOMContentLoaded',async()=>{
    const page=location.pathname.split('/').pop();if(!['repositories.html','repository.html'].includes(page))return;
    const C=window.MRCCatalog,el=id=>document.getElementById(id);
    try {
      if(page==='repository.html') {
        const data=await C.loadMany('repositories','resources','collections','relations');
        const row=data.repositories.find(row=>row.kind==='repository' && row.id===C.query('id'));
        if(!row){el('content').innerHTML='<div class="empty">リポジトリが見つかりません。<a href="repositories.html">一覧へ戻る</a></div>';return;}
        document.title=`${row.title} | MyResourceCenter`;
        el('content').innerHTML=renderDetail(row,data,C);return;
      }
      const data=await C.loadMany('repositories','taxonomy');
      const rows=filterRepositories(data.repositories),controls=[el('q'),el('tag')],PAGE_SIZE=20;
      const used=new Set(rows.flatMap(row=>row.tags || []));
      Object.keys(data.taxonomy.tags || {}).filter(tag=>used.has(tag)).sort().forEach(tag=>{const option=document.createElement('option');option.value=tag;option.textContent=tag;el('tag').appendChild(option);});
      const writePage=(page,method)=>{const url=new URL(location.href);if(page>1)url.searchParams.set('page',String(page));else url.searchParams.delete('page');if(url.href!==location.href)history[method](null,'',url);};
      const render=()=>{
        const filtered=filterRepositories(rows,{q:el('q').value,tag:el('tag').value});
        const totalPages=Math.ceil(filtered.length/PAGE_SIZE),raw=new URL(location.href).searchParams.get('page');
        const requested=raw && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw))?Math.max(1,Number(raw)):1;
        const page=Math.min(requested,Math.max(1,totalPages));writePage(page,'replaceState');
        const start=(page-1)*PAGE_SIZE,end=Math.min(start+PAGE_SIZE,filtered.length);
        el('count').textContent=filtered.length?`${start+1}–${end} 件目 / ${filtered.length} 件（全 ${rows.length} 件）`:`0 件 / 全 ${rows.length} 件`;
        el('list').innerHTML=filtered.slice(start,end).map(row=>renderCard(row,C)).join('') || '<div class="empty">条件に一致するリポジトリがありません。<br><button type="button" class="icon-button" data-reset-filters>条件をリセット</button></div>';
        const pageLink=(target,label)=>{const url=new URL(location.href);if(target>1)url.searchParams.set('page',String(target));else url.searchParams.delete('page');return `<a class="repository-page-link" href="${C.escapeHtml(url.pathname+url.search)}" data-page="${target}"${target===page?' aria-current="page"':''}>${label}</a>`;};
        const pages=[...new Set([1,page-1,page,page+1,totalPages].filter(value=>value>=1 && value<=totalPages))].sort((a,b)=>a-b);
        el('pagination').hidden=totalPages<=1;
        el('pagination').innerHTML=totalPages>1?`${page>1?pageLink(page-1,'前へ'):''}${pages.map(value=>pageLink(value,String(value))).join('')}${page<totalPages?pageLink(page+1,'次へ'):''}`:'';
      };
      // Clear visible values before the shared filter-state handler persists them.
      el('clear').addEventListener('click',()=>{controls.forEach(control=>control.value='');writePage(1,'replaceState');});
      C.bindFilterState(controls,render,{clearParams:['page']});
      controls.forEach(control=>control.addEventListener(control.tagName==='INPUT'?'input':'change',render));
      el('clear').addEventListener('click',render);
      el('pagination').addEventListener('click',event=>{
        const anchor=event.target.closest('a[data-page]');
        if(!anchor || event.button!==0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey)return;
        event.preventDefault();writePage(Number(anchor.dataset.page),'pushState');render();
        el('result-meta').scrollIntoView({block:'start'});el('list').querySelector('.repository-card-link')?.focus({preventScroll:true});
      });
      render();
    } catch(error) {
      console.error(error);const target=el('content') || el('list');target.innerHTML='<div class="empty" role="alert">Repository Catalogの読み込みに失敗しました。</div>';
      if(el('count'))el('count').textContent='読み込みに失敗しました';
    }
  });
})();
