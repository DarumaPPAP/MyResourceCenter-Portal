// Page rendering uses public metadata only; canonical originals remain in Drive.
window.addEventListener('DOMContentLoaded', async () => {
  const C = window.MRCCatalog;
  const page = location.pathname.split('/').pop() || 'index.html';
  const el = id => document.getElementById(id);
  const fill = (control, values) => [...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b)).forEach(value => {
    const option = document.createElement('option'); option.value = value; option.textContent = value; control.appendChild(option);
  });
  const bindFilters = (controls, render) => {
    controls.forEach(control => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change', render));
    el('clear').addEventListener('click', () => {controls.forEach(control => control.value = ''); render();});
    C.bindFilterState(controls, render); render();
  };
  const resourceLink = (resource, websiteIds) => {
    const href = C.resourceHref(resource, websiteIds);
    return href ? `<a href="${C.escapeHtml(href)}"${href.startsWith('http') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${C.escapeHtml(resource.title)}</a>` : C.escapeHtml(resource.title);
  };
  try {
    if (page === 'documents.html') {
      const data = await C.loadMany('document-presentation','resources','taxonomy');
      const rows = C.presentDocuments(data['document-presentation'],C.byId(data.resources),data.taxonomy);
      fill(el('category'),rows.flatMap(row=>row.categories)); fill(el('tag'),rows.flatMap(row=>row.tags));
      fill(el('format'),rows.map(row=>row.sourceFormat).filter(format=>!['PDF','PPTX'].includes(format)));
      C.bindThumbnailFallback(el('list'));
      const controls = ['q','category','format','tag'].map(el);
      const PAGE_SIZE = 20;
      const writePage = (page,method) => {
        const url = new URL(location.href);
        if (page > 1) url.searchParams.set('page',String(page));
        else url.searchParams.delete('page');
        if (url.href !== location.href) history[method](null,'',url);
      };
      const resolvePage = totalPages => {
        const raw = new URL(location.href).searchParams.get('page');
        let requested = 1;
        if (raw !== null && /^\d+$/.test(raw)) {
          const parsed = Number(raw);
          if (Number.isSafeInteger(parsed) && parsed > 0) requested = parsed;
        }
        const page = Math.min(requested,Math.max(totalPages,1));
        const canonical = page > 1 ? String(page) : null;
        if (raw !== canonical) writePage(page,'replaceState');
        return page;
      };
      const pageNumbers = (totalPages,page) => {
        if (totalPages <= 7) return Array.from({length:totalPages},(_,index)=>index+1);
        if (page <= 4) return [1,2,3,4,5,'…',totalPages];
        if (page >= totalPages-3) return [1,'…',totalPages-4,totalPages-3,totalPages-2,totalPages-1,totalPages];
        return [1,'…',page-1,page,page+1,'…',totalPages];
      };
      const pageHref = page => {
        const url = new URL(location.href);
        if (page > 1) url.searchParams.set('page',String(page));
        else url.searchParams.delete('page');
        return `${url.pathname}${url.search}${url.hash}`;
      };
      const renderPagination = (page,totalPages) => {
        const pagination = el('pagination');
        if (totalPages <= 1) { pagination.hidden = true; pagination.innerHTML = ''; return; }
        const pageLink = (target,label,current=false) => `<a class="document-page-link document-page-number${current?' document-page-current':''}" href="${C.escapeHtml(pageHref(target))}" data-page="${target}" aria-label="${target}ページ目"${current?' aria-current="page"':''}>${label}</a>`;
        const edgeLink = (target,label,disabled,ariaLabel) => disabled
          ? `<span class="document-page-link document-page-disabled" aria-disabled="true">${label}</span>`
          : `<a class="document-page-link" href="${C.escapeHtml(pageHref(target))}" data-page="${target}" aria-label="${ariaLabel}">${label}</a>`;
        const numbers = pageNumbers(totalPages,page).map(item => item === '…'
          ? '<li><span class="document-page-ellipsis" aria-hidden="true">…</span></li>'
          : `<li>${pageLink(item,item,item===page)}</li>`).join('');
        pagination.innerHTML = `<ul class="document-pagination-list"><li>${edgeLink(page-1,'前へ',page===1,'前のページ')}</li>${numbers}<li>${edgeLink(page+1,'次へ',page===totalPages,'次のページ')}</li></ul>`;
        pagination.hidden = false;
      };
      const render = ({focus=false}={}) => {
        const filtered = C.filterDocuments(rows,Object.fromEntries(controls.map(control=>[control.id,control.value])));
        const totalPages = Math.ceil(filtered.length/PAGE_SIZE);
        const page = resolvePage(totalPages);
        const start = filtered.length ? (page-1)*PAGE_SIZE : 0;
        const end = Math.min(start+PAGE_SIZE,filtered.length);
        const visible = filtered.slice(start,end);
        el('count').textContent = filtered.length
          ? `${start+1}–${end} 件目 / ${filtered.length} 件（全 ${rows.length} 件）`
          : `0 件 / 全 ${rows.length} 件`;
        el('list').innerHTML = visible.map(doc => {
          const viewer = C.viewerHref(doc);
          const href = viewer || `document.html?id=${encodeURIComponent(doc.resourceId)}`;
          const category = doc.categories[0] || doc.tags[0] || (doc.sourceFormat === 'UNKNOWN' ? 'Document' : doc.sourceFormat) || 'Document';
          const variants = ['cyan','blue','purple','pink','yellow','green'];
          const variantIndex = Array.from(category).reduce((sum, character) => sum + character.codePointAt(0), 0) % variants.length;
          const categoryBadge = category ? `<span class="document-category document-category--${variants[variantIndex]}">${C.escapeHtml(category)}</span>` : '';
          const metadata = [doc.sourceFormat === 'UNKNOWN' ? '形式未確認' : doc.sourceFormat, doc.engine].filter(Boolean).map(C.escapeHtml).join(' · ');
          return `<article class="document-entry">
            <div class="document-window-chrome" aria-hidden="true"><span></span><span></span><span></span></div>
            <div class="document-card-body">
              <div class="document-category-row">${categoryBadge}</div>
              <a class="thumbnail-link" aria-label="${C.escapeHtml(doc.title)}を読む" href="${C.escapeHtml(href)}">${C.documentThumbnail(doc)}</a>
              <div class="document-copy">
                <h2><a class="document-title" href="${C.escapeHtml(href)}">${C.escapeHtml(doc.title)}</a></h2>
                <div class="document-meta">${metadata}</div>
                <div class="tag-cloud">${C.chips(doc.tags.slice(0,6))}</div>
                <a class="document-detail" href="document.html?id=${encodeURIComponent(doc.resourceId)}">資料情報・関連資料 →</a>
              </div>
            </div>
          </article>`;
        }).join('') || '<div class="empty">条件に一致する資料がありません。<br><button type="button" class="icon-button" data-reset-filters>条件をリセット</button></div>';
        renderPagination(page,totalPages);
        if (focus) {
          el('result-meta').scrollIntoView({block:'start'});
          el('list').querySelector('.document-title')?.focus({preventScroll:true});
        }
      };
      C.bindFilterState(controls,render,{clearParams:['page']});
      controls.forEach(control => control.addEventListener(control.tagName === 'INPUT' ? 'input' : 'change',render));
      el('clear').addEventListener('click',() => {
        controls.forEach(control => { control.value = ''; });
        const url = new URL(location.href);
        controls.forEach(control => url.searchParams.delete(control.id));
        url.searchParams.delete('page');
        if (url.href !== location.href) history.replaceState(null,'',url);
        render();
        controls[0]?.focus();
      });
      el('pagination').addEventListener('click',event => {
        const link = event.target.closest('a[data-page]');
        if (!link || !el('pagination').contains(link) || event.button !== 0 || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        const page = Number(link.dataset.page);
        const current = Number(new URL(location.href).searchParams.get('page') || '1');
        if (!Number.isSafeInteger(page) || page < 1 || page === current) return;
        writePage(page,'pushState');
        render({focus:true});
      });
      render();
    } else if (page === 'collections.html') {
      const {collections, resources} = await C.loadMany('collections','resources');
      const byId = C.byId(resources);
      bindFilters([el('q')], () => {
        const q = el('q').value.trim().toLowerCase();
        const rows = C.sortCollections(collections).filter(col=>[col.title,col.description,col.category,...col.topics].join(' ').toLowerCase().includes(q));
        el('count').textContent = `${rows.length} / ${collections.length} Collections`;
        const groups = new Map(); rows.forEach(col=>{const category=col.category || 'Other';if(!groups.has(category))groups.set(category,[]);groups.get(category).push(col);});
        el('grid').innerHTML = [...groups].map(([category,cols])=>`<section class="collection-group"><h2 class="group-title">${C.escapeHtml(category)}</h2><div class="reading-guides">${cols.map(col=>{
          const preview = C.readingPreview(col);
          return `<a class="reading-guide" href="collection.html?id=${encodeURIComponent(col.id)}"><h3>${C.escapeHtml(col.title)}</h3><p>${C.escapeHtml(col.description)}</p>${preview.steps.length ? `<ol class="path-preview">${preview.steps.map((step,i)=>`<li><span class="path-number">${String(i+1).padStart(2,'0')}</span><div><strong>${C.escapeHtml(C.roleLabel(step.role))}</strong><span>${C.escapeHtml(byId.get(step.id)?.title || '資料')}</span></div></li>`).join('')}</ol>${preview.more ? `<div class="path-more">+${preview.more} more</div>` : ''}` : '<div class="path-pending"><strong>準備中</strong><span>Resources are being curated.</span></div>'}</a>`;
        }).join('')}</div></section>`).join('') || '<div class="empty">条件に一致するCollectionはありません。<button class="icon-button" data-reset-filters>条件をリセット</button></div>';
      });
    } else if (page === 'collection.html') {
      const {collections, resources, websites} = await C.loadMany('collections','resources','websites');
      const col = collections.find(col=>col.id===C.query('id'));
      if (!col) { el('content').innerHTML = '<div class="empty">Collectionが見つかりません。<a href="collections.html">一覧へ戻る</a></div>';return; }
      document.title = `${col.title} | MyResourceCenter`;
      const byId=C.byId(resources), websiteIds=new Set(websites.map(row=>row.id));
      el('content').innerHTML = `<section class="detail-hero"><div class="eyebrow">${C.escapeHtml(col.category)} / Reading Path</div><h1>${C.escapeHtml(col.title)}</h1><p>${C.escapeHtml(col.description)}</p><div class="detail-actions"><a href="collections.html">← Collection一覧</a></div></section><section class="detail-section"><h2>読む順番</h2><ol class="reading-path">${col.resources.map((member,i)=>{const resource=byId.get(member.id);return `<li><span class="reading-order">${String(i+1).padStart(2,'0')}</span><div><div class="document-meta">${C.escapeHtml(C.roleLabel(member.role))}</div>${resource ? resourceLink(resource,websiteIds) : '資料を確認中'}</div></li>`;}).join('')}</ol>${col.resources.length?'':'<div class="path-pending"><strong>準備中</strong><span>Resources are being curated.</span></div>'}</section><section class="detail-section"><h2>Topics</h2><div class="tag-cloud">${C.chips(col.topics)}</div></section>`;
    } else if (page === 'document.html') {
      const data = await C.loadMany('document-presentation','resources','websites','collections','relations');
      const doc = data['document-presentation'].find(row=>row.resourceId===C.query('id') || row.documentId===C.query('id'));
      if (!doc) {el('content').innerHTML='<div class="empty">資料が見つかりません。<a href="documents.html">一覧へ戻る</a></div>';return;}
      document.title = `${doc.title} | MyResourceCenter`;
      const byId=C.byId(data.resources), websiteIds=new Set(data.websites.map(row=>row.id));
      const collections=C.collectionEntries(doc.resourceId,data.collections), relations=C.relationEntries(doc.resourceId,data.relations,byId);
      el('content').innerHTML = `<div class="detail-shell"><div class="detail-main"><section class="detail-hero"><div class="eyebrow">Document</div><h1>${C.escapeHtml(doc.title)}</h1><div class="detail-actions"><a class="primary-button" href="${C.escapeHtml(C.viewerHref(doc))}">ブラウザで読む</a>${C.externalLink(doc.canonicalUrl,'Google Drive Original')}<a href="documents.html">← 一覧へ</a></div></section><section class="detail-section">${C.documentThumbnail(doc)}<dl class="detail-grid"><div><dt>Format</dt><dd>${C.escapeHtml(doc.sourceFormat)}</dd></div><div><dt>Engine</dt><dd>${C.escapeHtml(doc.engine)}</dd></div><div><dt>Level</dt><dd>${C.escapeHtml(doc.level)}</dd></div></dl></section><section class="detail-section"><h2>Tags</h2><div class="tag-cloud">${doc.tags.map(tag=>`<a class="tag" href="documents.html?tag=${encodeURIComponent(tag)}">${C.escapeHtml(tag)}</a>`).join('') || 'タグなし'}</div></section></div><aside class="detail-side"><section class="detail-section"><h2>Collections</h2>${collections.map(({collection,member})=>`<p><a href="collection.html?id=${encodeURIComponent(collection.id)}">${C.escapeHtml(collection.title)}</a><small class="document-meta"> · ${C.escapeHtml(C.roleLabel(member.role))}</small></p>`).join('') || '<p class="document-meta">Collectionを準備中</p>'}</section><section class="detail-section"><h2>関連資料</h2>${relations.map(entry=>`<p>${entry.resource ? resourceLink(entry.resource,websiteIds) : '資料'}<small class="document-meta"> · ${C.escapeHtml(C.relationLabel(entry.edge.relation))}</small></p>`).join('') || '<p class="document-meta">関連資料なし</p>'}</section></aside></div>`;
      C.bindThumbnailFallback(el('content'));
    } else if (page === 'index.html') {
      const data = await C.loadMany('document-presentation','resources','collections');
      const byId = C.byId(data.resources);
      // Feature available page previews without inventing publication dates.
      const docs = data['document-presentation'].filter(doc=>doc.thumbnail).slice(0,4);
      el('docs').innerHTML = docs.map(doc => {
        const href = C.viewerHref(doc) || `document.html?id=${encodeURIComponent(doc.resourceId)}`;
        return `<article class="document-entry"><a class="thumbnail-link" aria-label="${C.escapeHtml(doc.title)}を読む" href="${C.escapeHtml(href)}">${C.documentThumbnail(doc)}</a><div class="document-copy"><h3><a href="${C.escapeHtml(href)}">${C.escapeHtml(doc.title)}</a></h3><div class="document-meta">${C.escapeHtml(doc.sourceFormat === 'UNKNOWN' ? '形式未確認' : doc.sourceFormat)} · ${C.escapeHtml(doc.engine || 'General')}</div><div class="tag-cloud">${C.chips(doc.tags.slice(0,3))}</div><a class="document-detail" href="document.html?id=${encodeURIComponent(doc.resourceId)}">資料情報・関連資料 →</a></div></article>`;
      }).join('') || '<p role="status">プレビュー付きの資料を準備中です。<a href="documents.html">資料一覧へ →</a></p>';
      C.bindThumbnailFallback(el('docs'));
      // Only display paths with at least two real, resolvable reading steps.
      const paths = C.sortCollections(data.collections).filter(col=>col.resources.length >= 2 && col.resources.every(step=>byId.has(step.id))).slice(0,3);
      el('collections').innerHTML = paths.map(col => {
        const preview = C.readingPreview(col);
        return `<a class="reading-guide" href="collection.html?id=${encodeURIComponent(col.id)}"><div class="eyebrow">${C.escapeHtml(col.category)}</div><h3>${C.escapeHtml(col.title)}</h3><p>${C.escapeHtml(col.description)}</p><ol class="path-preview">${preview.steps.map((step,i)=>`<li><span class="path-number">${String(i+1).padStart(2,'0')}</span><div><strong>${C.escapeHtml(C.roleLabel(step.role))}</strong><span>${C.escapeHtml(byId.get(step.id).title)}</span></div></li>`).join('')}</ol>${preview.more ? `<div class="path-more">+${preview.more} more</div>` : ''}</a>`;
      }).join('') || '<p role="status">読み順を準備中です。<a href="collections.html">コレクション一覧へ →</a></p>';
    }
  } catch (error) {
    console.error(error);
    for (const id of ['list','grid','content','docs','collections']) {const target=el(id);if(target)target.innerHTML='<div class="empty" role="alert">読み込みに失敗しました。ページを再読み込みしてください。</div>';}
    if(el('count'))el('count').textContent='読み込みに失敗しました';
  }
});
