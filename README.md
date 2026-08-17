# MyResourceCenter-Portal

`DarumaPPAP/MyResourceCenter` のHuman向けPresentation Layerです。

## Source model

- AI / factual Source of Truth: Google Drive `/Sources` のCanonical Original
- PDF / PPTXはファイルサイズに関係なく同じDrive Storage policyで管理
- Human ViewerはCanonical Originalを変更せず、閲覧時だけ最適なViewerへルーティング
- Portal metadata: `catalog/original-documents.json`
- Base Original URL shards: `catalog/originals-base-01.json` ～ `03.json`
- CEDEC 2026 Original URL: `catalog/resources-06.json`

Portalの表示内容、GitHub上のLegacy binary mirror、Markdown、Generated SkillをAIの一次Evidenceとして扱いません。登録資料を根拠に回答・分析・設計・実装・問題作成等を行う場合は、CatalogからGoogle Drive Originalへ戻ります。

## Documents / Adaptive Viewer

`documents.html` は登録済みOriginal Libraryを横断表示します。

- 82 Original Documents
- PDF: 61
- PPTX: 21
- 28 base Originals + 54 CEDEC 2026 Originals
- Canonical Originalは常にGoogle Drive
- 通常サイズPDF / PPTX: Google Drive Preview
- 25 MiB以上のPDF: Adobe PDF Embed API
- Adobe初期化・PDF描画失敗時: Google Drive Previewへ自動fallback
- PPTXはサイズに関係なくAdobeへ送らない
- `sizeBytes` が未登録の資料は安全側でDrive Previewを使用

Viewer routing設定は `assets/viewer-config.js` に集約しています。

### Adobe PDF Embed API setup

Adobe PDF Embed APIを有効化するには、Adobe Developer ConsoleでGitHub Pagesの配信ドメイン用Client IDを発行し、`assets/viewer-config.js` の `adobeClientId` に設定します。

```js
window.MRCViewerConfig = Object.freeze({
  largePdfThresholdBytes: 25 * 1024 * 1024,
  adobeClientId: 'YOUR_ADOBE_PDF_EMBED_CLIENT_ID',
  adobeSdkUrl: 'https://acrobatservices.adobe.com/view-sdk/viewer.js',
  adobeLocale: 'ja-JP',
  adobeEnableLinearization: true
});
```

Client IDはAdobe側で登録したWebドメインと一致する必要があります。未設定・不一致・SDKロード失敗・PDF取得/CORS・描画失敗時はPortalを壊さずDrive Previewへfallbackします。

Adobe Viewerは大容量PDFで `FULL_WINDOW` + `enableLinearization` を使用します。Linearizationの効果を最大化するには、PDF配信元がHTTP Range / CORSを満たす必要があります。

## GitHub Pages

https://darumappap.github.io/MyResourceCenter-Portal/

`.github/workflows/deploy-pages.yml` から自動Deployします。

## Validation

```bash
python tools/validate_portal.py
python tools/validate_browser_viewer.py
```

Validatorは次を確認します。

- Canonical storageがGoogle Driveである
- Originalが28 + 54 = 82件である
- PDF 61 / PPTX 21である
- Drive URLが重複していない
- Documents pageがGitHub binary mirrorへ戻っていない
- Base Originalに正の`sizeBytes`が存在する
- 25 MiB以上のPDFだけAdobe routing対象になる
- 大容量PPTXはDrive routingのままである
- Adobe描画失敗時にDrive fallbackが存在する
- Portal Catalog / Resource / Relation / Collection整合性

Git LFS pointerやGitHub binary pathをPortalのCanonical Original URLとして使用しません。

## Trend Radar

`trend.html` はゲーム開発・Graphics・AI・Engine・Tools・Researchの短期Discovery Feedです。正式Knowledgeとは分離し、最大3日・1日最大100件の運用を維持します。
