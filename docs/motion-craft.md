# Portal の画面遷移と閲覧操作

2026-11-25。比較の起点は最新 main の [`654f3d1`（#133）](https://github.com/DarumaPPAP/MyResourceCenter-Portal/commit/654f3d13bd4753e1d88c6e57c11e91a88549a576)。[Contextual Motion](contextual-motion.md) と [Technical Motion](technical-motion.md) はそれぞれの時点の記録。

## ユーザーから示された判断基準

- 技術情報を毎日検索し、読み、発見するための Portal。落ち着いた視認性と操作速度を優先する。
- 「画面が点滅するように切り替わる」「Animationがカクつく」は、実画面の録画で確認する。数値仕様と CI も検証する。
- 頻繁な操作では反応を優先する。新しい画面を使うために演出の終了を待たせない。階層や現在地を伝える場合に、その関係を示す要素を動かす。

下記の180ms、方向表示の位置、押下時の縮小は試作とラボ確認に基づく今回の実装判断。ユーザーが試作を評価した結果はこの記録に含まれていない。

## 環境と資料

Cloud に復元されたディレクトリの Playwright 1.62.1、Chromium 151.0.7922.173、FFmpeg 7.1.5 を使用。保存済み `start_skill` はワークスペースと検出一覧で確認できなかったため、`/workspace/shared/design-engineering/.agents/skills` の本文と Reference を直接読み込んだ。復元されたファイルを、公開アーカイブのハッシュと内容で照合した。Emil は `64eb3deb9a5fbfa041faf783e0bc3fd635872e9c`、UI UX Pro Max は `8db36338810d0942567b97ce439affd1619fcf31`。スキルと依存の再インストールは不要だった。Windows の `registered Core process has no package identity` は Linux 実行中に発生していない。

| 使った本文と Reference | 採用した判断 |
| --- | --- |
| Emil `emil-design-eng`、`improve-animations/AUDIT.md`、`review-animations/STANDARDS.md` | 頻度と目的で演出を選別。操作対象に入場アニメーションを掛けず、通常速度と低速の録画を確認 |
| `remove-animations`、`find-animation-opportunities` | 検索、フィルター、ページ送り、初回カード、Home のスクロールリビールを静止。階層の変化と押下を演出の対象に選定 |
| `animation-performance`、Performance Cheatsheet | 既存の計測・CDP traceを再利用。本文スナップショットを取り除き、固定範囲のマーカーで transform と opacity を使う |
| `prototype/PICKER.md`、`choreograph/RECIPES.md`、`animate/RECIPES.md` | 実データの5方式を独立した試作で比較。1要素を主役に選び、前進・後退を対にする。押下は即座に縮小し、離したときに120msの ease-out で戻す |
| `break-ui/CATALOG.md`、`mobile-native` | 小さい画面、速いタップ、押下の色、幅の切替、フォーカスの遮蔽、API障害、履歴復元を確認 |
| `learn-taste` | ユーザーが示した基準と今回の試作判断に出典を付け、既存の設計資料からここへ参照を追加 |
| UI UX Pro Max `quick-reference.md`、`pro-rules.md`、`scripts/search.py` | Design System の Documentation / Minimalism & Swiss Style を参照。検索優先、既存の落ち着いた配色と文字階層、タップ領域、フォーカス、`color-accessible-pairs`、`content-jumping`、`contextual-live-badge-updates` を適用 |

UI UX Pro Max の Design System 検索は `technical knowledge base documentation search`、Motion 2、Density 7。アクセシビリティと遷移は `touch target focus not obscured` と `spatial continuity reduced motion` を `--domain ux` で照会した。検索結果から画面構成の判断に使える原則を選び、Portal の Neutral / Teal トークンと日本語フォントを使用した。FAQ やサポート導線、GSAP は今回の閲覧フローに対応しない。

参考サイトの [Page Stack](https://motion-reference.takayustudio.jp/index.html#motion=page-transition-stack) をブラウザで開き、1×と0.25×で再生してタイムラインと実行コードを照合した。デモの全周期は3,300msで、遷移部分は720ms。前進で不透明な新しい面が下から上がる間、旧面は奥で縮んで暗くなる。後退は同じ経路を反転する。一つの境界と逆向きの経路により、面の前後が読み取りやすい。Portal ではその因果関係をパンくずの短い方向表示に適用した。関連する [Route Slide](https://motion-reference.takayustudio.jp/index.html#motion=route-slide) は階層の方向、[View Crossfade](https://motion-reference.takayustudio.jp/index.html#motion=view-crossfade) は空白フレームを避けるタイミングの参考にした。

## 変更前の監査

静的HTMLと共通シェルを持つマルチページ構成。共通ナビ・テーマは `assets/portal.js`、Design Tokens は `assets/site.css`、各一覧と詳細はページ別 CSS と Catalog から描画する。Catalog は指紋付きJSON、キャッシュと進行中リクエストの共有、Home専用Projectionを使用。検索とページ送りは各画面の組み込み処理と History API、画面間は通常リンクを使用する。Viewer は専用HTML。対象リポジトリと親ディレクトリを確認し、適用される `AGENTS.md` は見つからなかった。Pages のステージング、Validate Portal、Browser Smoke が既存検証の入口。

| 優先度 | 最新 main の箇所と根拠 | 適用と対応 |
| --- | --- | --- |
| P0 | `assets/site.css:218–257`、`assets/portal.js:170–194`。旧本文全体を320–340msで消す。通常速の Desktop Light で Documents の上に Home の見出し、検索欄、画像が現れた | Emil Frequency / Performance。本文をキャプチャ対象から外し、実ページの背景と本文を表示 |
| P1 | `assets/site.css:159–166,258–278`。初回カードは10px、最大48msの遅延。ページ送りは最初の3枚が14px動き、キーボードでも発生。押下を止めるためにJSで一時停止していた | Emil Remove / Interruptibility。ページ送りとフォーカスは既存の操作系を使い、カードや見出しは静止 |
| P1 | `assets/portal.js:69–85`、`assets/site.css:22`。390pxの Collections は選択リンク右端が51px隠れ、Trendは全体が隠れた | UI UX Pro Max `nav-state-active`。モバイル表示開始時に水平レール内で現在地を表示。ページの縦位置は保持 |
| P1 | `assets/documents.css:87–88`。Dark の現在ページは白対 `#7bc9bd` で1.92:1 | `color-accessible-pairs`。既存の濃色 `#091221` を `--on-accent` とし、同じ背景色で9.76:1 |
| P1 | `assets/site.css:1,105–107`。320×375pxのWebsitesページ送りで先頭タイトルの上約12pxが sticky ヘッダーに隠れた | `focus-not-obscured`。テーマ切替ラベルの不要な折り返しを抑え、実際のヘッダー境界を使いテスト |
| P1 | `document.html:26`、`website.html:26`、`collection.html:20`。別文書の開始フレームが短い読み込み行と中央寄りのフッターに変わった。 `assets/site.css:149–157` の一覧シマーもデータ取得に重なる | `content-jumping` と Choreography。詳細は高さを持つ静止状態、一覧は既存寸法の静止スケルトンと状態テキスト |
| P2 | `assets/home.css:73,81–111`、`assets/human-portal.js:182–207`。検索欄は小画面13px。技術イラストの走査、読み順とカードの入場に複数タイムライン | `mobile-native` と Remove。検索欄は16px、イラスト・カードは表示時から静止 |
| P2 | `assets/websites.css:26–27,43–50`、`assets/documents.css:84–91`。Mobile Website 詳細が39×19px、ページ番号は高さ36px。濃い青のタップ表示を Dark の Collection で確認 | `touch-target-size` と `mobile-native`。対象を44pxに拡大し、タップ表示をアクセント系の色に調整 |
| P2 | `documents.html:35–36`、`websites.html:43–44`。更新件数とカード群が両方ライブリージョン | `contextual-live-badge-updates`。件数を通知し、結果リストの領域名を保持 |
| 見送り | 全体の配色・書体の置換、共有サムネイルの実装、独自ルーター、画像ロードを待つレイヤー演出 | 現行画面の読み順とデータ取得を基準にした。結果・詳細間のサムネイルには同一画像や初回表示時の確実なペアがない |

## 試作と採用判断

本番相当のステージングビルドを別ディレクトリにコピーして使用した。Catalog と画面のHTMLは実物。Desktop Light と Mobile Dark で実際のリンクをクリックまたはタップし、通常速と4倍時間の両方で Home → Documents → 資料詳細を録画。共通の静止背景と、頻度が高い箇所の静止状態で比較した。

| 案 | 実際に試した構成 | 判断 |
| --- | --- | --- |
| A 静止 | ページを通常リンクで切替。本文とマーカーがすぐ表示される | 検索、フィルター、ページ送り、キーボード、履歴、Viewer、Reduced Motion に適用 |
| B フェード | 旧面を使わず、新面の不透明度を.87→1、180ms。背景を固定 | 文字が二重にならない。関係を示さずに見出し・フォーム・画像を一斉に薄くするため見送り |
| C 方向 | 階層が変わると新本文が±14px、180ms。文字は不透明 | 往復の関係は分かる。検索欄やクリック位置まで変わるため、方向を小さい装飾面に縮小 |
| D レイヤー | 旧面10%と新面28%の水平移動を重ねる。新面は不透明、230ms、表示範囲にクリップ | 1本の縁で面の関係を読み取れる。スクロール済みの面・非同期描画・スナップショットの取得状況によって再生の見え方に差。広い面をキャプチャするコストもある |
| E 現在地と階層 | 共通する現在地マーカーを移動。階層だけパンくずの短い装飾を移動 | 採用。本文と操作領域を固定し、Desktop のセクション移動と一覧・詳細の関係を区別できた |

### 試作の計時

4倍CPU、録画あり、各1試行。資料詳細の起動1.2秒までの rAF 間隔の p95 / p99（ms）。レンダーとCatalog取得が重なるため、採用判断にはフレームと操作も使った。試行数を増やした性能比較は本番相当ビルドで行った。 [全20本の比較録画](motion-craft/prototype-recordings.tar)・[生データ](motion-craft/prototype-runs.json.gz)

| 案 | Desktop Light | Mobile Dark |
| --- | ---: | ---: |
| A | 75.0 / 95.0 | 69.2 / 116.7 |
| B | 100.0 / 152.6 | 56.6 / 110.3 |
| C | 248.3 / 276.3 | 99.9 / 121.6 |
| D | 193.4 / 225.4 | 50.0 / 86.7 |
| E | 136.5 / 160.6 | 100.0 / 124.0 |

実装では異なるセクションをポインターで開くと Desktop の共通マーカーが180msで移動する。一覧から詳細、その逆ではパンくず直下の22×2pxのマーカーだけが10pxを逆方向から移動する。Mobile の横長レールは即時に現在地を表示する。 共通スクリプトが最初の `pagereveal` に間に合わない場合も、ブラウザは静止した本文を表示する。HTTP `no-store` の試行でこのフォールバックを確認した。親子要素に追加の登場演出は無い。クリック、タップ、ホイール、キーボード、フォーカス、本文スクロールで演出を中断できる。横レールの初期位置合わせは独立して完了する。

## ブラウザレビュー

- Desktop の録画で、移動後の1フレーム目から見出しと検索欄が不透明かつ静止。変更前は、Documents のパンくずが切り替わった後も Home の本文が残り、その後のフレームで文字と画像が重なった。
- Dark Mobile の Collection 詳細では、同じ色の背景上で静止した読み込み表示から本文へ切り替わった。タップ表示は同系色。320px幅の試験では、初回実装のパンくず演出を横レールの `scroll` が中断することを独立レビューで見つけた。対象を本文スクロールに絞り、録画と View Transition の完了時間で完走を確認した。
- 390px のタッチエミュレーションで Documents の `?page=2` の y=2,619px から詳細へ行き、BFCache の Back で同じ位置とページ番号に戻った。Forward で同じ詳細を復元した。連続タップで詳細からパンくずを押しても移動できた。
- Browser Smoke は320、390、768、1280px、検索・フィルター・空状態、狭い画面での現在地とフォーカス、低速読み込み、View Transition API の例外、Reduced Motion、Viewer、旧Catalogからの復旧を検証する。Viewer の外部埋め込みはネットワークをブロックして経路とシェルを確認した。

### 録画

通常速度で再生。JSON は各操作のおおよその開始時刻（ms）。

| 画面 | 変更前 | 変更後 | 操作時刻 |
| --- | --- | --- | --- |
| Desktop 1080×720、Light | [動画](motion-craft/before-desktop.webm) | [動画](motion-craft/after-desktop.webm) | [前](motion-craft/before-desktop.json)・[後](motion-craft/after-desktop.json) |
| Mobile 390×844、Dark | [動画](motion-craft/before-mobile.webm) | [動画](motion-craft/after-mobile.webm) | [前](motion-craft/before-mobile.json)・[後](motion-craft/after-mobile.json) |

## Performance

Chromium 151、実 Catalog の Pages ビルド、CPU 4×。同じローカルHTTPサーバー設定、80msの遅延、下り200,000 B/sで測定。各条件で変更前後の順番を交替した。Desktop は1280×900、Mobile は390×844、DPR 2でタッチあり。Light / Dark、通常 / Reduced Motion を同じ条件で実施した。表の値は変更前 → 変更後の中央値。フレーム間隔はページ起動の最初の1.5秒で、読み込み・デコード・初期レイアウトを含む。

### Documents 起動

| 環境 | Motion | 試行数 | LCP (ms) | rAF p95 / p99 (ms) | 33.4ms超の間隔数 | 最長連続数 | シフト合計 |
| --- | --- | ---: | ---: | --- | ---: | ---: | ---: |
| Desktop Light | no-preference | 3 | 852 → 656 | 66.7 → 50.0 / 201.3 → 109.7 | 5 → 4 | 3 → 2 | 0.065 → 0.065 |
| Desktop Light | reduce | 3 | 716 → 636 | 76.7 → 50.0 / 177.3 → 118.0 | 6 → 5 | 5 → 2 | 0.065 → 0.065 |
| Mobile Dark | no-preference | 3 | 1016 → 676 | 113.4 → 63.3 / 219.9 → 146.0 | 5 → 5 | 4 → 3 | 0.000 → 0.000 |
| Mobile Dark | reduce | 3 | 628 → 576 | 53.3 → 50.7 / 143.3 → 114.5 | 4 → 5 | 3 → 3 | 0.000 → 0.000 |
| Desktop Dark | no-preference | 2 | 840 → 826 | 86.2 → 71.3 / 201.3 → 182.3 | 6 → 6 | 5 → 3 | 0.065 → 0.066 |
| Desktop Dark | reduce | 2 | 644 → 706 | 47.1 → 61.7 / 135.2 → 155.7 | 4 → 4 | 2 → 2 | 0.065 → 0.066 |
| Mobile Light | no-preference | 2 | 710 → 684 | 67.5 → 54.6 / 158.9 → 146.5 | 5 → 4 | 4 → 2 | 0.000 → 0.000 |
| Mobile Light | reduce | 2 | 612 → 528 | 61.2 → 40.8 / 145.0 → 104.7 | 5 → 4 | 3 → 2 | 0.000 → 0.000 |

### Websites 検索・ページ送り

検索は各試行10入力の同期処理中央値。ページ送りはクリックハンドラーの同期区間。Event Timing は入力待ちと描画待ちを含む。

| 環境 | Motion | 検索 (ms) | ページ送り (ms) | ページ送り Event Timing (ms) |
| --- | --- | ---: | ---: | ---: |
| Desktop Light | no-preference | 16.6 → 19.1 | 25.8 → 17.7 | 184 → 160 |
| Desktop Light | reduce | 19.2 → 17.5 | 26.5 → 21.1 | 184 → 176 |
| Mobile Dark | no-preference | 21.4 → 19.3 | 35.9 → 30.5 | 208 → 176 |
| Mobile Dark | reduce | 18.9 → 12.8 | 23.9 → 28.9 | 152 → 160 |
| Desktop Dark | no-preference | 23.5 → 16.6 | 33.4 → 27.8 | 224 → 176 |
| Desktop Dark | reduce | 17.5 → 21.6 | 31.4 → 31.9 | 200 → 268 |
| Mobile Light | no-preference | 20.0 → 21.2 | 27.1 → 23.1 | 164 → 168 |
| Mobile Light | reduce | 23.6 → 18.9 | 32.7 → 20.5 | 212 → 156 |

ネットワークを含む主計測で、Websites の同期検索は50ms超が前後とも200入力中2回。最大は79.2→97.4msで、50ms目標を外れることがある。増加は個別入力に限られ、検索処理・キャッシュ・レンダー最適化の経路は同じ。トレースは別試行のため、この最大値の原因は確認できていない。変更後の同期ページ送りの最大は36.9ms。

Documents も既存の Mobile 専用 Tool で、4倍CPUの同期区間を両版3回ずつ検証した。

| 画面 | 検索の各試行中央値 (ms) | ページ送り中央値 [範囲] (ms) |
| --- | ---: | ---: |
| documents | 12.4 → 18.8 | 25.5 [24.0–41.0] → 23.9 [15.3–28.0] |
| websites | 14.0 → 12.3 | 28.7 [27.0–29.3] → 24.5 [15.0–46.3] |

### キャッシュと Trace

| 通常 Motion | Home LCP cold (ms) | Home LCP warm (ms) | Websites LCP cold (ms) | Websites LCP warm (ms) |
| --- | ---: | ---: | ---: | ---: |
| Desktop Light | 972 → 864 | 328 → 212 | 1232 → 1232 | 592 → 560 |
| Mobile Dark | 796 → 756 | 244 → 172 | 1204 → 1116 | 628 → 448 |
| Desktop Dark | 1060 → 922 | 382 → 234 | 1358 → 1300 | 546 → 614 |
| Mobile Light | 868 → 786 | 264 → 222 | 1192 → 1212 | 568 → 436 |

全計測条件の Catalog 取得数と転送量の分布は同じ。各試行の Home cold は1件・1,632 B、Websites 初回は7件・43,489 B。再訪した Home / Websites はともに Catalog 転送0 B。

Mobile Dark、通常 Motion の Documents 起動を CDP trace で別採取した。ページが利用可能になってから1秒後までの処理時間の合計。Raster などは複数スレッドで並行する。

| Style Recalculation (ms) | Layout (ms) | JSスタック付き Layout (ms) | Paint (ms) | Raster (ms) | Compositor Commit (ms) | DroppedFrame イベント数 |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 89.3 → 24.7 | 123.7 → 77.3 | 1.3 → 0.0 | 50.1 → 20.1 | 62.2 → 8.2 | 22.8 → 25.9 | 32 → 14 |

上記の単一トレースで演出に起因する強制 Layout は観測されなかった。初期描画やフォーカスの Layout 自体は残る。切り替えの初期フレームは概ね改善した一方、16.7msには収まらない起動区間があり、Reduced Motion の一部の再訪値も増えた。例として Mobile Dark の Reduced Motion では Websites warm のLCPが460→516ms。測定間のばらつきと全指標は下記を参照。

起動区間のシフト合計はラボ指標。Desktop Light の Websites は0.107→0.106で0.1を上回る。CDP LayerTree の報告が空だったため描画レイヤー数は未検証。CPU 4×は低性能GPUを再現しない。実機のGPU・リフレッシュレート、Safari / Firefox、スクリーンリーダー、外部Viewerフレームの描画は今回未検証。

- [環境別の全指標と最小・最大](motion-craft/lab-summary.json.gz)・[全試行の生データ](motion-craft/lab-samples.tar)
- [Desktop Light / Mobile Dark CDPトレース](motion-craft/cdp-traces.tar)・[ページ送りトレース](motion-craft/pagination-traces.tar.gz)・[Mobile 同期試行](motion-craft/mobile-interactions.json.gz)

同じ条件の再計測には、ステージング後に下記を実行する。

```sh
PORTAL_LAB_CONTEXTUAL=1 PORTAL_LAB_VIEWPORT=desktop PORTAL_LAB_THEME=light \
  node tools/measure_portal_performance.cjs /tmp/mrc-motion-lab 3 0 \
  before=/tmp/mrc-motion-before after=/tmp/mrc-motion-after
python3 tools/summarize_portal_performance.py /tmp/mrc-motion-lab
```

## 再現手順

既存のリポジトリをセットアップした環境で実行する。各ステージ先は新規ディレクトリにする。ローカルで Home → Documents → 資料情報 → パンくずを操作すると、同階層と階層の差を確認できる。タッチエミュレーションで390pxまたは320pxを選択し、Collections、Theme、Browser Back/Forward、Reduced Motion を試せる。

```sh
git worktree add --detach /tmp/mrc-motion-baseline 654f3d1
node /tmp/mrc-motion-baseline/tools/build_portal.cjs /tmp/mrc-motion-before
node tools/build_portal.cjs /tmp/mrc-motion-after
python3 -m http.server 8765 --bind 127.0.0.1 --directory /tmp/mrc-motion-after
```

Portal は `http://127.0.0.1:8765/`。5案の比較では下記で出力されたURLを開き、下部ピッカーで切り替えてから実際のリンクを押す。URLに `?slow=1` を付けると4倍の時間、`?slow=0` で通常。 `?motion=a` から `?motion=e` で初期値、`?controls=0` でピッカーの描画を除外できる。試作ファイルは Pages の配信対象外。

```sh
node tools/motion-prototype/serve.cjs /tmp/mrc-motion-before /tmp/mrc-motion-prototypes
PORTAL_SMOKE_ROOT=/tmp/mrc-motion-after npm run test:browser-smoke
node tools/record_contextual_motion.cjs /tmp/mrc-motion-recordings before=/tmp/mrc-motion-before after=/tmp/mrc-motion-after
```

Playwrightをセットアップ済みのChromiumに向ける場合は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` を使う。録画ではPlaywrightのFFmpegまたは互換性を確認した既存のFFmpegを使用する。開発環境のポートや公開プレビューの新規設定は不要。
