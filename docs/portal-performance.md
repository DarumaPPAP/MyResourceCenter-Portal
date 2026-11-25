# Portal の性能検証

## 検証範囲

Before は GitHub の最新 `main` と照合した `1c4ad5969516891a66fb29e50a5a142bdfef8b95`。After は主要実装 `709c7a4` の Pages 用静的出力。現行 Catalog は Websites 207 件、Document Presentation 102 件。同条件の Before／After はローカルの公開用ビルドで比較した。GitHub Pages の公開版は別のブラウザー実行環境から確認した。

## GitHub Pages の変更前ベースライン

公開の `index.html`、`manifest.json`、Website シャード 1 の SHA-256 が `1c4ad59` と一致した。公開側の 3 URL は HTTP/2、`Cache-Control: max-age=600`、ETag を返し、同じ ETag の `If-None-Match` に HTTP 304 で応答した。 [HTTP の取得記録](portal-performance/pages-http.txt)

公開側で CPU・通信スロットリングをかけず、Chromium 156、1,920 × 993 CSS px のブラウザーから Home → Websites → Home → Websites の順で開いた。Home は初回・再訪とも Catalog 8 件、70,402 バイト、Websites は両方とも 8 件、44,454 バイトを転送した。Catalog のキャッシュヒットは 0 件。Websites 初回の Manifest は他の Catalog の最終応答の約 2 ms 後に開始し、ナビゲーションから 277 ms で完了した。After の公開測定はマージとデプロイ後に実施できる。 [公開側の Resource Timing](portal-performance/pages-resource-timing.json)

## 採用した変更

- 公開用ビルドが、既存の Document Presentation と Collection、Resource を使って Home 向け JSON を生成する。特集資料 4 件と Reading Path 3 件の選択規則を開発用ページと共有する。HTML から先行取得し、ビルドで上限 10,000 バイトを検証する。
- 公開 Catalog の安定 URL は既存の利用者向けに配信を続ける。ページからの読み込みは、ビルドが生成した内容ハッシュ付きの物理ファイルに切り替えた。同じ内容のシャードは更新後も同じ URL を使い、ブラウザー標準の HTTP キャッシュに載る。公開ビルドでは Manifest の Source Commit をローダーに含め、Site Icon のための個別取得を省く。
- 同じドキュメント内では、物理ファイルごとに取得とデコードを共有する。失敗した Promise を取り除き、次の読み込みで該当ファイルを再試行できる。バージョンが異なるデータを安定 URL から補完しないため、デプロイをまたいで古い HTML がキャッシュに残り、古い内容ハッシュが CDN に無い場合はページの再読み込みが必要になる。初期化に必要なバージョン付きスクリプトが見つからない場合も、再読み込みボタンを表示する。
- Websites の Host、Author、Facet、検索文字列、日付を初期化時に計算する。日付順は方向ごとに再利用し、同じ検索条件でのページ送りでは結果を再利用する。同じカードが同じ順序で並ぶ場合は DOM を保持する。検索と Filter の AND 条件、同日および日付不明の順序、URL と履歴を検証した。
- Websites と Documents のページ送りでは、古いページリンクを結果 DOM の更新前に置き換え、新しいタイトルへのスクロールとフォーカスを描画後に実行する。Websites は 4 件目以降に `content-visibility: auto` を使う。Home の主要画像を優先し、Websites のプレビュー背後にある Site Icon は優先度を下げる。プレースホルダーと既存のモーションは表示に残る。

## ラボの設定

Chromium 151.0.7922.173、390 × 844 CSS px、DPR 2、タッチ有効、CPU 4 倍スロットリング、通信遅延の設定 80 ms、下り 200 kB/s、上り 95 kB/s。両版を同じローカル HTTP サーバー実装で配信し、両方に `Cache-Control: public, max-age=600`、ETag、テキストの gzip 圧縮を適用した。各条件 3 試行で開始順を入れ替え、新しいブラウザーコンテキストから Home → Websites → Collection 詳細 → Home → Websites と遷移した。再訪は同じコンテキストで改めてページを開き、HTTP キャッシュを計測した。

初期表示時間はナビゲーション開始から最初の結果カードの表示を Playwright が確認するまで。LCP は表示確認の約 1 秒後までの観測値。CLS 欄は同区間で直前の入力を除外した Shift の合計。Event Timing はブラウザーが報告した単一クリックの時間で、同期時間とは範囲が異なる。下記の表は特記がなければ中央値。

## 現行データでの Before／After

| ページ・条件 | Catalog 読み込み数 | Catalog 転送バイト | 初期表示時間 (ms) |
| --- | ---: | ---: | ---: |
| Home 初回 | 8 → 1 | 69,535 → 1,632 | 1,448 → 656 |
| Websites 初回 | 8 → 7 | 44,034 → 43,489 | 1,158 → 708 |
| Collection 詳細 | 12 → 8 | 98,324 → 22,381 | 1,179 → 653 |
| Home 再訪 | 8 → 1 | 69,535 → 0 | 966 → 182 |
| Websites 再訪 | 8 → 7 | 44,034 → 0 | 921 → 273 |

モーション有効時。Home の展開後 Catalog は **311,782 → 2,906 バイト**。リソース全体の転送は 173,061 → 106,323 バイト。Collection 詳細で同一 URL の重複は 4 → 0 件となり、8 読み込みのうち 5 件が HTTP キャッシュから返った。再訪の Home と Websites は、表のすべての Catalog 読み込みがキャッシュから返った。Websites は Manifest を含む後続リクエストを省いた。

| 指標 | モーション有効 | Reduced Motion |
| --- | ---: | ---: |
| Home LCP (ms) | 540 → 516 | 468 → 484 |
| Websites LCP (ms) | 1,172 → 960 | 1,136 → 1,012 |
| Home 起動時フレーム間隔 p95 (ms) | 44.2 → 33.3 | 50.0 → 33.4 |
| Websites 起動時フレーム間隔 p95 (ms) | 16.8 → 26.8 | 16.8 → 30.1 |
| Websites 検索同期時間 (ms) | 34.9 → 14.9 | 31.5 → 12.2 |
| Websites ページ送り同期時間 (ms) | 179.4 → 15.3 | 151.9 → 14.3 |
| Websites ページ送り Event Timing (ms) | 224 → 104 | 200 → 128 |
| Websites ページ送り後の最大フレーム間隔 (ms) | 199.9 → 66.7 | 183.2 → 100.0 |

Home と Websites の CLS は全条件で 0。Collection 詳細は 0.084 → 0。Reduced Motion の Home LCP 中央値は 16 ms 増え、モーション有効時の中央値は 24 ms 減った。Websites では結果表示が約 450 ms 早まった一方、起動時のフレーム間隔 p95 は両モードで増えた。起動時の集計は先頭 1.5 秒を対象とし、結果の表示・画像処理が発生するタイミングも変わる。操作後の描画には同期時間の短縮後も改善余地がある。

### CDP トレース

モーション有効時の個別トレースで、クリック中の Style Recalculation / Layout は **43.1 / 130.2 → 0.05 / 0 ms**。Before では結果 DOM を変更した後にフォーカス中のページリンクを置き換える箇所と、直後のスクロールにスタックがあった。After ではクリック時の負荷が減り、表示・フォーカスに必要な Layout は後のフレームに現れる。クリックから約 350 ms 後までの Main Thread タスクは 324.9 → 242.5 ms、Paint は 39.3 → 23.6 ms。Raster は 17.5 → 38.5 ms と増えた。ブラウザーが新しい表示位置に向けて後続フレームの処理を行うため、クリックの同期時間と区別して評価した。

Home の診断用 JSON Parse は 8.1 → 0.8 ms。起動時の Script Evaluation、Style、Layout、Paint、Raster、Compositor Commit、Image Decode は保存済みトレースと集計から確認できる。各トレースは計時とは別の 1 試行で、反復計測の中央値と直接比較しない。

## スケール試験

実データ 207 件に対し、既存メタデータを複製してタイトルと ID を変え、別のディレクトリに 1,000 件・5,000 件の Websites Catalog を作った。追加分には新規画像を用意していない。合成データの試験は、新しいコンテキストで Websites に直接アクセスした。以下はモーション有効時の中央値。ネットワーク欄は HTML 本体を除く Resource Timing の集計で、実データの Websites は先に Home を訪問している。

| Websites データ | 初期表示 (ms) | 検索同期 (ms) | ページ送り同期 (ms) | 初期 JS ヒープ (MB) | リソース読み込み数 | 転送 (kB) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 現行 207 件 | 1,158 → 708 | 34.9 → 14.9 | 179.4 → 15.3 | 4.91 → 5.09 | 18 → 17 | 104.0 → 103.9 |
| 合成 1,000 件 | 1,887 → 1,853 | 50.4 → 9.2 | 173.0 → 14.4 | 3.68 → 4.13 | 15 → 14 | 209.2 → 210.4 |
| 合成 5,000 件 | 5,622 → 5,475 | 174.6 → 10.4 | 331.4 → 10.3 | 10.54 → 12.29 | 14 → 13 | 888.5 → 889.7 |

両モーション条件を含む After 全試行の最大は、検索 32.0 ms、ページ送り 27.4 ms。5,000 件の個別トレースの Websites 起動区間では、Main Thread のタスク累計が 1,523 → 1,550 ms、Layout が 164 → 121 ms、診断用 JSON Parse が 59 → 60 ms。合成 5,000 件は Catalog の圧縮転送が約 866 kB のままで、初期表示に約 5.5 秒かかる。事前計算した検索文字列と日付などを保持するため、同条件の起動時 JS ヒープは約 1.75 MB 増えた。今の実データ規模で操作の同期処理は目標を満たしており、単一の読み込みあたりの転送量を減らすことが大規模 Catalog の課題として残る。

## 検証と計測ファイル

既存の Portal／Viewer／Trend Validation、公開データ同期回帰、Node の検索・履歴・Home・デプロイ契約、公開ビルドに対する Chromium Browser Smoke が成功した。公開用の出力を 2 回生成して同一入力の URL が一致することを確認した。シャード更新時に変更ファイルの URL が新しくなり、同じ内容の Catalog URL は再利用される。旧ローダーへのリクエストは対応するファイルが無ければ失敗する。Chromium では短いモバイル画面でキーボード操作後も先頭結果へフォーカスし、Back 操作で結果に戻る。レビュー後に生成 HTML に追加した復旧ガードは、旧ローダーへの HTTP 404 を再現し、ボタンで再読み込みできることを検証した。ガード追加前後で Catalog と JavaScript ファイルの生成内容を比較し、一致を確認した。

- [集計 JSON](portal-performance/summary.json)
- [現行データの生データ](portal-performance/0-runs.json.gz) ／ [1,000 件](portal-performance/1000-runs.json.gz) ／ [5,000 件](portal-performance/5000-runs.json.gz)
- [現行 Before のトレース](portal-performance/0-before-no-preference.trace.json.gz) ／ [現行 After のトレース](portal-performance/0-after-no-preference.trace.json.gz)
- [Reduced Motion の Before](portal-performance/0-before-reduce.trace.json.gz) ／ [Reduced Motion の After](portal-performance/0-after-reduce.trace.json.gz)
- [1,000 件の Before](portal-performance/1000-before-no-preference.trace.json.gz) ／ [1,000 件の After](portal-performance/1000-after-no-preference.trace.json.gz)
- [5,000 件の Before](portal-performance/5000-before-no-preference.trace.json.gz) ／ [5,000 件の After](portal-performance/5000-after-no-preference.trace.json.gz)

## 再実行

リポジトリのルートで依存を入れ、未使用のディレクトリへ出力する。Chromium をインストール済みの場合は `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` を指定できる。

```bash
npm ci
npx playwright install chromium
git worktree add --detach /tmp/mrc-perf-before 1c4ad5969516891a66fb29e50a5a142bdfef8b95
node tools/build_portal.cjs /tmp/mrc-perf-after
node tools/measure_portal_performance.cjs /tmp/mrc-perf-results 3 0 \
  before=/tmp/mrc-perf-before after=/tmp/mrc-perf-after

for size in 1000 5000; do
  node tools/make_portal_benchmark_fixture.cjs /tmp/mrc-perf-before "/tmp/mrc-perf-before-$size" "$size"
  node tools/make_portal_benchmark_fixture.cjs . "/tmp/mrc-perf-source-$size" "$size"
  node -e 'require("./tools/build_portal.cjs").buildPortal(process.argv[1],process.argv[2]).catch(error=>{console.error(error);process.exitCode=1;});' \
    "/tmp/mrc-perf-source-$size" "/tmp/mrc-perf-after-$size"
  node tools/measure_portal_performance.cjs /tmp/mrc-perf-results 3 "$size" \
    "before=/tmp/mrc-perf-before-$size" "after=/tmp/mrc-perf-after-$size"
done

python tools/summarize_portal_performance.py /tmp/mrc-perf-results
PORTAL_SMOKE_ROOT=/tmp/mrc-perf-after npm run test:browser-smoke
```

公開側を計測できる環境では、同じスクリプトに `pages=https://darumappap.github.io/MyResourceCenter-Portal/` を指定する。公開デプロイが指すコミットをその実行時に記録する。

`*-runs.json.gz` には Navigation／Resource Timing、CDP の通信・レスポンスヘッダー、LCP、Layout Shift、Long Task、Event Timing、フレーム間隔、JavaScript ヒープを含む。Chrome DevTools の Performance に `*.trace.json.gz` を読み込み、`lab:click:start` と `lab:click:end` で同期区間を確認できる。Trace 用の試行だけ、Catalog に対して `Response.text()` と `JSON.parse()` を明示的に呼び、`lab:json:*` の時間を計測する。通常の比較試行は本番の `Response.json()` を使う。
