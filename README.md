# MyResourceCenter-Portal

`DarumaPPAP/MyResourceCenter` のHuman向けPresentation Layerです。

## Source model

- AI / factual Source of Truth: `MyResourceCenter/sources/Original/`
- Japanese: Originalをそのまま開く
- English: Originalを正本として、日本語Source-faithful HTMLをPortalへDeploy
- Portal metadata: `catalog/original-documents.json`

Portalの表示内容をAIの一次Evidenceとして扱いません。登録資料を根拠に回答・分析・設計・実装・問題作成等を行う場合は、MyResourceCenter側のOriginal Sourceへ戻ります。

## Documents

`documents.html` はOriginal Libraryを言語別に表示します。

- Japanese: `Originalを開く`
- English: `日本語HTML` + `Original`（HTML未生成時は準備中表示）
- unclassified: 言語確認待ち

現在のOriginal routingは `catalog/original-documents.json` を正本としてPortalへ投影します。

## GitHub Pages

https://darumappap.github.io/MyResourceCenter-Portal/

`.github/workflows/deploy-pages.yml` から自動Deployします。

## Trend Radar

`trend.html` はゲーム開発・Graphics・AI・Engine・Tools・Researchの短期Discovery Feedです。正式Knowledgeとは分離し、最大3日・1日最大100件の運用を維持します。
