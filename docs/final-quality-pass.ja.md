# Final Quality Pass 実測報告

HomeのKPI Stats strip、generic「探索する」Quick Cards、旧Dashboard構造を削除。既存Technical Environment SVG＋Game Development Knowledge Portal＋検索を主役とし、実資料4件、実Reading Paths3件（2〜3stepsと+N more）、editorial Trend入口を配置。既存thumbnail/viewer/reading-preview componentを再利用。

New Collection Candidateはspecific canonical topic、独立Role根拠付きmember3件以上、2種類以上のsuggested roles、説明可能なprogressionを必須とする。Role根拠はcanonical metadata、title、engine context、trusted source-grounded-derived summary。共通Topicだけや全overviewでは生成しない。理由・根拠はprivate queue内のみ。approved/rejected historyを保持しCanonicalへ自動昇格しない。

TAAは独立Role根拠不足で除外。RayTracingはfoundation1、production-case1、research2の4資料を保持し、CausticsはRole根拠不足で候補pathから除外。候補総数1。Originalの再読なしでmetadataを再評価。

66 PNG（合計12,445,458 bytes、最大773,206 bytes）を66 WebP（合計3,656,760 bytes、最大182,824 bytes）へ置換。long edge1200px、quality85、full page/no crop、全66 aspect ratio一致。Original→一時lossless PNG→配信WebP。Original/intermediateをGitへ追加しない。タイトル・主要図の可読性を実画像で確認。

Validatorはexact DOC-ID path、PNG/WebPだけ、no symlink/traversal、4MiB上限、bounded dimensions、実decodeを要求。PNGはstatic chunk allowlistと全zlib pixel streamを検証。WebPはpinned Pillow==12.3.0で完全decode、animation/private metadataを拒否。登録環境にWebP codecがない場合だけ検証済みPNGへfallback。公開WebPのvalidatorはdecoder不在でfail closed。

保存済みBaseline33コマンド＋追加検証13コマンドすべてPASS。8 Python suitesの134 tests、Knowledge Brain、Reference Snapshot、public/sensitive boundary、Portal/Viewer/Trend validators、filter/Human Portal/Home Node tests成功。Home1440/390 × light/dark、検索Enter/Websites検索、Reading Path遷移、keyboard、missing-image fallbackのHTTPブラウザ確認成功。独立レビューの2指摘を回帰テストRED→GREENで修正し再レビュー完了。

116 presentation、RES/DOC/Drive identity、COL-OITを含むcanonical collections12、canonical relations23、既存AI compactの値は保持。Drive変更なし。今回のPRはMergeしない。

残存制約：Original34件は32MiB取得上限、旧16件はSources正本未確認。全文coverage・language/English routingのpendingは従来どおり。Pillowはbuild/validation依存でbrowser runtime依存はなし。CI結果は両PRの最新headのChecksを参照する。
