# 分類ルールのカテゴリ選択化 実装計画

## 参照設計

`docs/superpowers/specs/2026-07-23-category-rule-category-select-design.md`

## 方針

カテゴリ一覧の取得処理、設定API、クライアントAPI、分類ルール画面の順に実装する。
DBマイグレーションやカテゴリ作成機能は追加しない。既存の分類ルール作成・更新APIは
変更せず、設定画面のカテゴリ入力だけを保存済みカテゴリ限定のセレクトボックスへ
置き換える。

## Task 1: 既存カテゴリ取得処理と設定API

### 対象ファイル

- Modify: `webapp/src/server/services/repository.ts`
- Modify: `webapp/src/server/routes/settings.ts`
- Create: `webapp/test/categories.test.ts`
- Modify: `webapp/test/routes.test.ts`

### 手順

1. `categories.test.ts` に、カテゴリ一覧SQLの失敗テストを追加する。
   - `category_rules`、`transactions`、`excluded_categories` の3テーブルを対象にする。
   - `UNION` で重複を除去する。
   - `NULL`、空文字、空白のみの値を除外する。
   - カテゴリ名の昇順で取得する。
   - D1から返された行を `string[]` に変換する。
2. `routes.test.ts` に `GET /api/settings/categories` の失敗テストを追加する。
   - ステータス200を返す。
   - レスポンス形式が `{ items: string[] }` である。
3. `npm test -- --run test/categories.test.ts test/routes.test.ts` を実行し、
   取得関数とルートが未実装のため失敗することを確認する。
4. `repository.ts` に `getCategories(db): Promise<string[]>` を追加する。
5. 3テーブルの `category` を `UNION` するSQLを実装する。
   - 外側のクエリで `category IS NOT NULL` を確認する。
   - `TRIM(category) <> ''` で空文字と空白のみを除外する。
   - 保存済みカテゴリ名は加工せず、そのまま返す。
   - `ORDER BY category ASC` で並べる。
6. `settings.ts` に `GET /categories` を追加し、`{ items }` を返す。
7. 対象テストを再実行して成功を確認する。

### コミット

`既存カテゴリ一覧APIを追加`

## Task 2: クライアントAPIとカテゴリセレクト

### 対象ファイル

- Modify: `webapp/src/client/lib/api.ts`
- Modify: `webapp/src/client/pages/settings/CategoryRulesSection.tsx`
- Create: `webapp/test/categoryRulesSection.test.ts`

### 手順

1. `categoryRulesSection.test.ts` に、`RuleModal` のサーバーサイド描画を使った
   失敗テストを追加する。
   - カテゴリ欄が自由入力ではなく `select` である。
   - 新規追加時は「カテゴリを選択」が初期選択される。
   - APIから渡したカテゴリが選択肢になる。
   - 編集時はルールの保存済みカテゴリが初期選択される。
2. `npm test -- --run test/categoryRulesSection.test.ts` を実行し、
   `RuleModal` がカテゴリ一覧を受け取らず、テキスト入力のため失敗することを確認する。
3. APIクライアントへ
   `getCategories(): Promise<{ items: string[] }>` を追加する。
4. `CategoryRulesSection` で分類ルール一覧とカテゴリ一覧を別々に `useAsync` で取得する。
5. `RuleModal` に `categories: string[]` を渡す。
6. カテゴリのテキスト入力を `select` に置き換える。
   - アクセシブル名として「カテゴリ」を設定する。
   - 先頭に `value=""` の「カテゴリを選択」を置く。
   - カテゴリ一覧を `option` として表示する。
   - 既存の `draft.category` を `value` とし、選択変更時に更新する。
7. 保存前のキーワード・カテゴリ必須チェックと、保存リクエストの形式は維持する。
8. 保存成功時は分類ルール一覧とカテゴリ一覧を再取得する。
9. 対象テストと `npm run typecheck` を実行して成功を確認する。

### コミット

`分類ルールのカテゴリを選択式に変更`

## Task 3: カテゴリ一覧の状態表示と操作制御

### 対象ファイル

- Modify: `webapp/src/client/pages/settings/CategoryRulesSection.tsx`
- Modify: `webapp/test/categoryRulesSection.test.ts`

### 手順

1. 操作可否を
   `カテゴリ取得済み && 取得エラーなし && 候補が1件以上`
   から判定する。
2. カテゴリ一覧の読み込み中は、分類ルール一覧を表示したまま追加ボタンと
   各ルールの編集ボタンを無効にする。
3. カテゴリ一覧の取得に失敗した場合は `ErrorMessage` と再試行を表示し、
   追加・編集操作を無効にする。
4. カテゴリが0件の場合は「選択できるカテゴリがありません」と表示し、
   追加・編集操作を無効にする。
5. UIテストへ、カテゴリ取得前または候補0件で操作不可になる条件を追加する。
   Reactの非同期フックを直接駆動しない範囲は、操作可否を決める純粋関数または
   表示用の小さな部品へ分離してテストする。
6. `npm test -- --run test/categoryRulesSection.test.ts` と
   `npm run typecheck` を実行する。

### コミット

`カテゴリ一覧の状態に応じて分類ルール操作を制御`

## Task 4: 全体検証

### 自動検証

`webapp` ディレクトリで次を実行する。

```bash
npm test
npm run build
```

### 手動検証

1. 設定画面を開き、分類ルール一覧が従来どおり表示されることを確認する。
2. 「＋ 追加」を開き、カテゴリ欄がセレクトボックスであることを確認する。
3. 分類ルール・取引明細・除外カテゴリにしか存在しないカテゴリが、それぞれ
   選択肢へ表示されることを確認する。
4. 同名カテゴリが1件だけ表示され、カテゴリ名の昇順で並ぶことを確認する。
5. カテゴリ未選択では保存できず、カテゴリを選択すると正しい値で保存されることを
   確認する。
6. 既存ルールを編集すると、現在のカテゴリが初期選択されることを確認する。
7. カテゴリ一覧取得エラー時に再試行でき、取得成功後に追加・編集が有効になることを
   確認する。
8. モバイル幅でもセレクトボックスとモーダル操作が崩れないことを確認する。

### 最終確認

- DBマイグレーションが追加されていない。
- 新規カテゴリの作成UIが追加されていない。
- 分類ルール作成・更新APIのリクエスト仕様が変わっていない。
- 明細編集画面と除外カテゴリ設定画面の入力方式が変わっていない。
- 変更が参照設計の対象範囲に限定されている。

### コミット

検証で修正が必要だった場合だけ、内容を表す追加コミットを作成する。
