// Pure presentation behavior checks; no browser or dependency required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { URL, URLSearchParams, window: {} };

const trendHtml = fs.readFileSync(path.join(__dirname, '../trend.html'), 'utf8');
const portalShell = fs.readFileSync(path.join(__dirname, '../assets/portal.js'), 'utf8');
assert.match(trendHtml, /<html lang="ja" data-theme="light">/, 'Trend starts with the shared light theme default');
assert.match(trendHtml, /<script defer src="assets\/portal\.js"><\/script>/, 'Trend loads the shared shell script');
assert.match(trendHtml, /data-theme-toggle/, 'Trend exposes the shared theme toggle');
assert.match(portalShell, /document\.addEventListener\('click'/, 'the shared shell handles document-level controls');
assert.match(portalShell, /href: 'taxonomy\.html'/, 'the shared shell supplies taxonomy navigation');
assert.doesNotMatch(trendHtml, /index\.html#tags/, 'Trend has no stale Home fragment navigation');
assert.match(trendHtml, /最大100件\s*\/\s*日/, 'Trend documents the validated 100-items-per-day limit');

vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/catalog.js'), 'utf8'), context);
const C = context.window.MRCCatalog;
const doc = {resourceId:'RES-1', documentId:'DOC-ABC', title:'影 & 光', sourceFormat:'PDF', thumbnail:'assets/generated/documents/DOC-ABC.png', canonicalUrl:'https://drive.google.com/file/d/abc_123-/view', tags:['Shader'], domains:['Graphics'], engine:'Unity'};
assert.equal(new URL(C.viewerHref(doc), 'https://example.test/').searchParams.get('id'), 'abc_123-');
assert.equal(new URL(C.viewerHref(doc), 'https://example.test/').searchParams.get('title'), doc.title);
for (const url of ['https://evil.test/file/d/abc/view','https://drive.google.com.evil.test/file/d/abc/view','javascript:alert(1)','https://drive.google.com/drive/folders/abc']) assert.equal(C.viewerHref({...doc,canonicalUrl:url}), '');
assert.equal(new URL(C.viewerHref({...doc,sourceFormat:'GOOGLE_SLIDES',canonicalUrl:'https://docs.google.com/presentation/d/native123/edit'}),'https://example.test/').searchParams.get('id'),'native123');
assert.equal(new URL(C.viewerHref({...doc,sourceFormat:'GOOGLE_DOC',canonicalUrl:'https://docs.google.com/document/d/native456/edit?tab=t.0'}),'https://example.test/').searchParams.get('id'),'native456');
assert.match(C.documentThumbnail(doc), /loading="lazy"/);
assert.match(C.documentThumbnail({...doc,thumbnail:'assets/generated/documents/DOC-ABC.webp'}), /DOC-ABC\.webp/);
assert.doesNotMatch(C.documentThumbnail({...doc,thumbnail:'assets/generated/documents/DOC-ABC.jpg'}), /<img/);
assert.match(C.documentThumbnail({...doc,thumbnail:null,sourceFormat:'PPTX'}), /PPTX/);
assert.doesNotMatch(C.documentThumbnail({...doc,thumbnail:'../../secret.png'}), /<img/);
const image = { hidden:false, closest:()=>({classList:{add(v){assert.equal(v,'is-missing');}}}) };
C.thumbnailFailed(image); assert.equal(image.hidden,true);
const resources = new Map([['RES-1',{id:'RES-1',topics:['Lighting']}]]);
const docs = C.presentDocuments([doc],resources);
assert.deepEqual(Array.from(docs[0].categories), ['Graphics']);
assert.equal(C.filterDocuments(docs,{q:'光',category:'Graphics',format:'PDF',tag:'Shader'}).length,1);
const legacyMissingDomains=C.presentDocuments([{...doc,domains:undefined}],resources);
assert.deepEqual(Array.from(legacyMissingDomains[0].categories),[],'Portal must not infer a Domain from tag taxonomy');
assert.equal(C.filterDocuments(legacyMissingDomains,{q:'lighting'}).length,1,'documents without a Domain remain searchable');
assert.equal(C.filterDocuments(legacyMissingDomains,{category:'Graphics'}).length,0);
const unclassifiedDocs=C.presentDocuments([{...doc,domains:[]}],resources);
assert.equal(C.filterDocuments(unclassifiedDocs,{category:'__unclassified__'}).length,1);
for (const filters of [{q:'missing'},{category:'AI'},{format:'PPTX'},{tag:'RayTracing'}]) assert.equal(C.filterDocuments(docs,filters).length,0);
assert.equal(C.filterDocuments(docs,{q:'lighting'}).length,1);
const humanPortalSource = fs.readFileSync(path.join(__dirname, '../assets/human-portal.js'), 'utf8');
assert.match(humanPortalSource, /class="document-window-chrome" aria-hidden="true"/);
assert.match(humanPortalSource, /C\.viewerHref\(doc\)/);
assert.match(humanPortalSource, /C\.documentThumbnail\(doc\)/);
assert.match(humanPortalSource, /C\.chips\(doc\.tags\.slice\(0,\s*6\)\)/);
async function renderDocumentCard(doc) {
  const elements = new Map();
  for (const id of ['q','category','format','tag','clear','list','count','result-meta','pagination']) {
    elements.set(id, {
      id,
    tagName:id === 'q' ? 'INPUT' : id === 'clear' ? 'BUTTON' : id === 'pagination' ? 'NAV' : 'SELECT',
      value:'',
      innerHTML:'',
      textContent:'',
      options:[],
      listeners:{},
      addEventListener(type,listener) { this.listeners[type] = listener; },
      appendChild(option) { this.options.push(option); },
      contains() { return true; },
      querySelector() { return null; },
      scrollIntoView() {}
    });
  }
  let onReady;
  const catalog = {
    loadMany:async () => ({'document-presentation':[doc],resources:[],taxonomy:{}}),
    presentDocuments:rows => rows.map(row => ({...row,categories:row.categories || [],tags:row.tags || []})),
    byId:() => new Map(),
    filterDocuments:rows => rows,
    viewerHref:() => '',
    documentThumbnail:() => '<div class="document-thumbnail">preview</div>',
    chips:() => '',
    escapeHtml:value => String(value).replace(/[&<>"']/g,char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])),
    bindThumbnailFallback:() => {},
    bindFilterState:(_controls,render) => render()
  };
  const context = {
    location:{pathname:'/documents.html',href:'https://portal.test/documents.html'},
    history:{replaceState(){}},
    URL,URLSearchParams,
    document:{
      getElementById:id => elements.get(id),
      createElement:() => ({})
    },
    window:{
      MRCCatalog:catalog,
      addEventListener:(type,listener) => { if (type === 'DOMContentLoaded') onReady = listener; }
    },
    console,
    encodeURIComponent
  };
  vm.runInNewContext(humanPortalSource,context);
  await onReady();
  const html = elements.get('list').innerHTML;
  const badge = html.match(/<span class="document-category document-category--[a-z]+">([^<]+)<\/span>/)?.[1] || '';
  return {badge,html};
}
Promise.resolve().then(async () => {
  const cases = [
    {name:'categories take priority',doc:{categories:['Graphics'],tags:['Shader'],sourceFormat:'PDF',engine:'General'},expected:'Graphics'},
    {name:'first tag is the fallback',doc:{categories:[],tags:['Transparency'],sourceFormat:'PDF',engine:'General'},expected:'Transparency'},
    {name:'format is the next fallback',doc:{categories:[],tags:[],sourceFormat:'PDF',engine:'General'},expected:'PDF'},
    {name:'unknown format uses Document',doc:{categories:[],tags:[],sourceFormat:'UNKNOWN',engine:'General'},expected:'Document'},
    {name:'long engine is not a badge fallback',doc:{categories:[],tags:[],sourceFormat:'UNKNOWN',engine:'Unity / Unity Recorder / After Effects'},expected:'Document'}
  ];
  for (const [index,test] of cases.entries()) {
    const rendered = await renderDocumentCard({resourceId:`RES-${index}`,title:`Case ${index}`,tags:[],...test.doc});
    assert.equal(rendered.badge,test.expected,test.name);
    if (test.doc.engine) assert.ok(rendered.html.includes(test.doc.engine),'engine remains in card metadata');
  }
  console.log('OK: document category badge priority and engine metadata across five fallback cases');
}).catch(error => { console.error(error); process.exitCode = 1; });
const cols = [{id:'B',category:'Rendering',title:'Z',resources:[1,2,3,4].map((x,i)=>({id:`RES-${x}`,role:['foundation','implementation','production-case','advanced'][i]}))},{id:'A',category:'AI',title:'Agent',resources:[]},{id:'C',category:'Rendering',title:'Alpha',resources:[]}];
assert.equal(C.sortCollections(cols).map(x=>x.id).join(','),'A,C,B');
assert.equal(cols[0].id,'B','sorting must not mutate catalog order');
const pathPreview = C.readingPreview(cols[0]);
assert.equal(pathPreview.steps.length,3); assert.equal(pathPreview.more,1);
assert.equal(pathPreview.steps[1].role,'implementation');
assert.equal(C.readingPreview(cols[1]).steps.length,0);
assert.equal(C.resourceHref({id:'RES-1',kind:'document'}),'document.html?id=RES-1');
console.log('OK: safe projection viewer navigation, thumbnail fallback, conjunctive filters, category ordering and explicit three-step reading previews');

// Python validator regressions use the real synchronized public catalog.
require('node:child_process').execFileSync('python', ['-B', '-c', String.raw`
import copy, importlib.util, tempfile, struct, zlib
from pathlib import Path
spec=importlib.util.spec_from_file_location('portal', 'tools/validate_portal.py')
v=importlib.util.module_from_spec(spec);spec.loader.exec_module(v)
bad_urls = ['https://name:password@example.test/path', 'https://name@example.test/', 'https://@example.test/', 'https://example.test:wrong/', 'https://example.test:99999/', 'https://[broken/', ' https://example.test/', 'https://example.test/a b', 'https://example.test/a\n', 'https://example.test/a\t', 'https://example.test/a\x7f', 'https://example.test/\\evil', 'https:///missing-host', 'https://example.test/\u00a0']
for url in bad_urls:
    errors=[];v.validate_public_url(errors, 'fixture.url', url)
    assert errors, 'unsafe public URL was accepted'
    assert all('password' not in error and 'name@' not in error for error in errors), 'error leaks credentials'
for url in ['https://example.test/a%20b?q=shader#GPU','http://localhost:8080/a','https://[::1]:8080/a', None]:
    errors=[];v.validate_public_url(errors, 'fixture.url', url);assert not errors, errors
# Website safety/behavior gates must run even when the taxonomy page is valid.
import contextlib, io
from unittest.mock import patch
original_read_text=Path.read_text
def broken_website_assets(path,*args,**kwargs):
    text=original_read_text(path,*args,**kwargs)
    if path == v.ROOT / 'assets/websites.js':
        for behavior in ('filterWebsites','sortWebsites','siteIconPath','bindSiteIconFallback'):
            text=text.replace(behavior,'removedBehavior')
    if path == v.ROOT / 'assets/websites.css':
        text=text.replace('width:112px;height:112px','width:80px;height:40px')
    if path == v.ROOT / 'websites.html':
        text += '<img src="https://remote.example/icon.png">'
    return text
output=io.StringIO()
with patch.object(Path,'read_text',broken_website_assets), contextlib.redirect_stdout(output):
    try:
        v.main()
    except SystemExit:
        pass
for behavior in ('filterWebsites','sortWebsites','siteIconPath','bindSiteIconFallback'):
    assert f'Websites page is missing {behavior} behavior' in output.getvalue(), behavior
assert 'Websites page must use local square Site Icons' in output.getvalue()
assert 'Websites page must not hotlink remote Site Icons' in output.getvalue()
rows=v.load('document-presentation.json')
resources=v.load('resources.json')+v.load('resources-06.json')+[v.project_resource(r) for r in v.load_latest_websites()]
taxonomy_domains=set(v.load('taxonomy.json')['domains'])
errors=[];v.validate_presentation(errors, rows, resources, taxonomy_domains);assert not errors,errors
for invalid_domains,message in ((['UnknownDomain'],'unknown canonical domain'),(['Graphics','Graphics'],'duplicate domain'),('Graphics','domains must be an array')):
    modified=copy.deepcopy(rows);modified[0]['domains']=invalid_domains
    errors=[];v.validate_presentation(errors,modified,resources,taxonomy_domains)
    assert any(message in error for error in errors),(invalid_domains,errors)
modified=copy.deepcopy(rows);modified[0]['domains']=[]
errors=[];v.validate_presentation(errors,modified,resources,taxonomy_domains);assert not errors,errors
cases=[({'driveId':'private'},'unexpected public fields'),({'thumbnail':'../../secret.png'},'invalid thumbnail asset path'),({'canonicalUrl':'https://drive.google.com.evil.test/file/d/abc/view'},'invalid/duplicate canonical'),({'sourceFormat':'EXE'},'invalid sourceFormat'),({'resourceId':'RES-MISSING'},'unresolved document Resource')]
for fields,message in cases:
    modified=copy.deepcopy(rows);modified[0].update(fields)
    errors=[];v.validate_presentation(errors,modified,resources,taxonomy_domains)
    assert any(message in error for error in errors),(fields,errors)
modified=copy.deepcopy(rows);modified[1]['documentId']=modified[0]['documentId']
errors=[];v.validate_presentation(errors,modified,resources,taxonomy_domains);assert any('duplicate documentId' in error for error in errors)
modified=copy.deepcopy(rows);modified[1]['sourceFormat']='UNKNOWN'
errors=[];v.validate_presentation(errors,modified,resources,taxonomy_domains);assert any('null thumbnail fallback' in error for error in errors)
original_load=v.load
for private in [{'canonicalRoot':{'id':'folder'}},{'sources':[{'folderId':'folder'}]},{'notes':['https://drive.google.com/drive/folders/private']}]:
    meta=original_load('original-documents.json');meta.update(private)
    v.load=lambda name:meta if name=='original-documents.json' else original_load(name)
    errors=[];v.validate_originals(errors)
    assert any('private' in error for error in errors),(private,errors)
v.load=original_load
with tempfile.TemporaryDirectory() as tmp:
    asset=Path(tmp)/'bad.png';asset.write_bytes(b'not an image')
    errors=[];v.validate_png(errors,'bad',asset);assert any('signature' in error for error in errors)
    def chunk(kind,payload):return struct.pack('>I',len(payload))+kind+payload+struct.pack('>I',zlib.crc32(kind+payload)&0xffffffff)
    asset.write_bytes(b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',0,100,8,2,0,0,0))+chunk(b'IDAT',b'x')+chunk(b'IEND',b''))
    errors=[];v.validate_png(errors,'bad',asset);assert any('dimensions' in error for error in errors)
from PIL import Image
with tempfile.TemporaryDirectory() as tmp:
    asset=Path(tmp)/'bad.webp';asset.write_bytes(b'RIFF-not-a-WebP')
    assert not v.validate_thumbnail_asset(asset)
    Image.new('RGB',(1201,800),'white').save(asset,'WEBP');assert not v.validate_thumbnail_asset(asset)
    Image.new('RGB',(1200,800),'white').save(asset,'WEBP');assert v.validate_thumbnail_asset(asset)
facets={'schemaVersion':'1.0.0','sites':[{'key':'site.test','displayName':'Example Site'}],'authors':[{'key':'ada','displayName':'Ada'}]}
facet_rows=[{'id':f'RES-{i}','url':f'https://site.test/{i}','authors':['Ada']} for i in range(4)]
errors=[];v.validate_website_facets(errors,facets,facet_rows);assert not errors,errors
errors=[];v.validate_website_facets(errors,facets,facet_rows[:3]);assert any('more than three' in error for error in errors),errors
for malformed in ['',False,0,{},[1],['']]:
    errors=[];v.validate_website_facets(errors,{'schemaVersion':'1.0.0','sites':[],'authors':[]},[{'id':'RES-bad','url':'https://site.test/a','authors':malformed}]);assert any('authors' in error for error in errors),errors
assert v.normalize_website_host('https://faß.de/article') == 'xn--fa-hia.de'
errors=[];v.validate_website_facets(errors,{'schemaVersion':'1.0.0','sites':[{'key':'site.test','displayName':'Example Site','status':'pending'}],'authors':[]},facet_rows);assert any('unexpected public fields' in error for error in errors),errors
with tempfile.TemporaryDirectory() as tmp:
    root=Path(tmp);icon=root/'assets/generated/site-icons/site.test.png';icon.parent.mkdir(parents=True);icon.write_bytes(b'not a PNG')
    errors=[];v.validate_site_icons(errors,root,facet_rows);assert any('invalid Site Icon' in error for error in errors),errors
print('OK: public validator rejects private fields/topology, invalid mappings, unsafe URLs/paths, unsupported thumbnails and malformed PNGs')
`], {cwd:path.join(__dirname,'..'),stdio:'inherit'});

// Website filtering and presentation are pure helpers shared by the page and tests.
const websitesContext = {URL, URLSearchParams, window:{}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/websites.js'), 'utf8'), websitesContext);
const W = websitesContext.window.MRCWebsites;
const facetConfig = {
  sites:[{key:'a.example',displayName:'A Site'}],
  authors:[{key:'alice',displayName:'Alice'}]
};
const websiteRows = [
  {id:'RES-1',title:'Tech A Alice',category:'Tech',canonicalUrl:'https://a.example/1',domains:['Graphics'],tags:['Unity','Shader'],authors:['Ａlice'],publishedAt:'2026-09-30'},
  {id:'RES-2',title:'Tech A Bob',category:'Tech',canonicalUrl:'https://a.example/2',tags:['Unity'],authors:['Bob'],publishedAt:'2026-09-28'},
  {id:'RES-3',title:'Idea A Alice',category:'Idea',canonicalUrl:'https://a.example/3',tags:['AI'],authors:['Alice'],publishedAt:'2026-09-29'},
  {id:'RES-4',title:'Tech B Alice',category:'Tech',canonicalUrl:'https://b.example/4',tags:['Shader','Performance'],authors:['Alice','Bob'],publishedAt:'2026-09-27'},
  {id:'RES-5',title:'Idea B',category:'Idea',canonicalUrl:'https://b.example/5',tags:[],authors:['Bob'],publishedAt:null},
  {id:'RES-6',title:'Engine only',publisher:'Example',category:'Tech',canonicalUrl:'https://c.example/6',tags:[],authors:['Carol'],engines:['Unity'],publishedAt:'2026-09-26'}
];
assert.equal(W.normalizeAuthor(' Ａlice  '), 'alice');
assert.equal(W.normalizeAuthor('ǰ'), 'j\u030c');
assert.equal(W.websiteHost('https://faß.de/article'), 'xn--fa-hia.de');
assert.equal(W.siteIconPath({canonicalUrl:'https://faß.de/article'}), 'assets/generated/site-icons/xn--fa-hia.de.png');
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{q:'graphics'},facetConfig),row=>row.id),['RES-1']);
assert.equal(W.filterWebsites(websiteRows,{tag:'Unity',site:'a.example'},facetConfig).length,2);
assert.equal(W.filterWebsites(websiteRows,{tag:'Shader',author:'alice'},facetConfig).length,2);
assert.equal(W.filterWebsites(websiteRows,{site:'a.example',author:'alice'},facetConfig).length,2);
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{tag:'Unity',site:'a.example',author:'alice'},facetConfig),row=>row.id),['RES-1']);
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{category:'Tech',tag:'Unity',site:'a.example',author:'alice'},facetConfig),row=>row.id),['RES-1']);
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{category:'Idea',tag:'AI',site:'a.example',author:'alice'},facetConfig),row=>row.id),['RES-3']);
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{q:'Unity'},facetConfig),row=>row.id),['RES-1','RES-2','RES-6'],'website search includes engine metadata');
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{category:'Tech',tag:'AI'},facetConfig),row=>row.id),[]);
assert.equal(W.filterWebsites(websiteRows,{site:'b.example'},facetConfig).length,0,'unapproved Site query values must not expose dedicated filter results');
assert.equal(W.filterWebsites(websiteRows,{author:'bob'},facetConfig).length,0,'unapproved Author query values must not expose dedicated filter results');
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{site:'__other__'},facetConfig),row=>row.id),['RES-4','RES-5','RES-6']);
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{author:'__other__'},facetConfig),row=>row.id),['RES-2','RES-5','RES-6']);
assert.equal(W.presentWebsites(websiteRows,facetConfig).find(row=>row.id==='RES-4').hasOtherAuthor,false,'an article with any approved Author must not also match Author Other');
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{tag:'InventedTag'},facetConfig),row=>row.id),[]);
const websiteCard = W.renderWebsiteCard({...websiteRows[0],publisher:'Example Site',contentType:'technical-article'}, C);
assert.match(websiteCard,/Unity/); assert.match(websiteCard,/Shader/);
assert.match(websiteCard,/website-category--tech/);
assert.match(websiteCard,/>Tech<\/span>/);
assert.doesNotMatch(websiteCard,/technical-article/,'contentType must not be rendered as Website classification');
assert.deepEqual(Array.from(W.sortWebsites(websiteRows,'desc'),row=>row.id),['RES-1','RES-3','RES-2','RES-4','RES-6','RES-5']);
assert.deepEqual(Array.from(W.sortWebsites(websiteRows,'asc'),row=>row.id),['RES-6','RES-4','RES-2','RES-3','RES-1','RES-5']);
assert.equal(W.siteIconPath(websiteRows[0]),'assets/generated/site-icons/a.example.png');
assert.notEqual(W.siteIconPath({...websiteRows[0],canonicalUrl:'https://[2001:db8::1]/'}),W.siteIconPath({...websiteRows[0],canonicalUrl:'https://[200:1db8::1]/'}));
assert.notEqual(W.siteIconPath({...websiteRows[0],canonicalUrl:'https://[a::b]/'}),W.siteIconPath({...websiteRows[0],canonicalUrl:'https://ip6-a--b/'}));
assert.equal(W.siteIconPath({...websiteRows[0],canonicalUrl:'javascript:alert(1)'}),'');
assert.deepEqual(Array.from(W.filterWebsites([{id:'RES-bad',title:'Bad authors',canonicalUrl:'https://bad.test',authors:'Alice'}],{author:'__other__'},facetConfig),row=>row.id),['RES-bad']);
assert.deepEqual(Array.from(W.filterWebsites([{id:'RES-object-authors',title:'Object authors',canonicalUrl:'https://bad.test',authors:{name:'Alice'}}],{author:'__other__'},facetConfig),row=>row.id),['RES-object-authors']);
console.log('OK: Website Category/Tag/Site/Author AND filters, Other semantics, date ordering and safe local Site Icon paths');

// Website Pagination is exercised through the real page script and catalog URL-state binder.
const websitePageSource = fs.readFileSync(path.join(__dirname, '../websites.html'), 'utf8');
const websiteStyles = fs.readFileSync(path.join(__dirname, '../assets/websites.css'), 'utf8');
assert.match(websitePageSource, /<nav[^>]*id="pagination"[^>]*aria-label="Webサイト一覧のページ"/);
assert.match(websitePageSource, /id="result-meta"[^>]*class="result-meta"|class="result-meta"[^>]*id="result-meta"/);
assert.match(websitePageSource, /id="list"[^>]*><\/div>\s*<nav[^>]*id="pagination"/);
assert.match(websiteStyles, /\.website-pagination[^\{]*\{[^}]*flex-wrap:\s*wrap/s);
assert.match(websiteStyles, /\.website-page-link[^\{]*\{[^}]*min-width:\s*36px/s);
assert.match(websiteStyles, /\.website-page-link:focus-visible/);

function websiteFixture(count) {
  return Array.from({length:count},(_,index)=>({
    id:`RES-${String(index+1).padStart(3,'0')}`,
    title:`Article ${String(index+1).padStart(3,'0')}`,
    category:'Tech',
    publisher:'Example Site',
    canonicalUrl:`https://example.test/${index+1}`,
    authors:['Ada'],
    tags:['Shader'],
    publishedAt:'2026-10-01'
  }));
}

async function createWebsitePage(rows,href='https://portal.test/websites.html') {
  const windowHandlers = Object.create(null);
  const documentHandlers = Object.create(null);
  const elements = new Map();
  const makeElement = (id,tagName='DIV') => {
    const listeners = Object.create(null);
    const element = {
      id,tagName,value:'',textContent:'',hidden:false,options:[],listeners,
      addEventListener(type,listener) { (listeners[type] ||= []).push(listener); },
      appendChild(child) { this.options.push(child); },
      emit(type,event={}) { for(const listener of listeners[type] || []) listener(event); },
      click() { this.emit('click',{target:this}); },
      focus(options) { this.focused=true;this.focusOptions=options; },
      contains() { return true; }
    };
    if(id==='list') {
      element.firstTitle=null;
      element.focusCount=0;
      element.querySelector=selector=>selector==='.website-title'?element.firstTitle:null;
      Object.defineProperty(element,'innerHTML',{
        get(){return element._innerHTML || '';},
        set(value){
          element._innerHTML=value;
          const hasCard=value.includes('<article class="website-card">');
          element.firstTitle=hasCard?{focus(options){element.focusCount+=1;element.lastFocusOptions=options;}}:null;
        }
      });
    } else if(id==='pagination') {
      element.innerHTML='';
    } else if(id==='result-meta') {
      element.scrollCount=0;
      element.scrollIntoView=options=>{element.scrollCount+=1;element.lastScrollOptions=options;};
    }
    elements.set(id,element);
    return element;
  };
  for(const id of ['q','category','tag','site','author','sort','clear','list','count','pagination','result-meta']) {
    makeElement(id,id==='q'?'INPUT':id==='clear'?'BUTTON':id==='pagination'?'NAV':id==='count'?'SPAN':'SELECT');
  }
  let currentUrl=new URL(href);
  let state=null;
  let cursor=0;
  const entries=[currentUrl.href];
  let pushCount=0;
  let replaceCount=0;
  const history={
    get state(){return state;},
    get length(){return entries.length;},
    pushState(nextState,_title,destination){
      currentUrl=new URL(destination,currentUrl);
      entries.splice(cursor+1);
      entries.push(currentUrl.href);
      cursor+=1;
      state=nextState;
      pushCount+=1;
    },
    replaceState(nextState,_title,destination){
      currentUrl=new URL(destination,currentUrl);
      entries[cursor]=currentUrl.href;
      state=nextState;
      replaceCount+=1;
    }
  };
  const location={get href(){return currentUrl.href;},get search(){return currentUrl.search;}};
  const document={
    getElementById:id=>elements.get(id),
    createElement:()=>({value:'',textContent:''}),
    addEventListener(type,listener){(documentHandlers[type] ||= []).push(listener);}
  };
  const window={
    addEventListener(type,listener){(windowHandlers[type] ||= []).push(listener);}
  };
  const context={URL,URLSearchParams,location,history,document,window,console,encodeURIComponent};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/catalog.js'),'utf8'),context);
  context.window.MRCCatalog.loadMany=async()=>({
    websites:rows,
    'website-facets':{sites:[],authors:[]},
    taxonomy:{categories:{Tech:{displayName:'Tech'}},tags:{Shader:{displayName:'Shader'}}}
  });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/websites.js'),'utf8'),context);
  const inlineScript=websitePageSource.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(inlineScript,'Website page must keep an inline presentation entry point');
  vm.runInNewContext(inlineScript,context);
  await windowHandlers.DOMContentLoaded[0]();
  return {
    elements,history,location,
    pageNumbers(){
      const listMarkup=elements.get('pagination').innerHTML.match(/<ul class="website-pagination-list">([\s\S]*?)<\/ul>/)?.[1] || '';
      return [...listMarkup.matchAll(/<a\b(?=[^>]*class="[^"]*website-page-number[^"]*")[^>]*data-page="(\d+)"/g)].map(match=>Number(match[1]));
    },
    ellipsisCount(){return (elements.get('pagination').innerHTML.match(/website-page-ellipsis/g) || []).length;},
    clickPage(page,options={}){
      const event={button:0,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,...options,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
      event.target={dataset:{page:String(page)},closest(selector){return selector==='a[data-page]'?this:null;}};
      elements.get('pagination').emit('click',event);
      return event;
    },
    travel(direction){
      const target=cursor+direction;
      if(target<0 || target>=entries.length) return;
      cursor=target;
      currentUrl=new URL(entries[cursor]);
      for(const listener of windowHandlers.popstate || []) listener({state});
    },
    resetFromEmpty(){
      const event={target:{closest(selector){return selector==='[data-reset-filters]'?this:null;}}};
      for(const listener of documentHandlers.click || []) listener(event);
    },
    get pushCount(){return pushCount;},
    get replaceCount(){return replaceCount;}
  };
}

Promise.resolve().then(async()=>{
  const rows45=websiteFixture(45);
  const page2=await createWebsitePage(rows45,'https://portal.test/websites.html?q=Article&page=2&keep=yes');
  const page2List=page2.elements.get('list'),page2Count=page2.elements.get('count'),page2Nav=page2.elements.get('pagination');
  assert.equal((page2List.innerHTML.match(/<article class="website-card">/g)||[]).length,20);
  assert.ok(page2List.innerHTML.includes('Article 021'));
  assert.ok(!page2List.innerHTML.includes('Article 020'));
  assert.equal(page2Count.textContent,'21–40 件目 / 45 件（全 45 件）');
  assert.equal(page2Nav.hidden,false);
  assert.deepEqual(page2.pageNumbers(),[1,2,3]);
  assert.match(page2Nav.innerHTML,/aria-current="page"/);
  assert.match(page2Nav.innerHTML,/aria-label="2ページ目"/);
  assert.match(page2Nav.innerHTML,/aria-label="前のページ"/);
  assert.match(page2Nav.innerHTML,/href="\/websites.html\?q=Article&amp;page=3&amp;keep=yes"/);
  const page3Click=page2.clickPage(3);
  assert.equal(page3Click.defaultPrevented,true);
  assert.equal(page2.pushCount,1);
  assert.equal(page2.location.search,'?q=Article&page=3&keep=yes');
  assert.equal((page2List.innerHTML.match(/<article class="website-card">/g)||[]).length,5);
  assert.ok(page2List.innerHTML.includes('Article 041'));
  assert.ok(page2List.innerHTML.includes('Article 045'));
  assert.equal(page2Count.textContent,'41–45 件目 / 45 件（全 45 件）');
  assert.match(page2Nav.innerHTML,/aria-disabled="true">次へ/);
  assert.equal(page2.elements.get('result-meta').scrollCount,1);
  assert.equal(page2List.focusCount,1);
  assert.equal(page2List.lastFocusOptions.preventScroll,true);
  page2.clickPage(3);
  assert.equal(page2.pushCount,1,'clicking the current page must not add history');
  page2.travel(-1);
  assert.equal(page2.location.search,'?q=Article&page=2&keep=yes');
  assert.equal(page2.elements.get('sort').value,'desc','Back restores the default sort selection when the URL omits sort');
  assert.ok(page2List.innerHTML.includes('Article 021'));
  page2.travel(1);
  assert.equal(page2.location.search,'?q=Article&page=3&keep=yes');
  assert.equal(page2.elements.get('sort').value,'desc','Forward keeps the default sort selection when the URL omits sort');
  assert.ok(page2List.innerHTML.includes('Article 041'));
  const modifiedClick=page2.clickPage(4,{ctrlKey:true});
  assert.equal(modifiedClick.defaultPrevented,false,'modified page-link activation must keep native browser behavior');
  assert.equal(page2.pushCount,1);
  assert.equal(page2.location.search,'?q=Article&page=3&keep=yes');
  assert.equal(page2.elements.get('result-meta').scrollCount,3,'Back/Forward returns focus to the result area');

  const query=page2.elements.get('q');
  query.value='Article 0';
  query.emit('input');
  assert.equal(page2.location.search,'?q=Article+0&keep=yes&sort=desc');
  assert.equal(page2Nav.hidden,false);
  assert.equal(page2Count.textContent,'1–20 件目 / 45 件（全 45 件）');
  const pageTwoMarkup=page2Nav.innerHTML.match(/<a\b(?=[^>]*class="[^"]*website-page-number[^"]*")[^>]*data-page="2"[^>]*>/)?.[0] || '';
  const pageTwoHref=pageTwoMarkup.match(/href="([^"]+)"/)?.[1]?.replace(/&amp;/g,'&') || '';
  const pageTwoUrl=new URL(pageTwoHref,'https://portal.test');
  assert.equal(pageTwoUrl.searchParams.get('q'),'Article 0','page links must use the latest filter URL');
  assert.equal(pageTwoUrl.searchParams.get('page'),'2');
  assert.equal(pageTwoUrl.searchParams.get('sort'),'desc','page links must preserve the restored default sort');

  query.value='Article 001';
  query.emit('input');
  assert.equal(page2.location.search,'?q=Article+001&keep=yes&sort=desc');
  assert.equal(page2Nav.hidden,true);
  assert.equal(page2Count.textContent,'1–1 件目 / 1 件（全 45 件）');
  assert.ok(page2List.innerHTML.includes('Article 001'),'filter searches the full catalog, including rows outside page 3');
  const historyLength=page2.history.length;
  page2.elements.get('clear').click();
  assert.equal(page2.history.length,historyLength,'filter and clear changes replace state instead of adding history');
  assert.equal(page2.location.search,'?keep=yes&sort=desc');
  assert.equal(page2Count.textContent,'1–20 件目 / 45 件');
  assert.equal((page2List.innerHTML.match(/<article class="website-card">/g)||[]).length,20);

  for(const invalid of ['1','0','-1','1.5','abc']) {
    const invalidPage=await createWebsitePage(rows45,`https://portal.test/websites.html?page=${encodeURIComponent(invalid)}&keep=yes`);
    assert.equal(invalidPage.location.search,'?keep=yes',`invalid/page-one value ${invalid} must canonicalize to page 1`);
    assert.equal((invalidPage.elements.get('list').innerHTML.match(/<article class="website-card">/g)||[]).length,20);
    assert.equal(invalidPage.elements.get('pagination').hidden,false);
    assert.match(invalidPage.elements.get('pagination').innerHTML,/aria-disabled="true">前へ/);
  }
  const oversized=await createWebsitePage(rows45,'https://portal.test/websites.html?page=999&keep=yes');
  assert.equal(oversized.location.search,'?page=3&keep=yes');
  assert.equal((oversized.elements.get('list').innerHTML.match(/<article class="website-card">/g)||[]).length,5);
  assert.equal(oversized.elements.get('count').textContent,'41–45 件目 / 45 件');
  assert.match(oversized.elements.get('pagination').innerHTML,/aria-disabled="true">次へ/);

  const onePage=await createWebsitePage(rows45.slice(0,20),'https://portal.test/websites.html?page=2&keep=yes');
  assert.equal(onePage.location.search,'?keep=yes');
  assert.equal(onePage.elements.get('pagination').hidden,true);
  const noResults=await createWebsitePage(rows45,'https://portal.test/websites.html?q=missing&page=2&keep=yes');
  assert.equal(noResults.location.search,'?q=missing&keep=yes');
  assert.equal(noResults.elements.get('pagination').hidden,true);
  assert.equal(noResults.elements.get('count').textContent,'0 件 / 全 45 件');
  noResults.resetFromEmpty();
  assert.equal(noResults.elements.get('q').value,'');
  assert.equal(noResults.location.search,'?keep=yes&sort=desc');
  assert.equal(noResults.elements.get('pagination').hidden,false);

  const sevenPages=await createWebsitePage(websiteFixture(140),'https://portal.test/websites.html?page=4');
  assert.deepEqual(sevenPages.pageNumbers(),[1,2,3,4,5,6,7]);
  assert.equal(sevenPages.ellipsisCount(),0);
  const twelvePages=websiteFixture(240);
  const firstWindow=await createWebsitePage(twelvePages,'https://portal.test/websites.html?page=1');
  assert.deepEqual(firstWindow.pageNumbers(),[1,2,3,4,5,12]);
  assert.equal(firstWindow.ellipsisCount(),1);
  const middleWindow=await createWebsitePage(twelvePages,'https://portal.test/websites.html?page=6');
  assert.deepEqual(middleWindow.pageNumbers(),[1,5,6,7,12]);
  assert.equal(middleWindow.ellipsisCount(),2);
  const finalWindow=await createWebsitePage(twelvePages,'https://portal.test/websites.html?page=10');
  assert.deepEqual(finalWindow.pageNumbers(),[1,8,9,10,11,12]);
  assert.equal(finalWindow.ellipsisCount(),1);
  console.log('OK: Website pagination slices, URL canonicalization, filter reset, history, accessibility and page windows');
}).catch(error=>{console.error(error);process.exitCode=1;});

const documentsPageSource=fs.readFileSync(path.join(__dirname,'../documents.html'),'utf8');
const documentsStyles=fs.readFileSync(path.join(__dirname,'../assets/documents.css'),'utf8');
assert.match(documentsPageSource,/<nav[^>]*id="pagination"[^>]*aria-label="ドキュメント一覧のページ"/);
assert.match(documentsPageSource,/id="list"[^>]*aria-live="polite"[^>]*tabindex="-1"/);
assert.match(documentsPageSource,/id="list"[^>]*><\/div>\s*<nav[^>]*id="pagination"/);
assert.match(documentsStyles,/\.document-pagination[^\{]*\{[^}]*flex-wrap:\s*wrap/s);
assert.match(documentsStyles,/\.document-page-link[^\{]*\{[^}]*min-width:\s*36px/s);
assert.match(documentsStyles,/\.document-page-link:focus-visible/);

function documentFixture(count) {
  return Array.from({length:count},(_,index)=>({
    resourceId:`RES-${String(index+1).padStart(3,'0')}`,
    documentId:`DOC-${String(index+1).padStart(3,'0')}`,
    title:`Document ${String(index+1).padStart(3,'0')}`,
    sourceFormat:index%2?'PDF':'PPTX',
    thumbnail:null,
    engine:'General',
    level:'implementation',
    tags:index%2?['Shader']:['AI'],
    domains:['Graphics'],
    canonicalUrl:`https://drive.google.com/file/d/drive_${index+1}/view`
  }));
}

async function createDocumentsPage(rows,href='https://portal.test/documents.html') {
  const windowHandlers=Object.create(null),documentHandlers=Object.create(null),elements=new Map();
  const makeElement=(id,tagName='DIV')=>{
    const listeners=Object.create(null);
    const element={id,tagName,value:'',textContent:'',hidden:false,options:[],listeners,
      addEventListener(type,listener){(listeners[type] ||= []).push(listener);},
      appendChild(child){this.options.push(child);},
      emit(type,event={}){for(const listener of listeners[type] || [])listener(event);},
      click(){this.emit('click',{target:this});},
      focus(options){this.focused=true;this.focusOptions=options;},
      contains(){return true;}
    };
    if(id==='list'){
      element.focusCount=0;
      element.querySelector=selector=>selector==='.document-title'?element.firstTitle:null;
      Object.defineProperty(element,'innerHTML',{get(){return element._innerHTML || '';},set(value){
        element._innerHTML=value;
        element.firstTitle=value.includes('<article class="document-entry">')?{focus(options){element.focusCount+=1;element.lastFocusOptions=options;}}:null;
      }});
    }else if(id==='pagination')element.innerHTML='';
    else if(id==='result-meta'){
      element.scrollCount=0;
      element.scrollIntoView=options=>{element.scrollCount+=1;element.lastScrollOptions=options;};
    }
    elements.set(id,element);return element;
  };
  for(const id of ['q','category','format','tag','clear','list','count','result-meta','pagination'])
    makeElement(id,id==='q'?'INPUT':id==='clear'?'BUTTON':id==='count'?'SPAN':id==='pagination'?'NAV':'SELECT');
  let currentUrl=new URL(href),cursor=0;
  const entries=[currentUrl.href];let pushCount=0,replaceCount=0;
  const history={
    get length(){return entries.length;},
    pushState(_state,_title,destination){currentUrl=new URL(destination,currentUrl);entries.splice(cursor+1);entries.push(currentUrl.href);cursor++;pushCount++;},
    replaceState(_state,_title,destination){currentUrl=new URL(destination,currentUrl);entries[cursor]=currentUrl.href;replaceCount++;}
  };
  const location={get href(){return currentUrl.href;},get search(){return currentUrl.search;},get pathname(){return currentUrl.pathname;}};
  const document={getElementById:id=>elements.get(id),createElement:()=>({value:'',textContent:''}),
    addEventListener(type,listener){(documentHandlers[type] ||= []).push(listener);}};
  const window={addEventListener(type,listener){(windowHandlers[type] ||= []).push(listener);}};
  const context={URL,URLSearchParams,location,history,document,window,console,encodeURIComponent};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../assets/catalog.js'),'utf8'),context);
  context.window.MRCCatalog.loadMany=async()=>({'document-presentation':rows,resources:[],taxonomy:{domains:{Graphics:{displayName:'Graphics'}},tags:{Shader:{displayName:'Shader'},Unused:{displayName:'Unused'}}}});
  vm.runInNewContext(humanPortalSource,context);
  await windowHandlers.DOMContentLoaded[0]();
  return{
    elements,history,location,get pushCount(){return pushCount;},get replaceCount(){return replaceCount;},
    pageNumbers(){const markup=elements.get('pagination').innerHTML.match(/<ul class="document-pagination-list">([\s\S]*?)<\/ul>/)?.[1]||'';
      return [...markup.matchAll(/<a\b(?=[^>]*class="[^"]*document-page-number[^"]*")[^>]*data-page="(\d+)"/g)].map(match=>Number(match[1]));},
    clickPage(page,options={}){const event={button:0,altKey:false,ctrlKey:false,metaKey:false,shiftKey:false,...options,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
      event.target={dataset:{page:String(page)},closest(selector){return selector==='a[data-page]'?this:null;}};elements.get('pagination').emit('click',event);return event;},
    travel(direction){const target=cursor+direction;if(target<0||target>=entries.length)return;cursor=target;currentUrl=new URL(entries[cursor]);
      for(const listener of windowHandlers.popstate||[])listener({});},
    resetFromEmpty(){const event={target:{closest(selector){return selector==='[data-reset-filters]'?this:null;}}};
      for(const listener of documentHandlers.click||[])listener(event);}
  };
}

Promise.resolve().then(async()=>{
  const taxonomyHtml=fs.readFileSync(path.join(__dirname,'../taxonomy.html'),'utf8');
  const taxonomyScript=[...taxonomyHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
  assert.ok(taxonomyScript,'Taxonomy page has an inline rendering entry point');
  const taxonomyRoots=Object.fromEntries(['categories','tags','domains','engines'].map(id=>[id,{innerHTML:''}]));
  const taxonomySearch={value:'',addEventListener(){}};
  const taxonomyClear={addEventListener(){}};
  const taxonomyHandlers={};
  const taxonomyContext={encodeURIComponent,console,window:{MRCCatalog:{
    load:async()=>({categories:{Tech:{displayName:'Tech'}},tags:{Shader:{displayName:'Shader'}},domains:{Graphics:{displayName:'Graphics'}},engines:{Unity:{displayName:'Unity'}}}),
    query:()=>'',escapeHtml:value=>String(value)
  },addEventListener(type,handler){taxonomyHandlers[type]=handler;}},document:{
    getElementById:id=>({search:taxonomySearch,clear:taxonomyClear,...taxonomyRoots}[id])
  }};
  vm.runInNewContext(taxonomyScript,taxonomyContext);
  await taxonomyHandlers.DOMContentLoaded();
  assert.match(taxonomyRoots.categories.innerHTML,/websites\.html\?category=Tech/);
  assert.match(taxonomyRoots.tags.innerHTML,/websites\.html\?tag=Shader/);
  assert.match(taxonomyRoots.tags.innerHTML,/documents\.html\?tag=Shader/);
  assert.match(taxonomyRoots.domains.innerHTML,/websites\.html\?q=Graphics/);
  assert.match(taxonomyRoots.domains.innerHTML,/documents\.html\?category=Graphics/);
  assert.match(taxonomyRoots.engines.innerHTML,/websites\.html\?q=Unity/);
  assert.match(taxonomyRoots.engines.innerHTML,/documents\.html\?q=Unity/);
  console.log('OK: Taxonomy links use exact Website and Document Category/Tag/Engine routes');

  const rows45=documentFixture(45);
  const page2=await createDocumentsPage(rows45,'https://portal.test/documents.html?page=2&keep=yes');
  const list=page2.elements.get('list'),count=page2.elements.get('count'),nav=page2.elements.get('pagination');
  assert.equal((list.innerHTML.match(/<article class="document-entry">/g)||[]).length,20);
  assert.ok(list.innerHTML.includes('Document 021'));
  assert.ok(!list.innerHTML.includes('Document 020'));
  assert.equal(count.textContent,'21–40 件目 / 45 件（全 45 件）');
  assert.deepEqual(page2.pageNumbers(),[1,2,3]);
  assert.match(nav.innerHTML,/aria-current="page"/);
  assert.match(nav.innerHTML,/aria-label="2ページ目"/);
  assert.match(nav.innerHTML,/aria-label="前のページ"/);
  assert.match(nav.innerHTML,/href="\/documents.html\?page=3&amp;keep=yes"/);
  const page3Click=page2.clickPage(3);
  assert.equal(page3Click.defaultPrevented,true);
  assert.equal(page2.pushCount,1);
  assert.equal(page2.location.search,'?page=3&keep=yes');
  assert.equal((list.innerHTML.match(/<article class="document-entry">/g)||[]).length,5);
  assert.ok(list.innerHTML.includes('Document 041'));
  assert.equal(count.textContent,'41–45 件目 / 45 件（全 45 件）');
  assert.equal(page2.elements.get('result-meta').scrollCount,1);
  assert.equal(list.focusCount,1);
  assert.equal(list.lastFocusOptions.preventScroll,true);
  page2.travel(-1);
  assert.equal(page2.location.search,'?page=2&keep=yes');
  assert.ok(list.innerHTML.includes('Document 021'));
  page2.travel(1);
  assert.equal(page2.location.search,'?page=3&keep=yes');
  assert.ok(list.innerHTML.includes('Document 041'));

  const query=page2.elements.get('q');
  query.value='Shader';query.emit('input');
  assert.equal(new URL(page2.location.href).searchParams.get('q'),'Shader');
  assert.equal(new URL(page2.location.href).searchParams.get('keep'),'yes');
  assert.equal(new URL(page2.location.href).searchParams.has('page'),false);
  assert.equal(nav.hidden,false);
  assert.equal(count.textContent,'1–20 件目 / 22 件（全 45 件）');
  assert.ok(list.innerHTML.includes('Document 002'),'filter is applied to the full catalog before pagination');
  assert.ok(!list.innerHTML.includes('Document 003'));
  const historyLength=page2.history.length;
  page2.elements.get('clear').click();
  assert.equal(page2.history.length,historyLength,'filter reset replaces history rather than adding an entry');
  assert.equal(page2.location.search,'?keep=yes');
  assert.equal(query.value,'');
  assert.equal(count.textContent,'1–20 件目 / 45 件（全 45 件）');

  for(const invalid of ['1','0','-1','1.5','abc']){
    const repaired=await createDocumentsPage(rows45,`https://portal.test/documents.html?page=${encodeURIComponent(invalid)}&keep=yes`);
    assert.equal(repaired.location.search,'?keep=yes',`invalid/page-one value ${invalid} is canonicalized`);
    assert.equal((repaired.elements.get('list').innerHTML.match(/<article class="document-entry">/g)||[]).length,20);
  }
  const oversized=await createDocumentsPage(rows45,'https://portal.test/documents.html?page=999&keep=yes');
  assert.equal(oversized.location.search,'?page=3&keep=yes');
  assert.equal(oversized.elements.get('count').textContent,'41–45 件目 / 45 件（全 45 件）');
  const noResults=await createDocumentsPage(rows45,'https://portal.test/documents.html?q=missing&page=2&keep=yes');
  assert.equal(noResults.location.search,'?q=missing&keep=yes');
  assert.equal(noResults.elements.get('count').textContent,'0 件 / 全 45 件');
  assert.equal(noResults.elements.get('pagination').hidden,true);
  noResults.resetFromEmpty();
  assert.equal(noResults.elements.get('q').value,'');
  assert.equal(noResults.location.search,'?keep=yes');
  assert.equal(noResults.elements.get('pagination').hidden,false);

  const pageOne=await createDocumentsPage(rows45,'https://portal.test/documents.html?page=1&keep=yes');
  assert.equal(pageOne.location.search,'?keep=yes','page 1 is omitted from canonical URLs');
  const onePage=await createDocumentsPage(rows45.slice(0,20),'https://portal.test/documents.html?page=2&keep=yes');
  assert.equal(onePage.location.search,'?keep=yes');
  assert.equal(onePage.elements.get('pagination').hidden,true);
  const canonicalTag=await createDocumentsPage(rows45,'https://portal.test/documents.html?tag=Unused');
  assert.equal(canonicalTag.elements.get('tag').value,'Unused','canonical Taxonomy tags remain selectable even when no Document currently uses one');
  assert.equal(canonicalTag.elements.get('count').textContent,'0 件 / 全 45 件');
  console.log('OK: Documents pagination slices after filtering, canonical URLs, filter reset, history, empty state and accessibility');

  const unclassifiedRows=[...rows45];
  unclassifiedRows[1]={...unclassifiedRows[1],domains:[],tags:[]};
  const unclassifiedPage=await createDocumentsPage(unclassifiedRows);
  assert.ok(unclassifiedPage.elements.get('list').innerHTML.includes('Document 002'),'unclassified row stays in the unfiltered list');
  assert.ok(unclassifiedPage.elements.get('category').options.some(option=>option.value==='__unclassified__'&&option.textContent==='未分類'));
  const unclassifiedSearch=unclassifiedPage.elements.get('q');
  unclassifiedSearch.value='Document 002';unclassifiedSearch.emit('input');
  assert.ok(unclassifiedPage.elements.get('list').innerHTML.includes('Document 002'),'unclassified row remains searchable');
  const unclassifiedFilter=await createDocumentsPage(unclassifiedRows);
  const category=unclassifiedFilter.elements.get('category');category.value='__unclassified__';category.emit('change');
  assert.equal((unclassifiedFilter.elements.get('list').innerHTML.match(/<article class="document-entry">/g)||[]).length,1);
  assert.ok(unclassifiedFilter.elements.get('list').innerHTML.includes('Document 002'));
  assert.equal(unclassifiedFilter.location.search,'?category=__unclassified__');
  console.log('OK: Empty canonical Domains stay visible/searchable and the UI-only 未分類 filter selects them');
}).catch(error=>{console.error(error);process.exitCode=1;});
