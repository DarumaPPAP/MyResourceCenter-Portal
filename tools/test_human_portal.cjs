// Pure presentation behavior checks; no browser or dependency required.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = { URL, URLSearchParams, window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../assets/catalog.js'), 'utf8'), context);
const C = context.window.MRCCatalog;
const doc = {resourceId:'RES-1', documentId:'DOC-ABC', title:'影 & 光', sourceFormat:'PDF', thumbnail:'assets/generated/documents/DOC-ABC.png', canonicalUrl:'https://drive.google.com/file/d/abc_123-/view', tags:['Shader'], engine:'Unity'};
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
const taxonomy = {tags:{Shader:{domain:'Graphics'}}};
const docs = C.presentDocuments([doc],resources,taxonomy);
assert.deepEqual(Array.from(docs[0].categories), ['Graphics']);
assert.equal(C.filterDocuments(docs,{q:'光',category:'Graphics',format:'PDF',tag:'Shader'}).length,1);
for (const filters of [{q:'missing'},{category:'AI'},{format:'PPTX'},{tag:'RayTracing'}]) assert.equal(C.filterDocuments(docs,filters).length,0);
assert.equal(C.filterDocuments(docs,{q:'lighting'}).length,1);
const humanPortalSource = fs.readFileSync(path.join(__dirname, '../assets/human-portal.js'), 'utf8');
assert.match(humanPortalSource, /class="document-window-chrome" aria-hidden="true"/);
assert.match(humanPortalSource, /C\.viewerHref\(doc\)/);
assert.match(humanPortalSource, /C\.documentThumbnail\(doc\)/);
assert.match(humanPortalSource, /C\.chips\(doc\.tags\.slice\(0,\s*6\)\)/);
async function renderDocumentCard(doc) {
  const elements = new Map();
  for (const id of ['q','category','format','tag','clear','list','count']) {
    elements.set(id, {
      id,
      tagName:id === 'q' ? 'INPUT' : id === 'clear' ? 'BUTTON' : 'SELECT',
      value:'',
      innerHTML:'',
      textContent:'',
      options:[],
      listeners:{},
      addEventListener(type,listener) { this.listeners[type] = listener; },
      appendChild(option) { this.options.push(option); }
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
    location:{pathname:'/documents.html'},
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
rows=v.load('document-presentation.json')
resources=v.load('resources.json')+v.load('resources-06.json')+[v.project_resource(r) for r in v.load_latest_websites()]
errors=[];v.validate_presentation(errors, rows, resources);assert not errors,errors
cases=[({'driveId':'private'},'unexpected public fields'),({'thumbnail':'../../secret.png'},'invalid thumbnail asset path'),({'canonicalUrl':'https://drive.google.com.evil.test/file/d/abc/view'},'invalid/duplicate canonical'),({'sourceFormat':'EXE'},'invalid sourceFormat'),({'resourceId':'RES-MISSING'},'unresolved document Resource')]
for fields,message in cases:
    modified=copy.deepcopy(rows);modified[0].update(fields)
    errors=[];v.validate_presentation(errors,modified,resources)
    assert any(message in error for error in errors),(fields,errors)
modified=copy.deepcopy(rows);modified[1]['documentId']=modified[0]['documentId']
errors=[];v.validate_presentation(errors,modified,resources);assert any('duplicate documentId' in error for error in errors)
modified=copy.deepcopy(rows);modified[1]['sourceFormat']='UNKNOWN'
errors=[];v.validate_presentation(errors,modified,resources);assert any('null thumbnail fallback' in error for error in errors)
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
  {id:'RES-1',title:'Tech A Alice',canonicalUrl:'https://a.example/1',contentType:'technical-article',domains:['Graphics'],authors:['Ａlice'],publishedAt:'2026-09-30'},
  {id:'RES-2',title:'Tech A Bob',canonicalUrl:'https://a.example/2',contentType:'technical-article',authors:['Bob'],publishedAt:'2026-09-28'},
  {id:'RES-3',title:'QA A Alice',canonicalUrl:'https://a.example/3',contentType:'qa-article',authors:['Alice'],publishedAt:'2026-09-29'},
  {id:'RES-4',title:'Tech B Alice',canonicalUrl:'https://b.example/4',contentType:'technical-article',authors:['Alice','Bob'],publishedAt:'2026-09-27'},
  {id:'RES-5',title:'Legacy B',canonicalUrl:'https://b.example/5',contentType:null,authors:['Bob'],publishedAt:null}
];
assert.equal(W.normalizeAuthor(' Ａlice  '), 'alice');
assert.equal(W.normalizeAuthor('ǰ'), 'j\u030c');
assert.equal(W.websiteHost('https://faß.de/article'), 'xn--fa-hia.de');
assert.equal(W.siteIconPath({canonicalUrl:'https://faß.de/article'}), 'assets/generated/site-icons/xn--fa-hia.de.png');
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{q:'graphics'},facetConfig),row=>row.id),['RES-1']);
assert.equal(W.filterWebsites(websiteRows,{category:'technical-article',site:'a.example'},facetConfig).length,2);
assert.equal(W.filterWebsites(websiteRows,{category:'technical-article',author:'alice'},facetConfig).length,2);
assert.equal(W.filterWebsites(websiteRows,{site:'a.example',author:'alice'},facetConfig).length,2);
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{category:'technical-article',site:'a.example',author:'alice'},facetConfig),row=>row.id),['RES-1']);
assert.equal(W.filterWebsites(websiteRows,{site:'b.example'},facetConfig).length,0,'unapproved Site query values must not expose dedicated filter results');
assert.equal(W.filterWebsites(websiteRows,{author:'bob'},facetConfig).length,0,'unapproved Author query values must not expose dedicated filter results');
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{site:'__other__'},facetConfig),row=>row.id),['RES-4','RES-5']);
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{author:'__other__'},facetConfig),row=>row.id),['RES-2','RES-5']);
assert.equal(W.presentWebsites(websiteRows,facetConfig).find(row=>row.id==='RES-4').hasOtherAuthor,false,'an article with any approved Author must not also match Author Other');
assert.deepEqual(Array.from(W.filterWebsites(websiteRows,{category:'invented'},facetConfig),row=>row.id),[]);
assert.deepEqual(Array.from(W.sortWebsites(websiteRows,'desc'),row=>row.id),['RES-1','RES-3','RES-2','RES-4','RES-5']);
assert.deepEqual(Array.from(W.sortWebsites(websiteRows,'asc'),row=>row.id),['RES-4','RES-2','RES-3','RES-1','RES-5']);
assert.equal(W.siteIconPath(websiteRows[0]),'assets/generated/site-icons/a.example.png');
assert.notEqual(W.siteIconPath({...websiteRows[0],canonicalUrl:'https://[2001:db8::1]/'}),W.siteIconPath({...websiteRows[0],canonicalUrl:'https://[200:1db8::1]/'}));
assert.notEqual(W.siteIconPath({...websiteRows[0],canonicalUrl:'https://[a::b]/'}),W.siteIconPath({...websiteRows[0],canonicalUrl:'https://ip6-a--b/'}));
assert.equal(W.siteIconPath({...websiteRows[0],canonicalUrl:'javascript:alert(1)'}),'');
assert.deepEqual(Array.from(W.filterWebsites([{id:'RES-bad',title:'Bad authors',canonicalUrl:'https://bad.test',authors:'Alice'}],{author:'__other__'},facetConfig),row=>row.id),['RES-bad']);
assert.deepEqual(Array.from(W.filterWebsites([{id:'RES-object-authors',title:'Object authors',canonicalUrl:'https://bad.test',authors:{name:'Alice'}}],{author:'__other__'},facetConfig),row=>row.id),['RES-object-authors']);
console.log('OK: Website facet AND filters, Other semantics, exact Category, date ordering and safe local Site Icon paths');
