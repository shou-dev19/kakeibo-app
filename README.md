# kakeibo-app

CSV 明細を取り込み、家計の収支・資産・割り勘を管理する家計簿アプリです。

現行アプリは `webapp/` にある TypeScript 製の Web アプリケーションで、React、Hono、Cloudflare Workers、Cloudflare D1（SQLite）で構成されています。移行元だった Google Apps Script（GAS）版は `webapp/` への移行完了に伴い削除済みで、当時の設計・移行の記録は `docs/` に残しています。

## 主な機能

- 金融機関ごとに定義した CSV 形式での明細インポート（プレビュー対応・重複取込防止）
- キーワードと金融機関に基づく取引の自動カテゴリ分類、および既存明細の再分類
- 明細の検索・編集・削除
- 月次収支、年間収支、資産推移・ポートフォリオ、割り勘のレポート
- 証券口座残高、カテゴリ分類ルール、CSV 形式、割り勘ルール、除外カテゴリの管理
- Cloudflare Access による本番 API のアクセス制御

## 技術構成

| 区分 | 使用技術 |
| --- | --- |
| フロントエンド | React / Vite / TypeScript |
| API | Hono on Cloudflare Workers |
| データベース | Cloudflare D1（SQLite） |
| 認証 | Cloudflare Access（JWT 検証） |
| テスト | Vitest |

## ローカル開発

### 必要環境

- Node.js 20 以上
- npm 10 以上

```bash
cd webapp
npm install
cp .dev.vars.example .dev.vars
npm run db:migrate:local
npm run dev
```

`npm run dev` は、React の SPA と `/api/*` を同一オリジンで起動します。ローカル開発では `.dev.vars` の `DEV_BYPASS_ACCESS=true` により Cloudflare Access の検証を無効化しています。この設定を本番環境で有効にしてはいけません。

## よく使うコマンド

以下はいずれも `webapp/` で実行します。

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | ローカル開発サーバーを起動 |
| `npm run build` | 型チェックと本番ビルド |
| `npm test` | テストを実行 |
| `npm run typecheck` | 型チェックのみを実行 |
| `npm run db:migrate:local` | ローカル D1 にマイグレーションを適用 |
| `npm run db:migrate:remote` | 本番 D1 にマイグレーションを適用 |
| `npm run db:import:sheets` | GAS 版スプレッドシートの CSV をローカル D1 に取り込む |
| `npm run deploy` | ビルドして Cloudflare Workers にデプロイ |

## GAS 版からのデータ移行

Google スプレッドシートから次の 5 ファイルを CSV 形式でエクスポートし、リポジトリルートの `input/` に置きます。`input/` は Git 管理対象外です。

- `kakeibo-app - 取引履歴DB.csv`
- `kakeibo-app - 証券残高DB.csv`
- `kakeibo-app - 分類・除外設定.csv`
- `kakeibo-app - 割り勘キーワード設定.csv`
- `kakeibo-app - CSVフォーマット設定.csv`

```bash
cd webapp
npm run db:migrate:local
npm run db:import:sheets
```

このコマンドは対象テーブルを完全に再作成してから投入するため、繰り返し実行できます。生成された SQL は `webapp/.migrate-tmp/` に出力されます。本番 D1 への反映手順を含む詳細は [webapp/README.md](webapp/README.md) を参照してください。

## 本番デプロイ

Cloudflare にログインしたうえで、D1 のマイグレーションを適用し、Worker をデプロイします。

```bash
cd webapp
npm run db:migrate:remote
npx wrangler secret put ALLOWED_EMAILS
npm run deploy
```

デプロイ前に [webapp/wrangler.jsonc](webapp/wrangler.jsonc) の Cloudflare Access 設定を対象環境の値に合わせてください。`ALLOWED_EMAILS` はカンマ区切りの許可メールアドレスを Worker Secret として登録します。

## ディレクトリ構成

```text
.
├── webapp/                 # 現行の Web アプリ
│   ├── src/client/         # React SPA
│   ├── src/server/         # Hono API / Workers エントリ
│   ├── migrations/         # D1 スキーマと初期データ
│   ├── scripts/            # 旧スプレッドシート版データの移行スクリプト
│   └── test/               # Vitest テスト
└── docs/                   # 要件・設計・移行計画（GAS 版当時の記録を含む）
```

## 補足

- `webapp/README.md` に、D1 スキーマ、ローカルデータ移行、認証設定の詳細を記載しています。
- リポジトリ全体の開発ガイドは [CLAUDE.md](CLAUDE.md) を参照してください。
