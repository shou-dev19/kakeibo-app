# 明細カテゴリ色・割り勘割合表示 実装計画

## 参照設計

`docs/superpowers/specs/2026-07-23-transaction-category-color-split-rate-design.md`

## 方針

カテゴリ色の純粋関数、割り勘の共有判定、明細API、画面表示の順に小さく実装する。各段階で対象テストを先に追加し、既存の割り勘優先度仕様を再実装しない。

DBマイグレーションは追加しない。

## Task 1: 決定的なカテゴリ色関数

### 対象ファイル

- Create: `webapp/src/client/lib/categoryColors.ts`
- Create: `webapp/test/categoryColors.test.ts`

### 手順

1. 次の失敗テストを追加する。
   - `食料品` が `#0d9488` になる。
   - `光熱費` が `#f59e0b` になる。
   - 同じ名前を複数回渡しても同じ色になる。
   - 前後空白を除去して判定する。
   - NULL、空文字、`未分類` は固定の中立色になる。
2. `npm test -- --run test/categoryColors.test.ts` を実行し、モジュール未実装による失敗を確認する。
3. 現在の12色のチャートパレットを `CATEGORY_COLORS` として定義する。
4. `TextEncoder` でUTF-8化したバイト列に、32ビットFNV-1aを適用する純粋関数を実装する。
5. `getCategoryColor(category: string | null | undefined)` を実装する。
   - `trim()` 後の空文字は `未分類` とする。
   - `未分類` は固定の中立色を返す。
   - それ以外は符号なしハッシュ値をパレット長で剰余し、対応色を返す。
6. 対象テストを再実行して成功を確認する。

### コミット

`カテゴリ名から固定色を決定する関数を追加`

## Task 2: カテゴリ系グラフへ固定色を適用

### 対象ファイル

- Modify: `webapp/src/client/components/charts.tsx`
- Modify: `webapp/src/client/pages/HomePage.tsx`
- Modify: `webapp/src/client/pages/report/MonthlySection.tsx`
- Modify: `webapp/src/client/pages/report/AnnualSection.tsx`

### 手順

1. `charts.tsx` のパレット定義を削除し、`categoryColors.ts` から読み込む。
2. `CategoryPie` に任意の `colorForName?: (name: string) => string` を追加する。
3. `colorForName` がある場合は各スライス名から色を決め、ない場合は従来どおり配列順で色を決める。
4. ホーム、月次、年間のカテゴリ円グラフへ `getCategoryColor` を渡す。
5. 月次内訳の色見本も、配列インデックスではなく `getCategoryColor(c.category)` を使う。
6. 資産ポートフォリオは `colorForName` を渡さず、従来の配色を維持する。
7. `npm test -- --run test/categoryColors.test.ts` と `npm run build` を実行する。

### コミット

`カテゴリグラフの色をカテゴリ名で固定`

## Task 3: 割り勘の対象条件とルール選択を共有

### 対象ファイル

- Modify: `webapp/src/shared/splitwise.ts`
- Modify: `webapp/test/splitwise.test.ts`

### 手順

1. `matchEligibleSplitRule` の失敗テストを追加する。
   - `支出`かつ`振替`以外で、一致した最優先ルールを返す。
   - 収入は一致パターンがあっても `null` を返す。
   - `振替`は一致パターンがあっても `null` を返す。
   - 複数一致時は `priority` が小さいルールを返す。
2. `npm test -- --run test/splitwise.test.ts` を実行し、新しい関数がないため失敗することを確認する。
3. 並べ替え済みのルールを受け取る `matchEligibleSplitRule(tx, sortedRules)` を追加する。
4. `calculateSplitwise` 内の種別・カテゴリ判定と `matchSplitRule` 呼び出しを、新しい関数へ置き換える。
5. `calculateSplitwise` は従来どおり、関数の外側でルールを一度だけ `sortSplitRules` へ渡す。
6. 割合別小計、端数処理、合計額の既存コードは変更しない。
7. 対象テストを再実行し、既存13件を含めて成功することを確認する。

### コミット

`割り勘対象判定を共有関数へ集約`

## Task 4: 明細APIへ相手負担割合を追加

### 対象ファイル

- Modify: `webapp/src/server/routes/transactions.ts`
- Modify: `webapp/src/client/lib/api.ts`
- Modify: `webapp/test/routes.test.ts`

### 手順

1. 明細APIの失敗テストを追加する。
   - 一致する支出に `splitRate: 50` が付く。
   - 不一致、収入、`振替`に `splitRate: null` が付く。
   - 同じ明細に優先度10の50%ルールと優先度100の100%ルールが一致する場合、50%が返る。
   - ページの `total` と既存フィルタ結果が変わらない。
2. `npm test -- --run test/routes.test.ts` を実行し、`splitRate` がないため失敗することを確認する。
3. `GET /api/transactions` で `listTransactions` と `getSplitRules` を `Promise.all` で取得する。
4. `sortSplitRules` をリクエストごとに一度だけ実行する。
5. ページ内の各取引へ `matchEligibleSplitRule` を適用し、選ばれたルールの `rate` または `null` を `splitRate` として付ける。
6. クライアントAPIに次の一覧専用型を追加し、`TransactionPage.items` を更新する。

```ts
export type TransactionListItem = Transaction & {
  splitRate: number | null;
};
```

7. 優先度、ルールID、パターンはレスポンスへ追加しない。
8. 対象テストと `webapp/test/splitwise.test.ts` を再実行する。

### コミット

`明細APIに割り勘割合を追加`

## Task 5: 明細カードへカテゴリ色と相手負担割合を表示

### 対象ファイル

- Modify: `webapp/src/client/pages/TransactionsPage.tsx`

### 手順

1. `getCategoryColor` を読み込む。
2. 明細ごとに表示カテゴリ名を `tx.category?.trim() || "未分類"` とし、共通関数から色を得る。
3. 現在の青緑一色のカテゴリ表示を、次の構成へ置き換える。
   - 解決したカテゴリ色の小さなドット
   - 解決したカテゴリ色を低い不透明度で使った背景
   - コントラストを確保した中立色のカテゴリ名
4. `tx.splitRate !== null` の場合だけ、カテゴリの直後に `相手負担 {splitRate}%` バッジを表示する。
5. バッジはカテゴリ色と混同しない固定色を使い、割合を文字で明示する。
6. 対象外にはプレースホルダーや「対象外」を表示しない。
7. 既存の `flex-wrap` を維持し、カード押下、編集、削除、ページングを変更しない。
8. `npm run build` を実行し、一覧専用型と表示コードの型整合を確認する。

### コミット

`明細カードにカテゴリ色と相手負担割合を表示`

## Task 6: 全体検証

### 自動検証

`webapp` ディレクトリで次を実行する。

```bash
npm test
npm run build
```

### 手動検証

1. 同じカテゴリが、ホーム、月次円グラフ、月次内訳、年間円グラフ、明細カードで同じ色になることを確認する。
2. 月を切り替えてカテゴリの支出順位が変わっても、色が変わらないことを確認する。
3. 資産ポートフォリオの配色が従来どおりであることを確認する。
4. 50%、100%、31%の各対象明細に正しい `相手負担 n%` が表示されることを確認する。
5. 複数ルールへ一致する明細で、割り勘レポートと明細カードの割合が一致することを確認する。
6. 対象外、収入、`振替`に割合バッジが表示されないことを確認する。
7. モバイル幅でカテゴリ、割合、メモが読みやすく折り返されることを確認する。

### 最終確認

- DBマイグレーションが追加されていない。
- カテゴリ色設定が追加されていない。
- 割り勘レポートの合計計算が変更されていない。
- 変更が本設計の対象ファイルに限定されている。

### コミット

検証で修正が必要だった場合だけ、内容を表す追加コミットを作成する。
