# MyResourceCenter-Portal

`DarumaPPAP/MyResourceCenter` のHuman向けPresentation Layerです。

## Source model

- AI / factual Source of Truth: Google Drive `/Sources` のCanonical Original
- PDF / PPTXはファイルサイズに関係なく同じDrive Storage policyで管理
- Japanese: Canonical Drive Originalをそのまま開く
- English: Canonical Drive Original + 日本語Source-faithful HTML Presentation
- Portal metadata: `catalog/original-documents.json`
- Base Original URL shards: `catalog/originals-base-01.json` ～ `03.json`
- CEDEC 2026 Original URL: `catalog/resources-06.json`

Portalの表示内容、GitHub上のLegacy binary mirror、Markdown、Generated SkillをAIの一次Evidenceとして扱いません。登録資料を根拠に回答・分析・設計・実装・問題作成等を行う場合は、CatalogからGoogle Drive Originalへ戻ります。

## Documents

`documents.html` は登録済みOriginal Libraryを横断表示します。

- 82 Original Documents
- PDF: 61
- PPTX: 21
- 28 base Originals + 54 CEDEC 2026 Originals
- 各DocumentからGoogle Drive Originalへ直接アクセス

Git LFS pointerやGitHub binary pathをPortalのCanonical Original URLとして使用しません。

## GitHub Pages

https://darumappap.github.io/MyResourceCenter-Portal/

`.github/workflows/deploy-pages.yml` から自動Deployします。

## Validation

```bash
python tools/validate_portal.py
```

Validatorは次を確認します。

- Canonical storageがGoogle Driveである
- Originalが28 + 54 = 82件である
- PDF 61 / PPTX 21である
- Drive URLが重複していない
- Documents pageがGitHub binary mirrorへ戻っていない
- Portal Catalog / Resource / Relation / Collection整合性

## Trend Radar

`trend.html` はゲーム開発・Graphics・AI・Engine・Tools・Researchの短期Discovery Feedです。正式Knowledgeとは分離し、最大3日・1日最大100件の運用を維持します。
