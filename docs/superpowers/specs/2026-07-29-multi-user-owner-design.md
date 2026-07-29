# 利用者（夫/妻）別データ管理 設計

## 背景

現在このアプリは単一利用者を前提としている。`transactions` に利用者の区別がなく、CSVをアップロードした人が誰かを記録していない。夫婦それぞれが自分の明細を取り込むと、すべてが一つの塊として混ざり、以下が成立しなくなる。

- どちらの明細か判別できない
- 分類ルールが相手の明細にも作用する
- 全件再分類が相手の明細まで書き換える（誤操作時の復旧コストが高い）
- 割り勘が「夫視点での妻への請求額」という片側の見方に固定されている

## 目的

- 明細・証券残高・分類ルールに「利用者」を持たせ、夫と妻のデータを分離する
- ホーム/明細/レポートで「夫のみ / 妻のみ / 合算」を切り替えられるようにする
- 割り勘を「請求額」ではなく「夫負担額 / 妻負担額」として算出する
- 全件再分類をログイン利用者のスコープに限定し、加えて誤操作からの復旧手段を用意する

## 対象外

- 3人以上の利用者への拡張（データモデルは拡張可能に保つが、UIは夫婦2名前提）
- 世帯をまたぐマルチテナント化
- レポートの集計ロジック自体（除外カテゴリ、振替の扱い、按分方法）の変更
- 新規「試算」タブの追加（要件の「試算」は既存の「資産」タブを指す）

---

## 1. 利用者の識別

### 1.1 owner の値

利用者を表す固定キーを `shared/types.ts` に定義する。

```ts
export type Owner = "husband" | "wife";
export const OWNER_LABELS: Record<Owner, string> = { husband: "夫", wife: "妻" };
/** 画面のスコープ切替で使う値。'all' は夫婦合算。 */
export type OwnerScope = Owner | "all";
```

DBにはメールアドレスではなく `'husband' | 'wife'` を保存する。理由:

- メールアドレスをDB・Gitに残さない（現状 `ALLOWED_EMAILS` は Worker Secret として意図的にリポジトリ外にある。この方針を崩さない）
- メールアドレス変更でデータが孤立しない
- 表示・ソート・SQLが短く、CHECK制約で値を守れる

### 1.2 メール → owner の解決

Worker Secret `OWNER_EMAILS` を追加する。書式は `役割:メール` のカンマ区切り。

```
OWNER_EMAILS=husband:xxx@gmail.com,wife:yyy@gmail.com
```

`middleware/access.ts` を拡張する。

1. 従来どおり Access JWT を検証する
2. `email` クレームを `OWNER_EMAILS` と突き合わせて owner を解決する
3. 解決できなければ **403**（許可リストに載っていても owner 不明なら書き込ませない）
4. `c.set("owner", owner)` でコンテキストに載せる

`ALLOWED_EMAILS` との関係: `OWNER_EMAILS` のメール集合はそのまま許可リストとして使えるため、`ALLOWED_EMAILS` は冗長になる。ただし今回は**両方を必須**とし、`ALLOWED_EMAILS` に載っていない、または owner を解決できないメールは拒否する（許可判定を弱める方向の変更をしない）。`ALLOWED_EMAILS` の廃止は別タスクとする。

ローカル開発（`DEV_BYPASS_ACCESS=true`）では `.dev.vars` の `DEV_OWNER`（既定 `husband`）を owner として使う。夫/妻それぞれの見え方をローカルで検証できるようにするため。

`AppEnv["Variables"]` に `owner?: Owner` を追加し、ルートハンドラから `requireOwner(c)` で取得する（未設定なら500）。

### 1.3 「読み取りスコープ」と「書き込み主体」の分離

これが本設計の中核となる区別。

| 種別 | owner の決まり方 | 対象 |
| --- | --- | --- |
| 読み取りスコープ | クライアントの `?owner=husband\|wife\|all` | 明細一覧、月次/年間/資産レポート |
| 書き込み主体 | **ログインJWTのみ**（クライアントは指定不可） | CSV取込、分類ルールCRUD、全件再分類 |

書き込み主体をクライアントに指定させないことが、「妻がログインしたら妻の明細にしか再分類が走らない」という要件をAPIレベルで保証する唯一の方法になる。クエリで受け取ると、キャッシュされた古いUIやURL直打ちで簡単に破れる。

---

## 2. スキーマ変更

マイグレーションは追記のみ。`0007` 以降を追加する。

### 2.1 `0007_transactions_owner.sql`

`transactions` に `owner` を追加する。あわせて **UNIQUE 制約を `import_hash` 単独から `(owner, import_hash)` に変更する**。

```sql
CREATE TABLE transactions_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  owner        TEXT    NOT NULL CHECK (owner IN ('husband','wife')),
  date         TEXT    NOT NULL,
  description  TEXT    NOT NULL,
  amount       INTEGER NOT NULL,
  type         TEXT    NOT NULL,
  institution  TEXT,
  category     TEXT,
  category_locked INTEGER NOT NULL DEFAULT 0,
  memo         TEXT,
  balance      INTEGER,
  import_hash  TEXT    NOT NULL,
  created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  UNIQUE (owner, import_hash)
);

INSERT INTO transactions_new
  (id, owner, date, description, amount, type, institution, category,
   category_locked, memo, balance, import_hash, created_at)
SELECT id, 'husband', date, description, amount, type, institution, category,
       category_locked, memo, balance, import_hash, created_at
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX idx_transactions_date ON transactions (date);
CREATE INDEX idx_transactions_category ON transactions (category);
CREATE INDEX idx_transactions_owner_date ON transactions (owner, date);
```

既存行はすべて `husband` として移行する（これまで夫のみが取り込んでいるため）。

**`import_hash` の計算式（`shared/hash.ts`）は変更しない。** owner をハッシュ入力に加えると既存行のハッシュ値と一致しなくなり、過去にアップロード済みのCSVを再アップロードしたときに重複検知が効かなくなる。owner はハッシュではなく UNIQUE インデックス側で分離する。これにより:

- 夫が同じCSVを再アップロード → 同じ owner・同じ hash で衝突し、従来どおりスキップされる
- 夫婦が同じ内容の明細（同日・同店舗・同額）を別々に持つ → owner が違うので両方保存される

SQLiteでは列に付いた UNIQUE 制約を後から外せないため、テーブル再作成が必要になる。**本番適用前に `wrangler d1 export` でバックアップを取る**こと。

### 2.2 `0008_securities_owner.sql`

```sql
ALTER TABLE securities_balances ADD COLUMN owner TEXT NOT NULL DEFAULT 'husband';
CREATE INDEX idx_securities_owner_date ON securities_balances (owner, date);
```

証券残高に owner がないと、「夫のみの総資産」も「夫婦合算の総資産」も正しく出せない。

### 2.3 `0009_category_rules_owner.sql`

```sql
ALTER TABLE category_rules ADD COLUMN owner TEXT NOT NULL DEFAULT 'husband';

-- 妻の初期ルールを、夫の現行ルールの複製として作成する
INSERT INTO category_rules (owner, keyword, institution, category, priority)
SELECT 'wife', keyword, institution, category, priority
FROM category_rules WHERE owner = 'husband';

CREATE INDEX idx_category_rules_owner_priority ON category_rules (owner, priority);
```

複製後は完全に独立する。夫がルールを編集しても妻には反映されない（意図どおり）。

### 2.4 `0010_recategorize_history.sql`

再分類のUndo用。

```sql
CREATE TABLE recategorize_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner         TEXT    NOT NULL CHECK (owner IN ('husband','wife')),
  executed_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_count INTEGER NOT NULL,
  reverted_at   TEXT
);

CREATE TABLE recategorize_changes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id            INTEGER NOT NULL REFERENCES recategorize_runs(id) ON DELETE CASCADE,
  transaction_id    INTEGER NOT NULL,
  previous_category TEXT,
  new_category      TEXT    NOT NULL
);

CREATE INDEX idx_recategorize_changes_run ON recategorize_changes (run_id);
```

### 2.5 変更しないテーブル（夫婦共用）

`split_rules` / `csv_formats` / `excluded_categories` は owner を持たない。妥当性は §6 で検討する。

`shared/types.ts` の各インターフェースに `owner` を追加し、`TABLE_NAMES` に新テーブル2つを足す（`schema.test.ts` が整合を検証する）。

---

## 3. サーバー実装

### 3.1 リポジトリ層

`TransactionFilter` に `owner?: OwnerScope` を追加し、`buildTransactionWhere` に条件を1つ足す。`'all'` または未指定なら条件を付けない。

owner スコープを受け取るよう変更する関数:

- `listTransactions`
- `getAllTransactions` → `getTransactions(db, scope)`
- `getTransactionsForMonth`
- `getTransactionInstitutionsForMonth`
- `getSecurities`
- `getCategoryRules(db, owner)` — こちらは `OwnerScope` ではなく **`Owner` 必須**（設定画面は常に自分のもの）
- `insertTransactionIgnoreDup` / `insertSecurity` — INSERT に owner を含める
- `insertCategoryRule` / `updateCategoryRule` / `deleteCategoryRule` — **WHERE に `owner = ?` を必ず含める**（他人のルールIDを直接叩いても操作できないようにする）

`getCategories()` は変更しない。カテゴリ名は夫婦共通の語彙として扱い、両者の明細・ルール・除外設定から集める（§6 参照）。

### 3.2 資産集計のキー衝突 — 必須の修正

現在の `shared/reports.ts` の `buildAssetSeries` / `buildPortfolio` は、**`institution` をキーに「最新残高」を保持**している。

```ts
lastBank.set(tx.institution ?? "", tx.balance as number);
```

夫と妻が同じ金融機関（例: 両方が三井住友銀行に口座を持つ）を使っていると、合算表示で片方の残高がもう片方を上書きし、**総資産が過少に出る**。これは owner を導入した瞬間に発生する実害のあるバグなので、同じ変更セットで直す必要がある。

対応: キーを `owner` と組にする。

```ts
const bankKey = (tx: ReportTransaction) => `${tx.owner} ${tx.institution ?? ""}`;
const secKey  = (s: SecuritiesBalance) => `${s.owner} ${s.brokerage}`;
```

`ReportTransaction` に `owner: Owner` を追加する。これで「夫の三井住友」と「妻の三井住友」が別々に積み上がり、合算総資産が正しくなる。単独スコープ表示時はそもそも1人分しか流れてこないので影響はない。

### 3.3 API

読み取りスコープ用に `?owner=husband|wife|all` を追加する（省略時は `all`）。不正値は400。

| エンドポイント | owner の扱い |
| --- | --- |
| `GET /api/transactions` | クエリ（既定 `all`） |
| `GET /api/transactions/institutions` | クエリ（既定 `all`） |
| `GET /api/reports/monthly` | クエリ（既定 `all`） |
| `GET /api/reports/annual` | クエリ（既定 `all`） |
| `GET /api/reports/assets` | クエリ（既定 `all`） |
| `GET /api/securities` | クエリ（既定 `all`） |
| `GET /api/splitwise` | **なし**（常に夫婦合算） |
| `POST /api/imports`, `/preview` | **JWT**（クライアント指定不可） |
| `POST /api/securities` | **JWT** |
| `GET/POST/PATCH/DELETE /api/settings/category-rules` | **JWT** |
| `POST /api/transactions/recategorize` 系 | **JWT** |
| `/api/settings/{split-rules,csv-formats,excluded-categories}` | 変更なし（共用） |

明細一覧のレスポンスに `owner` を含め、クライアントが「夫/妻」バッジを出せるようにする。

### 3.4 取り込み（importer）

`previewImports` / `runImports` に `owner: Owner` を渡す。

- 分類は **取り込む本人のルール**で行う（`getCategoryRules(db, owner)`）
- 重複判定 `getExistingImportHashes(db, owner)` を owner で絞る。夫の取込プレビューで妻の明細が重複としてカウントされないようにする
- 挿入時に `owner` を書く

### 3.5 明細の編集（transactionCategoryEdit）

明細一覧は夫婦両方を表示できるため、「他人の明細を編集したときにどちらのルールが増えるのか」という問題が出る。

**他人の明細はカテゴリ変更・削除を不可（閲覧のみ）とする。** メモ編集も同様に不可とする。理由:

- 「分類ルールは自分のものだけ」「再分類は自分の明細だけ」という分離が、編集経路から漏れるのを防ぐ
- 夫が妻の明細を編集して妻のルールセットにルールが増える、という予想しづらい挙動を作らない

`saveTransactionEdit` / `previewTransactionCategoryRule` / `deleteTransaction` は対象明細の owner とログイン owner を突き合わせ、不一致なら **403**（`TransactionEditError` に 403 を追加）。UIは他人の明細をタップしても編集モーダルを開かず、「妻の明細のため編集できません」と示す。

新規ルールは常にログイン owner に紐づけて INSERT する。

### 3.6 全件再分類

`recategorizeAll(db, owner)` に変更し、対象明細もルールも owner で絞る。加えて2段構えの安全策を入れる。

**(a) ドライラン**

`POST /api/transactions/recategorize/preview` を追加。DBを書き換えず、変更予定を返す。

```ts
interface RecategorizePreview {
  owner: Owner;
  total: number;          // 対象明細数（自分の明細のみ）
  skippedLocked: number;  // 手動固定でスキップ
  changeCount: number;    // 実際に変わる件数
  /** 変更の要約。件数降順。 */
  summary: { from: string; to: string; count: number }[];
  /** 先頭50件のサンプル。 */
  samples: { id: number; date: string; description: string; from: string; to: string }[];
}
```

設定画面では「実行」を押すとまずこのプレビューを表示し、`〇〇 → △△ が N件` の一覧を確認してから「この内容で実行」を押す。現行の確認ダイアログを、中身のある確認に置き換える。

**(b) Undo**

`POST /api/transactions/recategorize` は `db.batch` で以下を1回の実行として記録する。

1. `recategorize_runs` に1行（owner, updated_count）
2. 変更した明細ごとに `recategorize_changes`（transaction_id, previous_category, new_category）
3. `transactions` の UPDATE

`POST /api/transactions/recategorize/undo` は、**自分の owner の、まだ revert していない最新の run** を巻き戻す。巻き戻す対象は「現在のカテゴリが `new_category` のままの明細」のみとする（再分類後に手で直した明細は上書きしない）。完了したら `reverted_at` を埋める。

`GET /api/transactions/recategorize/last` で直近の run（実行日時・件数・Undo可否）を返し、設定画面に「直近の再分類: 2026-07-29 12:34 / 132件更新 [取り消す]」を出す。Undo可能なのは最新の1回のみとする（多段Undoは複雑さに見合わない）。

これで「一度間違えると戻すのが大変」という問題は、**実行前（プレビュー）と実行後（Undo）の両方**で塞がれる。

---

## 4. 割り勘の再定義

### 4.1 rate の意味

`split_rules.rate` の意味を「**妻の負担率（%）**」として固定する。現行は「相手（＝妻）の負担率」なので、**既存データの意味は変わらない**。マイグレーション不要。設定画面の列見出しを「負担率」から「妻の負担率」に変更し、意味を明示する。

支払者（明細の owner）が誰であっても rate の解釈は変わらない。これが「夫視点の請求額」から「客観的な負担額」への転換の本質になる。

### 4.2 算出

対象は従来どおり `type='支出'` かつ `category !== '振替'` かつルールにマッチした明細。ただし**夫婦両方の明細**を対象にする（`getTransactionsForMonth` を `all` スコープで取る）。

ルールにマッチしない支出は「各自の個人支出」として割り勘の集計から外す（現行の意味論を維持）。ただし混乱を避けるため、UIに「割り勘対象外（個人負担）」の金額を参考値として併記する。

```
妻負担額 = Σ_rate ( 対象額合計(rate) × rate / 100 )     ← 現行 totalBilled と同値
共同支出総額 = Σ 対象明細の amount
夫負担額 = 共同支出総額 − 妻負担額
```

夫負担額を引き算で出すことで、`夫負担額 + 妻負担額 = 共同支出総額` が丸めによらず必ず成立する。端数表示は現行の `formatBilled`（端数がある時だけ小数2桁）を踏襲する。

### 4.3 精算額（追加提案）

owner が入って初めて「誰がいくら立て替えたか」が分かるようになる。負担額だけでは「で、いくら渡せばいいのか」が出ないため、以下を併記することを推奨する。

```
妻の実支払額 = Σ owner='wife' の対象明細の amount
精算額 = 妻負担額 − 妻の実支払額
  > 0 なら 妻 → 夫 に支払う
  < 0 なら 夫 → 妻 に支払う
```

これは要件の「単純な夫負担額・妻負担額」を置き換えるものではなく、その下に1行足す位置づけ。不要なら省いてよい。

### 4.4 レスポンス

```ts
interface SplitwiseResult {
  year: number;
  month: number;
  totalAmount: number;      // 共同支出総額
  husbandShare: number;     // 夫負担額
  wifeShare: number;        // 妻負担額
  husbandPaid: number;      // 夫の実支払額
  wifePaid: number;         // 妻の実支払額
  settlement: number;       // 精算額（正: 妻 → 夫）
  subtotals: SplitwiseRateSubtotal[];  // rate ごと。husbandShare/wifeShare を追加
  items: SplitwiseLineItem[];          // owner を追加
}
```

`totalBilled` は削除する（意味が変わるフィールドを同名で残さない）。`shared/splitwise.ts` の `calculateSplitwise` を書き換え、`test/splitwise.test.ts` の期待値も更新する。ルールのマッチング（`sortSplitRules` / `matchEligibleSplitRule`）は変更しない。

---

## 5. クライアント

### 5.1 共通コンポーネント

`components/OwnerTabs.tsx` を追加する。`夫 / 妻 / 合算` の3値セグメントコントロール。既存の `ReportPage` のセグメントと同じ見た目を使い回す。

選択値はセッション内で共有する（`nav.tsx` に軽い状態を置くか、`sessionStorage` に保存）。明細で「妻」を選んでレポートに移動したら、レポートも「妻」で開くのが自然なため。

現在のログイン利用者は `GET /api/me`（`{ owner, label }` を返す新規エンドポイント）で取得し、ヘッダに「夫としてログイン中」を表示する。設定画面のスコープ表示にも使う。

### 5.2 ホーム画面

常に**夫婦合算**を表示する（スコープ切替なし）。世帯全体のダッシュボードという位置づけを明確にする。

- 収支サマリ（収入/支出/収支）: 合算
- **総資産**: 合算。内訳に「預金 / 証券」に加えて「夫 / 妻」の内訳を小さく併記する
- **カテゴリ別支出**: 合算の円グラフ。スライスをタップすると明細画面へ（スコープ `all`）
- 割り勘カード: 「夫負担 / 妻負担」の2値表示に変更（現行の「請求額」表示を置き換え）

### 5.3 明細画面

`MonthSwitcher` の下に `OwnerTabs` を置く。既定は `合算`（ホームのカテゴリ円グラフからのドリルダウンが合算のため整合する）。

- タブ切替時はページを0に戻し、金融機関候補も選択スコープで再取得する
- 明細カードに、スコープが `合算` のときだけ owner バッジ（夫/妻）を出す
- 他人の明細はタップしても編集モーダルを開かない（§3.5）

### 5.4 レポート画面

`月次` / `年間` / `資産` の3セクションの上に `OwnerTabs` を置く。既定は `合算`。

- 月次: そのスコープの収支・カテゴリ別内訳
- 年間: そのスコープの直近12ヶ月表
- 資産: そのスコープの資産推移とポートフォリオ。`合算` のとき、ポートフォリオの内訳に owner 別の行も出す
- `割り勘` セクションは `OwnerTabs` を出さない（常に夫婦合算のため）。セクション切替時にタブを隠す

割り勘セクションの表示を作り替える。

```
┌─────────────────────────────┐
│  夫負担額        │  妻負担額   │
│  123,456円      │  98,765円  │
├─────────────────────────────┤
│  共同支出総額 222,221円               │
│  精算: 妻 → 夫 12,345円               │
└─────────────────────────────┘
負担率別の小計（rate / 件数 / 対象額 / 夫負担 / 妻負担）
対象明細（owner バッジ付き）
```

### 5.5 設定画面

- **分類ルール**: 見出しを「分類ルール（夫）」のように owner 付きにし、「あなたの明細にのみ適用されます」と補足する。API がログイン owner で絞るため、クライアント側の追加処理は不要
- **全件再分類**: 見出しを「全件再分類（夫の明細のみ）」に変更。実行フローを `実行 → プレビュー表示 → 確認して実行 → 完了トースト + 取り消しボタン` に変更。直近の実行履歴と `[取り消す]` を常設表示する
- **割り勘ルール / CSVフォーマット / 除外カテゴリ**: 見出しに「夫婦共用」バッジを付け、変更が相手にも及ぶことを明示する

---

## 6. 共用設定の妥当性検討

要件で「共用でよいか検討してほしい」とあった3つについて。

### 6.1 割り勘ルール — 共用が必須

共用にすべきというより、**分けてはいけない**。割り勘ルールは「この支出は妻が50%負担する」という**世帯の合意そのもの**を表す。夫と妻が別々のルールセットを持つと、同じ支出に対して夫の計算では妻負担50%、妻の計算では30%、といった食い違いが発生し、精算額が定義できなくなる。ルールは1組だけ存在すべきで、共用が正しい。

なお、共用であることの副作用として「相手がルールを変えると自分の見る負担額も変わる」がある。世帯の合意が変わったなら両者の数字が変わるのは正しい挙動なので、問題にはならない。UIで「夫婦共用」を明示しておけば十分。

### 6.2 CSVフォーマット — 共用で問題なし

フォーマット定義（列位置・ヘッダ行数・文字コード・ヘッダ署名）は、**金融機関側の仕様という客観的事実**であり、利用者の属性を一切含まない。同じ銀行のCSVは誰がダウンロードしても同じ形なので、定義を2つ持つ意味がない。むしろ分けると、片方だけフォーマット修正して他方が壊れる、という保守事故が起きる。

検討した唯一の懸念は `csv_formats.name` が UNIQUE かつ `institution` としてそのまま明細に書かれる点。夫婦が「同じ金融機関名だが別レイアウト」のCSVを使う場合（例: 同じカード会社の別商品）、フォーマット名を分ける必要がある。ただしこれは**現状でも同じ制約**であり、今回の変更で新たに生じる問題ではない。むしろ owner 列が入ることで「夫の三井住友」「妻の三井住友」が同じフォーマット名のままデータ上区別できるようになり、状況は改善する。

**結論: 共用で問題なし。**

### 6.3 除外カテゴリ — 共用で問題なし（ただし前提が1つ）

除外カテゴリは「投資は収支計算から除く」のような**集計方針**であり、人ではなく世帯の会計ポリシーに属する。合算レポートを出す以上、夫と妻で除外基準が違ったら合算値の意味が壊れる。共用が正しい。

前提として1点。分類ルールを利用者別に分けると、**カテゴリ名の語彙が夫婦で分岐しうる**（妻だけが「ペット」カテゴリを作る等）。除外カテゴリも合算レポートもカテゴリ名で突き合わせるため、語彙が割れると合算レポートの行数が増えて読みづらくなる。

対策として、**カテゴリ名の一覧（`GET /api/settings/categories`）は owner で絞らず、現状どおり両者の明細・ルール・除外設定から集める**方針を維持する。分類ルール編集時のカテゴリ選択肢も明細編集モーダルのカテゴリ選択肢も、この共通の一覧から出る。結果として、片方が作ったカテゴリはもう片方の選択肢にも自然に現れ、語彙は放っておいても共有される。**ルールは分離するが、カテゴリという語彙は共有する** — これが今回の分離の正しい境界線になる。

---

## 7. テスト

**スキーマ / マイグレーション**
- `schema.test.ts`: `TABLE_NAMES` と新テーブル・新カラムの整合
- `transactions` 再作成後も既存行のID・値・`created_at` が保持され、全行が `owner='husband'` になること
- `UNIQUE(owner, import_hash)`: 同 owner の同 hash は拒否、別 owner の同 hash は許可
- `category_rules` が夫の件数の2倍になり、妻側が同内容であること

**認証 (`access.test.ts`)**
- 夫のメール → `owner='husband'`、妻のメール → `'wife'`
- `ALLOWED_EMAILS` にあるが `OWNER_EMAILS` にないメール → 403
- `DEV_BYPASS_ACCESS` 時に `DEV_OWNER` が反映されること

**リポジトリ / API (`routes.test.ts`)**
- `?owner=husband|wife|all` で明細・月次・年間・資産・金融機関候補が正しく絞られること
- 不正な owner 値 → 400
- 分類ルールAPIがログイン owner のものだけを返し、他人のルールIDへの PATCH/DELETE が403で拒否されること
- 他人の明細への PATCH/DELETE が403で拒否されること
- 取込が JWT の owner で登録し、重複判定も同 owner 内でのみ効くこと（夫と妻が同内容CSVを取り込むと両方保存される）

**資産集計 (`reports.test.ts`)**
- 夫と妻が**同名の金融機関**に残高を持つとき、合算総資産が両方の合計になること（現行のキー衝突に対する回帰テスト）
- 証券も同様に owner 別に積み上がること
- 単独スコープの結果が、その owner の明細だけを与えた場合と一致すること

**割り勘 (`splitwise.test.ts`)**
- `夫負担額 + 妻負担額 = 共同支出総額` が常に成立すること（端数ケース含む）
- 妻負担額が現行の `totalBilled` と一致すること（既存データでの連続性）
- 支払者が妻の明細でも rate の解釈が変わらないこと
- 精算額の符号が正しいこと（妻が多く立て替えたら負）

**再分類**
- 再分類がログイン owner の明細のみを更新し、相手の明細を1件も変更しないこと
- プレビューがDBを一切変更しないこと、`summary` の件数が実行結果と一致すること
- Undo で元のカテゴリに戻ること
- 再分類後に手動で変更した明細は Undo で上書きされないこと
- Undo 済みの run を再度 Undo できないこと

**クライアント**
- 明細画面でタブを切り替えると対応する owner のAPIが呼ばれ、ページが0に戻ること
- 合算スコープでのみ owner バッジが出ること
- レポートの3セクションでタブが機能し、割り勘セクションではタブが出ないこと
- ホームが常に合算を表示すること

---

## 8. 実装順序

1. `Owner` 型 + Secret + access ミドルウェア + `GET /api/me`（データ変更なし、先に土台を作る）
2. マイグレーション 0007〜0010 + `shared/types.ts` + `schema.test.ts`
3. リポジトリ層の owner 対応 + 資産集計のキー衝突修正（§3.2）
4. 取込・明細編集・分類ルールの書き込み owner 対応
5. 再分類のスコープ限定 + プレビュー + Undo
6. 割り勘の再定義（サーバー + `shared/splitwise.ts` + テスト）
7. クライアント: `OwnerTabs` + 明細 + レポート
8. クライアント: ホーム + 設定画面

各段階で `npm run build && npm test` が通る状態を保つ。

---

## 9. 受け入れ条件

- 妻がログインしてCSVをアップロードすると、その明細が `owner='wife'` で登録され、明細画面の「妻」タブにのみ表示される
- 明細画面で「夫」「妻」「合算」を切り替えると、表示件数と内容が切り替わる
- レポートの月次・年間・資産で3スコープを切り替えられ、合算の総資産が夫と妻の資産の合計に一致する（同じ銀行名を両者が持っていても正しい）
- ホーム画面が夫婦合算の総資産とカテゴリ別支出を表示する
- 割り勘タブが「夫負担額」「妻負担額」を表示し、両者の合計が共同支出総額に一致する
- 妻がログインして全件再分類を実行すると、夫の明細は1件も変更されない
- 全件再分類は実行前に変更予定件数と内訳を表示し、実行後に取り消せる
- 設定画面の分類ルールにログイン利用者のルールのみが表示される
- 割り勘ルール・CSVフォーマット・除外カテゴリは夫婦どちらのログインでも同じ内容が表示される
