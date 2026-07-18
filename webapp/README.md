# 家計簿 Web アプリ (webapp)

GAS 版家計簿アプリの Web リファクタリング版。
TypeScript + React (Vite) + Hono + Cloudflare Workers + D1 (SQLite) 構成。

1 つの Worker で React SPA の静的配信と Hono API (`/api/*`) を両立します。
（移行ステップ1「足場作り」の成果物。UI/API は骨格のみ）

## 必要環境

- Node.js 20+
- npm 10+

## セットアップ

```bash
cd webapp
npm install
# ローカル開発用の環境変数ファイルを用意（.dev.vars は .gitignore 対象）
cp .dev.vars.example .dev.vars
```

`.dev.vars` はローカル開発時のみ読み込まれ、Git にはコミットされません。
既定で `DEV_BYPASS_ACCESS=true` が入っており、開発中は Cloudflare Access の
JWT 検証をスキップします。**本番では絶対に有効化しないでください**
（認証が完全に無効になります）。

## ローカル D1 のマイグレーション

Wrangler がローカルに用意する SQLite に対してマイグレーションを適用します
（Cloudflare へのログイン不要）。

```bash
npm run db:migrate:local
```

`migrations/0001_initial.sql`（スキーマ）と `migrations/0002_seed.sql`
（GAS 版のハードコード初期値のシード）が順に適用されます。

## 現行スプレッドシートからのデータ移行（移行ステップ2）

現行 GAS 版スプレッドシートからエクスポートした 5 つの CSV をローカル D1 に
一括投入します。実データ（金融情報）を含むため、CSV はリポジトリルートの
`input/`（`.gitignore` 対象）に置きます。

必要ファイル（`input/` 直下）:

- `kakeibo-app - 取引履歴DB.csv`
- `kakeibo-app - 証券残高DB.csv`
- `kakeibo-app - 分類・除外設定.csv`
- `kakeibo-app - 割り勘キーワード設定.csv`
- `kakeibo-app - CSVフォーマット設定.csv`

```bash
# 事前にスキーマ適用（未適用の場合）
npm run db:migrate:local
# 5 CSV を読み込み → SQL 生成 → ローカル D1 へ投入 → 検証サマリー出力
npm run db:import:sheets
```

移行の特性:

- **完全リロード（冪等）**: 6 テーブル（`transactions` / `securities_balances` /
  `category_rules` / `csv_formats` / `split_rules` / `excluded_categories`）を
  DELETE してから再投入します。`0002_seed.sql` のサンプルデータは実データで
  置き換えられます。何度実行しても結果は同じです。
- **GAS 版ハードコード特例の再投入**: スクリプトが以下 2 件を明示的に投入します。
  - 分類ルール: `keyword='十日市場', institution='イオンカード', category='食料品', priority=0`
  - 割り勘ルール: `match_type='keyword', pattern='ﾖｺﾊﾏｼﾎｲｸﾘﾖｳ', rate=31`
- **import_hash**: 取引履歴全体を 1 ファイル扱いで出現順にカウントし、
  `src/shared/hash.ts` のロジックで算出します。
- **検証**: 実行後にスクリプト自身が各テーブルの投入件数とソース行数の一致、
  取引の合計金額・期間、重複ハッシュ件数（0 が期待値）を出力します。
- 生成 SQL は `.migrate-tmp/`（`.gitignore` 対象）に書き出されます。

### 本番 D1 への適用

同じ手順を本番 D1 に適用する場合は、生成された SQL を `--remote` で流します
（このスクリプトはローカルのみを対象とし、本番への実行は行いません）:

```bash
npm run db:import:sheets   # ローカル投入 + .migrate-tmp/migrate-from-sheets.sql 生成
npx wrangler d1 execute kakeibo --remote --file=.migrate-tmp/migrate-from-sheets.sql
```

## 開発サーバー

```bash
# 1. 依存インストール
npm install
# 2. ローカル D1 にマイグレーション適用
npm run db:migrate:local
# 3. 開発サーバー起動 (Vite + Cloudflare Workers ランタイム)
npm run dev
```

`npm run dev` は `@cloudflare/vite-plugin` により Vite 上で Workers ランタイムを
エミュレートし、SPA と `/api/*` を同一オリジンで提供します。

開発時は Cloudflare Access の JWT 検証を `.dev.vars` の
`DEV_BYPASS_ACCESS=true` でスキップしています。本番の `wrangler.jsonc` には
`DEV_BYPASS_ACCESS` を含めていないため、デプロイ時は既定で検証が有効になります。
本番デプロイ前に `wrangler.jsonc` の `ACCESS_TEAM_DOMAIN` / `ACCESS_AUD` /
`ALLOWED_EMAILS` を実値へ差し替えてください（`ALLOWED_EMAILS` は許可する
メールアドレスをカンマ区切りで指定。JWT 検証成功後に email クレームを
このリストと突き合わせ、含まれない場合は 403 を返します）。

## コマンド一覧

| コマンド | 内容 |
|---|---|
| `npm run dev` | ローカル開発サーバー（SPA + API） |
| `npm run build` | 型チェック + 本番ビルド（`dist/` 生成） |
| `npm test` | Vitest 実行（スキーマ整合・API ヘルスチェック） |
| `npm run typecheck` | `tsc --noEmit` による型チェックのみ |
| `npm run db:migrate:local` | ローカル D1 へマイグレーション適用 |
| `npm run db:migrate:remote` | リモート D1 へマイグレーション適用（要ログイン） |
| `npm run db:import:sheets` | 現行スプレッドシート CSV（`input/`）をローカル D1 へ完全リロード投入 |
| `npm run deploy` | ビルド + Cloudflare へデプロイ（要ログイン） |

## ディレクトリ構成

```
webapp/
├── wrangler.jsonc        # Workers + D1 バインディング / Access vars
├── .dev.vars.example     # ローカル開発用 vars の雛形（.dev.vars にコピー）
├── migrations/           # D1 スキーマ (0001) + シード (0002)
├── public/               # 静的アセット (manifest.json, icon.svg)
├── index.html            # SPA エントリ
├── src/
│   ├── client/           # React SPA（下部タブナビ＋プレースホルダ画面）
│   ├── server/           # Hono API（/api/health, Access JWT ミドルウェア）
│   └── shared/           # 型定義（D1 スキーマ対応）
└── test/                 # Vitest（スキーマ整合・API ヘルスチェック）
```

## D1 スキーマ

`migrations/0001_initial.sql` の 6 テーブル:
`transactions` / `securities_balances` / `category_rules` /
`csv_formats` / `split_rules` / `excluded_categories`。
型は `src/shared/types.ts` に対応。

- `transactions.import_hash` に UNIQUE 制約（重複取込防止）、`date` にインデックス
- 金額・残高は INTEGER（円）

## 認証

本番では Cloudflare Access（Google ログイン + 許可メール 2 件）が第 1 の壁、
Hono の Access JWT 検証ミドルウェア（`src/server/middleware/access.ts`）が
第 2 の壁になります。
