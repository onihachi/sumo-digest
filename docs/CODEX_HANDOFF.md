# 最終目標
過去の本場所を選べるアーカイブ欄を追加し、2026年の夏・名古屋・秋場所を公開ページから視聴可能にする。

# 完了したこと
- 過去3場所・各15日・計443取組の `data/archives.*` を生成した。
- アーカイブUI、URL復元、現在場所への復帰、日・取組移動を実装した。
- 場所切替時の自動保存、前進方向だけの切替、開始日維持、壊れたアーカイブの fail-closed を実装した。
- 欠落日は0取組・`complete:false` の日として15日分へ正規化し、通常表示は動画のある最新日を選ぶようにした。
- JSON/JS一致、重複日、現在場所混入、異常日時を検出する共有検証と異常系テストを追加した。
- 九州場所の開始日を 2026-11-08 に修正した。
- 独立レビューで `APPROVED` を得た。
- コミット `771bc39` を `main` へpushし、GitHub Pagesのビルド・デプロイ成功を確認した。
- 公開サイトで夏・名古屋・秋場所の直接URL、場所切替、動画表示、ブラウザエラーなしを確認した。

# 現在の状態
機能実装、テスト、独立レビュー、GitHub Pagesへの公開、実サイト確認まで完了。公開URLは `https://onihachi.github.io/sumo-digest/`。

# 重要な設計判断
- 現在場所は `data/bouts.*`、終了済み場所は `data/archives.*` に分離する。
- URLは現在場所が `?day=N`、過去場所が `?basho=YYYY-MM&day=N`。
- アーカイブIDは開始日ではなく令和年＋場所月の正規IDを使う。
- 既存アーカイブが存在する場合は空・破損を初期状態とみなさず更新を中止する。
- アーカイブの日付省略時は動画のある最新日を表示し、明示された0取組日は専用文言で復元する。
- 公開先は既存の GitHub Pagesを維持する。

# 変更した主要ファイル
- `app.js`, `index.html`, `styles.css`
- `data/archives.json`, `data/archives.js`, `data/bouts.json`, `data/bouts.js`
- `scripts/update-videos.mjs`, `scripts/check-data.mjs`, `scripts/archive-schema.mjs`
- `scripts/build-site.mjs`, `scripts/create-archive-data.mjs`
- `scripts/test-update-videos.mjs`, `scripts/test-data-validation.mjs`
- `.github/workflows/update-videos.yml`, `package.json`, `README.md`

# 次に行う具体的な1作業
なし（実装・公開確認まで完了）。

# 実行すべきテストコマンド
`node --check app.js && node --check scripts/archive-schema.mjs && node --check scripts/update-videos.mjs && npm run check && npm run build && git diff --check`

# 未解決の問題
なし。GitHub Pagesの実行にはActions側のNode.js 20非推奨とUbuntu移行予告が注記されたが、ビルドとデプロイは成功している。
