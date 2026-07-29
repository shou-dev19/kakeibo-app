-- 0010_recategorize_history.sql
-- 全件再分類の取り消し (Undo) 用の履歴。再分類は一度誤って流すと手作業での
-- 復旧が困難なため、実行ごとに「変更前のカテゴリ」を丸ごと控えておく。

CREATE TABLE recategorize_runs (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner         TEXT    NOT NULL CHECK (owner IN ('husband', 'wife')),
  executed_at   TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_count INTEGER NOT NULL,
  reverted_at   TEXT                        -- 取り消し済みなら日時
);

CREATE INDEX idx_recategorize_runs_owner ON recategorize_runs (owner, id);

CREATE TABLE recategorize_changes (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id            INTEGER NOT NULL REFERENCES recategorize_runs (id) ON DELETE CASCADE,
  transaction_id    INTEGER NOT NULL,
  previous_category TEXT,                   -- 未分類だった場合は NULL もありうる
  new_category      TEXT    NOT NULL
);

CREATE INDEX idx_recategorize_changes_run ON recategorize_changes (run_id);
