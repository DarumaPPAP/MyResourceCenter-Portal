# Contextual Page Transition & Layout Motion

対象は MyResourceCenter-Portal の MPA。比較元は PR #130・#131 を含む `b4482c2074e06f27c65f19c3b58203ddf98979d1`。

## 参考モーションと Portal での採用

参考サイトのページスタックをブラウザーで再生し、各デモの公開レシピと方向、振幅、イージングを比較した。スタックでは後退が前進の逆再生で、ルートスライドでは進行方向に合わせて X 軸を反転する。Portal では一覧と対応する詳細の関係がある場合に限って、Y 軸の前後を使う。 [Motion Reference](https://motion-reference.takayustudio.jp/index.html#motion=page-transition-stack)

| 操作 | 参考デモ | Portal での採用 |
| --- | --- | --- |
| 同階層 | 520 ms、easeInOutCubic、旧・新ビューを交差 | 420 ms。旧見出しのスナップショットを薄くしながら、ライブ本文を .35 → 1 で描画。交差は見出し周辺 |
| 一覧から詳細 | 720 ms、easeInOutCubic、旧面 .94 と −10 px、新面は下から | 480 ms。旧見出しは .96 と −10 px、新本文は最大 106 px 下から |
| 詳細から一覧 | スタックを同じ軌道で逆再生 | 420 ms。旧見出しは下方向へ、新本文は −28 px から復元 |
| 現在地 | 520 ms、easeOutCubic、横方向に伸縮 | 300 ms。サイドバーは縦、モバイルナビは横方向に伸縮 |
| 見出し・検索ツールバー | 見出しの順序と入力先が分かるように時間差を付ける | 340 ms・16 px・38 ms 間隔／200 ms・6 px。親本文が動くときは付加演出を省く |
| 初回結果・ページ送り | 参考の再配置やスライドは位置の変化を可視化 | 初回の先頭 3 件は 290 ms・40 ms 間隔。ページ送りは ±24 px・280 ms。検索入力では再生しない |

ページ全体のルートスナップショットは旧実装のヒットテスト問題を再発させるため対象外とした。旧見出しと現在地マーカーだけを取得し、新しい本文を実 DOM のまま表示する。サイドバー、トップバー、モバイルナビ本体は固定。CSS Animation と Cross-document View Transition を併用し、キーボードで本文にフォーカスすると表示を即座に安定させる。ポインターを押している間は対象をその位置に留め、クリックやタップの位置ズレを防ぐ。SPA 化やナビゲーションの待機は不要。

対応する一覧・詳細は実際の履歴エントリーの組み合わせで判定する。一部の Chromium の履歴移動では遷移先の履歴情報やスナップショットが揃わない。対応する遷移元が得られた場合は、URL が一致する短命の同一タブ記録から移動方向を復元し、ライブ本文の入場を使う。既存の履歴、スクロール位置、BFCache、リンクの既定動作はブラウザーが管理する。Viewer と Reduced Motion ではページモーションを適用しない。

## 見送ったモーション

| モーション | 検討結果 |
| --- | --- |
| M04 共有要素 | 850 ms の参照は最初のキャプチャ時に両方の実要素がある構成。Portal の詳細は Catalog から非同期で描画され、Website の一覧プレビューと Repository の一覧グリフは対応する詳細画像が無い。表示のために取得を待たせず、一覧・詳細のスタックを使う |
| M10・M11 FLIP と再配置 | 760／820 ms の参照は DOM 書き換え前後の矩形計測が必要。公開日順の反転ではページ内に同じカードが残らない場合があり、絞り込み操作では位置計測が順方向の同期処理を増やす。即時更新を採用 |
| M12 円形テーマ | 760 ms の参照は新テーマを全画面でキャプチャする。Portal ではテーマ、入力、ナビ全体に同じ遮蔽範囲が掛かるため、既存の即時切り替えを継続 |

## 本番の変更前ベースライン

公開側の `assets/portal.js` の SHA-256 が `b4482c2` と一致した。HTTP/2 と `Cache-Control: max-age=600` を確認。Chromium 156 の外部ブラウザー、1920 × 993、スロットリングなしの 1 回の観測で、Home は Catalog 1 件、キャッシュ再訪では転送 0 B。Documents は Catalog 8 件、69,121 B。LCP は Home の訪問順で 204／72 ms、Documents は 220 ms。外部ブラウザーでは開始前に Home を開いているため、公開データは観測値として記録し、冷キャッシュ比較にはローカル結果を使う。 [公開計測の記録](contextual-motion/pages-baseline.txt)

## 通常速度の録画

Home → Documents → Document Detail → 戻る → Websites → ページ送り往復 → Collections → Collection Detail → 戻る → テーマ切り替え。モバイルのナビゲーションはタッチ操作。動画は 25 fps の記録で、性能計測のフレーム間隔とは別に扱う。本文の位置と透過、ヘッダーの重なり、シェルの固定を途中フレームでも確認した。

- デスクトップ（ライト） [Before](contextual-motion/before-desktop.webm) ／ [After](contextual-motion/after-desktop.webm)
- モバイル（ダーク） [Before](contextual-motion/before-mobile.webm) ／ [After](contextual-motion/after-mobile.webm)

## 操作と復旧の検証

- 公開ビルドで Browser Smoke が成功した。標準の検索・絞り込み・ページ送り・履歴、モバイルの短い画面での結果フォーカス、Viewer、バージョン付き JavaScript と Catalog が 404 を返した場合の復旧を含む。
- 同階層の遷移中に検索欄を座標でクリックして文字を入力した。前進中は移動した Viewer リンクを座標でクリックし、Viewer が開くことを確認した。独立レビューでは Chromium の BFCache を有効にし、戻る・進む両方でキャッシュから復元して方向を確認した。
- Reduced Motion、View Transition を無効にした構成、従来のライト／ダーク切り替えも Browser Smoke に含む。Portal、Viewer、Trend、同期、Node の既存検証が成功した。
- 比較用の公開ビルド間で、Catalog のファイル名と内容がすべて一致した。既存の Home Projection、HTTP キャッシュ、ファイル単位の取得共有と復旧を保持した。

## 再実行

```bash
npm ci
npx playwright install chromium
git worktree add --detach /tmp/mrc-motion-before b4482c2
node /tmp/mrc-motion-before/tools/build_portal.cjs /tmp/mrc-motion-before-pages
node tools/build_portal.cjs /tmp/mrc-motion-after-pages
PORTAL_LAB_CONTEXTUAL=1 node tools/measure_portal_performance.cjs /tmp/mrc-motion-lab 2 0 \
  before=/tmp/mrc-motion-before-pages after=/tmp/mrc-motion-after-pages
python tools/summarize_portal_performance.py /tmp/mrc-motion-lab
node tools/record_contextual_motion.cjs /tmp/mrc-motion-video \
  before=/tmp/mrc-motion-before-pages after=/tmp/mrc-motion-after-pages
PORTAL_SMOKE_ROOT=/tmp/mrc-motion-after-pages npm run test:browser-smoke
```

ラボは Chromium のモバイルエミュレーション（390 × 844、DPR 2）、4 倍 CPU スロットリング、80 ms の通信遅延、gzip、ETag／max-age 600 のローカル配信。通常速度の動画は独立した試行で、デスクトップのライトテーマとモバイルのダークテーマから開始する。フレーム間隔と同期処理はラボで測り、動画では方向と連続性を確認する。実機 GPU の計測はこの環境では行えない。
