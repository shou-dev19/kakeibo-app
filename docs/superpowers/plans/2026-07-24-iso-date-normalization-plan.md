# ISO日付正規化 実装計画

## 参照設計

`docs/superpowers/specs/2026-07-24-iso-date-normalization-design.md`

## 方針

共通の日付正規化関数に厳密な `YYYY-MM-DD` 対応を追加し、既存の
`buildIsoDate()` を再利用して実在日付を検証する。証券登録APIの仕様や
クライアントフォーム、DBスキーマは変更しない。

## Task 1: 日付正規化の回帰テスト

### 対象ファイル

- Modify: `webapp/test/dates.test.ts`

### 手順

1. ゼロ埋めされた `YYYY-MM-DD` が同じISO形式へ正規化されるテストを追加する。
2. `2025-02-30` のような存在しないISO日付が拒否されるテストを追加する。
3. `2025-7-2` のような非ゼロ埋め形式が拒否されるテストを維持・追加する。
4. 対象テストを実行し、ISO形式が未対応のため失敗することを確認する。

## Task 2: ISO日付の正規化

### 対象ファイル

- Modify: `webapp/src/shared/dates.ts`

### 手順

1. `normalizeDate()` に `^\d{4}-\d{2}-\d{2}$` の分岐を追加する。
2. 年・月・日を取り出し、既存の `buildIsoDate()` へ渡す。
3. 対象テストを再実行し、既存形式を含めて成功することを確認する。

## Task 3: 証券登録APIの回帰テスト

### 対象ファイル

- Modify: `webapp/test/routes.test.ts`

### 手順

1. `POST /api/securities` にISO日付を送信するテストを追加する。
2. ステータス `201` と作成IDを確認する。
3. 存在しないISO日付には `400` と `invalid date` が返ることを確認する。

## Task 4: 全体検証

`webapp` ディレクトリで次を実行する。

```bash
npm test
npm run typecheck
npm run build
```

最終的に、既存の日付形式、証券登録以外の日付利用箇所、DB保存形式に変更が
ないことを確認する。
