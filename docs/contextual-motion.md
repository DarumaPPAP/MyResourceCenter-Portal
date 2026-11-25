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

## ローカル性能

モーション有効時の 2 試行の中央値。初期表示はナビゲーションから最初のカードまたは詳細が表示されるまで。p95 は各試行の最初の 1.5 秒のフレーム間隔。

| 画面 | 初期表示 (ms) | LCP (ms) | フレーム間隔 p95 (ms) |
| --- | ---: | ---: | ---: |
| Home 初回 | 1,009 → 730 | 816 → 590 | 110.0 → 33.3 |
| Home 再訪 | 339 → 184 | 244 → 164 | 33.3 → 16.7 |
| Websites 初回 | 782 → 776 | 1,040 → 1,024 | 29.6 → 31.7 |
| Websites 再訪 | 412 → 397 | 416 → 386 | 33.3 → 32.1 |
| Documents | 778 → 466 | 740 → 458 | 62.5 → 33.3 |
| Document Detail | 484 → 389 | 452 → 376 | 28.8 → 30.9 |

全ナビゲーションの観測区間で CLS は 0。Home の初回は 1 Catalog・1,632 B 転送、Home と Websites の再訪は 0 B 転送。Documents と Document Detail の本文アニメーション開始はナビゲーション開始後の中央値 240／313 ms。モーションなしの場合は開始マークがない。

| Websites の操作、モーション有効時 | Before → After |
| --- | ---: |
| 検索同期時間の中央値 | 14.6 → 13.0 ms |
| ページ送り同期時間の中央値 | 15.8 → 13.8 ms |
| ページ送り Event Timing の中央値 | 96 → 96 ms |

全ルートを通す比較では、After の検索で 126 ms、Before でも 112.9 ms が各 1 回あり、全試行で 50 ms を下回る目標は未達だった。ページ送り同期処理は両モーション条件を含めて最大 18.3 ms。同期処理と入力から描画までの Event Timing は別指標で、Reduced Motion のページ送り Event Timing の中央値は 108 → 136 ms だった。Reduced Motion の Document Detail LCP には After の 680 ms の試行があり、少数試行でのばらつきとして記録した。

タッチ復旧を追加した版で Websites のみを測る再試験を各条件 3 回行った。After の全試行の最大は、検索 22.6 ms、ページ送り 19.5 ms。ページ送りのクリック区間に強制 Layout は計測されなかった。全ルート比較は静止したページ送りリンクでスタイルを更新しないよう絞り込んだ段階、追加試験はタッチの互換クリックまで位置を保持する修正後に採取した。 [操作再試験の集計](contextual-motion/interactions/summary.json) ／ [生データ](contextual-motion/interactions/0-runs.json.gz)

モーション有効時の CDP トレースで、ページ送りのクリック中の Layout は両版とも計測されなかった。Documents の Style／Layout／Paint／Raster／Compositor Commit は 68.9／92.1／16.1／36.7／69.3 → 53.3／68.8／35.5／12.4／36.4 ms。Document Detail の Paint は 28.8 → 50.3 ms。見た目の連続性と引き換えに一部の描画負荷が残る。レイヤー数はこの Chromium の CDP が比較可能な値を返さず集計外。60 Hz 実機でのフレーム間隔は今回のラボから判定できない。

- [計測集計](contextual-motion/summary.json) ／ [生データ](contextual-motion/0-runs.json.gz)
- [CDP トレース Before](contextual-motion/0-before-no-preference.trace.json.gz) ／ [After](contextual-motion/0-after-no-preference.trace.json.gz)
- [Reduced Motion Before](contextual-motion/0-before-reduce.trace.json.gz) ／ [After](contextual-motion/0-after-reduce.trace.json.gz)

## 操作と復旧の検証

- 公開ビルドで Browser Smoke が成功した。標準の検索・絞り込み・ページ送り・履歴、モバイルの短い画面での結果フォーカス、Viewer、バージョン付き JavaScript と Catalog が 404 を返した場合の復旧を含む。
- 同階層の遷移中に検索欄を座標でクリックして文字を入力した。前進中は移動した Viewer リンクを座標でクリックし、モバイルでもタップして、両方で Viewer が開くことを確認した。独立レビューでは Chromium の BFCache を有効にし、戻る・進む両方でキャッシュから復元して方向を確認した。
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
PORTAL_LAB_CONTEXTUAL=1 PORTAL_LAB_WEBSITES_ONLY=1 node tools/measure_portal_performance.cjs /tmp/mrc-motion-interactions 3 0 \
  before=/tmp/mrc-motion-before-pages after=/tmp/mrc-motion-after-pages
node tools/record_contextual_motion.cjs /tmp/mrc-motion-video \
  before=/tmp/mrc-motion-before-pages after=/tmp/mrc-motion-after-pages
PORTAL_SMOKE_ROOT=/tmp/mrc-motion-after-pages npm run test:browser-smoke
```

ラボは Chromium のモバイルエミュレーション（390 × 844、DPR 2）、4 倍 CPU スロットリング、80 ms の通信遅延、gzip、ETag／max-age 600 のローカル配信。通常速度の動画は独立した試行で、デスクトップのライトテーマとモバイルのダークテーマから開始する。フレーム間隔と同期処理はラボで測り、動画では方向と連続性を確認する。実機 GPU の計測はこの環境では行えない。

## 最終レビュー

デスクトップのライトテーマとモバイルのダークテーマで、既存の Before／After 動画を通常の再生速度で比較し、遷移途中のフレームも点検した。

- **同階層**。After では旧見出しが薄くなり、新しい本文が現れる段階を確認できる。モバイルの細い幅では旧見出しと新見出しの文字が短く重なる。
- **一覧と詳細**。詳細は下から入り、一覧は上側から戻る。モバイルの履歴復元では、旧見出しが復元位置のサムネイルの上を短く通過する場合がある。サイドバー、トップバー、モバイルナビの位置は安定している。
- **ページ送り**。前後の移動は結果領域内で完結し、フォーカスされた先頭結果は静止する。24 px の移動と既存の遷移時間を維持する。
- **操作**。既存の途中フレームを固定した Viewer テストを維持し、通常進行中の検索欄でマウスとタッチの押下、位置保持、解放、信頼済みクリックと文字入力を別々に検証した。クリックの伝播が途切れる場合も、解放後のタイマーから静止表示に戻る。
- **障害時**。ナビゲーション、テーマ、検索の初期化を済ませてから Motion を開始する。Observer 未提供、コンストラクター、`observe`、初期処理、結果コールバックの障害を注入した。例外時は押下・入場・キャプチャの状態を解除し、現在のページを静止表示にする。

最終レビュー修正前の `4fac0e1` と修正後を、同じ Websites 単独のローカル条件でモーション有効・Reduced Motion 各 3 回比較した。修正後の最大同期時間は検索 **22.6 ms**、ページ送り **21.2 ms**。クリック中の Layout は全 4 トレースで 0 ms だった。Catalog のファイル名・内容・転送量は一致した。モーション有効時のページ送り Event Timing 中央値は 112 → 136 ms、Reduced Motion は 96 → 128 ms。同期処理と表示までの時間の差を追えるよう、少数試行の生データとトレースを保存した。 [最終レビュー再試験](contextual-motion/final-review/summary.json) ／ [生データ](contextual-motion/final-review/0-runs.json.gz)


## 画面遷移品質の再修正

公開後の操作フィードバック（点滅、カクつき、旧見出しの残像、不自然な本文移動）を受けて、旧見出しだけのキャプチャと新本文の低い不透明度・最大106pxの移動を廃止した。旧面のみを短い一体の演出として退場させ、新本文は通常描画のままとする。同階層は320msの旧面フェード、一覧・詳細は340msの方向付き退場（±24px）。これは従来の Page Stack を完全再現するものではない。入力・フォーカス・スクロール時は旧面を直ちに破棄する。旧面はトップ位置でのみキャプチャし、視覚範囲を1ビューポート以内にクリップする。クリップによって実際のGPU割当量まで制限できるとは限らないため、長い一覧のRaster／GPU負荷は別途計測する。履歴復元位置を覆わず、ViewerとReduced Motionは即時遷移を維持する。検索ツールバーは移動させず、直接表示時の見出し・結果およびページ送りは小さい振幅と高い初期不透明度に調整した。

ローカルのChromium 144では、20件の簡略化した同一文書のテスト画面で旧面だけのView Transitionを実行し、1280×900／390×844で新本文の不透明度1、検索欄のHit Testing、マウスクリックと文字入力が成立することを確認した。実際のリポジトリの取得およびローカルHTTPナビゲーションは実行環境のDNS・ブラウザ制限で失敗した。したがって実Portalでの文書間遷移、動画の視覚品質、GPU性能は未検証であり、過去の計測・動画を本修正の成果として流用しない。Browser Smokeは旧面の遷移中の実入力と新本文の静止を確認するよう更新した。Merge前に最新ビルドのBrowser Smokeと実画面の動画を確認すること。
