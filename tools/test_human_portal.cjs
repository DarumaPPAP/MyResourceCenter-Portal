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
assert.match(C.documentThumbnail({...doc,thumbnail:null,sourceFormat:'PPTX'}), /PPTX/);
assert.doesNotMatch(C.documentThumbnail({...doc,thumbnail:'../../secret.png'}), /<img/);
const image = { hidden:false, closest:()=>({classList:{add(v){assert.equal(v,'is-missing');}}}) };
C.thumbnailFailed(image); assert.equal(image.hidden,true);
const resources = new Map([['RES-1',{id:'RES-1',topics:['Lighting']}]]);
const taxonomy = {tags:{Shader:{domain:'Graphics'}}};
const docs = C.presentDocuments([doc],resources,taxonomy);
assert.equal(C.filterDocuments(docs,{q:'光',category:'Graphics',format:'PDF',tag:'Shader'}).length,1);
for (const filters of [{q:'missing'},{category:'AI'},{format:'PPTX'},{tag:'RayTracing'}]) assert.equal(C.filterDocuments(docs,filters).length,0);
assert.equal(C.filterDocuments(docs,{q:'lighting'}).length,1);
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
print('OK: public validator rejects private fields/topology, invalid mappings, unsafe URLs/paths, unsupported thumbnails and malformed PNGs')
`], {cwd:path.join(__dirname,'..'),stdio:'inherit'});
