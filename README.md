# MyResourceCenter-Portal

`DarumaPPAP/MyResourceCenter` のHuman向けPresentation Layerです。

## Source model

- AI / factual Source of Truth: Google Drive `KnowledgeLibrary/Sources` のCanonical Original
- PDF / PPTXはファイルサイズに関係なく同じDrive Storage policyで管理
- Documents表示: `catalog/document-presentation.json` の実Title・Format・Thumbnail
- Legacy Original inventory: `catalog/original-documents.json`
- Base Original URL shards: `catalog/originals-base-01.json` ～ `04.json`
- CEDEC 2026 Original URL: `catalog/resources-06.json`

Portalの表示内容、GitHub上のLegacy binary mirror、Markdown、Generated SkillをAIの一次Evidenceとして扱いません。登録資料を根拠に回答・分析・設計・実装・問題作成等を行う場合は、CatalogからGoogle Drive Originalへ戻ります。

## Public boundary

Portalへ同期できるのは **KnowledgeLibrary/Sources由来のallowlistされたpublic-safe metadata / Presentation** だけです。

以下はPrivate運用領域でありPortalへ同期しません。

- KnowledgeLibrary/Assets
- KnowledgeLibrary/Logs
- KnowledgeLibrary_Restricted
- Drive folder topology / folder URLs
- Asset source / analysis cache / operational trace

Private MyResourceCenterからPortalへの同期は、public projection + Validator + PRを境界として維持します。

## Documents

`documents.html` は公開Document Presentationを横断表示します。Thumbnail / 実Title優先で、Search・Category・Format・Tagsから探し、Portal Viewer → Google Drive Originalへ進めます。

- 116 Document Presentations（66件の実Original Page 1 Thumbnail + 明示Fallback）
- Legacy inventory: 100 Original Documents
- PDF: 79
- PPTX: 21
- 46 base Originals + 54 CEDEC 2026 Originals
- 各DocumentからPortal Viewer・資料情報・関連Collectionへアクセス

Git LFS pointerやGitHub binary pathをPortalのCanonical Original URLとして使用しません。

Homeは技術Environment SVGと現在のCatalog件数を表示。Websitesは正方形のローカルSite IconとMetadataを使った技術記事Directoryで、Iconが利用できない場合は文字表示へFallbackします。Category / Site / Author FilterはAND条件で、公開日で昇順・降順にSortできます。CollectionsはCategory / Title順のReading Path、TrendsはEditorial表示です。表示契約・検証方法は [Human Portal](docs/human-portal.md) を参照してください。

## GitHub Pages

https://darumappap.github.io/MyResourceCenter-Portal/

`.github/workflows/validate-portal.yml` の全Validation成功後に自動Deployします。Trend更新の自動Merge後も同じWorkflowを起動します。

## Validation

```bash
python tools/validate_portal.py
python tools/validate_browser_viewer.py
python tools/validate_trends.py
python tools/validate_trend_candidates.py
node tools/test_filter_state.cjs
node tools/test_human_portal.cjs
node tools/test_home.cjs
node tools/test_deploy_workflow.cjs
```

Validatorは次を確認します。

- Canonical storageがGoogle Driveである
- Originalが46 + 54 = 100件である
- PDF 79 / PPTX 21である
- Drive URLが重複していない
- URL credential・空白 / 制御文字・不正Port・Malformed URLを拒否
- PresentationのRES / DOC / Canonical URL対応、Thumbnail path / PNG integrity / dimensions
- Documents pageがGitHub binary mirrorへ戻っていない
- Portal Catalog / Resource / Relation / Collection整合性
- KnowledgeLibraryのPrivate folder URL / topologyが公開Catalogへ混入していない

## Trend Radar

`trend.html` はゲーム開発・Graphics・AI・Engine・Tools・Researchの短期Discovery Feedです。正式Knowledgeとは分離し、最大3日・1日最大100件の運用を維持します。
