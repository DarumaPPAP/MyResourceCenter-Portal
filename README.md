# MyResourceCenter-Portal

`MyResourceCenter` の人間向け公開Portalです。

- Source of Truth: private `DarumaPPAP/MyResourceCenter`
- Public Portal: this repository
- Public contents: HTML / CSS / JS / Website registry / Document metadata / short-lived Trend metadata
- Not published here: PDF/PPTX原本、Markdown本文、図版、Skills、private source metadata

## Pages

https://darumappap.github.io/MyResourceCenter-Portal/

GitHub Pagesは `.github/workflows/deploy-pages.yml` から自動Deployします。

## Trend Radar

`trend.html` はゲーム開発・Graphics・AI・Engine・Tools・Researchの新着を一覧する **Discovery Feed** です。

Trendは正式Knowledgeではありません。

- `data/trends.json` 1ファイルだけを使用
- 最大3日保持
- 1日最大50件
- 記事本文・画像・PDF等は保存しない
- Trendから`MyResourceCenter`のWebsites / Documentsへ自動登録しない
- 残したいSourceだけ、ユーザー判断後に通常の登録フローへ昇格する

AI/Task等が当日分を生成した場合は、軽量JSONを入力として安全更新Toolへ渡します。

```bash
python3 tools/update_trends.py --input /tmp/today-trends.json
python3 tools/validate_trends.py
```

`update_trends.py` はURL重複を除去し、Score降順で最大50件へ制限し、古いDayを落として最大3日だけ保持します。

