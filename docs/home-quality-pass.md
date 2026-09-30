# Home Final Quality Pass

## 変更

Homeの主見出しを `Game Development Knowledge Portal` に変更。登録リソース / Webサイト / 資料 / 関連リンク / コレクションのKPI strip、汎用の「探索する」Quick Card群、旧Dashboard用のHome CSSを削除した。

構成は Technical/Game Hero + Search → Featured Documents → Reading Paths → Trend / Discovery。既存 `assets/technical-environment.svg` を再利用し、Geometry / Wireframe / Lighting / GPUのcaptionとRendering検索への入口を付けた。検索は視認性のあるaccent枠・十分な高さを持ち、資料 / Webサイトの対象切替と `/` キー、Enter送信を維持する。

Featured Documentsはpublic presentation index内のプレビュー付き実資料4件。既存のDocument entry / Thumbnail / Viewer routing / Metadata / Tags / 詳細導線を再利用する。公開日に相当するmetadataがないため「Recent」とは表記せず、公開順や日付を創作しない。Thumbnailはcontain・lazy・async decodingと画像失敗fallbackを維持する。

Reading Pathsは既存のReading Guide componentと `sortCollections` / `readingPreview` / `roleLabel` を使う。実Resourceを2件以上持つCollectionから3テーマを表示し、最初の2〜3件の実Title / Roleと、残りがある場合だけ `+N more` を出す。空・1件のみ・参照不能のPathはHomeでは省き、Collection一覧への導線を残す。Canonical membershipやRoleは変更しない。

Trendは見出し・短い説明・3日限定Feedという文脈を持つeditorial entry。記事や画像をHomeへ別保存する仕組みは追加しない。

## 検証

`node tools/test_home.cjs` は変更前に主見出し契約でREDを確認し、変更後GREEN。実catalog loader / Home rendererをVM内で実行し、public metadataに存在するTitle・Viewer導線・4件のThumbnail・3テーマの実Reading Steps・Role・`+N more`・画像失敗handler・不完全なPathの除外・空データ・読み込み失敗を検証する。Node標準ライブラリのみを使用。

HTTP上のPlaywright + 既存 `/usr/bin/chromium` により、Desktop 1440 / Mobile 390 × Light / Darkの4条件を確認した。全条件でHTTP 200、画像4件読込、横overflowなし、JavaScript page errorなし。画面も確認し、HeroとSearchが主役になっていること、資料が実プレビューとして見えること、Reading Pathsの実Title / Roleが読めることを確認した。

実操作では `/` キーのfocus、Enter検索からDocument filter、対象切替と検索buttonからWebsite filter、Reading PathからCollection詳細への遷移、画像request失敗時のfallbackを確認した。

検証画像・JSON・一時Playwright scriptはRepository外の `/workspace/scratch/quality-home-*`、`/workspace/scratch/check-quality-home.py` に置く。Original・中間画像・新規dependencyは追加していない。

既存のfilter / Human Portal Node tests、Viewer・Trend・Trend candidate validatorsも実行。HomeでKPI件数を要求していた旧Portal validation clauseは、今回の明示的なStats削除に合わせて実コンテンツ契約へ更新済み。Public Boundary / Catalog / Thumbnail / Viewerの既存安全契約は維持する。
