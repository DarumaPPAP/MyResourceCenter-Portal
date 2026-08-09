# MyResourceCenter Portal Redesign

## Goal

MyResourceCenter-Portal を「説明を読むポータル」から、必要な技術資料へ最短で到達する **資料管理センター** へ再設計する。

Source of Truth は private な `MyResourceCenter` のまま維持し、Portal は公開可能な metadata を探索・理解する Human UI に徹する。

## Core UX

1. **検索を最優先**
   - TOPを開いた直後にグローバル検索へ視線が向く。
   - Title / Tag / Engine / Source Format / Level を横断検索できる。
   - 検索語の例をプレースホルダだけでなくカテゴリ導線として表示する。

2. **カテゴリから迷わず入れる**
   - Graphics
   - Unity
   - AI / LLM
   - Git / DevOps
   - Security
   - Voxel / Geometry
   - Audio
   - Tooling / Architecture

   カテゴリは固定 taxonomy とタグ集計を組み合わせる。タグをそのまま大量表示するのではなく、人間が選びやすい上位カテゴリへまとめる。

3. **資料カードだけで中身を判断できる**
   - Title
   - 1〜2行の要約 / What you will learn
   - Engine
   - Source Format
   - Level
   - Tags
   - Figure count
   - Updated / Added information（公開Catalogで取得可能になった場合）

4. **“最近追加されたもの”を見つけられる**
   - 最新資料
   - ピックアップ
   - よく見るカテゴリ
   - Source type別導線

## Information Architecture

### Sidebar

- ホーム
- すべての資料
- Webサイト
- ドキュメント
- カテゴリ
- タグ
- 最近追加
- 登録フロー

管理者向け情報や Source Library の責務説明は下部へ退避し、探索導線より目立たせない。

### Home

1. Hero / Search
   - H1: `資料管理センター`
   - Subcopy: `技術資料・Webサイト・強化Markdownを、目的からすぐ探せる。`
   - Global Search
   - Category chips

2. Recent Resources
   - 新しく追加された資料を横断表示
   - Web / Markdown を同じカード規格で表示

3. Explore by Category
   - Graphics / Unity / AI / Git / Security / Voxel / Audio など
   - 各カテゴリの件数を表示

4. Recommended / Pickup
   - 代表的な資料を表示
   - 単なる先頭5件ではなく curated / featured metadata を将来的に追加可能な構造にする

5. Library Summary
   - Source / Website / Markdown / Figure / Original の件数は補助情報として小さく表示

6. Registration Flow
   - 最下部へ配置
   - 日常的な資料探索の邪魔をしない

## Visual Direction

- GitHub / Linear / Notion の中間にある開発者向け Knowledge UI
- Light / Dark 両対応を維持
- Dark は deep navy + blue/purple accent
- Cardの境界を弱め、情報階層は余白・文字サイズ・ラベルで作る
- KPIカードを主役にしない
- Hero右側の抽象的な本イラストは縮小または廃止し、検索・カテゴリへスペースを使う
- Hover animation は小さく、探索性を優先
- 日本語主体。英語ラベルは Source Format / Engine など技術的に意味がある箇所のみ

## Resource Card Proposal

```text
┌─────────────────────────────────────────────┐
│ [PPTX]  Production / implementation         │
│ Shipping Dynamic GI — Frostbite GIBS        │
│ Surfelsを使ったDynamic GIのproduction設計… │
│                                             │
│ GI  Surfels  Frostbite  DynamicGI           │
│                                             │
│ Engine: Frostbite        重要図: 3           │
└─────────────────────────────────────────────┘
```

一覧を開く前から「自分が今読むべき資料か」を判断できることを最優先する。

## Current UI Problems to Address

- Heroの面積に対して検索欄が小さい。
- 右側のlibrary illustrationが探索タスクに直接寄与しない。
- 5つの統計値が画面上部を占有し、資料そのものより先に見える。
- Quick AccessがSource type中心で、ユーザーの目的・技術カテゴリ中心ではない。
- PickupがCatalog先頭5件であり、推薦の意味を持たない。
- Tag cloudは便利だが、タグ数が増えるほど入口として判断コストが上がる。
- Source登録フローがTOPの主要コンテンツと同じ強さで表示されている。

## Implementation Steps

### 1. Home shell

- Heroを検索中心のcompact headerへ変更
- `資料管理センター` をH1へ適用
- Search直下にcategory chipsを追加
- Statsをcompact summaryへ変更

### 2. Resource discovery

- documents / websites Catalog を統合したHome用view modelを作る
- Recent / Category / Featured sectionsを追加
- URL query (`?q=` / `?tag=` / `?category=`) を一覧画面へ引き継ぐ

### 3. Card system

- Resource card component相当のHTML生成関数を `assets/portal.js` へ集約
- Format / Level / Engine / Tags の見た目を共通化
- responsive時はmetadataを段階的に折り畳む

### 4. Navigation

- Sidebarを探索タスク基準へ再構成
- mobile navigationも同じ情報設計に合わせる

### 5. Polish

- keyboard focus / contrast / aria-liveを維持
- 320px〜desktopまでoverflowなし
- Light / Darkの両テーマで確認

## Acceptance Criteria

- TOP表示直後に「何を検索できるサイトか」が分かる。
- 1クリックで主要カテゴリへ入れる。
- 2クリック以内で任意の資料一覧へ到達できる。
- 資料カードを開かなくても Format / Level / Engine / 主題を判断できる。
- Source Library と Portal の責務分離を維持する。
- public metadata以外をPortalへ複製しない。
- desktop / tablet / mobileで横スクロールを発生させない。
- Light / Darkテーマを維持する。
