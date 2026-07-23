-- split_rules に優先度を追加。category_rules と同じく priority が小さいほど優先。デフォルト 100。
ALTER TABLE split_rules ADD COLUMN priority INTEGER NOT NULL DEFAULT 100;
CREATE INDEX idx_split_rules_priority ON split_rules (priority);
