# Gemini コンテキスト: kakeibo-app

## プロジェクト概要

CSV 明細を取り込み、家計の収支・資産・割り勘を管理する家計簿 Web アプリです。アプリ本体は `webapp/` にあり、TypeScript のフルスタック構成（React SPA + Hono API）で Cloudflare Workers 上で動作します。

- **主要技術**: React / Vite, Hono on Cloudflare Workers, Cloudflare D1 (SQLite), Cloudflare Access, Vitest
- **コア機能**:
    - 金融機関ごとの CSV 形式定義による明細インポート（プレビュー・重複防止）
    - キーワード／金融機関ルールによる取引の自動分類
    - 月次・年間収支、資産推移・ポートフォリオ、割り勘のレポート
    - 各種設定（分類ルール・CSV 形式・割り勘ルール・除外カテゴリ・証券残高）の管理

> 旧 Google Apps Script（GAS）版は `webapp/` への移行完了に伴い削除済みです。当時の設計・移行の記録は `docs/`、データ移行スクリプトは `webapp/scripts/` に残っています。

## ビルドと実行

コマンドはすべて `webapp/` で実行します。

```bash
cd webapp
npm install
cp .dev.vars.example .dev.vars   # 初回のみ
npm run db:migrate:local         # ローカル D1 にマイグレーション適用
npm run dev                      # SPA + /api/* を同一オリジンで起動
```

| コマンド | 内容 |
| --- | --- |
| `npm run dev` | ローカル開発サーバー |
| `npm run build` | 型チェック + 本番ビルド |
| `npm test` | Vitest 実行 |
| `npm run typecheck` | 型チェックのみ |
| `npm run db:migrate:local` / `:remote` | D1 へマイグレーション適用（ローカル / 本番） |
| `npm run deploy` | ビルドして Cloudflare Workers へデプロイ |

ローカルでは `.dev.vars` の `DEV_BYPASS_ACCESS=true` により Cloudflare Access 検証を無効化します。本番では有効化しないこと。

## アーキテクチャと開発規約

```
webapp/src/
├── client/   # React SPA（pages / components / lib/api.ts）
├── server/   # Hono API（routes/ → services/ → …）、Workers エントリ、Access ミドルウェア
└── shared/   # client/server 共有の types.ts と純粋なドメインロジック
webapp/migrations/  # D1 スキーマ・シード（NNNN_*.sql、追記のみ）
webapp/test/        # Vitest（モジュール単位）
```

- **レイヤリング**: routes（HTTP）→ services（`repository.ts` が D1 アクセスを集約）→ `shared/` の純粋関数。分類・CSV 解析・割り勘・レポート等のドメインロジックは D1 非依存で `shared/` に置き、単体テスト可能にする。
- **型の共有**: DB 行や API ペイロードの型は `shared/types.ts` に定義し client/server で共有。スキーマ変更時はマイグレーション追加 + 型更新 + `schema.test.ts` を緑に保つ。
- **マイグレーションは追記のみ**: 適用済みファイルは編集せず、新しい `NNNN_*.sql` を追加する。
- **優先度の慣習**: 分類ルール・割り勘ルールの `priority` は**数値が小さいほど優先**（デフォルト 100）。
- ドメインデータ・コメントは日本語。周囲のコードスタイルに合わせる。
